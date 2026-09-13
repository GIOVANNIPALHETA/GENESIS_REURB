import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Coins,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileCheck2,
  FileClock,
  FileText,
  Filter,
  History,
  Layers,
  MapPin,
  Paperclip,
  Pencil,
  PieChart as PieChartIcon,
  Plus,
  Printer,
  Receipt,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  User,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { maskCurrency, unmaskCurrency } from '../utils/money';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_STYLES } from '../utils/paymentMethods';
import { normalizeText } from '../utils/text';

type FinancialAccount = {
  id: string;
  name: string;
  type: string;
  openingBalance: number;
  received: number;
  spent: number;
  balance: number;
};

type ExpenseType = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  isFixed: boolean;
  requiresReceipt: boolean;
  affectsProfitSharing: boolean;
  active: boolean;
};

type ExpenseItem = {
  id: string;
  description: string;
  amount: number;
  expenseDate: string;
  dueDate?: string;
  status: string;
  paymentMethod: string;
  beneficiary?: string;
  transactionId?: string;
  notes?: string;
  isRecurring: boolean;
  expenseTypeId?: string;
  expenseType?: ExpenseType;
  account: { id: string; name: string };
  project?: { id: string; name: string };
  lot?: { id: string; number: string; block: { number: string } };
  user: { id: string; name: string };
  attachments: Array<{ id: string; originalName: string; filePath: string }>;
};

type ProfitBeneficiary = {
  id: string;
  name: string;
  type: string;
  documentNumber?: string;
  defaultPercentage: number;
  totalWithdrawn: number;
  active: boolean;
  notes?: string;
};

type ProfitSummary = {
  period: { year: number; month: number; label: string };
  totalRevenue: number;
  operationalExpenses: number;
  asaasFees: number;
  netProfit: number;
  totalWithdrawn: number;
  remainingProfit: number;
  items: Array<{
    beneficiaryId: string;
    beneficiaryName: string;
    beneficiaryType: string;
    percentage: number;
    allocatedAmount: number;
    withdrawnAmount: number;
    remainingAmount: number;
  }>;
  withdrawals: Array<{
    id: string;
    amount: number;
    withdrawalDate: string;
    paymentMethod: string;
    notes?: string;
    beneficiary: { name: string };
    account: { name: string };
  }>;
};

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const EXPENSE_STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  PAID: { label: 'Pago', style: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  PENDING: { label: 'Pendente', style: 'bg-amber-50 text-amber-800 border-amber-200' },
  SCHEDULED: { label: 'Agendado', style: 'bg-blue-50 text-blue-800 border-blue-200' },
  CANCELED: { label: 'Cancelado', style: 'bg-rose-50 text-rose-800 border-rose-200' },
};

