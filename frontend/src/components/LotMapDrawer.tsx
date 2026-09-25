import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  ExternalLink,
  MapPin,
  User,
  FileText,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Link as LinkIcon,
  Unlink,
  Calendar,
  Layers,
  Edit3,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  RefreshCw,
  Camera
} from 'lucide-react';
import axios from 'axios';
import { DocumentScannerModal } from './DocumentScannerModal';
import { QuickPersonModal, QuickPerson } from './QuickPersonModal';
import { normalizeText } from '../utils/text';

export interface LotDrawerData {
  featureId: string;
  type: 'lot' | 'quadra' | 'circle' | 'other';
  label: string;
  lotNumber?: string;
  blockNumber?: string;
  areaM2: number;
  perimeterM?: number;
  utmCenter?: [number, number];
  wgsCenter?: [number, number];
  statusContract: 'CONTRACT_SIGNED' | 'NOT_SIGNED' | 'DISTRATTO' | 'UNLINKED';
  statusFinancial: 'PAID' | 'UP_TO_DATE' | 'OVERDUE' | 'NO_CHARGES' | 'UNLINKED';
  lotData?: {
    id: string;
    number: string;
    blockId: string;
    blockNumber: string;
    address: string | null;
    area: number | null;
    perimeter: number | null;
    registration: string | null;
    status: string;
    occupant: {
      id?: string;
      name: string;
      cpf: string | null;
      phone: string | null;
    } | null;
    contract: {
      id: string;
      contractNumber: string;
      signed: boolean;
      signedAt: string | null;
      status: string;
      totalValue: number;
    } | null;
    financial: {
      totalInstallments: number;
      paidInstallments: number;
      overdueInstallments: number;
      pendingInstallments: number;
      totalAmount: number;
      paidAmount: number;
      remainingAmount: number;
      nextDueDate: string | null;
    };
  } | null;
}

interface AvailableLot {
  id: string;
  number: string;
  blockId: string;
  blockNumber: string;
  status: string;
  occupantName: string | null;
}

interface LotMapDrawerProps {
  data: LotDrawerData | null;
  projectId: string;
  availableLots: AvailableLot[];
  onClose: () => void;
  onLinkSuccess: (updatedFeatureId: string, updatedLotId: string) => void;
  onUnlinkSuccess: (featureId: string) => void;
  onCreateLotForFeature?: (featureData: LotDrawerData) => void;
  onEditLot?: (lotId: string) => void;
}

