import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Plus,
  Search,
  Check,
  MapPin,
  User,
  Building,
  AlertCircle,
  RefreshCw,
  Layers,
  ChevronDown,
  UserCheck,
  UserX
} from 'lucide-react';
import { QuickPersonModal, QuickPerson } from './QuickPersonModal';
import { normalizeText } from '../utils/text';

interface Block {
  id: string;
  number: string;
  projectId: string;
}

export interface LotFormInitialData {
  id?: string;
  blockId?: string;
  number?: string;
  address?: string | null;
  area?: number | null;
  perimeter?: number | null;
  registration?: string | null;
  status?: string;
  geographicFile?: string | null;
  frontDimension?: number | null;
  backDimension?: number | null;
  rightDimension?: number | null;
  leftDimension?: number | null;
  technicalNotes?: string | null;
  observations?: string | null;
  personId?: string | null;
  personName?: string | null;
  personCpf?: string | null;
}

interface LotFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName?: string;
  initialData?: LotFormInitialData | null;
  editingLotId?: string | null;
  onSuccess: (savedLotId: string) => void;
}

export function LotFormModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  initialData,
  editingLotId,
  onSuccess
}: LotFormModalProps) {
  const isEditing = Boolean(editingLotId);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [people, setPeople] = useState<QuickPerson[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Form states
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [lotNumber, setLotNumber] = useState('');
  const [lotStatus, setLotStatus] = useState<'NOT_SIGNED' | 'CONTRACT_SIGNED' | 'DISTRATTO'>('NOT_SIGNED');
  const [area, setArea] = useState<string>('');
  const [perimeter, setPerimeter] = useState<string>('');
  const [address, setAddress] = useState('');
  const [registration, setRegistration] = useState('');
  const [frontDim, setFrontDim] = useState('');
  const [backDim, setBackDim] = useState('');
  const [rightDim, setRightDim] = useState('');
  const [leftDim, setLeftDim] = useState('');
  const [observations, setObservations] = useState('');
  const [geographicFile, setGeographicFile] = useState<string>('');

  // Person selection
  const [selectedPerson, setSelectedPerson] = useState<QuickPerson | null>(null);
  const [searchPerson, setSearchPerson] = useState('');
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [isQuickPersonOpen, setIsQuickPersonOpen] = useState(false);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingLot, setLoadingLot] = useState(false);

  // Load project blocks and people
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      try {
        setLoadingBlocks(true);
        const [blocksRes, peopleRes] = await Promise.all([
          axios.get(`/api/blocks?projectId=${projectId}`),
          axios.get('/api/people')
        ]);

        const bList: Block[] = blocksRes.data.data || [];
        bList.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
        setBlocks(bList);

        const pList: QuickPerson[] = peopleRes.data.data || [];
        setPeople(pList);
      } catch (err) {
        console.error('Falha ao carregar blocos ou pessoas:', err);
      } finally {
        setLoadingBlocks(false);
      }
    }

    loadData();
  }, [isOpen, projectId]);

  // If editing an existing lot by ID, fetch full data
  useEffect(() => {
    if (!isOpen) return;

    if (editingLotId) {
      setLoadingLot(true);
      setError(null);
      axios
        .get(`/api/lots/${editingLotId}`)
        .then((res) => {
          const l = res.data.data;
          if (l) {
            setSelectedBlockId(l.blockId || '');
            setLotNumber(l.number || '');
            setLotStatus(l.status || 'NOT_SIGNED');
            setArea(l.area !== null && l.area !== undefined ? String(l.area) : '');
            setPerimeter(l.perimeter !== null && l.perimeter !== undefined ? String(l.perimeter) : '');
            setAddress(l.address || '');
            setRegistration(l.registration || '');
            setFrontDim(l.frontDimension ? String(l.frontDimension) : '');
            setBackDim(l.backDimension ? String(l.backDimension) : '');
            setRightDim(l.rightDimension ? String(l.rightDimension) : '');
            setLeftDim(l.leftDimension ? String(l.leftDimension) : '');
            setObservations(l.observations || '');
            setGeographicFile(l.geographicFile || '');

            const currentOccupant = l.occupancies?.find((o: any) => o.current && o.type === 'OWNER')?.person;
            if (currentOccupant) {
              setSelectedPerson({
                id: currentOccupant.id,
                fullName: currentOccupant.fullName,
                cpf: currentOccupant.cpf,
                phone: currentOccupant.phone,
                rg: currentOccupant.rg,
                rgIssuer: currentOccupant.rgIssuer,
                profession: currentOccupant.profession,
                maritalStatus: currentOccupant.maritalStatus,
                email: currentOccupant.email
              });
            } else {
              setSelectedPerson(null);
            }
          }
        })
        .catch((err) => {
          setError(err?.response?.data?.message || 'Falha ao buscar detalhes do lote.');
        })
        .finally(() => {
          setLoadingLot(false);
        });
    } else if (initialData) {
      // Creation mode with prefilled data (e.g. from clicked polygon)
      setSelectedBlockId(initialData.blockId || '');
      setLotNumber(initialData.number || '');
      setLotStatus((initialData.status as any) || 'NOT_SIGNED');
      setArea(initialData.area ? String(initialData.area) : '');
      setPerimeter(initialData.perimeter ? String(initialData.perimeter) : '');
      setAddress(initialData.address || '');
      setRegistration(initialData.registration || '');
      setFrontDim(initialData.frontDimension ? String(initialData.frontDimension) : '');
      setBackDim(initialData.backDimension ? String(initialData.backDimension) : '');
      setRightDim(initialData.rightDimension ? String(initialData.rightDimension) : '');
      setLeftDim(initialData.leftDimension ? String(initialData.leftDimension) : '');
      setObservations(initialData.observations || '');
      setGeographicFile(initialData.geographicFile || '');

      if (initialData.personId) {
        setSelectedPerson({
          id: initialData.personId,
          fullName: initialData.personName || 'Titular selecionado',
          cpf: initialData.personCpf || undefined
        });
      } else {
        setSelectedPerson(null);
      }
    } else {
      // Empty creation mode
      setSelectedBlockId('');
      setLotNumber('');
      setLotStatus('NOT_SIGNED');
      setArea('');
      setPerimeter('');
      setAddress('');
      setRegistration('');
      setFrontDim('');
      setBackDim('');
      setRightDim('');
      setLeftDim('');
      setObservations('');
      setGeographicFile('');
      setSelectedPerson(null);
      setError(null);
    }
  }, [isOpen, editingLotId, initialData]);

  // Filter people by name or CPF
  const filteredPeople =
    searchPerson.trim().length > 0
      ? people
          .filter((p) => {
            const query = normalizeText(searchPerson);
            return (
              normalizeText(p.fullName).includes(query) ||
              (p.cpf && p.cpf.replace(/\D/g, '').includes(query.replace(/\D/g, '')))
            );
          })
          .slice(0, 8)
      : [];

  const handleSelectPerson = (p: QuickPerson) => {
    setSelectedPerson(p);
    setSearchPerson('');
    setShowPersonDropdown(false);
  };

  const handleRemovePerson = () => {
    setSelectedPerson(null);
  };

  const handlePersonCreated = (newPerson: QuickPerson) => {
    setPeople((prev) => [newPerson, ...prev]);
    setSelectedPerson(newPerson);
    setIsQuickPersonOpen(false);
    setShowPersonDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBlockId) {
      setError('Por favor, selecione a Quadra do lote.');
      return;
    }
    if (!lotNumber.trim()) {
      setError('Por favor, informe o Número do lote.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const parsedArea = area ? parseFloat(area.replace(',', '.')) : undefined;
      const parsedPerimeter = perimeter ? parseFloat(perimeter.replace(',', '.')) : undefined;
      const parsedFront = frontDim ? parseFloat(frontDim.replace(',', '.')) : undefined;
      const parsedBack = backDim ? parseFloat(backDim.replace(',', '.')) : undefined;
      const parsedRight = rightDim ? parseFloat(rightDim.replace(',', '.')) : undefined;
      const parsedLeft = leftDim ? parseFloat(leftDim.replace(',', '.')) : undefined;

      const payload: any = {
        blockId: selectedBlockId,
        number: lotNumber.trim(),
        status: lotStatus,
        area: isNaN(parsedArea as number) ? undefined : parsedArea,
        perimeter: isNaN(parsedPerimeter as number) ? undefined : parsedPerimeter,
        address: address.trim() || undefined,
        registration: registration.trim() || undefined,
        frontDimension: isNaN(parsedFront as number) ? undefined : parsedFront,
        backDimension: isNaN(parsedBack as number) ? undefined : parsedBack,
        rightDimension: isNaN(parsedRight as number) ? undefined : parsedRight,
        leftDimension: isNaN(parsedLeft as number) ? undefined : parsedLeft,
        observations: observations.trim() || undefined,
        geographicFile: geographicFile || undefined,
        personId: selectedPerson ? selectedPerson.id : null
      };

      let savedLotId = '';

      if (isEditing && editingLotId) {
        const res = await axios.put(`/api/lots/${editingLotId}`, payload);
        savedLotId = res.data.data?.id || editingLotId;
      } else {
        const res = await axios.post('/api/lots', payload);
        savedLotId = res.data.data?.id;
      }

      onSuccess(savedLotId);
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Erro ao salvar informações do lote.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-3 sm:p-4">
        <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-teal-50 text-[#0f5964]">
                <MapPin className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {isEditing ? `Editar Lote ${lotNumber}` : 'Novo Lote'}
                </h3>
                <p className="text-xs text-slate-500">
                  {projectName ? `Projeto: ${projectName}` : 'Cadastro de lote'}
                  {geographicFile && (
                    <span className="ml-2 font-mono text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      Geometria #{geographicFile}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="mx-4 sm:mx-5 mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Body */}
          {loadingLot ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-[#0f5964]" />
              Carregando dados do lote...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Row 1: Quadra, Número, Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quadra *
                  </label>
                  <select
                    required
                    value={selectedBlockId}
                    onChange={(e) => setSelectedBlockId(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="">Selecione a quadra...</option>
                    {blocks.map((b) => (
                      <option key={b.id} value={b.id}>
                        Quadra {b.number}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Número do Lote *
                  </label>
                  <input
                    type="text"
                    required
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    placeholder="Ex: 01, 14-B..."
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Status Cadastral
                  </label>
                  <select
                    value={lotStatus}
                    onChange={(e) => setLotStatus(e.target.value as any)}
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900 font-medium cursor-pointer"
                  >
                    <option value="NOT_SIGNED">Sem Contrato</option>
                    <option value="CONTRACT_SIGNED">Contrato Assinado</option>
                    <option value="DISTRATTO">Distrato</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Titular / Morador Section */}
              <div className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#0f5964]" />
                    Titular / Morador do Lote
                  </label>

                  <button
                    type="button"
                    onClick={() => setIsQuickPersonOpen(true)}
                    className="text-xs font-semibold text-[#0f5964] hover:text-[#0c4750] flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Cadastrar Nova Pessoa
                  </button>
                </div>

                {selectedPerson ? (
                  <div className="p-3 bg-white rounded-lg border border-teal-200 flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {selectedPerson.fullName}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-50 text-teal-700 font-semibold border border-teal-100 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Titular
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex gap-3">
                        {selectedPerson.cpf && <span>CPF: {selectedPerson.cpf}</span>}
                        {selectedPerson.phone && <span>Tel: {selectedPerson.phone}</span>}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleRemovePerson}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition cursor-pointer"
                      title="Desvincular pessoa deste lote"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={searchPerson}
                          onChange={(e) => {
                            setSearchPerson(e.target.value);
                            setShowPersonDropdown(true);
                          }}
                          onFocus={() => setShowPersonDropdown(true)}
                          placeholder="Buscar por nome completo ou CPF..."
                          className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-800"
                        />
                      </div>
                    </div>

                    {showPersonDropdown && searchPerson.trim().length > 0 && (
                      <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-xl border border-slate-200 p-1 z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                        {filteredPeople.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400 text-center">
                            Nenhuma pessoa encontrada com "{searchPerson}".
                          </div>
                        ) : (
                          filteredPeople.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectPerson(p)}
                              className="w-full p-2 text-left hover:bg-teal-50/70 rounded-lg transition flex items-center justify-between cursor-pointer"
                            >
                              <div>
                                <p className="text-xs font-bold text-slate-800">{p.fullName}</p>
                                <p className="text-[11px] text-slate-500">
                                  {p.cpf ? `CPF: ${p.cpf}` : 'Sem CPF informado'}
                                </p>
                              </div>
                              <span className="text-[11px] font-semibold text-[#0f5964]">
                                Selecionar
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Row 3: Área e Perímetro */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Área (m²)
                  </label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="Ex: 250.00"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Perímetro (m)
                  </label>
                  <input
                    type="text"
                    value={perimeter}
                    onChange={(e) => setPerimeter(e.target.value)}
                    placeholder="Ex: 70.00"
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                </div>
              </div>

              {/* Row 4: Dimensões (Frente, Fundo, Direita, Esquerda) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Frente (m)
                  </label>
                  <input
                    type="text"
                    value={frontDim}
                    onChange={(e) => setFrontDim(e.target.value)}
                    placeholder="Ex: 10.00"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fundo (m)
                  </label>
                  <input
                    type="text"
                    value={backDim}
                    onChange={(e) => setBackDim(e.target.value)}
                    placeholder="Ex: 10.00"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Direita (m)
                  </label>
                  <input
                    type="text"
                    value={rightDim}
                    onChange={(e) => setRightDim(e.target.value)}
                    placeholder="Ex: 25.00"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Esquerda (m)
                  </label>
                  <input
                    type="text"
                    value={leftDim}
                    onChange={(e) => setLeftDim(e.target.value)}
                    placeholder="Ex: 25.00"
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Row 5: Endereço e Matrícula */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço / Logradouro
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, Travessa, Avenida..."
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Matrícula / Registro de Imóveis
                  </label>
                  <input
                    type="text"
                    value={registration}
                    onChange={(e) => setRegistration(e.target.value)}
                    placeholder="Nº da Matrícula / RI..."
                    className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                  />
                </div>
              </div>

              {/* Row 6: Observações */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Observações
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Informações adicionais do lote..."
                  rows={2}
                  className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f5964]/20 text-slate-900"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="py-2.5 px-6 rounded-xl bg-[#0f5964] hover:bg-[#0c4750] disabled:opacity-50 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  {isEditing ? 'Salvar Alterações' : 'Cadastrar Lote'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* QUICK PERSON MODAL */}
      {isQuickPersonOpen && (
        <QuickPersonModal
          onClose={() => setIsQuickPersonOpen(false)}
          onCreated={handlePersonCreated}
        />
      )}
    </>
  );
}