export function FinancePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'revenues' | 'expenses' | 'types' | 'accounts' | 'profit' | 'reports'>('overview');
  const [loading, setLoading] = useState(true);

  // Dados Globais
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<ProfitBeneficiary[]>([]);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [lotsList, setLotsList] = useState<any[]>([]);
  const [installments, setInstallments] = useState<any[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Filtros de Receitas / Extrato
  const [revSearch, setRevSearch] = useState('');
  const [revStatus, setRevStatus] = useState('');
  const [revAccount, setRevAccount] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const [revDateFrom, setRevDateFrom] = useState('');
  const [revDateTo, setRevDateTo] = useState('');

  // Filtros de Despesas
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Modais
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [revenueModalOpen, setRevenueModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [beneficiaryModalOpen, setBeneficiaryModalOpen] = useState(false);
  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [scanningReceipt, setScanningReceipt] = useState(false);

  // Estados de Formulário
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [revenueForm, setRevenueForm] = useState({
    accountId: '',
    lotId: '',
    description: '',
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'PIX',
    notes: '',
    file: null as File | null,
  });

  const [expenseForm, setExpenseForm] = useState({
    expenseTypeId: '',
    accountId: '',
    beneficiary: '',
    description: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    status: 'PAID',
    paymentMethod: 'CASH',
    transactionId: '',
    notes: '',
    isRecurring: false,
    file: null as File | null,
  });

  const [typeForm, setTypeForm] = useState({
    name: '',
    description: '',
    color: '#0f5964',
    isFixed: false,
    requiresReceipt: false,
    affectsProfitSharing: true,
  });

  const [beneficiaryForm, setBeneficiaryForm] = useState({
    name: '',
    type: 'INDIVIDUAL',
    documentNumber: '',
    defaultPercentage: '33.33',
    notes: '',
  });

  const [withdrawalForm, setWithdrawalForm] = useState({
    beneficiaryId: '',
    accountId: '',
    amount: '',
    withdrawalDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'PIX',
    notes: '',
  });

  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Fechar dropdown de projetos ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setProjectDropdownOpen(false);
      }
    }
    if (projectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [projectDropdownOpen]);

  // Carregar Dados
  async function loadData() {
    setLoading(true);
    try {
      const [accRes, expRes, typesRes, benRes, profRes, lotsRes, instRes, projRes] = await Promise.all([
        axios.get('/api/finance/accounts'),
        axios.get('/api/expenses'),
        axios.get('/api/expenses/types/list'),
        axios.get('/api/expenses/profit/beneficiaries'),
        axios.get('/api/expenses/profit/summary'),
        axios.get('/api/lots'),
        axios.get('/api/finance/installments'),
        axios.get('/api/projects'),
      ]);
      setAccounts(accRes.data.data || []);
      setExpenses(expRes.data.data || []);
      setExpenseTypes(typesRes.data.data || []);
      setBeneficiaries(benRes.data.data || []);
      setProfitSummary(profRes.data.data || null);
      setLotsList(lotsRes.data.data || []);
      setInstallments(instRes.data.data || []);
      setProjects(projRes.data.data || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  // Lista unificada de projetos disponíveis
  const availableProjects = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => {
      if (p.id && p.name) map.set(p.id, p.name);
    });
    installments.forEach((i) => {
      const p = i.negotiation?.contract?.project;
      if (p && p.id && !map.has(p.id)) {
        map.set(p.id, p.name || 'Projeto');
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [projects, installments]);

  // Contagem de títulos/parcelas por projeto
  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    installments.forEach((i) => {
      const pId = i.negotiation?.contract?.project?.id;
      if (pId) {
        counts[pId] = (counts[pId] || 0) + 1;
      }
    });
    return counts;
  }, [installments]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const selectAllProjects = () => {
    setSelectedProjectIds(availableProjects.map((p) => p.id));
  };

  const clearProjects = () => {
    setSelectedProjectIds([]);
  };

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const isNew = searchParams.get('new');
    const type = searchParams.get('type');
    const lotIdParam = searchParams.get('lotId');

    if (isNew === '1' || lotIdParam) {
      setActiveTab('expenses');
      if (type === 'expense') {
        setEditingExpenseId(null);
        setExpenseModalOpen(true);
      } else {
        // Padrão: Abre a tela de Novo Lançamento de Receita (Entrada)
        const selectedLot = lotsList.find((l) => l.id === lotIdParam);
        const ownerName = selectedLot?.occupancies?.find((o: any) => o.current)?.person?.fullName || selectedLot?.contracts?.[0]?.person?.fullName;

        setRevenueForm({
          accountId: accounts[0]?.id || '',
          lotId: lotIdParam || '',
          description: ownerName ? `Recebimento Lote ${selectedLot?.number} - ${ownerName}` : '',
          amount: '',
          paymentDate: new Date().toISOString().slice(0, 10),
          paymentMethod: 'PIX',
          notes: '',
          file: null,
        });
        setRevenueModalOpen(true);
      }
    }
  }, [searchParams, accounts, lotsList]);

  // Filtro e Extrato de Receitas / Parcelas
  const filteredRevenues = useMemo(() => {
    const now = new Date();
    return installments
      .map((inst) => {
        const contract = inst.negotiation?.contract;
        const person = contract?.person;
        const lot = contract?.lot;
        const project = contract?.project;
        const dueDate = new Date(inst.dueDate);
        const isOverdue = inst.status !== 'PAID' && dueDate < now;
        const diffTime = now.getTime() - dueDate.getTime();
        const overdueDays = isOverdue ? Math.floor(diffTime / (1000 * 60 * 60 * 24)) : 0;
        const payment = inst.payments?.[0];

        return {
          ...inst,
          contract,
          person,
          lot,
          project,
          isOverdue,
          overdueDays,
          payment,
        };
      })
      .filter((item) => {
        if (selectedProjectIds.length > 0) {
          if (!item.project?.id || !selectedProjectIds.includes(item.project.id)) {
            return false;
          }
        }
        if (revStatus) {
          if (revStatus === 'OVERDUE') {
            if (!item.isOverdue) return false;
          } else if (item.status !== revStatus) {
            return false;
          }
        }
        if (revAccount) {
          const hasAccount = item.payments?.some((p: any) => p.accountId === revAccount);
          if (!hasAccount) return false;
        }
        if (revDateFrom && new Date(item.dueDate) < new Date(`${revDateFrom}T00:00:00`)) return false;
        if (revDateTo && new Date(item.dueDate) > new Date(`${revDateTo}T23:59:59`)) return false;

        if (revSearch.trim()) {
          const q = normalizeText(revSearch);
          const matchPerson = normalizeText(item.person?.fullName).includes(q);
          const matchCpf = item.person?.cpf ? normalizeText(item.person.cpf).includes(q) : false;
          const matchLot = normalizeText(item.lot?.number).includes(q);
          const matchBlock = normalizeText(item.lot?.block?.number).includes(q);
          const matchProject = normalizeText(item.project?.name).includes(q);
          const matchNotes = normalizeText(item.payments?.[0]?.notes).includes(q);
          if (!matchPerson && !matchCpf && !matchLot && !matchBlock && !matchProject && !matchNotes) return false;
        }

        return true;
      });
  }, [installments, revSearch, revStatus, revAccount, selectedProjectIds, revDateFrom, revDateTo]);

  // Estatísticas dinâmicas baseadas nas receitas filtradas
  const revenueStats = useMemo(() => {
    const totalReceived = filteredRevenues.reduce(
      (s, i) => s + (i.paidAmount || (i.status === 'PAID' ? i.amount : 0)),
      0
    );
    const totalPending = filteredRevenues
      .filter((i) => i.status !== 'PAID')
      .reduce((s, i) => s + (i.amount - (i.paidAmount || 0)), 0);
    const overdueCount = filteredRevenues.filter((i) => i.isOverdue).length;
    return { totalReceived, totalPending, overdueCount };
  }, [filteredRevenues]);

  // Cálculos do Dashboard / Visão Geral
  const dashboardStats = useMemo(() => {
    const totalReceived = installments.reduce((s, i) => s + (i.paidAmount || 0), 0);
    const totalPendingRev = installments
      .filter((i) => i.status !== 'PAID')
      .reduce((s, i) => s + (i.amount - (i.paidAmount || 0)), 0);
    const totalSpent = expenses.filter((e) => e.status === 'PAID').reduce((s, e) => s + e.amount, 0);
    const totalPending = expenses.filter((e) => e.status === 'PENDING').reduce((s, e) => s + e.amount, 0);
    const asaasFees = expenses
      .filter((e) => e.status === 'PAID' && (e.expenseType?.name.includes('Asaas') || e.description.toLowerCase().includes('asaas')))
      .reduce((s, e) => s + e.amount, 0);

    const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

    // Agrupamento por Categoria
    const categoryTotals: Record<string, number> = {};
    expenses.filter((e) => e.status === 'PAID').forEach((e) => {
      const cat = e.expenseType?.name || 'Outros';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
    });

    return {
      totalReceived,
      totalPendingRev,
      totalSpent,
      totalPending,
      asaasFees,
      totalBalance,
      categoryTotals,
    };
  }, [expenses, accounts, installments]);

  // Filtro de Despesas
  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (selectedStatus && e.status !== selectedStatus) return false;
      if (selectedType && e.expenseTypeId !== selectedType) return false;
      if (selectedAccount && e.account.id !== selectedAccount) return false;
      if (dateFrom && new Date(e.expenseDate) < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo && new Date(e.expenseDate) > new Date(`${dateTo}T23:59:59`)) return false;
      if (search.trim()) {
        const q = normalizeText(search);
        const matchDesc = normalizeText(e.description).includes(q);
        const matchBen = normalizeText(e.beneficiary).includes(q);
        const matchType = normalizeText(e.expenseType?.name).includes(q);
        if (!matchDesc && !matchBen && !matchType) return false;
      }
      return true;
    });
  }, [expenses, selectedStatus, selectedType, selectedAccount, dateFrom, dateTo, search]);

  // Salvar Despesa
  async function handleSaveExpense(e: React.FormEvent) {
    e.preventDefault();
    try {
      let savedExpenseId = editingExpenseId;
      if (editingExpenseId) {
        await axios.put(`/api/expenses/${editingExpenseId}`, {
          ...expenseForm,
          amount: Number(expenseForm.amount),
        });
      } else {
        const res = await axios.post('/api/expenses', {
          ...expenseForm,
          amount: Number(expenseForm.amount),
        });
        savedExpenseId = res.data.data.id;
      }

      // Se anexou arquivo, faz o upload vinculado
      if (expenseForm.file && savedExpenseId) {
        const fd = new FormData();
        fd.append('file', expenseForm.file);
        await axios.post(`/api/expenses/${savedExpenseId}/attachments`, fd);
      }

      setExpenseModalOpen(false);
      setEditingExpenseId(null);
      setExpenseForm({
        expenseTypeId: '',
        accountId: '',
        beneficiary: '',
        description: '',
        amount: '',
        expenseDate: new Date().toISOString().slice(0, 10),
        dueDate: '',
        status: 'PAID',
        paymentMethod: 'CASH',
        transactionId: '',
        notes: '',
        isRecurring: false,
        file: null,
      });
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao salvar despesa');
    }
  }

  // Deletar Despesa
  async function handleDeleteExpense(id: string) {
    if (!window.confirm('Deseja realmente excluir este lançamento de despesa?')) return;
    try {
      await axios.delete(`/api/expenses/${id}`);
      await loadData();
    } catch {
      alert('Não foi possível excluir a despesa.');
    }
  }

  // OCR / Leitura Inteligente de Comprovante
  async function handleScanReceipt(file: File) {
    setScanningReceipt(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post('/api/expenses/scan-receipt', fd);
      const sug = res.data.data.suggestion;

      // Preenche o modal automaticamente com a sugestão para aprovação humana
      setExpenseForm((prev) => ({
        ...prev,
        expenseTypeId: sug.expenseTypeId || prev.expenseTypeId,
        description: sug.description || prev.description,
        beneficiary: sug.beneficiary || prev.beneficiary,
        amount: String(sug.amount || ''),
        expenseDate: sug.expenseDate || prev.expenseDate,
        paymentMethod: sug.paymentMethod || prev.paymentMethod,
        accountId: sug.accountId || accounts[0]?.id || '',
        transactionId: sug.transactionId || prev.transactionId,
        file,
      }));

      setExpenseModalOpen(true);
      alert('✨ Comprovante analisado! Confira as informações sugeridas e clique em Salvar Despesa.');
    } catch (err) {
      alert('Não foi possível processar o comprovante automaticamente.');
    } finally {
      setScanningReceipt(false);
    }
  }

  // Salvar Nova Receita Manual
  async function handleSaveRevenue(e: React.FormEvent) {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('accountId', revenueForm.accountId);
      if (revenueForm.lotId) fd.append('lotId', revenueForm.lotId);
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
        lotId: '',
        description: '',
        amount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'PIX',
        notes: '',
        file: null,
      });
      await loadData();
      alert('✅ Receita registrada com sucesso! O caixa e o lote foram atualizados.');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao registrar receita.');
    }
  }

  // Salvar Retirada de Lucro
  async function handleSaveWithdrawal(e: React.FormEvent) {
    e.preventDefault();
    try {
      await axios.post('/api/expenses/profit/withdrawals', {
        beneficiaryId: withdrawalForm.beneficiaryId,
        accountId: withdrawalForm.accountId,
        amount: Number(withdrawalForm.amount),
        withdrawalDate: withdrawalForm.withdrawalDate,
        paymentMethod: withdrawalForm.paymentMethod,
        notes: withdrawalForm.notes,
      });

      setWithdrawalModalOpen(false);
      setWithdrawalForm({
        beneficiaryId: '',
        accountId: '',
        amount: '',
        withdrawalDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'PIX',
        notes: '',
      });
      await loadData();
      alert('✅ Retirada registrada com sucesso! O caixa foi atualizado.');
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao registrar retirada.');
    }
  }

  // Salvar Novo Tipo de Despesa
  async function handleSaveType(e: React.FormEvent) {
    e.preventDefault();
    try {
      await axios.post('/api/expenses/types/list', typeForm);
      setTypeModalOpen(false);
      setTypeForm({ name: '', description: '', color: '#0f5964', isFixed: false, requiresReceipt: false, affectsProfitSharing: true });
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar tipo de despesa');
    }
  }

  // Salvar Novo Beneficiário
  async function handleSaveBeneficiary(e: React.FormEvent) {
    e.preventDefault();
    try {
      await axios.post('/api/expenses/profit/beneficiaries', {
        ...beneficiaryForm,
        defaultPercentage: Number(beneficiaryForm.defaultPercentage),
      });
      setBeneficiaryModalOpen(false);
      setBeneficiaryForm({ name: '', type: 'INDIVIDUAL', documentNumber: '', defaultPercentage: '33.33', notes: '' });
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao criar beneficiário');
    }
  }

  return (
    <div className="space-y-6 pb-24">
      {/* CABEÇALHO COMPACTO */}
      <PageHeader
        breadcrumb="Gestão / Financeiro"
        title="Financeiro"
        subtitle="Recebimentos, despesas e contas em um só lugar."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setRevenueForm({
                accountId: accounts[0]?.id || '',
                lotId: '',
                description: '',
                amount: '',
                paymentDate: new Date().toISOString().slice(0, 10),
                paymentMethod: 'PIX',
                notes: '',
                file: null,
              });
              setRevenueModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[#0f5964] hover:bg-[#0c4952] px-3.5 py-2 text-sm font-medium text-white transition shadow-xs"
          >
            <Plus size={16} />
            <span>+ Nova receita</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingExpenseId(null);
              setExpenseModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 transition shadow-xs"
          >
            <Plus size={16} />
            <span>+ Nova despesa</span>
          </button>
        </div>
      </PageHeader>

      {/* NAVEGAÇÃO DE ABAS SÓBRIA */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="flex gap-4 sm:gap-6 min-w-max text-sm">
          {[
            { key: 'overview', label: 'Visão geral' },
            { key: 'revenues', label: 'Receitas' },
            { key: 'expenses', label: 'Despesas' },
            { key: 'accounts', label: 'Contas' },
            { key: 'profit', label: 'Divisão de lucros' },
            { key: 'types', label: 'Tipos de despesa' },
            { key: 'reports', label: 'Relatórios' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`pb-3 pt-1 border-b-2 text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-[#0f5964] text-[#0f5964] font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300 font-medium'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* CARDS PRINCIPAIS */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Despesas pagas
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">{money(dashboardStats.totalSpent)}</p>
              <p className="text-xs text-slate-400 mt-1">Total de saídas liquidadas</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Despesas pendentes
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">{money(dashboardStats.totalPending)}</p>
              <p className="text-xs text-slate-400 mt-1">Contas a pagar agendadas</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Taxas do Asaas
              </span>
              <p className="mt-2 text-2xl font-bold text-slate-900">{money(dashboardStats.asaasFees)}</p>
              <p className="text-xs text-slate-400 mt-1">Tarifas e taxas bancárias</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Saldo geral em caixa
              </span>
              <p className="mt-2 text-2xl font-bold text-[#0f5964]">{money(dashboardStats.totalBalance)}</p>
              <p className="text-xs text-slate-400 mt-1">Soma de todas as contas</p>
            </div>
          </div>

          {/* SALDO POR CONTA & DESPESAS POR CATEGORIA */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Saldos por Conta */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <Wallet size={18} className="text-[#0f5964]" /> Saldos por Conta Financeira
              </h3>
              <div className="divide-y divide-slate-100">
                {accounts.map((acc) => (
                  <div key={acc.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{acc.name}</p>
                      <p className="text-xs text-slate-400">Entradas: {money(acc.received)} · Saídas: {money(acc.spent)}</p>
                    </div>
                    <p className={`text-base font-extrabold font-mono ${acc.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {money(acc.balance)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Despesas por Categoria */}
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-[#17343b] flex items-center gap-2">
                <Tag size={18} className="text-[#0f5964]" /> Despesas por Categoria
              </h3>
              <div className="space-y-3">
                {Object.entries(dashboardStats.categoryTotals).map(([cat, total]) => {
                  const percent = dashboardStats.totalSpent > 0 ? (total / dashboardStats.totalSpent) * 100 : 0;
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-800">{cat}</span>
                        <span className="text-slate-600">{money(total)} ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-[#0f5964] h-2 rounded-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: RECEITAS & EXTRATO DE PARCELAS / CLIENTES */}
      {activeTab === 'revenues' && (
        <div className="space-y-4">
          {/* CARDS DE RESUMO DE RECEITAS ESTILO REFERÊNCIA */}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Total recebido
              </span>
              <p className="mt-2 text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">
                {money(revenueStats.totalReceived)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Valores liquidados
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                A receber
              </span>
              <p className="mt-2 text-2xl sm:text-[28px] font-bold text-slate-900 tracking-tight">
                {money(revenueStats.totalPending)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Parcelas em aberto
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs">
              <span className="text-xs font-medium text-slate-500">
                Parcelas em atraso
              </span>
              <p className="mt-2 text-2xl sm:text-[28px] font-bold text-rose-600 tracking-tight">
                {revenueStats.overdueCount} {revenueStats.overdueCount === 1 ? 'parcela' : 'parcelas'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Requer acompanhamento
              </p>
            </div>
          </div>

          {/* FILTROS DE RECEITAS */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">Receitas e parcelas</h3>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
                  Resultados da busca
                </span>
              </div>
              {(revSearch || revStatus || revAccount || selectedProjectIds.length > 0 || revDateFrom || revDateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setRevSearch('');
                    setRevStatus('');
                    setRevAccount('');
                    setSelectedProjectIds([]);
                    setRevDateFrom('');
                    setRevDateTo('');
                  }}
                  className="text-xs font-medium text-[#0f5964] hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {/* 1. Busca Geral */}
              <div className="relative xl:col-span-2">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Valadares, titular, CPF, lote..."
                  value={revSearch}
                  onChange={(e) => setRevSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
                />
              </div>

              {/* 2. FILTRO MULTI-PROJETOS */}
              <div className="relative" ref={projectDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProjectDropdownOpen((v) => !v)}
                  className={`w-full flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition text-left ${
                    selectedProjectIds.length > 0
                      ? 'border-[#0f5964] bg-[#edf7f7] text-[#0f5964] font-medium'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="truncate">
                    {selectedProjectIds.length === 0
                      ? 'Todos os projetos'
                      : selectedProjectIds.length === 1
                      ? availableProjects.find((p) => p.id === selectedProjectIds[0])?.name || '1 projeto'
                      : `${selectedProjectIds.length} projetos`}
                  </span>
                  <ChevronDown size={14} className="text-slate-400 ml-1 shrink-0" />
                </button>

                {/* Popover de Seleção dos Projetos */}
                {projectDropdownOpen && (
                  <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="font-semibold text-xs text-slate-600">
                        Projetos ({selectedProjectIds.length}/{availableProjects.length})
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={selectAllProjects}
                          className="font-medium text-[#0f5964] hover:underline"
                        >
                          Marcar todos
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          onClick={clearProjects}
                          className="font-medium text-rose-600 hover:underline"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>

                    {availableProjects.length > 5 && (
                      <input
                        type="text"
                        placeholder="Buscar projeto..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:border-[#0f5964] outline-none"
                      />
                    )}

                    <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                      {availableProjects
                        .filter((p) => normalizeText(p.name).includes(normalizeText(projectSearch)))
                        .map((p) => {
                          const isSelected = selectedProjectIds.includes(p.id);
                          const count = projectCounts[p.id] || 0;
                          return (
                            <label
                              key={p.id}
                              className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 cursor-pointer transition text-xs select-none ${
                                isSelected ? 'bg-teal-50 text-[#0f5964] font-medium' : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleProject(p.id)}
                                  className="h-3.5 w-3.5 rounded border-slate-300 text-[#0f5964] focus:ring-[#0f5964]"
                                />
                                <span className="truncate">{p.name}</span>
                              </div>
                              <span className="text-[11px] text-slate-400 tabular-nums font-mono">{count}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Situação */}
              <select
                value={revStatus}
                onChange={(e) => setRevStatus(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
              >
                <option value="">Todas as situações</option>
                <option value="PAID">Pago</option>
                <option value="PENDING">Pendente</option>
                <option value="PARTIALLY_PAID">Parcialmente pago</option>
                <option value="OVERDUE">Em atraso</option>
              </select>

              {/* 4. Conta Financeira */}
              <select
                value={revAccount}
                onChange={(e) => setRevAccount(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
              >
                <option value="">Todas as contas</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              {/* 5. Vencimento De/Até */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  title="Vencimento De"
                  value={revDateFrom}
                  onChange={(e) => setRevDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900"
                />
                <span className="text-slate-300 text-xs">até</span>
                <input
                  type="date"
                  title="Vencimento Até"
                  value={revDateTo}
                  onChange={(e) => setRevDateTo(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Chips de Projetos Selecionados */}
            {selectedProjectIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mr-1">
                  Projetos selecionados:
                </span>
                {selectedProjectIds.map((id) => {
                  const proj = availableProjects.find((p) => p.id === id);
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 rounded-md bg-[#edf7f7] border border-[#bfe2e6] px-2 py-0.5 text-xs font-medium text-[#0f5964]"
                    >
                      <Building2 size={12} />
                      {proj?.name || id}
                      <button
                        type="button"
                        onClick={() => toggleProject(id)}
                        className="ml-1 text-[#0f5964] hover:text-rose-600 rounded"
                        title="Remover projeto do filtro"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* TABELA DE EXTRATO DE RECEITAS: DESKTOP (TABELA) + MOBILE (CARDS) */}
          {/* 1. DESKTOP TABELA (>= md: 768px) */}
          <div className="hidden md:block rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Titular / lote</th>
                    <th className="px-5 py-3">Parcela</th>
                    <th className="px-5 py-3">Vencimento</th>
                    <th className="px-5 py-3 text-right">Valor</th>
                    <th className="px-5 py-3 text-right">Recebido</th>
                    <th className="px-5 py-3">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRevenues.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                        Nenhuma receita ou parcela encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredRevenues.map((item) => {
                      const statusStyle =
                        item.status === 'PAID'
                          ? 'bg-[#edf7f7] text-[#0f5964] border-[#bfe2e6]'
                          : item.isOverdue
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : item.status === 'PARTIALLY_PAID'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200';

                      const statusText =
                        item.status === 'PAID'
                          ? 'Pago'
                          : item.isOverdue
                          ? 'Atrasado'
                          : item.status === 'PARTIALLY_PAID'
                          ? 'Parcial'
                          : 'Pendente';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          {/* Titular / Lote (Duas linhas sóbrias conforme referência) */}
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-slate-900 text-sm">
                              {item.person?.fullName || 'Receita Avulsa'}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {item.lot ? (
                                <>Quadra {item.lot.block?.number || '—'} · Lote {item.lot.number}</>
                              ) : (
                                <span className="text-slate-400 italic">Avulso</span>
                              )}
                            </div>
                          </td>

                          {/* Parcela */}
                          <td className="px-5 py-3.5 text-sm text-slate-700 font-medium whitespace-nowrap">
                            {item.installmentNumber === 0 ? 'Entrada' : `${item.installmentNumber}ª Parcela`}
                          </td>

                          {/* Vencimento */}
                          <td className="px-5 py-3.5 text-sm text-slate-600 whitespace-nowrap">
                            {new Date(item.dueDate).toLocaleDateString('pt-BR')}
                          </td>

                          {/* Valor */}
                          <td className="px-5 py-3.5 text-right font-medium text-slate-900 font-mono tabular-nums whitespace-nowrap">
                            {money(item.amount)}
                          </td>

                          {/* Recebido */}
                          <td className="px-5 py-3.5 text-right font-semibold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                            {money(item.paidAmount || 0)}
                          </td>

                          {/* Situação */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${statusStyle}`}>
                              {statusText}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
              <span>{filteredRevenues.length} registros encontrados</span>
              <span>Financeiro</span>
            </div>
          </div>

          {/* 2. MOBILE CARDS (< md: 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredRevenues.map((item) => {
              const statusStyle =
                item.status === 'PAID'
                  ? 'bg-[#edf7f7] text-[#0f5964] border-[#bfe2e6]'
                  : item.isOverdue
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : item.status === 'PARTIALLY_PAID'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200';

              const statusText =
                item.status === 'PAID'
                  ? 'Pago'
                  : item.isOverdue
                  ? 'Atrasado'
                  : item.status === 'PARTIALLY_PAID'
                  ? 'Parcial'
                  : 'Pendente';

              return (
                <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">
                        {item.person?.fullName || 'Receita Avulsa'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.lot ? `Quadra ${item.lot.block?.number} · Lote ${item.lot.number}` : 'Avulso'}
                      </div>
                    </div>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium shrink-0 ${statusStyle}`}>
                      {statusText}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                    <span>Parcela: <strong className="text-slate-800">{item.installmentNumber === 0 ? 'Entrada' : `${item.installmentNumber}ª`}</strong></span>
                    <span>Vencimento: <strong className="text-slate-800">{new Date(item.dueDate).toLocaleDateString('pt-BR')}</strong></span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400">Valor: </span>
                      <span className="font-mono font-medium text-slate-800">{money(item.amount)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Recebido: </span>
                      <span className="font-mono font-bold text-slate-900">{money(item.paidAmount || 0)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="text-center text-xs text-slate-500 py-2">
              {filteredRevenues.length} registros exibidos
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: DESPESAS (TABELA E CRUD) */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Lançamentos de Despesas</h3>
              <p className="text-xs text-slate-500">Registre e controle os pagamentos, notas fiscais e comprovantes da empresa.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={receiptInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleScanReceipt(f);
                }}
              />
              <button
                type="button"
                disabled={scanningReceipt}
                onClick={() => receiptInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2 text-xs font-bold text-[#0f5964] hover:bg-teal-100 transition shadow-sm"
              >
                <Sparkles size={15} /> {scanningReceipt ? 'Lendo...' : 'Ler Comprovante (OCR)'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevenueForm({
                    accountId: accounts[0]?.id || '',
                    lotId: '',
                    description: '',
                    amount: '',
                    paymentDate: new Date().toISOString().slice(0, 10),
                    paymentMethod: 'PIX',
                    notes: '',
                    file: null,
                  });
                  setRevenueModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition shadow-sm"
              >
                <Plus size={15} /> Nova Receita (Entrada)
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingExpenseId(null);
                  setExpenseForm({
                    expenseTypeId: '',
                    accountId: accounts[0]?.id || '',
                    beneficiary: '',
                    description: '',
                    amount: '',
                    expenseDate: new Date().toISOString().slice(0, 10),
                    dueDate: '',
                    status: 'PAID',
                    paymentMethod: 'CASH',
                    transactionId: '',
                    notes: '',
                    isRecurring: false,
                    file: null,
                  });
                  setExpenseModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-bold text-white hover:bg-[#0c4952] transition shadow-sm"
              >
                <Plus size={15} /> Nova Despesa
              </button>
            </div>
          </div>

          {/* FILTROS DE DESPESAS */}
          <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-5 text-xs">
            <input
              type="text"
              placeholder="Buscar descrição, favorecido..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-800 placeholder-slate-400 focus:border-[#0f5964] focus:outline-none"
            />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-[#0f5964] focus:outline-none"
            >
              <option value="">Todas as Situações</option>
              <option value="PAID">Pago</option>
              <option value="PENDING">Pendente</option>
              <option value="SCHEDULED">Agendado</option>
              <option value="CANCELED">Cancelado</option>
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-800 focus:border-[#0f5964] focus:outline-none"
            >
              <option value="">Todos os Tipos</option>
              {expenseTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0f5964] focus:outline-none"
              title="Data inicial"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-slate-800 focus:border-[#0f5964] focus:outline-none"
              title="Data final"
            />
          </div>

          {/* TABELA DE DESPESAS - DESKTOP */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo / Categoria</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Favorecido</th>
                  <th className="px-4 py-3">Conta / Forma</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Anexo</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenses.length > 0 ? (
                  filteredExpenses.map((exp) => {
                    const st = EXPENSE_STATUS_CONFIG[exp.status] || EXPENSE_STATUS_CONFIG.PAID;
                    return (
                      <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.style}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                          {new Date(exp.expenseDate).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-[#0f5964]">{exp.expenseType?.name || 'Geral'}</span>
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate font-medium text-slate-900" title={exp.description}>
                          {exp.description}
                        </td>
                        <td className="px-4 py-3 text-slate-600 truncate max-w-[140px]">{exp.beneficiary || '—'}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{exp.account.name}</p>
                          <span className="text-[10px] text-slate-400">
                            {PAYMENT_METHOD_LABELS[exp.paymentMethod] || exp.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900 whitespace-nowrap">
                          {money(exp.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {exp.attachments && exp.attachments.length > 0 ? (
                            <a
                              href={exp.attachments[0].filePath}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex p-1.5 text-[#0f5964] hover:bg-teal-50 rounded"
                              title={exp.attachments[0].originalName}
                            >
                              <Paperclip size={14} />
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExpenseId(exp.id);
                                setExpenseForm({
                                  expenseTypeId: exp.expenseTypeId || '',
                                  accountId: exp.account.id,
                                  beneficiary: exp.beneficiary || '',
                                  description: exp.description,
                                  amount: String(exp.amount),
                                  expenseDate: new Date(exp.expenseDate).toISOString().slice(0, 10),
                                  dueDate: exp.dueDate ? new Date(exp.dueDate).toISOString().slice(0, 10) : '',
                                  status: exp.status,
                                  paymentMethod: exp.paymentMethod,
                                  transactionId: exp.transactionId || '',
                                  notes: exp.notes || '',
                                  isRecurring: exp.isRecurring,
                                  file: null,
                                });
                                setExpenseModalOpen(true);
                              }}
                              className="rounded p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="rounded p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Nenhuma despesa encontrada para os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* CARDS DE DESPESAS - MOBILE (< 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredExpenses.length > 0 ? (
              filteredExpenses.map((exp) => {
                const st = EXPENSE_STATUS_CONFIG[exp.status] || EXPENSE_STATUS_CONFIG.PAID;
                return (
                  <div key={exp.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${st.style}`}>
                          {st.label}
                        </span>
                        <p className="mt-1 text-xs text-slate-400">
                          {new Date(exp.expenseDate).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-bold tabular-nums text-slate-900">
                          {money(exp.amount)}
                        </span>
                        <p className="text-[10px] text-slate-500">{exp.account.name}</p>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-[#0f5964]">
                        {exp.expenseType?.name || 'Geral'}
                      </span>
                      <p className="text-sm font-medium text-slate-900 mt-0.5">
                        {exp.description}
                      </p>
                      {exp.beneficiary && (
                        <p className="text-xs text-slate-500 mt-1">
                          Favorecido: <strong className="text-slate-700">{exp.beneficiary}</strong>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                      <span className="text-[11px] text-slate-400">
                        {PAYMENT_METHOD_LABELS[exp.paymentMethod] || exp.paymentMethod}
                      </span>
                      <div className="flex items-center gap-2">
                        {exp.attachments && exp.attachments.length > 0 && (
                          <a
                            href={exp.attachments[0].filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-slate-200 text-[#0f5964] hover:bg-teal-50"
                            title={exp.attachments[0].originalName}
                          >
                            <Paperclip size={16} />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingExpenseId(exp.id);
                            setExpenseForm({
                              expenseTypeId: exp.expenseTypeId || '',
                              accountId: exp.account.id,
                              beneficiary: exp.beneficiary || '',
                              description: exp.description,
                              amount: String(exp.amount),
                              expenseDate: new Date(exp.expenseDate).toISOString().slice(0, 10),
                              dueDate: exp.dueDate ? new Date(exp.dueDate).toISOString().slice(0, 10) : '',
                              status: exp.status,
                              paymentMethod: exp.paymentMethod,
                              transactionId: exp.transactionId || '',
                              notes: exp.notes || '',
                              isRecurring: exp.isRecurring,
                              file: null,
                            });
                            setExpenseModalOpen(true);
                          }}
                          className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="flex min-h-[42px] min-w-[42px] items-center justify-center rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
                Nenhuma despesa encontrada para os filtros selecionados.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: TIPOS DE DESPESA */}
      {activeTab === 'types' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Tipos e Categorias de Despesas</h3>
              <p className="text-xs text-slate-500">Configure categorias, obrigatoriedade de comprovante e impacto na divisão de lucros.</p>
            </div>
            <button
              type="button"
              onClick={() => setTypeModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
            >
              <Plus size={15} /> Novo Tipo
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {expenseTypes.map((t) => (
              <div key={t.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color || '#0f5964' }} />
                    <h4 className="font-bold text-sm text-slate-900">{t.name}</h4>
                  </div>
                  {t.isFixed && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Fixa</span>
                  )}
                </div>
                {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Impacta Lucro: <strong className="text-slate-700">{t.affectsProfitSharing ? 'Sim' : 'Não'}</strong></span>
                  <span>Exige Anexo: <strong className="text-slate-700">{t.requiresReceipt ? 'Sim' : 'Não'}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 4: CONTAS FINANCEIRAS */}
      {activeTab === 'accounts' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Contas Financeiras e Caixas</h3>
              <p className="text-xs text-slate-500">Conciliação de saldos, entradas e saídas por banco ou carteira digital.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {accounts.map((acc) => (
              <div key={acc.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-[#0f5964]">{acc.type}</span>
                  <Wallet size={18} className="text-[#0f5964]" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">{acc.name}</h4>
                  <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${acc.balance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {money(acc.balance)}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400 font-medium">Recebido:</span>
                    <strong className="text-emerald-700 tabular-nums">{money(acc.received)}</strong>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase text-slate-400 font-medium">Gasto:</span>
                    <strong className="text-rose-700 tabular-nums">{money(acc.spent)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 5: DIVISÃO DE LUCROS */}
      {activeTab === 'profit' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Divisão e Retirada de Lucros</h3>
              <p className="text-xs text-slate-500">Apuração mensal do lucro líquido (Receitas - Despesas) e controle de retiradas por sócio.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBeneficiaryModalOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Users size={15} /> Sócios / Beneficiários
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawalForm({
                    beneficiaryId: beneficiaries[0]?.id || '',
                    accountId: accounts[0]?.id || '',
                    amount: '',
                    withdrawalDate: new Date().toISOString().slice(0, 10),
                    paymentMethod: 'PIX',
                    notes: '',
                  });
                  setWithdrawalModalOpen(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952]"
              >
                <Coins size={15} /> Registrar Retirada
              </button>
            </div>
          </div>

          {/* PAINEL DE APURAÇÃO DO MÊS */}
          {profitSummary && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6 shadow-xs space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-semibold uppercase text-[#0f5964]">Competência / Período</span>
                  <h4 className="text-2xl font-bold text-slate-900">Mês {profitSummary.period.label}</h4>
                </div>
                <div className="text-right">
                  <span className="text-xs uppercase text-slate-400 font-medium">Lucro Líquido Disponível:</span>
                  <p className="text-2xl font-bold text-emerald-700 tabular-nums">{money(profitSummary.netProfit)}</p>
                </div>
              </div>

              {/* DADOS DA APURAÇÃO */}
              <div className="grid gap-3 sm:grid-cols-4 text-xs">
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-slate-400 uppercase font-medium">1. Receita Realizada:</span>
                  <p className="text-base font-bold text-slate-900 mt-1 tabular-nums">{money(profitSummary.totalRevenue)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-slate-400 uppercase font-medium">2. Despesas Operacionais:</span>
                  <p className="text-base font-bold text-rose-700 mt-1 tabular-nums">{money(profitSummary.operationalExpenses)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-slate-400 uppercase font-medium">3. Total Retirado:</span>
                  <p className="text-base font-bold text-amber-700 mt-1 tabular-nums">{money(profitSummary.totalWithdrawn)}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3.5 border border-slate-100">
                  <span className="text-slate-400 uppercase font-medium">4. Saldo Restante:</span>
                  <p className="text-base font-bold text-emerald-700 mt-1 tabular-nums">{money(profitSummary.remainingProfit)}</p>
                </div>
              </div>

              {/* TABELA DE SÓCIOS / PARTICIPAÇÃO */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Beneficiário / Sócio</th>
                      <th className="px-4 py-2.5">Tipo</th>
                      <th className="px-4 py-2.5 text-center">% Cota</th>
                      <th className="px-4 py-2.5 text-right">Valor Devido</th>
                      <th className="px-4 py-2.5 text-right">Valor Retirado</th>
                      <th className="px-4 py-2.5 text-right">Saldo a Retirar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitSummary.items.map((item) => (
                      <tr key={item.beneficiaryId}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{item.beneficiaryName}</td>
                        <td className="px-4 py-3 text-slate-500">{item.beneficiaryType === 'COMPANY' ? 'Pessoa Jurídica' : 'Pessoa Física'}</td>
                        <td className="px-4 py-3 text-center font-semibold text-[#0f5964]">{item.percentage}%</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{money(item.allocatedAmount)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-700 tabular-nums">{money(item.withdrawnAmount)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700 tabular-nums">{money(item.remainingAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 6: RELATÓRIOS & TAXAS ASAAS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[#17343b]">Relatório Financeiro & Taxas Asaas</h3>
              <p className="text-xs text-slate-500">Extrato consolidado para impressão e conciliação de tarifas bancárias.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
            >
              <Printer size={15} /> Imprimir / Salvar PDF
            </button>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 sm:p-8 shadow-xs space-y-6 text-xs text-slate-800 print:border-none print:shadow-none">
            <div className="border-b-2 border-slate-900 pb-4 flex justify-between items-end">
              <div>
                <h2 className="text-xl font-extrabold uppercase">GÊNESIS REURB - EXTRATO DE DESPESAS & TAXAS</h2>
                <p className="text-slate-500 mt-1">Demonstrativo Financeiro Consolidado</p>
              </div>
              <div className="text-right text-slate-500">
                Data: {new Date().toLocaleDateString('pt-BR')}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Total Despesas Pagas:</span>
                <p className="text-base font-extrabold text-slate-900 tabular-nums">{money(dashboardStats.totalSpent)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Taxas Asaas no Período:</span>
                <p className="text-base font-extrabold text-sky-700 tabular-nums">{money(dashboardStats.asaasFees)}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-400 font-bold">Saldo Consolidado:</span>
                <p className="text-base font-extrabold text-emerald-700 tabular-nums">{money(dashboardStats.totalBalance)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVA / EDITAR DESPESA */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveExpense} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {editingExpenseId ? 'Editar Despesa' : 'Novo Lançamento de Despesa'}
              </h3>
              <button type="button" onClick={() => setExpenseModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <label className="font-semibold text-slate-700">
                Tipo de Despesa
                <select
                  required
                  value={expenseForm.expenseTypeId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseTypeId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="">Selecione um tipo...</option>
                  {expenseTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>

              <label className="font-semibold text-slate-700">
                Conta de Origem
                <select
                  required
                  value={expenseForm.accountId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, accountId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (Saldo: {money(a.balance)})</option>
                  ))}
                </select>
              </label>

              <label className="font-semibold text-slate-700 sm:col-span-2">
                Descrição da Despesa
                <input
                  required
                  type="text"
                  placeholder="Ex: Abastecimento caminhonete placa XYZ..."
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Valor da Despesa (R$)
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Favorecido / Fornecedor
                <input
                  type="text"
                  placeholder="Ex: Posto Central, Asaas, etc."
                  value={expenseForm.beneficiary}
                  onChange={(e) => setExpenseForm({ ...expenseForm, beneficiary: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Data da Despesa
                <input
                  type="date"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="font-semibold text-slate-700">
                Forma de Pagamento
                <select
                  value={expenseForm.paymentMethod}
                  onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="CASH">Dinheiro</option>
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartão</option>
                  <option value="BANK_TRANSFER">Transferência</option>
                  <option value="ASAAS">Asaas</option>
                  <option value="MERCADO_PAGO">Mercado Pago</option>
                </select>
              </label>

              <label className="font-semibold text-slate-700">
                Situação
                <select
                  value={expenseForm.status}
                  onChange={(e) => setExpenseForm({ ...expenseForm, status: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="PAID">Pago (Abate do Caixa)</option>
                  <option value="PENDING">Pendente (A Pagar)</option>
                  <option value="SCHEDULED">Agendado</option>
                  <option value="CANCELED">Cancelado</option>
                </select>
              </label>

              <label className="font-semibold text-slate-700">
                Nº Transação / Comprovante
                <input
                  type="text"
                  placeholder="ID da transação..."
                  value={expenseForm.transactionId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, transactionId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="font-semibold text-slate-700 sm:col-span-2">
                Anexo de Comprovante / Recibo (Opcional)
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setExpenseForm({ ...expenseForm, file: f });
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 p-2 text-xs"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
              >
                Salvar Despesa
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: RETIRADA DE LUCRO */}
      {withdrawalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveWithdrawal} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Registrar Retirada de Lucro</h3>
              <button type="button" onClick={() => setWithdrawalModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Sócio / Beneficiário
                <select
                  required
                  value={withdrawalForm.beneficiaryId}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, beneficiaryId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="">Selecione o beneficiário...</option>
                  {beneficiaries.map((b) => (
                    <option key={b.id} value={b.id}>{b.name} ({b.defaultPercentage}%)</option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Conta de Origem (Caixa)
                <select
                  required
                  value={withdrawalForm.accountId}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, accountId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (Saldo: {money(a.balance)})</option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Valor Retirado (R$)
                <input
                  required
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={withdrawalForm.amount}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Data da Retirada
                  <input
                    type="date"
                    value={withdrawalForm.withdrawalDate}
                    onChange={(e) => setWithdrawalForm({ ...withdrawalForm, withdrawalDate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  />
                </label>
                <label className="font-semibold text-slate-700">
                  Forma de Pagamento
                  <select
                    value={withdrawalForm.paymentMethod}
                    onChange={(e) => setWithdrawalForm({ ...withdrawalForm, paymentMethod: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  >
                    <option value="PIX">PIX</option>
                    <option value="BANK_TRANSFER">Transferência</option>
                    <option value="CASH">Dinheiro</option>
                  </select>
                </label>
              </div>

              <label className="block font-semibold text-slate-700">
                Observações
                <input
                  type="text"
                  placeholder="Ex: Adiantamento de lucro referente ao mês..."
                  value={withdrawalForm.notes}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, notes: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setWithdrawalModalOpen(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
              >
                Confirmar Retirada
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO TIPO DE DESPESA */}
      {typeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveType} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Novo Tipo de Despesa</h3>
              <button type="button" onClick={() => setTypeModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Nome do Tipo
                <input
                  required
                  type="text"
                  placeholder="Ex: Licenciamento Ambiental, Cartório..."
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <label className="block font-semibold text-slate-700">
                Descrição
                <input
                  type="text"
                  placeholder="Breve descrição da finalidade..."
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.isFixed}
                    onChange={(e) => setTypeForm({ ...typeForm, isFixed: e.target.checked })}
                    className="rounded text-[#0f5964] focus:ring-[#0f5964]"
                  />
                  <span>Despesa Fixa / Recorrente</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.requiresReceipt}
                    onChange={(e) => setTypeForm({ ...typeForm, requiresReceipt: e.target.checked })}
                    className="rounded text-[#0f5964] focus:ring-[#0f5964]"
                  />
                  <span>Exige Comprovante / Anexo</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={typeForm.affectsProfitSharing}
                    onChange={(e) => setTypeForm({ ...typeForm, affectsProfitSharing: e.target.checked })}
                    className="rounded text-[#0f5964] focus:ring-[#0f5964]"
                  />
                  <span>Deduz da Divisão de Lucros</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setTypeModalOpen(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
              >
                Criar Tipo
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVO SÓCIO / BENEFICIÁRIO */}
      {beneficiaryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveBeneficiary} className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-slate-900">Novo Beneficiário de Lucro</h3>
              <button type="button" onClick={() => setBeneficiaryModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block font-semibold text-slate-700">
                Nome ou Razão Social
                <input
                  required
                  type="text"
                  placeholder="Nome do sócio ou empresa..."
                  value={beneficiaryForm.name}
                  onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, name: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Tipo
                  <select
                    value={beneficiaryForm.type}
                    onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, type: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  >
                    <option value="INDIVIDUAL">Pessoa Física</option>
                    <option value="COMPANY">Pessoa Jurídica</option>
                  </select>
                </label>
                <label className="font-semibold text-slate-700">
                  % Cota Padrão
                  <input
                    type="number"
                    step="0.01"
                    value={beneficiaryForm.defaultPercentage}
                    onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, defaultPercentage: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  />
                </label>
              </div>

              <label className="block font-semibold text-slate-700">
                CPF / CNPJ (Opcional)
                <input
                  type="text"
                  value={beneficiaryForm.documentNumber}
                  onChange={(e) => setBeneficiaryForm({ ...beneficiaryForm, documentNumber: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setBeneficiaryModalOpen(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0c4952] transition shadow-xs"
              >
                Salvar Sócio
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: NOVA RECEITA MANUAL (ENTRADA) */}
      {revenueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <form onSubmit={handleSaveRevenue} className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <ArrowUpRight size={20} />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">Novo Lançamento de Receita (Entrada)</h3>
              </div>
              <button type="button" onClick={() => setRevenueModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
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
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="">Selecione uma conta...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} (Saldo Atual: {money(a.balance)})</option>
                  ))}
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Lote Vinculado (Opcional)
                <select
                  value={revenueForm.lotId}
                  onChange={(e) => {
                    const selected = lotsList.find((l) => l.id === e.target.value);
                    const ownerName = selected?.occupancies?.find((o: any) => o.current)?.person?.fullName || selected?.contracts?.[0]?.person?.fullName;
                    setRevenueForm({
                      ...revenueForm,
                      lotId: e.target.value,
                      description: ownerName ? `Recebimento Lote ${selected.number} - ${ownerName}` : revenueForm.description,
                    });
                  }}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                >
                  <option value="">-- Nenhum lote vinculado (Receita avulsa) --</option>
                  {lotsList.map((l) => {
                    const ownerName = l.occupancies?.find((o: any) => o.current)?.person?.fullName || l.contracts?.[0]?.person?.fullName || 'Sem titular';
                    return (
                      <option key={l.id} value={l.id}>
                        Quadra {l.block?.number || '—'} · Lote {l.number} ({ownerName})
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="block font-semibold text-slate-700">
                Descrição da Receita
                <input
                  required
                  type="text"
                  placeholder="Ex: Pagamento de entrada em espécie, Recebimento avulso..."
                  value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
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
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  />
                </label>

                <label className="font-semibold text-slate-700">
                  Data do Recebimento
                  <input
                    type="date"
                    value={revenueForm.paymentDate}
                    onChange={(e) => setRevenueForm({ ...revenueForm, paymentDate: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold text-slate-700">
                  Forma de Recebimento
                  <select
                    value={revenueForm.paymentMethod}
                    onChange={(e) => setRevenueForm({ ...revenueForm, paymentMethod: e.target.value })}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                  >
                    <option value="CASH">Dinheiro</option>
                    <option value="PIX">PIX</option>
                    <option value="CARD">Cartão</option>
                    <option value="BANK_TRANSFER">Transferência Bancária</option>
                    <option value="MERCADO_PAGO">Mercado Pago</option>
                    <option value="ASAAS">Asaas</option>
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
                    className="mt-1 w-full rounded-md border border-slate-300 p-1.5 text-xs"
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
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setRevenueModalOpen(false)}
                className="min-h-[42px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="min-h-[42px] rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition shadow-xs"
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