export function LotMapDrawer({
  data,
  projectId,
  availableLots,
  onClose,
  onLinkSuccess,
  onUnlinkSuccess,
  onCreateLotForFeature,
  onEditLot
}: LotMapDrawerProps) {
  const navigate = useNavigate();
  const [selectedLotIdToLink, setSelectedLotIdToLink] = useState('');
  const [selectedBlockFilter, setSelectedBlockFilter] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [showLinkSection, setShowLinkSection] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // States for Titular / Occupant linking
  const [showOccupantPicker, setShowOccupantPicker] = useState(false);
  const [people, setPeople] = useState<QuickPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [searchPerson, setSearchPerson] = useState('');
  const [isUpdatingOccupant, setIsUpdatingOccupant] = useState(false);
  const [isQuickPersonOpen, setIsQuickPersonOpen] = useState(false);

  if (!data) return null;

  const isLinked = !!data.lotData;

  // Format currency
  const formatMoney = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Format CPF
  const formatCpf = (cpf: string | null) => {
    if (!cpf) return null;
    const clean = cpf.replace(/\D/g, '');
    if (clean.length !== 11) return cpf;
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  // Group available unlinked lots by block
  const blockOptions = Array.from(
    new Set(availableLots.map((l) => l.blockNumber))
  ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const filteredAvailableLots = selectedBlockFilter
    ? availableLots.filter((l) => l.blockNumber === selectedBlockFilter)
    : availableLots;

  // Load people for occupant picker
  const loadPeople = async () => {
    try {
      setLoadingPeople(true);
      const res = await axios.get('/api/people');
      setPeople(res.data.data || []);
    } catch (err) {
      console.error('Falha ao carregar lista de pessoas:', err);
    } finally {
      setLoadingPeople(false);
    }
  };

  const handleToggleOccupantPicker = () => {
    if (!showOccupantPicker && people.length === 0) {
      loadPeople();
    }
    setShowOccupantPicker(!showOccupantPicker);
  };

  const handleSelectOccupant = async (person: QuickPerson) => {
    if (!data?.lotData?.id) return;
    try {
      setIsUpdatingOccupant(true);
      await axios.put(`/api/lots/${data.lotData.id}`, {
        personId: person.id
      });
      // Update local state in drawer
      if (data.lotData) {
        data.lotData.occupant = {
          id: person.id,
          name: person.fullName,
          cpf: person.cpf || null,
          phone: person.phone || null
        };
      }
      setShowOccupantPicker(false);
      setSearchPerson('');
      onLinkSuccess(data.featureId, data.lotData.id);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao vincular titular.');
    } finally {
      setIsUpdatingOccupant(false);
    }
  };

  const handleUnlinkOccupant = async () => {
    if (!data?.lotData?.id) return;
    if (!confirm('Deseja desvincular o titular deste lote?')) return;
    try {
      setIsUpdatingOccupant(true);
      await axios.put(`/api/lots/${data.lotData.id}`, {
        personId: null
      });
      if (data.lotData) {
        data.lotData.occupant = null;
      }
      onLinkSuccess(data.featureId, data.lotData.id);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao desvincular titular.');
    } finally {
      setIsUpdatingOccupant(false);
    }
  };

  const handlePersonCreated = async (newPerson: QuickPerson) => {
    setPeople((prev) => [newPerson, ...prev]);
    setIsQuickPersonOpen(false);
    await handleSelectOccupant(newPerson);
  };

  const handleConfirmLink = async () => {
    if (!selectedLotIdToLink) return;
    setIsLinking(true);
    setLinkError(null);
    try {
      await axios.post(`/api/map/${projectId}/link-lot`, {
        lotId: selectedLotIdToLink,
        featureId: data.featureId
      });
      onLinkSuccess(data.featureId, selectedLotIdToLink);
      setShowLinkSection(false);
    } catch (err: any) {
      setLinkError(err?.response?.data?.message || 'Erro ao vincular lote');
    } finally {
      setIsLinking(false);
    }
  };

  const handleConfirmUnlink = async () => {
    if (!confirm('Deseja desvincular este lote do elemento geográfico no mapa?')) return;
    setIsUnlinking(true);
    try {
      await axios.post(`/api/map/${projectId}/unlink-lot`, {
        featureId: data.featureId
      });
      onUnlinkSuccess(data.featureId);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao desvincular lote');
    } finally {
      setIsUnlinking(false);
    }
  };

  // Contractual badge rendering
  const renderContractBadge = () => {
    switch (data.statusContract) {
      case 'CONTRACT_SIGNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Contrato assinado
          </span>
        );
      case 'DISTRATTO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <AlertCircle className="w-3.5 h-3.5" />
            Distrato
          </span>
        );
      case 'NOT_SIGNED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3.5 h-3.5" />
            Sem contrato
          </span>
        );
      case 'UNLINKED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-500 border border-dashed border-slate-300">
            <Layers className="w-3.5 h-3.5" />
            Não vinculado
          </span>
        );
    }
  };

  // Financial badge rendering
  const renderFinancialBadge = () => {
    switch (data.statusFinancial) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Quitado
          </span>
        );
      case 'UP_TO_DATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5" />
            Em dia (saldo a pagar)
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 animate-pulse">
            <AlertCircle className="w-3.5 h-3.5" />
            Em atraso
          </span>
        );
      case 'NO_CHARGES':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <DollarSign className="w-3.5 h-3.5" />
            Sem cobrança gerada
          </span>
        );
      case 'UNLINKED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-500 border border-dashed border-slate-300">
            <Layers className="w-3.5 h-3.5" />
            Não vinculado
          </span>
        );
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/30 z-30 lg:hidden backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer container: Sidebar on desktop, Bottom-sheet on mobile */}
      <aside
        className="fixed lg:absolute bottom-0 right-0 z-40 w-full lg:w-[420px] max-h-[85vh] lg:max-h-full h-auto lg:h-full bg-white border-t lg:border-t-0 lg:border-l border-slate-200 shadow-2xl flex flex-col rounded-t-2xl lg:rounded-none overflow-hidden transition-all"
        aria-label="Ficha do Lote"
      >
        {/* Mobile handle indicator */}
        <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mt-2.5 mb-1 lg:hidden" />

        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0f5964]">
                {data.type === 'quadra' ? 'Quadra' : 'Ficha do Lote'}
              </span>
              <span className="text-xs text-slate-400 font-mono">#{data.featureId}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">
              {data.label}
            </h3>
          </div>

          <div className="flex items-center gap-1">
            {isLinked && data.lotData && onEditLot && (
              <button
                type="button"
                onClick={() => onEditLot(data.lotData!.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-[#0f5964] hover:bg-teal-50 border border-transparent hover:border-teal-200 transition cursor-pointer"
                title="Editar dados cadastrais deste lote"
                aria-label="Editar dados cadastrais deste lote"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
              title="Fechar ficha"
              aria-label="Fechar ficha"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Badges Section */}
        <div className="px-4 sm:px-5 py-3 bg-white border-b border-slate-100 flex flex-wrap gap-2 items-center">
          <div>{renderContractBadge()}</div>
          <div>{renderFinancialBadge()}</div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-sm">
          {/* Cadastral Information */}
          <section className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              Dados Cadastrais
            </h4>

            <div className="grid grid-cols-2 gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Área Calculada</p>
                <p className="font-semibold text-slate-800 text-sm sm:text-base">
                  {data.areaM2.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m²
                </p>
              </div>

              {data.perimeterM && (
                <div>
                  <p className="text-xs text-slate-500">Perímetro</p>
                  <p className="font-semibold text-slate-800 text-sm sm:text-base">
                    {data.perimeterM.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} m
                  </p>
                </div>
              )}

              {data.lotData?.blockNumber && (
                <div>
                  <p className="text-xs text-slate-500">Quadra</p>
                  <p className="font-medium text-slate-800">
                    Quadra {data.lotData.blockNumber}
                  </p>
                </div>
              )}

              {data.lotData?.number && (
                <div>
                  <p className="text-xs text-slate-500">Lote</p>
                  <p className="font-medium text-slate-800">
                    Lote {data.lotData.number}
                  </p>
                </div>
              )}
            </div>

            {/* Coordinates */}
            {(data.utmCenter || data.wgsCenter) && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1 font-mono text-slate-600">
                {data.utmCenter && (
                  <p>
                    <span className="text-slate-400">UTM 21S:</span> E {data.utmCenter[0]} | N {data.utmCenter[1]}
                  </p>
                )}
                {data.wgsCenter && (
                  <p>
                    <span className="text-slate-400">WGS84:</span> {data.wgsCenter[0].toFixed(6)}, {data.wgsCenter[1].toFixed(6)}
                  </p>
                )}
              </div>
            )}

            {/* Occupant / Owner Section with Interactive Linking */}
            {isLinked && data.lotData && (
              <div className="p-3.5 rounded-xl bg-slate-50/90 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                    <User className="w-3.5 h-3.5 text-[#0f5964]" />
                    <span>Titular / Morador</span>
                  </div>

                  {data.lotData.occupant ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleToggleOccupantPicker}
                        disabled={isUpdatingOccupant}
                        className="text-[11px] font-semibold text-[#0f5964] hover:text-[#0c4750] px-2 py-0.5 rounded-md hover:bg-teal-50 transition cursor-pointer"
                      >
                        {showOccupantPicker ? 'Fechar' : 'Alterar'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlinkOccupant}
                        disabled={isUpdatingOccupant}
                        className="text-[11px] font-semibold text-red-600 hover:text-red-700 px-2 py-0.5 rounded-md hover:bg-red-50 transition cursor-pointer"
                        title="Desvincular titular"
                      >
                        Desvincular
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleToggleOccupantPicker}
                      disabled={isUpdatingOccupant}
                      className="text-xs font-bold text-[#0f5964] hover:text-[#0c4750] flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-teal-50 transition cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {showOccupantPicker ? 'Fechar' : 'Vincular Titular'}
                    </button>
                  )}
                </div>

                {/* Current Occupant Details */}
                {data.lotData.occupant ? (
                  <div className="space-y-0.5 bg-white p-2.5 rounded-lg border border-slate-100">
                    <p className="font-bold text-slate-800 text-sm">{data.lotData.occupant.name}</p>
                    {data.lotData.occupant.cpf && (
                      <p className="text-xs text-slate-500">
                        CPF: {formatCpf(data.lotData.occupant.cpf)}
                      </p>
                    )}
                    {data.lotData.occupant.phone && (
                      <p className="text-xs text-slate-500">
                        Telefone: {data.lotData.occupant.phone}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-2 text-xs text-slate-500 italic bg-white/60 rounded-lg border border-dashed border-slate-200">
                    Nenhum morador ou titular cadastrado para este lote.
                  </div>
                )}

                {/* Interactive Person Picker */}
                {showOccupantPicker && (
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Buscar pessoa cadastrada:
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsQuickPersonOpen(true)}
                        className="text-[11px] font-bold text-[#0f5964] hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Cadastrar Novo
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchPerson}
                        onChange={(e) => setSearchPerson(e.target.value)}
                        placeholder="Digite o nome ou CPF..."
                        className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0f5964] text-slate-800"
                        autoFocus
                      />
                    </div>

                    {loadingPeople ? (
                      <p className="text-xs text-slate-400 py-1 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Carregando pessoas...
                      </p>
                    ) : (
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
                        {people
                          .filter((p) => {
                            if (!searchPerson.trim()) return true;
                            const q = normalizeText(searchPerson);
                            return (
                              normalizeText(p.fullName).includes(q) ||
                              (p.cpf && p.cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
                            );
                          })
                          .slice(0, 10)
                          .map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectOccupant(p)}
                              disabled={isUpdatingOccupant}
                              className="w-full px-2.5 py-1.5 text-left text-xs hover:bg-teal-50 flex items-center justify-between transition cursor-pointer"
                            >
                              <div>
                                <p className="font-semibold text-slate-800">{p.fullName}</p>
                                <p className="text-[10px] text-slate-500">
                                  {p.cpf ? `CPF: ${p.cpf}` : 'Sem CPF'}
                                </p>
                              </div>
                              <span className="text-[11px] font-bold text-[#0f5964]">
                                Vincular
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Contractual Summary */}
          {isLinked && (
            <section className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Resumo Contratual
              </h4>

              {data.lotData?.contract ? (
                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Nº do Contrato</span>
                    <span className="font-mono font-semibold text-slate-800">
                      {data.lotData.contract.contractNumber}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Status Contratual</span>
                    <span className="font-medium text-slate-700">
                      {data.lotData.contract.signed ? 'Assinado' : 'Pendente de assinatura'}
                    </span>
                  </div>

                  {data.lotData.contract.signedAt && (
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-slate-500">Data de Assinatura</span>
                      <span className="text-xs text-slate-700">
                        {new Date(data.lotData.contract.signedAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                    <span className="text-xs font-medium text-slate-600">Valor Total</span>
                    <span className="font-bold text-[#0f5964]">
                      {formatMoney(data.lotData.contract.totalValue)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                  Sem contrato gerado no sistema para este lote.
                </div>
              )}
            </section>
          )}

          {/* Financial Summary */}
          {isLinked && (
            <section className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                Resumo Financeiro
              </h4>

              {data.lotData?.financial && data.lotData.financial.totalInstallments > 0 ? (
                <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <p className="text-[11px] text-slate-500">Parcelas Pagas</p>
                      <p className="font-bold text-emerald-600">
                        {data.lotData.financial.paidInstallments} / {data.lotData.financial.totalInstallments}
                      </p>
                    </div>

                    <div className="p-2 rounded-lg bg-white border border-slate-100">
                      <p className="text-[11px] text-slate-500">Em Atraso</p>
                      <p className={`font-bold ${data.lotData.financial.overdueInstallments > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {data.lotData.financial.overdueInstallments}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total Pago:</span>
                      <span className="font-semibold text-emerald-700">
                        {formatMoney(data.lotData.financial.paidAmount)}
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-500">Saldo Restante:</span>
                      <span className="font-semibold text-slate-700">
                        {formatMoney(data.lotData.financial.remainingAmount)}
                      </span>
                    </div>

                    {data.lotData.financial.nextDueDate && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200/50">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Próximo Vencimento:
                        </span>
                        <span className="font-medium text-slate-800">
                          {new Date(data.lotData.financial.nextDueDate).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-500">
                  Nenhuma parcela ou cobrança registrada no sistema para este lote.
                </div>
              )}
            </section>
          )}

          {/* Linking Section for UNLINKED lots */}
          {!isLinked && (
            <section className="space-y-3 pt-2 border-t border-slate-100">
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  Elemento não vinculado
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Este polígono geográfico ainda não está associado a um lote cadastrado no banco de dados do Gênesis REURB.
                </p>

                {/* Botão de Criação de Novo Lote a partir deste Polígono */}
                {onCreateLotForFeature && (
                  <button
                    type="button"
                    onClick={() => onCreateLotForFeature(data)}
                    className="w-full py-2.5 px-3 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Criar Novo Lote para este Polígono
                  </button>
                )}

                {!showLinkSection ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkSection(true)}
                    className="w-full mt-1.5 py-2 px-3 rounded-lg border border-amber-300 bg-amber-100/60 hover:bg-amber-100 text-amber-900 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    Vincular a lote já existente
                  </button>
                ) : (
                  <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-medium text-amber-900 mb-1">
                        1. Filtrar por Quadra (opcional)
                      </label>
                      <select
                        value={selectedBlockFilter}
                        onChange={(e) => {
                          setSelectedBlockFilter(e.target.value);
                          setSelectedLotIdToLink('');
                        }}
                        className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">Todas as Quadras ({availableLots.length} lotes disponíveis)</option>
                        {blockOptions.map((b) => (
                          <option key={b} value={b}>
                            Quadra {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-amber-900 mb-1">
                        2. Selecionar Lote Cadastrado
                      </label>
                      <select
                        value={selectedLotIdToLink}
                        onChange={(e) => setSelectedLotIdToLink(e.target.value)}
                        className="w-full text-xs p-2 rounded-lg border border-amber-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="">-- Selecione o lote --</option>
                        {filteredAvailableLots.map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            Quadra {lot.blockNumber} - Lote {lot.number}
                            {lot.occupantName ? ` (${lot.occupantName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {linkError && (
                      <p className="text-xs text-red-600 font-medium">{linkError}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowLinkSection(false)}
                        className="flex-1 py-1.5 px-3 rounded-lg border border-slate-300 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition cursor-pointer"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        onClick={handleConfirmLink}
                        disabled={!selectedLotIdToLink || isLinking}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition cursor-pointer flex items-center justify-center gap-1"
                      >
                        {isLinking ? 'Vinculando...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 space-y-2">
          {isLinked && data.lotData ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                title="Escanear documentos com o celular para este lote"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Escanear</span> Doc
              </button>

              {onEditLot && (
                <button
                  type="button"
                  onClick={() => onEditLot(data.lotData!.id)}
                  className="flex-1 py-2 px-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
                  title="Editar dados cadastrais do lote"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Editar
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate(`/lots/${data.lotData!.id}`)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] text-white text-xs font-bold flex items-center justify-center gap-1 shadow-sm transition cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir
              </button>

              <button
                type="button"
                onClick={handleConfirmUnlink}
                disabled={isUnlinking}
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition cursor-pointer"
                title="Desvincular lote da geometria"
                aria-label="Desvincular lote da geometria"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 transition cursor-pointer"
            >
              Fechar ficha
            </button>
          )}
        </div>
      </aside>

      {/* MODAL SCANNER INTELIGENTE DE DOCUMENTOS */}
      {isLinked && data.lotData && (
        <DocumentScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          initialProjectId={projectId}
          initialBlockId={data.lotData.blockId}
          initialLotId={data.lotData.id}
          initialPersonId={data.lotData.occupant?.id}
          onScanComplete={() => {
            // Document successfully scanned and saved
          }}
        />
      )}

      {/* QUICK PERSON MODAL FOR CREATING OCCUPANT */}
      {isQuickPersonOpen && (
        <QuickPersonModal
          onClose={() => setIsQuickPersonOpen(false)}
          onCreated={handlePersonCreated}
        />
      )}
    </>
  );
}

