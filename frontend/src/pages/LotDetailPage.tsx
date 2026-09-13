import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Download,
  Edit3,
  Eye,
  FileCheck2,
  FileClock,
  FileText,
  History,
  Layers,
  MapPin,
  Maximize2,
  Paperclip,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LotFinanceTab } from '../components/LotFinanceTab';

type Person = {
  id: string;
  fullName: string;
  cpf?: string;
  rg?: string;
  rgIssuer?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  profession?: string;
  maritalStatus?: string;
  spouse?: {
    fullName: string;
    cpf?: string;
    rg?: string;
    profession?: string;
    phone?: string;
  };
};

type Occupancy = {
  id: string;
  type: string;
  current: boolean;
  startDate?: string;
  observations?: string;
  person: Person;
};

type Payment = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  receiptPath?: string | null;
  notes?: string;
};

type Installment = {
  id: string;
  installmentNumber: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  paymentMethod?: string;
  asaasPaymentId?: string | null;
  bankSlipUrl?: string | null;
  invoiceUrl?: string | null;
  payments?: Payment[];
};

type Negotiation = {
  id: string;
  totalValue: number;
  downPayment: number;
  financedAmount: number;
  installmentCount: number;
  installments: Installment[];
};

type Contract = {
  id: string;
  contractNumber: string;
  status: string;
  signed: boolean;
  signedAt?: string;
  totalValue: number;
  notes?: string;
  person: Person;
  negotiations: Negotiation[];
};

type DocumentItem = {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  size: number;
  category?: string;
  notes?: string;
  createdAt: string;
  uploadedBy: { id: string; name: string; email: string };
  documentType?: { id: string; name: string; category: string };
};

type LotDetail = {
  id: string;
  number: string;
  address?: string;
  area?: number;
  perimeter?: number;
  frontDimension?: number;
  backDimension?: number;
  rightDimension?: number;
  leftDimension?: number;
  confrontations?: string;
  latitude?: number;
  longitude?: number;
  geographicFile?: string;
  technicalNotes?: string;
  registration?: string;
  status: string;
  active: boolean;
  observations?: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    city?: string;
    state?: string;
    neighborhood?: string;
  };
  block: {
    id: string;
    number: string;
    description?: string;
  };
  occupancies: Occupancy[];
  contracts: Contract[];
  documents: DocumentItem[];
};

