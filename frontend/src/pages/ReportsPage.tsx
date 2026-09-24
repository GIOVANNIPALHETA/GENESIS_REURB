import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Layers,
  Folder,
  CreditCard,
  FileText,
  Activity,
  FileSpreadsheet,
  FileDown,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar,
  UserCheck,
  Building2,
  Check,
  DollarSign
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { formatMoney } from '../utils/money';

interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface ReportMeta {
  id: string;
  title: string;
  category: string;
  description: string;
  dateFilterLabel: string;
  supportsReferenceDate?: boolean;
  supportsResponsible?: boolean;
  supportsSituation?: boolean;
  supportsOverdueToggle?: boolean;
  supportsDocType?: boolean;
  supportsAgingBracket?: boolean;
  supportsStatus?: boolean;
  situations?: string[];
  agingBrackets?: string[];
  statuses?: string[];
}

export function ReportsPage() {
  // Navigation & Metadata
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [reportsList, setReportsList] = useState<ReportMeta[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('Projetos');
  const [activeReportId, setActiveReportId] = useState<string>('lot-pendencies');

  // Filter States
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedResponsible, setSelectedResponsible] = useState<string>('');
  const [selectedSituation, setSelectedSituation] = useState<string>('ALL');
  const [selectedAgingBracket, setSelectedAgingBracket] = useState<string>('ALL');
  const [selectedDocType, setSelectedDocType] = useState<string>('ALL');
  const [referenceDate, setReferenceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isOverdueOnly, setIsOverdueOnly] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Dropdown reference data
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);

  // Report Data States
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exportingExcel, setExportingExcel] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);

  // Active Report Meta
  const currentReportMeta = useMemo(() => {
    return reportsList.find(r => r.id === activeReportId) || null;
  }, [reportsList, activeReportId]);

  // Available Reports in Active Category
  const categoryReports = useMemo(() => {
    return reportsList.filter(r => r.category === activeCategory);
  }, [reportsList, activeCategory]);

  // Load Metadata (Categories & Available Reports, Projects, Users)
  useEffect(() => {
    async function loadInitialMeta() {
      try {
        const [metaRes, projRes, userRes] = await Promise.all([
          axios.get('/api/reports/categories'),
          axios.get('/api/projects'),
          axios.get('/api/users')
        ]);

        if (metaRes.data.success) {
          setCategories(metaRes.data.data.categories || []);
          setReportsList(metaRes.data.data.reports || []);
        }
        setProjects(projRes.data.data || []);
        setUsers(userRes.data.data || []);
      } catch (err) {
        console.error('Erro ao carregar metadados de relatórios:', err);
      }
    }
    loadInitialMeta();
  }, []);

  // When switching categories, automatically set first report of that category
  const handleSelectCategory = (catId: string) => {
    setActiveCategory(catId);
    const firstRep = reportsList.find(r => r.category === catId);
    if (firstRep) {
      setActiveReportId(firstRep.id);
      setPage(1);
    }
  };

  // Fetch Report Data
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/reports/data', {
        params: {
          reportType: activeReportId,
          projectId: selectedProject || undefined,
          responsibleId: selectedResponsible || undefined,
          situation: selectedSituation !== 'ALL' ? selectedSituation : undefined,
          agingBracket: selectedAgingBracket !== 'ALL' ? selectedAgingBracket : undefined,
          docType: selectedDocType !== 'ALL' ? selectedDocType : undefined,
          referenceDate: referenceDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          isOverdueOnly: isOverdueOnly ? 'true' : undefined,
          search: searchTerm || undefined,
          page,
          limit
        }
      });

      if (res.data.success) {
        setReportData(res.data.data);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do relatório:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refetch when filters or pagination change
  useEffect(() => {
    fetchReportData();
  }, [
    activeReportId,
    selectedProject,
    selectedResponsible,
    selectedSituation,
    selectedAgingBracket,
    selectedDocType,
    referenceDate,
    startDate,
    endDate,
    isOverdueOnly,
    page,
    limit
  ]);

  // Handle Search Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchReportData();
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Export Excel
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try {
      const res = await axios.get('/api/reports/export/excel', {
        responseType: 'blob',
        params: {
          reportType: activeReportId,
          projectId: selectedProject || undefined,
          responsibleId: selectedResponsible || undefined,
          situation: selectedSituation !== 'ALL' ? selectedSituation : undefined,
          agingBracket: selectedAgingBracket !== 'ALL' ? selectedAgingBracket : undefined,
          docType: selectedDocType !== 'ALL' ? selectedDocType : undefined,
          referenceDate: referenceDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          isOverdueOnly: isOverdueOnly ? 'true' : undefined,
          search: searchTerm || undefined
        }
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${activeReportId}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      alert('Não foi possível gerar a planilha Excel.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await axios.get('/api/reports/export/pdf', {
        responseType: 'blob',
        params: {
          reportType: activeReportId,
          projectId: selectedProject || undefined,
          responsibleId: selectedResponsible || undefined,
          situation: selectedSituation !== 'ALL' ? selectedSituation : undefined,
          agingBracket: selectedAgingBracket !== 'ALL' ? selectedAgingBracket : undefined,
          docType: selectedDocType !== 'ALL' ? selectedDocType : undefined,
          referenceDate: referenceDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          isOverdueOnly: isOverdueOnly ? 'true' : undefined,
          search: searchTerm || undefined
        }
      });

      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `relatorio_${activeReportId}_${new Date().toISOString().slice(0, 10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Não foi possível gerar o arquivo PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedProject('');
    setSelectedResponsible('');
    setSelectedSituation('ALL');
    setSelectedAgingBracket('ALL');
    setSelectedDocType('ALL');
    setStartDate('');
    setEndDate('');
    setIsOverdueOnly(false);
    setSearchTerm('');
    setReferenceDate(new Date().toISOString().slice(0, 10));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header com Ações de Exportação */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Central de relatórios"
          subtitle="Gere, filtre e exporte relatórios consolidados de projetos, documentos, contratos e financeiro."
        />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchReportData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-[#0f5964] hover:text-[#0f5964] transition disabled:opacity-50"
            title="Atualizar dados"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exportingExcel || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800 shadow-xs hover:bg-emerald-100 hover:border-emerald-300 transition disabled:opacity-50"
            title="Exportar todos os registros filtrados para Excel"
          >
            <FileSpreadsheet size={15} className="text-emerald-700" />
            <span>{exportingExcel ? 'Gerando Excel...' : 'Exportar Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800 shadow-xs hover:bg-rose-100 hover:border-rose-300 transition disabled:opacity-50"
            title="Exportar todos os registros filtrados para PDF formal"
          >
            <FileDown size={15} className="text-rose-700" />
            <span>{exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}</span>
          </button>
        </div>
      </div>

      {/* Navegação de Categorias */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-soft">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {categories.map((cat) => {
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleSelectCategory(cat.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl px-3 py-3 text-center transition ${
                  isSelected
                    ? 'bg-[#0f5964] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2 font-medium text-xs">
                  {cat.id === 'Projetos' && <Layers size={16} />}
                  {cat.id === 'Documentos' && <Folder size={16} />}
                  {cat.id === 'Financeiro' && <CreditCard size={16} />}
                  {cat.id === 'Contratos' && <FileText size={16} />}
                  {cat.id === 'Atendimentos' && <Activity size={16} />}
                  <span>{cat.name}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Seletor de Relatórios da Categoria Selecionada */}
      {categoryReports.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Relatórios disponíveis:
          </span>
          {categoryReports.map((rep) => {
            const isSelected = activeReportId === rep.id;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => {
                  setActiveReportId(rep.id);
                  setPage(1);
                }}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition ${
                  isSelected
                    ? 'bg-[#edf7f7] text-[#0f5964] border border-[#0f5964]/30 font-semibold'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {rep.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Indicadores Resumidos (KPIs) */}
      {reportData?.indicators && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Indicadores: Pendências por Lote */}
          {activeReportId === 'lot-pendencies' && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Lotes com Pendências
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0f5964]">
                    <Layers size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {reportData.indicators.lotsWithPendencies}
                  </span>
                  <span className="text-xs text-slate-500">lotes distintos</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Pendências em Aberto
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <Clock size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-700">
                    {reportData.indicators.openPendencies}
                  </span>
                  <span className="text-xs text-slate-500">ações pendentes</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Pendências Vencidas
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-600">
                    {reportData.indicators.overduePendencies}
                  </span>
                  <span className="text-xs text-slate-500">prazo expirado</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Total de Ocorrências
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <BarChart3 size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">
                    {reportData.indicators.totalPendencies}
                  </span>
                  <span className="text-xs text-slate-500">registros filtrados</span>
                </div>
              </div>
            </>
          )}

          {/* Indicadores: Checklist Documental */}
          {activeReportId === 'document-checklist' && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Não Entregues
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                    <XCircle size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-800">
                    {reportData.indicators.notDeliveredCount}
                  </span>
                  <span className="text-xs text-slate-500">itens pendentes</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Em Análise Técnica
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                    <Clock size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-sky-700">
                    {reportData.indicators.underReviewCount}
                  </span>
                  <span className="text-xs text-slate-500">em validação</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Precisa de Correção
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-600">
                    {reportData.indicators.correctionNeededCount}
                  </span>
                  <span className="text-xs text-slate-500">rejeitados/vencidos</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Aprovados / Válidos
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-700">
                    {reportData.indicators.approvedCount}
                  </span>
                  <span className="text-xs text-slate-500">conformidade OK</span>
                </div>
              </div>
            </>
          )}

          {/* Indicadores: Parcelas em Atraso */}
          {activeReportId === 'overdue-installments' && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Saldo Vencido Total
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-rose-700">
                    {formatMoney(reportData.indicators.totalOverdueAmount)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Parcelas em Atraso
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <CreditCard size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-slate-900">
                    {reportData.indicators.overdueInstallmentsCount}
                  </span>
                  <span className="text-xs text-slate-500">parcelas</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Contratos com Atraso
                  </span>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50 text-[#0f5964]">
                    <FileText size={18} />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#0f5964]">
                    {reportData.indicators.distinctContractsCount}
                  </span>
                  <span className="text-xs text-slate-500">famílias / contratos</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">
                  Faixas de Inadimplência
                </span>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Até 30d:</span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(reportData.indicators.agingBuckets.upTo30.amount)} ({reportData.indicators.agingBuckets.upTo30.count})
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>31 a 60d:</span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(reportData.indicators.agingBuckets.from31to60.amount)} ({reportData.indicators.agingBuckets.from31to60.count})
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>61 a 90d:</span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(reportData.indicators.agingBuckets.from61to90.amount)} ({reportData.indicators.agingBuckets.from61to90.count})
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-600 font-medium">
                    <span>&gt; 90 dias:</span>
                    <span className="font-bold">
                      {formatMoney(reportData.indicators.agingBuckets.over90.amount)} ({reportData.indicators.agingBuckets.over90.count})
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Indicadores: Evolução Contratual */}
          {activeReportId === 'contracts-evolution' && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contratos Assinados</span>
                <p className="mt-3 text-2xl font-bold text-emerald-700">{reportData.indicators.signedCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pendentes Assinatura</span>
                <p className="mt-3 text-2xl font-bold text-amber-600">{reportData.indicators.unsignedCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Valor Total Contratado</span>
                <p className="mt-3 text-2xl font-bold text-slate-900">{formatMoney(reportData.indicators.totalValue)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total Amortizado</span>
                <p className="mt-3 text-2xl font-bold text-[#0f5964]">{formatMoney(reportData.indicators.totalPaid)}</p>
              </div>
            </>
          )}

          {/* Indicadores: Histórico Atendimentos */}
          {activeReportId === 'service-records' && (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total de Atendimentos</span>
                <p className="mt-3 text-2xl font-bold text-slate-900">{reportData.indicators.totalServices}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Famílias Atendidas</span>
                <p className="mt-3 text-2xl font-bold text-[#0f5964]">{reportData.indicators.distinctPeople}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Com Próximo Contato</span>
                <p className="mt-3 text-2xl font-bold text-sky-700">{reportData.indicators.withNextContact}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Painel de Filtros e Busca */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
            <Filter size={14} className="text-[#0f5964]" />
            <span>Filtros do Relatório</span>
          </div>

          {currentReportMeta?.dateFilterLabel && (
            <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />
              <span>O filtro de período utiliza: <strong className="text-slate-700">{currentReportMeta.dateFilterLabel}</strong></span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {/* Busca textual */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Buscar</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Quadra, lote, titular..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 pl-9 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0f5964] focus:bg-white focus:outline-none"
              />
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            </div>
          </div>

          {/* Filtro de Projeto */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Projeto</label>
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
            >
              <option value="">Todos os Projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Filtro de Responsável (quando aplicável) */}
          {currentReportMeta?.supportsResponsible && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Responsável</label>
              <select
                value={selectedResponsible}
                onChange={(e) => {
                  setSelectedResponsible(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
              >
                <option value="">Todos os Responsáveis</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Data de Referência (Financeiro) */}
          {currentReportMeta?.supportsReferenceDate && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                Data de Referência (Cálculo do Atraso)
              </label>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => {
                  setReferenceDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none font-medium"
              />
            </div>
          )}

          {/* Faixa de Atraso (Financeiro) */}
          {currentReportMeta?.supportsAgingBracket && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Faixa de Atraso</label>
              <select
                value={selectedAgingBracket}
                onChange={(e) => {
                  setSelectedAgingBracket(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
              >
                <option value="ALL">Todas as faixas</option>
                <option value="Até 30 dias">Até 30 dias</option>
                <option value="31–60 dias">31–60 dias</option>
                <option value="61–90 dias">61–90 dias</option>
                <option value="Acima de 90 dias">Acima de 90 dias</option>
              </select>
            </div>
          )}

          {/* Situação (Projetos / Documentos) */}
          {currentReportMeta?.supportsSituation && (
            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Situação</label>
              <select
                value={selectedSituation}
                onChange={(e) => {
                  setSelectedSituation(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
              >
                <option value="ALL">Todas as situações</option>
                {activeReportId === 'document-checklist' && (
                  <>
                    <option value="NOT_DELIVERED">Não entregue</option>
                    <option value="UNDER_REVIEW">Em análise</option>
                    <option value="CORRECTION_NEEDED">Precisa de correção</option>
                    <option value="APPROVED">Aprovado</option>
                  </>
                )}
                {activeReportId === 'lot-pendencies' && (
                  <>
                    <option value="Em aberto">Em aberto</option>
                    <option value="Vencida">Vencida</option>
                    <option value="Precisa de correção">Precisa de correção</option>
                    <option value="Em análise">Em análise</option>
                  </>
                )}
              </select>
            </div>
          )}

          {/* Período De / Até */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Data Inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Data Final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs text-slate-900 focus:border-[#0f5964] focus:bg-white focus:outline-none"
            />
          </div>

          {/* Toggle de Apenas Vencidas (Projetos) */}
          {currentReportMeta?.supportsOverdueToggle && (
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isOverdueOnly}
                  onChange={(e) => {
                    setIsOverdueOnly(e.target.checked);
                    setPage(1);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-[#0f5964] focus:ring-[#0f5964]"
                />
                <span className="text-xs font-semibold text-rose-700">
                  Apenas pendências vencidas
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Linha de Limpar Filtros */}
        {(selectedProject || selectedResponsible || selectedSituation !== 'ALL' || selectedAgingBracket !== 'ALL' || startDate || endDate || isOverdueOnly || searchTerm) && (
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 underline transition"
            >
              Limpar todos os filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabela de Resultados */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-soft overflow-hidden">
        {/* Cabeçalho de Resultados e Paginação Superior */}
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {reportData?.title || currentReportMeta?.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Exibindo {reportData?.rows?.length || 0} de <strong>{reportData?.totalRecords || 0}</strong> registros filtrados
            </p>
          </div>

          {/* Seletor de registros por página */}
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Linhas por página:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#0f5964] focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Estado Carregando */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw size={28} className="animate-spin text-[#0f5964] mb-3" />
            <p className="text-xs font-medium text-slate-600">Carregando dados do relatório...</p>
          </div>
        )}

        {/* Estado Vazio */}
        {!loading && reportData?.rows?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <Search size={22} />
            </div>
            <h4 className="text-sm font-bold text-slate-800">Nenhum registro encontrado</h4>
            <p className="text-xs text-slate-500 max-w-sm mt-1">
              Não encontramos nenhum registro correspondente aos filtros selecionados. Experimente ajustar o período, remover filtros ou buscar por outro termo.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:border-[#0f5964] hover:text-[#0f5964] transition"
            >
              Redefinir filtros
            </button>
          </div>
        )}

        {/* Tabela de Dados */}
        {!loading && reportData?.rows?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              {/* CABEÇALHOS ESPECÍFICOS */}
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                {activeReportId === 'lot-pendencies' && (
                  <tr>
                    <th className="px-5 py-3.5">Projeto</th>
                    <th className="px-4 py-3.5">Qd / Lote</th>
                    <th className="px-5 py-3.5">Titular / Família</th>
                    <th className="px-4 py-3.5">Tipo</th>
                    <th className="px-5 py-3.5">Descrição da Pendência</th>
                    <th className="px-4 py-3.5">Responsável</th>
                    <th className="px-4 py-3.5">Prazo</th>
                    <th className="px-4 py-3.5">Situação</th>
                    <th className="px-4 py-3.5 text-center">Dias Aberto</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                )}

                {activeReportId === 'document-checklist' && (
                  <tr>
                    <th className="px-5 py-3.5">Projeto</th>
                    <th className="px-4 py-3.5">Qd / Lote</th>
                    <th className="px-5 py-3.5">Titular / Família</th>
                    <th className="px-5 py-3.5">Documento Exigido</th>
                    <th className="px-4 py-3.5">Situação</th>
                    <th className="px-4 py-3.5">Data de Entrega</th>
                    <th className="px-5 py-3.5">Motivo / Pendência</th>
                    <th className="px-4 py-3.5 text-right">Ação</th>
                  </tr>
                )}

                {activeReportId === 'overdue-installments' && (
                  <tr>
                    <th className="px-5 py-3.5">Contrato</th>
                    <th className="px-5 py-3.5">Titular</th>
                    <th className="px-4 py-3.5">Projeto</th>
                    <th className="px-4 py-3.5">Qd / Lote</th>
                    <th className="px-4 py-3.5">Parcela</th>
                    <th className="px-4 py-3.5">Vencimento</th>
                    <th className="px-4 py-3.5 text-right">Valor Devido</th>
                    <th className="px-4 py-3.5 text-right">Valor Pago</th>
                    <th className="px-4 py-3.5 text-right">Saldo Aberto</th>
                    <th className="px-4 py-3.5 text-center">Atraso</th>
                    <th className="px-4 py-3.5">Faixa</th>
                  </tr>
                )}

                {activeReportId === 'contracts-evolution' && (
                  <tr>
                    <th className="px-5 py-3.5">Contrato</th>
                    <th className="px-4 py-3.5">Projeto</th>
                    <th className="px-4 py-3.5">Qd / Lote</th>
                    <th className="px-5 py-3.5">Titular</th>
                    <th className="px-4 py-3.5">Situação</th>
                    <th className="px-4 py-3.5">Data Assinatura</th>
                    <th className="px-4 py-3.5 text-right">Valor Contratado</th>
                    <th className="px-4 py-3.5 text-right">Total Pago</th>
                    <th className="px-4 py-3.5 text-right">Saldo Restante</th>
                    <th className="px-4 py-3.5 text-center">Parcelas</th>
                  </tr>
                )}

                {activeReportId === 'service-records' && (
                  <tr>
                    <th className="px-5 py-3.5">Data</th>
                    <th className="px-5 py-3.5">Pessoa</th>
                    <th className="px-4 py-3.5">Projeto</th>
                    <th className="px-4 py-3.5">Qd / Lote</th>
                    <th className="px-5 py-3.5">Atendimento</th>
                    <th className="px-5 py-3.5">Pendências</th>
                    <th className="px-4 py-3.5">Próximo Contato</th>
                    <th className="px-4 py-3.5">Responsável</th>
                  </tr>
                )}
              </thead>

              {/* CORPO DA TABELA */}
              <tbody className="divide-y divide-slate-100">
                {activeReportId === 'lot-pendencies' && reportData.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-medium text-slate-900">{row.projectName}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f5964]">{row.quadraLote}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{row.occupant}</p>
                      {row.occupantPhone && <p className="text-[11px] text-slate-400">{row.occupantPhone}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {row.type}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate text-slate-700" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.responsible}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {row.deadline ? new Date(row.deadline + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.situation === 'Vencida' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                          <AlertTriangle size={11} /> Vencida
                        </span>
                      )}
                      {row.situation === 'Em aberto' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 border border-amber-200">
                          <Clock size={11} /> Em aberto
                        </span>
                      )}
                      {row.situation === 'Precisa de correção' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                          <AlertTriangle size={11} /> Precisa de correção
                        </span>
                      )}
                      {row.situation === 'Em análise' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200">
                          <Clock size={11} /> Em análise
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-600">
                      {row.daysOpen} d
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/lots/${row.lotId}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f5964] hover:underline"
                        title="Abrir cadastro completo do lote"
                      >
                        <span>Abrir lote</span>
                        <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}

                {activeReportId === 'document-checklist' && reportData.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-medium text-slate-900">{row.projectName}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f5964]">{row.quadraLote}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.occupant}</td>
                    <td className="px-5 py-3 font-semibold text-slate-800">{row.requiredDocLabel}</td>
                    <td className="px-4 py-3">
                      {row.situationCode === 'APPROVED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={11} /> Aprovado
                        </span>
                      )}
                      {row.situationCode === 'UNDER_REVIEW' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-bold text-sky-700 border border-sky-200">
                          <Clock size={11} /> Em análise
                        </span>
                      )}
                      {row.situationCode === 'CORRECTION_NEEDED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                          <AlertTriangle size={11} /> Precisa de correção
                        </span>
                      )}
                      {row.situationCode === 'NOT_DELIVERED' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                          <XCircle size={11} /> Não entregue
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.deliveryDate ? new Date(row.deliveryDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate text-slate-600" title={row.pendingReason || ''}>
                      {row.pendingReason || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/lots/${row.lotId}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f5964] hover:underline"
                        title="Ver dossiê do lote"
                      >
                        <span>Dossiê</span>
                        <ExternalLink size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}

                {activeReportId === 'overdue-installments' && reportData.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{row.contractNumber}</td>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{row.personName}</p>
                      {row.personPhone && <p className="text-[11px] text-slate-400">{row.personPhone}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.projectName}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f5964]">{row.quadraLote}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{row.installmentLabel}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {new Date(row.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{formatMoney(row.dueAmount)}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 font-medium">{formatMoney(row.paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-700">{formatMoney(row.openAmount)}</td>
                    <td className="px-4 py-3 text-center font-bold text-rose-600">{row.daysOverdue} d</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        row.agingBracket === 'Até 30 dias'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : row.agingBracket === '31–60 dias'
                          ? 'bg-orange-50 text-orange-800 border border-orange-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}>
                        {row.agingBracket}
                      </span>
                    </td>
                  </tr>
                ))}

                {activeReportId === 'contracts-evolution' && reportData.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-semibold text-slate-900">{row.contractNumber}</td>
                    <td className="px-4 py-3 text-slate-700">{row.projectName}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f5964]">{row.quadraLote}</td>
                    <td className="px-5 py-3 font-medium text-slate-800">{row.personName}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                        row.signed
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {row.signed ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                        {row.signedLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.signedAt ? new Date(row.signedAt + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(row.totalValue)}</td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatMoney(row.totalPaid)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">{formatMoney(row.balanceRemaining)}</td>
                    <td className="px-4 py-3 text-center text-slate-600 font-medium">{row.installmentsProgress}</td>
                  </tr>
                ))}

                {activeReportId === 'service-records' && reportData.rows.map((row: any) => (
                  <tr key={row.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {new Date(row.serviceDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{row.personName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.projectName}</td>
                    <td className="px-4 py-3 font-semibold text-[#0f5964]">{row.quadraLote}</td>
                    <td className="px-5 py-3 max-w-xs truncate text-slate-700" title={row.description}>
                      {row.description}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{row.pendingActions}</td>
                    <td className="px-4 py-3 text-slate-600">{row.nextContactDate}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{row.responsible}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Rodapé de Paginação */}
        {!loading && reportData?.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-slate-50/50 border-t border-slate-200">
            <span className="text-xs text-slate-600">
              Página <strong>{reportData.page}</strong> de <strong>{reportData.totalPages}</strong> ({reportData.totalRecords} itens)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={reportData.page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronLeft size={14} />
                <span>Anterior</span>
              </button>

              <div className="flex items-center gap-1 px-2 text-xs font-semibold text-slate-700">
                {reportData.page} / {reportData.totalPages}
              </div>

              <button
                type="button"
                onClick={() => setPage(p => Math.min(reportData.totalPages, p + 1))}
                disabled={reportData.page >= reportData.totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <span>Próxima</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