const STATUS_CONFIG: Record<string, { label: string; style: string; icon: any }> = {
  NOT_SIGNED: {
    label: 'Não assinou contrato',
    style: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: FileClock,
  },
  CONTRACT_SIGNED: {
    label: 'Contrato assinado',
    style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: FileCheck2,
  },
  TITLE_ISSUED: {
    label: 'Título emitido',
    style: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: CheckCircle2,
  },
  REGISTERED: {
    label: 'Registrado em cartório',
    style: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: Building2,
  },
  CANCELLED: {
    label: 'Distrato / Cancelado',
    style: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: FileClock,
  },
};

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function LotDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'contracts' | 'finance' | 'documents' | 'reports' | 'location'>('overview');

  // Modais
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [newContractModalOpen, setNewContractModalOpen] = useState(false);
  const [uploadDocModalOpen, setUploadDocModalOpen] = useState(false);
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [accounts, setAccounts] = useState<{ id: string; name: string; balance: number }[]>([]);

  const [revenueForm, setRevenueForm] = useState({
    accountId: '',
    description: '',
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'PIX',
    notes: '',
    file: null as File | null,
  });

  const [editForm, setEditForm] = useState({
    number: '',
    personId: '',
    address: '',
    area: '',
    perimeter: '',
    frontDimension: '',
    backDimension: '',
    rightDimension: '',
    leftDimension: '',
    confrontations: '',
    latitude: '',
    longitude: '',
    technicalNotes: '',
    registration: '',
    status: 'NOT_SIGNED',
    observations: '',
  });

  const [contractForm, setContractForm] = useState({
    contractNumber: '',
    personId: '',
    totalValue: '',
    downPayment: '',
    installmentCount: '10',
    entryDate: new Date().toISOString().slice(0, 10),
    firstDueDate: '',
    notes: '',
  });

  const [docUploadState, setDocUploadState] = useState<{
    file: File | null;
    category: string;
    notes: string;
  }>({
    file: null,
    category: 'Documento Técnico',
    notes: '',
  });

  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [dragTargetChecklistKey, setDragTargetChecklistKey] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [peopleList, setPeopleList] = useState<{ id: string; fullName: string; cpf?: string }[]>([]);

  async function loadLot() {
    if (!id) return;
    setLoading(true);
    try {
      const [res, accRes] = await Promise.all([
        axios.get(`/api/lots/${id}`),
        axios.get('/api/finance/accounts'),
      ]);
      const data: LotDetail = res.data.data;
      setLot(data);
      setAccounts(accRes.data.data || []);
      
      const currentPerson = data.contracts?.[0]?.person || data.occupancies?.find((o) => o.current)?.person || data.occupancies?.[0]?.person;

      setEditForm({
        number: data.number || '',
        personId: currentPerson?.id || '',
        address: data.address || '',
        area: data.area ? String(data.area) : '',
        perimeter: data.perimeter ? String(data.perimeter) : '',
        frontDimension: data.frontDimension ? String(data.frontDimension) : '',
        backDimension: data.backDimension ? String(data.backDimension) : '',
        rightDimension: data.rightDimension ? String(data.rightDimension) : '',
        leftDimension: data.leftDimension ? String(data.leftDimension) : '',
        confrontations: data.confrontations || '',
        latitude: data.latitude ? String(data.latitude) : '',
        longitude: data.longitude ? String(data.longitude) : '',
        technicalNotes: data.technicalNotes || '',
        registration: data.registration || '',
        status: data.status || 'NOT_SIGNED',
        observations: data.observations || '',
      });
      setError(null);
    } catch {
      setError('Não foi possível carregar as informações deste lote.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRevenue(e: React.FormEvent) {
    e.preventDefault();
    if (!lot) return;
    try {
      const fd = new FormData();
      fd.append('accountId', revenueForm.accountId);
      fd.append('lotId', lot.id);
      fd.append('description', revenueForm.description);
      fd.append('amount', String(revenueForm.amount));
      fd.append('paymentDate', revenueForm.paymentDate);
      fd.append('paymentMethod', revenueForm.paymentMethod);
      if (revenueForm.notes) fd.append('notes', revenueForm.notes);
      if (revenueForm.file) fd.append('receipt', revenueForm.file);

      await axios.post('/api/finance/payments', fd);
      setRevenueModalOpen(false);
      setRevenueForm({
        accountId: '',
        description: '',
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'PIX',
        notes: '',
        file: null,
      });
      await loadLot();
      setActiveTab('finance');
      alert('✅ Receita registrada com sucesso! O financeiro do lote foi atualizado.');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao registrar receita.');
    }
  }

  async function loadPeople() {
    try {
      const res = await axios.get('/api/people');
      setPeopleList(res.data.data || []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadLot();
    loadPeople();
  }, [id]);

  // Identificação do Titular
  const currentOwner = useMemo(() => {
    if (!lot) return null;
    const cur =
      lot.occupancies?.find((o) => o.current && o.type === 'OWNER') ||
      lot.occupancies?.find((o) => o.current) ||
      lot.occupancies?.[0];
    if (cur?.person) return cur.person;
    if (lot.contracts && lot.contracts.length > 0 && lot.contracts[0].person) {
      return lot.contracts[0].person;
    }
    return null;
  }, [lot]);

  // Totais Financeiros Consolidados
  const financials = useMemo(() => {
    if (!lot || !lot.contracts) return { contracted: 0, received: 0, pending: 0 };
    let contracted = 0;
    let received = 0;

    for (const c of lot.contracts) {
      for (const neg of c.negotiations || []) {
        contracted += neg.totalValue || 0;
        for (const inst of neg.installments || []) {
          received += inst.paidAmount || 0;
        }
      }
    }
    return {
      contracted,
      received,
      pending: Math.max(contracted - received, 0),
    };
  }, [lot]);

  // Salvar Edição do Lote
  async function handleSaveLot(e: React.FormEvent) {
    e.preventDefault();
    if (!lot) return;
    try {
      await axios.put(`/api/lots/${lot.id}`, {
        number: editForm.number,
        personId: editForm.personId || null,
        address: editForm.address || undefined,
        area: editForm.area ? Number(editForm.area) : undefined,
        perimeter: editForm.perimeter ? Number(editForm.perimeter) : undefined,
        frontDimension: editForm.frontDimension ? Number(editForm.frontDimension) : undefined,
        backDimension: editForm.backDimension ? Number(editForm.backDimension) : undefined,
        rightDimension: editForm.rightDimension ? Number(editForm.rightDimension) : undefined,
        leftDimension: editForm.leftDimension ? Number(editForm.leftDimension) : undefined,
        confrontations: editForm.confrontations || undefined,
        latitude: editForm.latitude ? Number(editForm.latitude) : undefined,
        longitude: editForm.longitude ? Number(editForm.longitude) : undefined,
        technicalNotes: editForm.technicalNotes || undefined,
        registration: editForm.registration || undefined,
        status: editForm.status,
        observations: editForm.observations || undefined,
      });
      setEditModalOpen(false);
      await loadLot();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao salvar alterações no lote.');
    }
  }

  // Upload de Documento para o Lote
  async function handleUploadDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!lot || !docUploadState.file) return;
    try {
      const fd = new FormData();
      fd.append('file', docUploadState.file);
      fd.append('lotId', lot.id);
      fd.append('category', docUploadState.category);
      if (docUploadState.notes) fd.append('notes', docUploadState.notes);
      if (currentOwner?.id) fd.append('personId', currentOwner.id);

      await axios.post('/api/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadDocModalOpen(false);
      setDocUploadState({ file: null, category: 'Documento Técnico', notes: '' });
      await loadLot();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar documento.');
    }
  }

  // Excluir Documento do Lote
  async function handleDeleteDoc(docId: string) {
    if (!window.confirm('Deseja realmente excluir este documento do lote?')) return;
    try {
      await axios.delete(`/api/documents/${docId}`);
      await loadLot();
    } catch {
      alert('Não foi possível excluir o documento.');
    }
  }

  // Criar Contrato no Lote
  async function handleCreateContract(e: React.FormEvent) {
    e.preventDefault();
    if (!lot || !currentOwner?.id) {
      alert('É necessário ter um titular vinculado para emitir contrato.');
      return;
    }
    try {
      await axios.post('/api/contracts', {
        contractNumber: contractForm.contractNumber || `CTR-${lot.block.number}-${lot.number}-${Date.now().toString().slice(-4)}`,
        personId: currentOwner.id,
        lotId: lot.id,
        projectId: lot.project.id,
        totalValue: Number(contractForm.totalValue),
        downPayment: Number(contractForm.downPayment || 0),
        installmentCount: Number(contractForm.installmentCount || 1),
        entryDate: new Date(`${contractForm.entryDate}T12:00:00`).toISOString(),
        firstDueDate: contractForm.firstDueDate ? new Date(`${contractForm.firstDueDate}T12:00:00`).toISOString() : undefined,
        notes: contractForm.notes || undefined,
      });
      setNewContractModalOpen(false);
      await loadLot();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar contrato.');
    }
  }

  async function downloadContractDocx(contractId: string, contractNumber: string) {
    try {
      const response = await axios.get(`/api/contracts/${contractId}/document`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contrato-${contractNumber.replace(/[^a-z0-9_-]/gi, '-')}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Não foi possível gerar ou baixar o contrato.');
    }
  }

  // Excluir Contrato
  async function handleDeleteContract(contractId: string) {
    if (!window.confirm('Atenção: A exclusão do contrato removerá suas parcelas e baixas vinculadas. Deseja prosseguir?')) return;
    try {
      await axios.delete(`/api/contracts/${contractId}`);
      await loadLot();
    } catch {
      alert('Não foi possível excluir o contrato.');
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <p className="text-sm font-semibold text-slate-500">Carregando dados completos do lote...</p>
      </div>
    );
  }

  if (error || !lot) {
    return (
      <div className="rounded-3xl bg-red-50 p-8 text-center space-y-4">
        <p className="text-red-700 font-semibold">{error || 'Lote não encontrado.'}</p>
        <Link
          to="/lots"
          className="inline-flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0c4952]"
        >
          <ArrowLeft size={16} /> Voltar para Lotes
        </Link>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[lot.status] || STATUS_CONFIG.NOT_SIGNED;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-6 pb-24">
      {/* 1. CABEÇALHO DO LOTE */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[#0f5964]">
              <Layers size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">
                {lot.project.name} · Quadra {lot.block.number}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-[#17343b]">
                Lote {lot.number}
              </h1>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${statusCfg.style}`}>
                <StatusIcon size={14} />
                {statusCfg.label}
              </span>
            </div>
            {currentOwner ? (
              <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-slate-900">{currentOwner.fullName}</span>
                {currentOwner.cpf && <span className="text-slate-400 font-mono">({currentOwner.cpf})</span>}
                {currentOwner.phone && <span className="text-[#0f5964] font-medium">· Tel: {currentOwner.phone}</span>}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">Nenhum titular vinculado atualmente</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/lots"
              className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm"
            >
              <ArrowLeft size={15} /> Voltar à Listagem
            </Link>
            <button
              type="button"
              onClick={() => {
                setRevenueForm({
                  accountId: accounts[0]?.id || '',
                  description: currentOwner ? `Recebimento Lote ${lot.number} - ${currentOwner.fullName}` : `Recebimento Lote ${lot.number}`,
                  amount: '',
                  paymentDate: new Date().toISOString().slice(0, 10),
                  paymentMethod: 'PIX',
                  notes: '',
                  file: null,
                });
                setRevenueModalOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition shadow-sm"
            >
              <Plus size={15} /> Novo Lançamento
            </button>
            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="flex items-center gap-1.5 rounded-xl bg-[#17343b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f5964] transition shadow-sm"
            >
              <Edit3 size={15} /> Editar Lote
            </button>
            <button
              type="button"
              onClick={async () => {
                if (window.confirm(`Tem certeza que deseja excluir o Lote ${lot.number}? Esta ação removerá o lote e seus vínculos de teste.`)) {
                  try {
                    await axios.delete(`/api/lots/${lot.id}`);
                    alert('✅ Lote excluído com sucesso!');
                    window.location.href = '/lots';
                  } catch (err: any) {
                    alert(err?.response?.data?.message || 'Erro ao excluir lote.');
                  }
                }
              }}
              className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-sm"
              title="Excluir este lote"
            >
              <Trash2 size={15} /> Excluir Lote
            </button>
          </div>
        </div>

        {/* 2. DASHBOARD DE INDICADORES RÁPIDOS */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 pt-5">
          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <FileCheck2 size={13} className="text-[#0f5964]" /> Contratos
            </span>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {lot.contracts?.length || 0}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <CircleDollarSign size={13} className="text-blue-600" /> Contratado
            </span>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {money(financials.contracted)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Receipt size={13} className="text-emerald-600" /> Recebido
            </span>
            <p className="mt-1 text-lg font-bold text-emerald-700">
              {money(financials.received)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <History size={13} className="text-amber-600" /> Em Aberto
            </span>
            <p className="mt-1 text-lg font-bold text-amber-700">
              {money(financials.pending)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Paperclip size={13} className="text-purple-600" /> Documentos
            </span>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {lot.documents?.length || 0}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Calendar size={13} className="text-slate-500" /> Atualizado
            </span>
            <p className="mt-1 text-xs font-semibold text-slate-700">
              {new Date(lot.updatedAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </section>

      {/* 3. NAVEGAÇÃO POR ABAS (6 MÓDULOS) */}
      <div className="border-b border-slate-200">
        <nav className="flex flex-wrap gap-2 text-sm font-semibold">
          {[
            { key: 'overview', label: '1. Visão Geral', icon: Eye },
            { key: 'contracts', label: '2. Contratos', icon: FileText, count: lot.contracts?.length },
            { key: 'finance', label: '3. Financeiro', icon: Receipt },
            { key: 'documents', label: '4. Documentos', icon: Paperclip, count: lot.documents?.length },
            { key: 'reports', label: '5. Relatórios', icon: Printer },
            { key: 'location', label: '6. Localização', icon: MapPin },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition ${
                  isActive
                    ? 'border-[#0f5964] text-[#0f5964] bg-teal-50/30'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] ${isActive ? 'bg-[#0f5964] text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* 4. CONTEÚDO DAS ABAS */}

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
              <h3 className="text-base font-bold text-[#17343b] flex items-center gap-2">
                <Building2 size={18} className="text-[#0f5964]" /> Dados Cadastrais do Imóvel
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Endereço / Logradouro:</span>
                  <p className="font-medium text-slate-900">{lot.address || 'Não informado'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Área Territorial (m²):</span>
                  <p className="font-semibold text-slate-900">{lot.area ? `${lot.area} m²` : 'Não informada'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Perímetro Linear (m):</span>
                  <p className="font-medium text-slate-900">{lot.perimeter ? `${lot.perimeter} m` : 'Não informado'}</p>
                </div>
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Matrícula / Registro:</span>
                  <p className="font-mono text-slate-900">{lot.registration || 'Não registrada'}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Confrontações / Limites:</span>
                  <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 mt-1">
                    {lot.confrontations || 'Confrontações não cadastradas.'}
                  </p>
                </div>
                {lot.observations && (
                  <div className="sm:col-span-2">
                    <span className="text-xs text-slate-400 uppercase font-semibold">Observações Gerais:</span>
                    <p className="text-xs text-slate-700 italic mt-1">{lot.observations}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
              <h3 className="text-base font-bold text-[#17343b] flex items-center gap-2">
                <User size={18} className="text-[#0f5964]" /> Histórico de Titulares & Ocupantes
              </h3>
              {lot.occupancies && lot.occupancies.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {lot.occupancies.map((occ) => (
                    <div key={occ.id} className="py-3 flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{occ.person.fullName}</span>
                          {occ.current && (
                            <span className="rounded-md bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                              Atual
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                          CPF: {occ.person.cpf || 'Não informado'} · Tel: {occ.person.phone || '—'}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400">
                        {occ.startDate ? new Date(occ.startDate).toLocaleDateString('pt-BR') : 'Data não informada'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Nenhum histórico de ocupação cadastrado.</p>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
              <h3 className="text-base font-bold text-[#17343b]">Titular Atual</h3>
              {currentOwner ? (
                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-slate-400 font-semibold uppercase">Nome:</span>
                    <p className="font-bold text-sm text-slate-900">{currentOwner.fullName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase">CPF:</span>
                    <p className="font-mono font-medium text-slate-800">{currentOwner.cpf || 'Não cadastrado'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold uppercase">Telefone:</span>
                    <p className="font-medium text-slate-800">{currentOwner.phone || 'Não cadastrado'}</p>
                  </div>
                  {currentOwner.profession && (
                    <div>
                      <span className="text-slate-400 font-semibold uppercase">Profissão:</span>
                      <p className="font-medium text-slate-800">{currentOwner.profession}</p>
                    </div>
                  )}
                  {currentOwner.spouse && (
                    <div className="border-t pt-2 mt-2">
                      <span className="text-slate-400 font-semibold uppercase">Cônjuge:</span>
                      <p className="font-bold text-slate-900">{currentOwner.spouse.fullName}</p>
                      {currentOwner.spouse.cpf && <p className="font-mono text-[11px] text-slate-500">CPF: {currentOwner.spouse.cpf}</p>}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Sem titular associado.</p>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-3">
              <h3 className="text-base font-bold text-[#17343b]">Progresso Financeiro</h3>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-emerald-600 h-3 rounded-full transition-all duration-500"
                  style={{
                    width: `${financials.contracted > 0 ? Math.min(100, Math.round((financials.received / financials.contracted) * 100)) : 0}%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-emerald-700">
                  {financials.contracted > 0 ? Math.round((financials.received / financials.contracted) * 100) : 0}% Quitado
                </span>
                <span className="text-slate-500">
                  {money(financials.received)} / {money(financials.contracted)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: CONTRATOS */}
      {activeTab === 'contracts' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Contratos do Lote</h3>
              <p className="text-xs text-slate-500">Termos de adesão e contratos de regularização vinculados a este lote.</p>
            </div>
            <button
              type="button"
              onClick={() => setNewContractModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-sm"
            >
              <Plus size={15} /> Novo Contrato
            </button>
          </div>

          {lot.contracts && lot.contracts.length > 0 ? (
            <div className="grid gap-4">
              {lot.contracts.map((c) => {
                const neg = c.negotiations?.[0];
                const totalPaid = neg?.installments?.reduce((s, i) => s + i.paidAmount, 0) || 0;
                return (
                  <div key={c.id} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                      <div>
                        <span className="text-xs font-bold uppercase text-[#0f5964]">Contrato / Adesão</span>
                        <h4 className="text-xl font-bold text-slate-900">{c.contractNumber}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Titular: <strong>{c.person.fullName}</strong> ({c.person.cpf || 'Sem CPF'})
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => downloadContractDocx(c.id, c.contractNumber)}
                          className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Download size={13} /> Baixar DOCX
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteContract(c.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-4 text-xs">
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <span className="text-slate-400 uppercase font-semibold">Valor Total:</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{money(c.totalValue)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <span className="text-slate-400 uppercase font-semibold">Entrada:</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{money(neg?.downPayment || 0)}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <span className="text-slate-400 uppercase font-semibold">Parcelas:</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5">{neg?.installmentCount || 0}x</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <span className="text-slate-400 uppercase font-semibold">Total Pago:</span>
                        <p className="text-sm font-bold text-emerald-700 mt-0.5">{money(totalPaid)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center space-y-3">
              <FileText size={32} className="mx-auto text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Nenhum contrato cadastrado para este lote.</p>
              <button
                type="button"
                onClick={() => setNewContractModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952]"
              >
                <Plus size={14} /> Cadastrar Primeiro Contrato
              </button>
            </div>
          )}
        </div>
      )}

      {/* ABA 3: FINANCEIRO */}
      {activeTab === 'finance' && (
        <div className="space-y-4">
          <LotFinanceTab
            lot={{
              id: lot.id,
              number: lot.number,
              project: { id: lot.project.id },
            }}
            owner={currentOwner || undefined}
            onChanged={loadLot}
          />
        </div>
      )}

      {/* ABA 4: DOCUMENTOS COM CHECKLIST */}
      {activeTab === 'documents' && (() => {
        const isMarried = currentOwner?.maritalStatus === 'Casado(a)' || currentOwner?.maritalStatus === 'União Estável' || !!currentOwner?.spouse;

        const CHECKLIST_ITEMS = [
          {
            key: 'doc_titular',
            title: '1. RG, CPF ou CNH do Titular',
            desc: 'Documento oficial com foto e CPF do requerente principal',
            required: true,
            categories: ['RG/CPF ou CNH do Titular', 'Documento Pessoal'],
          },
          {
            key: 'doc_spouse',
            title: '2. Documento do Cônjuge',
            desc: isMarried ? 'RG, CPF ou CNH do cônjuge / companheiro(a)' : 'Opcional (apenas se for casado ou união estável)',
            required: isMarried,
            categories: ['Documento do Cônjuge'],
          },
          {
            key: 'doc_civil',
            title: '3. Certidão de Casamento ou Nascimento',
            desc: isMarried ? 'Certidão de casamento com eventuais averbações' : 'Certidão de nascimento (ou casamento/óbito/divórcio)',
            required: true,
            categories: ['Certidão de Casamento ou Nascimento'],
          },
          {
            key: 'doc_residence',
            title: '4. Comprovante de Residência',
            desc: 'Conta de energia, água ou telefone recente em nome do requerente',
            required: true,
            categories: ['Comprovante de Residência'],
          },
          {
            key: 'doc_purchase',
            title: '5. Contrato de Compra e Venda do Lote',
            desc: 'Instrumento particular ou recibo de compra do imóvel',
            required: true,
            categories: ['Contrato de Compra e Venda', 'Contrato Assinado'],
          },
          {
            key: 'doc_sequence',
            title: '6. Sequência de Contrato',
            desc: 'Cadeia sucessória / contratos anteriores que comprovem a posse histórica',
            required: false,
            categories: ['Sequência de Contrato'],
          },
          {
            key: 'doc_service',
            title: '7. Contrato de Prestação de Serviços',
            desc: 'Contrato firmado para regularização fundiária / assessoria REURB',
            required: true,
            categories: ['Contrato de Prestação de Serviços'],
          },
          {
            key: 'doc_extra',
            title: '8. Documentos Complementares',
            desc: 'IPTU, comprovantes de posse antiga, fotos do lote, memoriais, etc.',
            required: false,
            categories: ['Documentos Complementares', 'Documento Técnico', 'Planta e Topografia', 'Outros'],
          },
        ];

        // Mapear documentos anexados por item do checklist
        const getDocsForChecklist = (categories: string[]) => {
          if (!lot.documents) return [];
          return lot.documents.filter((d) => {
            const cat = d.category || d.documentType?.name || 'Outros';
            return categories.some((c) => cat.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(cat.toLowerCase()));
          });
        };

        const totalRequired = CHECKLIST_ITEMS.filter((i) => i.required).length;
        const totalCompleted = CHECKLIST_ITEMS.filter((i) => i.required && getDocsForChecklist(i.categories).length > 0).length;
        const progressPercent = Math.round((totalCompleted / totalRequired) * 100);

        return (
          <div className="space-y-6">
            {/* CABEÇALHO DA ABA */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#17343b]">Checklist de Documentos para Regularização (REURB)</h3>
                <p className="text-xs text-slate-500">
                  Controle analítico de documentação jurídica, pessoal e posse necessária para emissão do título.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDocUploadState({ file: null, category: 'RG/CPF ou CNH do Titular', notes: '' });
                  setUploadDocModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c4952] transition shadow-sm"
              >
                <Upload size={15} /> Anexar Documento
              </button>
            </div>

            {/* BARRA DE PROGRESSO DO CHECKLIST */}
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCheck2 size={20} className="text-[#0f5964]" />
                  <span className="text-sm font-bold text-slate-900">Progresso dos Documentos Obrigatórios</span>
                </div>
                <span className={`text-xs font-extrabold px-3 py-1 rounded-full ${progressPercent === 100 ? 'bg-emerald-100 text-emerald-800' : 'bg-teal-50 text-[#0f5964]'}`}>
                  {totalCompleted} de {totalRequired} obrigatórios ({progressPercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-[#0f5964]'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* LISTAGEM EM FORMATO DE CHECKLIST */}
            <div className="space-y-3">
              {CHECKLIST_ITEMS.map((item) => {
                const attached = getDocsForChecklist(item.categories);
                const hasDocs = attached.length > 0;
                const isDragTarget = dragTargetChecklistKey === item.key;

                return (
                  <div
                    key={item.key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragTargetChecklistKey(item.key);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragTargetChecklistKey(item.key);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.currentTarget === e.target) {
                        setDragTargetChecklistKey(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragTargetChecklistKey(null);
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) {
                        setDocUploadState({
                          file: droppedFile,
                          category: item.categories[0],
                          notes: '',
                        });
                        setUploadDocModalOpen(true);
                      }
                    }}
                    className={`rounded-2xl border transition-all p-4.5 bg-white shadow-soft ${
                      isDragTarget
                        ? 'border-2 border-dashed border-[#0f5964] bg-teal-50/80 ring-4 ring-teal-500/20 scale-[1.01]'
                        : hasDocs
                        ? 'border-emerald-200 bg-emerald-50/10'
                        : item.required
                        ? 'border-amber-200 bg-amber-50/10'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {hasDocs ? (
                            <CheckCircle2 size={20} className="text-emerald-600" />
                          ) : item.required ? (
                            <FileClock size={20} className="text-amber-500" />
                          ) : (
                            <Paperclip size={20} className="text-slate-300" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-slate-900">{item.title}</h4>
                            {isDragTarget ? (
                              <span className="rounded bg-[#0f5964] text-white px-2 py-0.5 text-[10px] font-bold animate-pulse">
                                Solte o arquivo aqui para anexar
                              </span>
                            ) : item.required ? (
                              <span className="rounded bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 text-[10px] font-bold">
                                Obrigatório
                              </span>
                            ) : (
                              <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-[10px] font-semibold">
                                Opcional / Se houver
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDocUploadState({
                              file: null,
                              category: item.categories[0],
                              notes: '',
                            });
                            setUploadDocModalOpen(true);
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50/70 px-3 py-1.5 text-xs font-bold text-[#0f5964] hover:bg-teal-100 transition"
                        >
                          <Upload size={13} /> Anexar
                        </button>
                      </div>
                    </div>

                    {/* ARQUIVOS ANEXADOS DESTE ITEM */}
                    {hasDocs && (
                      <div className="mt-3 border-t border-slate-100 pt-3 space-y-2">
                        {attached.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText size={15} className="text-[#0f5964] shrink-0" />
                              <span className="font-semibold text-slate-800 truncate" title={doc.originalName}>
                                {doc.originalName}
                              </span>
                              {doc.notes && (
                                <span className="text-[11px] text-slate-400 italic truncate max-w-[200px]">
                                  ({doc.notes})
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                · {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <a
                                href={doc.filePath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 font-bold text-[#0f5964] hover:underline"
                              >
                                <Download size={13} /> Baixar
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDeleteDoc(doc.id)}
                                className="text-slate-400 hover:text-rose-600 transition p-1"
                                title="Excluir anexo"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ABA 5: RELATÓRIOS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Espelho & Relatório Individual do Lote</h3>
              <p className="text-xs text-slate-500">Resumo completo com cabeçalho oficial para impressão e arquivo.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-xl bg-[#17343b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f5964] transition shadow-sm"
            >
              <Printer size={15} /> Imprimir / Salvar PDF
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-soft space-y-6 text-sm text-slate-800 print:border-none print:shadow-none print:p-0">
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 uppercase tracking-wide">
                  GÊNESIS REURB - FICHA CADASTRAL INDIVIDUAL
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Projeto: <strong>{lot.project.name}</strong> · Município: {lot.project.city || 'Aripuanã'} - {lot.project.state || 'MT'}
                </p>
              </div>
              <div className="text-right text-xs text-slate-500">
                Data de Emissão: {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-xs uppercase text-slate-400 font-bold">Identificação:</span>
                <p className="font-bold text-base text-slate-900">Lote {lot.number}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-400 font-bold">Quadra:</span>
                <p className="font-bold text-base text-slate-900">Quadra {lot.block.number}</p>
              </div>
              <div>
                <span className="text-xs uppercase text-slate-400 font-bold">Situação Jurídica:</span>
                <p className="font-bold text-slate-900">{statusCfg.label}</p>
              </div>
            </div>

            <div>
              <h4 className="font-bold uppercase text-xs text-slate-500 border-b pb-1 mb-2">1. Dados do Titular / Requerente</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Nome Completo:</span>
                  <p className="font-bold text-slate-900">{currentOwner?.fullName || 'Não cadastrado'}</p>
                </div>
                <div>
                  <span className="text-slate-400">CPF:</span>
                  <p className="font-mono font-medium text-slate-900">{currentOwner?.cpf || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Telefone:</span>
                  <p className="font-medium text-slate-900">{currentOwner?.phone || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Estado Civil:</span>
                  <p className="font-medium text-slate-900">{currentOwner?.maritalStatus || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold uppercase text-xs text-slate-500 border-b pb-1 mb-2">2. Características do Imóvel</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">Área Total:</span>
                  <p className="font-bold text-slate-900">{lot.area ? `${lot.area} m²` : '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Perímetro:</span>
                  <p className="font-medium text-slate-900">{lot.perimeter ? `${lot.perimeter} m` : '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Endereço:</span>
                  <p className="font-medium text-slate-900">{lot.address || '—'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Matrícula:</span>
                  <p className="font-mono text-slate-900">{lot.registration || '—'}</p>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-bold uppercase text-xs text-slate-500 border-b pb-1 mb-2">3. Posição Financeira</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400">Total Contratado:</span>
                  <p className="font-bold text-sm text-slate-900">{money(financials.contracted)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400">Total Quitado:</span>
                  <p className="font-bold text-sm text-emerald-700">{money(financials.received)}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400">Saldo Devedor:</span>
                  <p className="font-bold text-sm text-amber-700">{money(financials.pending)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 6: LOCALIZAÇÃO & GEORREFERENCIAMENTO */}
      {activeTab === 'location' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Localização & Dados Topográficos</h3>
              <p className="text-xs text-slate-500">Dimensões perimétricas, confrontações, coordenadas e estrutura para Shapefile.</p>
            </div>
            <button
              type="button"
              onClick={() => setEditModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-sm"
            >
              <Edit3 size={15} /> Editar Dados Técnicos
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Maximize2 size={16} className="text-[#0f5964]" /> Dimensões do Lote
              </h4>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Frente:</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{lot.frontDimension ? `${lot.frontDimension} m` : 'Não informada'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Fundos:</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{lot.backDimension ? `${lot.backDimension} m` : 'Não informada'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Lado Direito:</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{lot.rightDimension ? `${lot.rightDimension} m` : 'Não informada'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Lado Esquerdo:</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{lot.leftDimension ? `${lot.leftDimension} m` : 'Não informada'}</p>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <span className="text-xs text-slate-400 font-semibold uppercase">Confrontações / Divisas:</span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                  {lot.confrontations || 'Nenhuma confrontação cadastrada.'}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-4">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <MapPin size={16} className="text-[#0f5964]" /> Georreferenciamento & Mapa
              </h4>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Latitude:</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{lot.latitude || '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl">
                  <span className="text-slate-400 font-semibold uppercase">Longitude:</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">{lot.longitude || '—'}</p>
                </div>
              </div>

              <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center space-y-2">
                <MapPin size={28} className="mx-auto text-slate-400" />
                <p className="text-xs font-bold text-slate-700">Módulo de Mapa & Shapefile Pronto para Integração</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  A estrutura do banco já está preparada para receber arquivos Shape (.shp, .zip, .geojson) e exibir polígonos no mapa.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDITAR LOTE */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4">
          <form onSubmit={handleSaveLot} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Editar Dados do Lote</h3>
              <button type="button" onClick={() => setEditModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="font-semibold text-slate-700 sm:col-span-2">
                Titular / Beneficiário do Lote
                <select
                  value={editForm.personId}
                  onChange={(e) => setEditForm({ ...editForm, personId: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none focus:ring-1 focus:ring-[#0f5964]"
                >
                  <option value="">-- Sem titular vinculado --</option>
                  {peopleList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} {p.cpf ? `(CPF: ${p.cpf})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="font-semibold text-slate-700">
                Número do Lote
                <input
                  required
                  type="text"
                  value={editForm.number}
                  onChange={(e) => setEditForm({ ...editForm, number: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Situação do Lote
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="NOT_SIGNED">Não assinou contrato</option>
                  <option value="CONTRACT_SIGNED">Contrato assinado</option>
                  <option value="TITLE_ISSUED">Título emitido</option>
                  <option value="REGISTERED">Registrado em cartório</option>
                  <option value="CANCELLED">Distrato / Cancelado</option>
                </select>
              </label>

              <label className="font-semibold text-slate-700 sm:col-span-2">
                Endereço / Logradouro
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Área Total (m²)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.area}
                  onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Perímetro (m)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.perimeter}
                  onChange={(e) => setEditForm({ ...editForm, perimeter: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Dimensão Frente (m)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.frontDimension}
                  onChange={(e) => setEditForm({ ...editForm, frontDimension: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Dimensão Fundos (m)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.backDimension}
                  onChange={(e) => setEditForm({ ...editForm, backDimension: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Lado Direito (m)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.rightDimension}
                  onChange={(e) => setEditForm({ ...editForm, rightDimension: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Lado Esquerdo (m)
                <input
                  type="number"
                  step="0.01"
                  value={editForm.leftDimension}
                  onChange={(e) => setEditForm({ ...editForm, leftDimension: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700 sm:col-span-2">
                Confrontações
                <textarea
                  rows={2}
                  value={editForm.confrontations}
                  onChange={(e) => setEditForm({ ...editForm, confrontations: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <label className="font-semibold text-slate-700 sm:col-span-2">
                Observações Técnicas / Gerais
                <textarea
                  rows={2}
                  value={editForm.observations}
                  onChange={(e) => setEditForm({ ...editForm, observations: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952]"
              >
                Salvar Alterações
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO CONTRATO */}
      {newContractModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4">
          <form onSubmit={handleCreateContract} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Novo Contrato / Termo de Adesão</h3>
              <button type="button" onClick={() => setNewContractModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-700">Titular do Contrato:</span>
                <p className="font-bold text-sm text-slate-900">{currentOwner?.fullName || 'Sem titular cadastrado'}</p>
              </div>

              <label className="block font-semibold text-slate-700">
                Valor Total (R$)
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="Ex: 5000.00"
                  value={contractForm.totalValue}
                  onChange={(e) => setContractForm({ ...contractForm, totalValue: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Valor da Entrada (R$)
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={contractForm.downPayment}
                    onChange={(e) => setContractForm({ ...contractForm, downPayment: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="font-semibold text-slate-700">
                  Qtd. de Parcelas
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={contractForm.installmentCount}
                    onChange={(e) => setContractForm({ ...contractForm, installmentCount: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Data da Entrada
                  <input
                    type="date"
                    value={contractForm.entryDate}
                    onChange={(e) => setContractForm({ ...contractForm, entryDate: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="font-semibold text-slate-700">
                  1º Vencimento
                  <input
                    type="date"
                    value={contractForm.firstDueDate}
                    onChange={(e) => setContractForm({ ...contractForm, firstDueDate: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setNewContractModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952]"
              >
                Emitir Contrato
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: UPLOAD DE DOCUMENTO */}
      {uploadDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4">
          <form onSubmit={handleUploadDoc} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Anexar Documento ao Lote</h3>
              <button type="button" onClick={() => setUploadDocModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Categoria do Documento
                <select
                  value={docUploadState.category}
                  onChange={(e) => setDocUploadState({ ...docUploadState, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="RG/CPF ou CNH do Titular">1. RG, CPF ou CNH do Titular</option>
                  <option value="Documento do Cônjuge">2. Documento do Cônjuge (se casado)</option>
                  <option value="Certidão de Casamento ou Nascimento">3. Certidão de Casamento ou Nascimento</option>
                  <option value="Comprovante de Residência">4. Comprovante de Residência</option>
                  <option value="Contrato de Compra e Venda">5. Contrato de Compra e Venda do Lote</option>
                  <option value="Sequência de Contrato">6. Sequência de Contrato</option>
                  <option value="Contrato de Prestação de Serviços">7. Contrato de Prestação de Serviços</option>
                  <option value="Documentos Complementares">8. Documentos Complementares</option>
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Observação (Opcional)
                <input
                  type="text"
                  placeholder="Ex: Assinado em cartório, via original..."
                  value={docUploadState.notes}
                  onChange={(e) => setDocUploadState({ ...docUploadState, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </label>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setDocUploadState((curr) => ({ ...curr, file: f }));
                    if (e.target) e.target.value = '';
                  }}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingDoc(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingDoc(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingDoc(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingDoc(false);
                    const droppedFile = e.dataTransfer.files?.[0] || null;
                    if (droppedFile) {
                      setDocUploadState((curr) => ({ ...curr, file: droppedFile }));
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition cursor-pointer ${
                    isDraggingDoc
                      ? 'border-[#0f5964] bg-teal-50/80 ring-4 ring-teal-500/20 scale-[1.01]'
                      : docUploadState.file
                      ? 'border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70'
                      : 'border-slate-300 hover:border-[#0f5964] hover:bg-slate-50'
                  }`}
                >
                  {docUploadState.file ? (
                    <div className="flex flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm mb-2">
                        <CheckCircle2 size={24} />
                      </div>
                      <p className="text-xs font-bold text-slate-800 break-all px-2 max-w-full">
                        {docUploadState.file.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {(docUploadState.file.size / (1024 * 1024)).toFixed(2)} MB · Pronto para salvar
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0f5964] border border-slate-200 shadow-xs group-hover:bg-slate-50">
                          Clique ou arraste outro para trocar
                        </span>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setDocUploadState((curr) => ({ ...curr, file: null }));
                          }}
                          className="rounded-lg bg-white p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                          title="Remover arquivo selecionado"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-2xl mb-2 transition-all ${
                          isDraggingDoc
                            ? 'bg-[#0f5964] text-white scale-110 shadow-md animate-pulse'
                            : 'bg-teal-50 text-[#0f5964]'
                        }`}
                      >
                        <Upload size={24} />
                      </div>
                      <p className="text-xs font-bold text-slate-800">
                        {isDraggingDoc ? 'Solte o arquivo aqui agora' : 'Arraste e solte o documento aqui'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        ou clique para navegar no computador
                      </p>
                      <span className="mt-2 text-[10px] text-slate-400 font-medium">
                        Formatos aceitos: PDF, Imagens (JPG, PNG) e DOCX
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setUploadDocModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!docUploadState.file}
                className="rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] disabled:opacity-50"
              >
                Salvar Anexo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO LANÇAMENTO DE RECEITA DIRETO NO LOTE */}
      {revenueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102a33]/60 p-4">
          <form onSubmit={handleSaveRevenue} className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <ArrowUpRight size={20} />
                <h3 className="text-lg font-bold text-slate-900">Novo Lançamento de Receita (Entrada)</h3>
              </div>
              <button
                type="button"
                onClick={() => setRevenueModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Conta de Destino (Onde o dinheiro entrou)
                <select
                  required
                  value={revenueForm.accountId}
                  onChange={(e) => setRevenueForm({ ...revenueForm, accountId: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Selecione uma conta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (Saldo Atual: {money(a.balance)})
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-xl bg-teal-50 border border-teal-200 p-3">
                <span className="text-[10px] font-bold uppercase text-teal-800 tracking-wider">Lote Vinculado</span>
                <p className="text-sm font-bold text-slate-900 mt-0.5">
                  Quadra {lot.block?.number || '—'} · Lote {lot.number}
                </p>
                <p className="text-xs text-slate-600">
                  Titular: <strong>{currentOwner?.fullName || 'Sem titular'}</strong>
                </p>
              </div>

              <label className="block font-semibold text-slate-700">
                Descrição da Receita
                <input
                  required
                  type="text"
                  placeholder="Ex: Pagamento de entrada em espécie..."
                  value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964]"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Valor Recebido (R$)
                  <input
                    required
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={revenueForm.amount}
                    onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#0f5964]"
                  />
                </label>
                <label className="font-semibold text-slate-700">
                  Data do Recebimento
                  <input
                    type="date"
                    value={revenueForm.paymentDate}
                    onChange={(e) => setRevenueForm({ ...revenueForm, paymentDate: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Forma de Recebimento
                  <select
                    value={revenueForm.paymentMethod}
                    onChange={(e) => setRevenueForm({ ...revenueForm, paymentMethod: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="PIX">PIX</option>
                    <option value="BANK_TRANSFER">Transferência Bancária</option>
                    <option value="CASH">Dinheiro / Espécie</option>
                    <option value="BOLETO">Boleto Bancário</option>
                    <option value="CARD">Cartão</option>
                  </select>
                </label>
                <label className="font-semibold text-slate-700">
                  Comprovante (Opcional)
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setRevenueForm({ ...revenueForm, file: f });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-300 p-1.5 text-xs text-slate-700 bg-white"
                  />
                </label>
              </div>

              <label className="block font-semibold text-slate-700">
                Observações
                <input
                  type="text"
                  placeholder="Informações adicionais..."
                  value={revenueForm.notes}
                  onChange={(e) => setRevenueForm({ ...revenueForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                onClick={() => setRevenueModalOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-800"
              >
                Salvar Receita
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}