import { useEffect, useState, useMemo, useRef } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import {
  Folder,
  FolderOpen,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  Upload,
  Download,
  Copy,
  Check,
  Eye,
  Trash2,
  X,
  Plus,
  ShieldCheck,
  FileCheck,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { formatCpf } from '../utils/cpf';

interface Project {
  id: string;
  name: string;
}

interface Block {
  id: string;
  number: string;
  projectId: string;
}

interface ChecklistItem {
  key: string;
  label: string;
  required: boolean;
  isApplicable: boolean;
  count: number;
  hasDoc: boolean;
  documents: any[];
}

interface DossierItem {
  id: string;
  lotNumber: string;
  block: { id: string; number: string };
  project: { id: string; name: string };
  owner: {
    id: string;
    fullName: string;
    cpf?: string | null;
    phone?: string | null;
    maritalStatus?: string | null;
    spouse?: { fullName: string; cpf?: string | null } | null;
  } | null;
  status: 'COMPLETE' | 'PENDING' | 'EMPTY' | 'NO_OWNER';
  progressPercent: number;
  completedRequired: number;
  totalRequired: number;
  totalUploaded: number;
  checklist: ChecklistItem[];
  documents: any[];
  drivePath: string;
}

interface DossiersSummary {
  totalLots: number;
  completeCount: number;
  pendingCount: number;
  emptyCount: number;
  noOwnerCount: number;
  totalDocs: number;
  driveBaseExists: boolean;
  driveBasePath: string;
}

const CHECKLIST_LABELS: Record<string, { short: string; full: string }> = {
  doc_titular: { short: 'RG/CPF', full: 'RG, CPF ou CNH do Titular' },
  doc_spouse: { short: 'Cônjuge', full: 'Documento do Cônjuge' },
  civil_cert: { short: 'Certidão', full: 'Certidão de Nascimento ou Casamento' },
  residence_proof: { short: 'Residência', full: 'Comprovante de Residência' },
  purchase_contract: { short: 'Compra/Venda', full: 'Contrato de Compra e Venda' },
  chain_contract: { short: 'Cadeia', full: 'Cadeia Dominial (Contratos Anteriores)' },
  service_contract: { short: 'Termo REURB', full: 'Contrato / Termo de Adesão REURB' },
  complementary: { short: 'Compl.', full: 'Documentos Complementares (IPTU, Planta)' },
};

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<'dossiers' | 'files' | 'drive'>('dossiers');

  // Estados dos Dossiês
  const [dossiers, setDossiers] = useState<DossierItem[]>([]);
  const [summary, setSummary] = useState<DossiersSummary | null>(null);
  const [loadingDossiers, setLoadingDossiers] = useState(true);

  // Filtros
  const [projects, setProjects] = useState<Project[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Estados de Sincronização Drive
  const [syncingDrive, setSyncingDrive] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Estados de Modais
  const [selectedDossier, setSelectedDossier] = useState<DossierItem | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadLotId, setUploadLotId] = useState('');
  const [uploadCategory, setUploadCategory] = useState('RG/CPF ou CNH do Titular');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Estado de Cópia
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Lista Geral de Documentos (Aba Arquivos)
  const [allDocs, setAllDocs] = useState<any[]>([]);
  const [loadingAllDocs, setLoadingAllDocs] = useState(false);
  const [fileStatusFilter, setFileStatusFilter] = useState('');

  // Carregar Projetos e Quadras
  useEffect(() => {
    async function loadMeta() {
      try {
        const [projRes, blockRes] = await Promise.all([
          axios.get('/api/projects'),
          axios.get('/api/blocks'),
        ]);
        setProjects(projRes.data.data || []);
        setBlocks(blockRes.data.data || []);
      } catch (err) {
        console.error('Erro ao carregar projetos e quadras', err);
      }
    }
    loadMeta();
  }, []);

  // Carregar Dossiês
  const loadDossiers = async () => {
    setLoadingDossiers(true);
    try {
      const res = await axios.get('/api/documents/dossiers', {
        params: {
          projectId: selectedProject || undefined,
          blockId: selectedBlock || undefined,
          statusFilter: selectedStatus || undefined,
          search: searchTerm || undefined,
        },
      });
      if (res.data?.success) {
        setDossiers(res.data.data.dossiers || []);
        setSummary(res.data.data.summary || null);
      }
    } catch (err) {
      console.error('Erro ao carregar dossiês', err);
    } finally {
      setLoadingDossiers(false);
    }
  };

  useEffect(() => {
    loadDossiers();
  }, [selectedProject, selectedBlock, selectedStatus]);

  // Carregar Lista Geral de Arquivos
  const loadAllDocs = async () => {
    setLoadingAllDocs(true);
    try {
      const res = await axios.get('/api/documents', {
        params: fileStatusFilter ? { status: fileStatusFilter } : undefined,
      });
      setAllDocs(res.data.data || []);
    } catch (err) {
      console.error('Erro ao carregar lista de arquivos', err);
    } finally {
      setLoadingAllDocs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'files') {
      loadAllDocs();
    }
  }, [activeTab, fileStatusFilter]);

  // Filtrar quadras com base no projeto selecionado
  const filteredBlocks = useMemo(() => {
    if (!selectedProject) return blocks;
    return blocks.filter((b) => b.projectId === selectedProject);
  }, [blocks, selectedProject]);

  // Sincronizar Google Drive
  const handleSyncDrive = async () => {
    setSyncingDrive(true);
    setSyncFeedback(null);
    try {
      const res = await axios.post('/api/documents/sync-drive');
      setSyncFeedback(res.data?.message || 'Sincronização concluída com sucesso!');
      await loadDossiers();
    } catch (err: any) {
      setSyncFeedback(err?.response?.data?.message || 'Erro ao sincronizar com Google Drive.');
    } finally {
      setSyncingDrive(false);
    }
  };

  // Copiar Caminho do Drive
  const handleCopyPath = (pathText: string) => {
    navigator.clipboard.writeText(pathText);
    setCopiedPath(pathText);
    setTimeout(() => setCopiedPath(null), 2500);
  };

  // Enviar Documento
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      alert('Por favor, selecione um arquivo.');
      return;
    }

    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('category', uploadCategory);
      if (uploadLotId) fd.append('lotId', uploadLotId);
      if (uploadNotes) fd.append('notes', uploadNotes);

      await axios.post('/api/documents', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadNotes('');
      await loadDossiers();

      if (selectedDossier) {
        // Atualiza o dossiê aberto
        const updated = await axios.get('/api/documents/dossiers', {
          params: { search: selectedDossier.lotNumber },
        });
        const fresh = updated.data?.data?.dossiers?.find((d: any) => d.id === selectedDossier.id);
        if (fresh) setSelectedDossier(fresh);
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erro ao enviar documento.');
    } finally {
      setIsUploading(false);
    }
  };

  // Excluir Documento
  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await axios.delete(`/api/documents/${docId}`);
      await loadDossiers();
      if (selectedDossier) {
        setSelectedDossier((prev) =>
          prev ? { ...prev, documents: prev.documents.filter((d) => d.id !== docId) } : null
        );
      }
      if (activeTab === 'files') {
        loadAllDocs();
      }
    } catch {
      alert('Não foi possível excluir o documento.');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* CABEÇALHO */}
      <PageHeader
        title="Controle de Documentos & Dossiês REURB"
        subtitle="Acompanhamento da integridade documental das famílias e sincronização direta no Google Drive."
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleSyncDrive}
            disabled={syncingDrive}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
            title="Verificar e sincronizar pastas e documentos no Google Drive"
          >
            <RefreshCw size={14} className={syncingDrive ? 'animate-spin text-[#0f5964]' : ''} />
            {syncingDrive ? 'Sincronizando...' : 'Sincronizar Drive'}
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadLotId('');
              setUploadCategory('RG/CPF ou CNH do Titular');
              setIsUploadModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0c4952] transition"
          >
            <Plus size={15} /> Novo Documento
          </button>
        </div>
      </PageHeader>

      {/* FEEDBACK DE SINCRONIZAÇÃO */}
      {syncFeedback && (
        <div className="flex items-center justify-between rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-emerald-600" />
            <span>{syncFeedback}</span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="text-emerald-600 hover:text-emerald-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* NAVEGAÇÃO ENTRE ABAS */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-3xl px-6 pt-3 shadow-soft">
        <button
          onClick={() => setActiveTab('dossiers')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'dossiers'
              ? 'border-[#0f5964] text-[#0f5964]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FolderOpen size={17} /> Dossiês por Lote (Controle REURB)
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'files'
              ? 'border-[#0f5964] text-[#0f5964]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText size={17} /> Todos os Arquivos
        </button>
        <button
          onClick={() => setActiveTab('drive')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold transition ${
            activeTab === 'drive'
              ? 'border-[#0f5964] text-[#0f5964]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Folder size={17} /> Google Drive (G:)
        </button>
      </div>

      {/* ABA 1: DOSSIÊS POR LOTE */}
      {activeTab === 'dossiers' && (
        <div className="space-y-6">
          {/* CARDS INDICADORES / ESTATÍSTICAS */}
          {summary && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Total de Lotes</span>
                  <Layers size={18} className="text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-900">{summary.totalLots}</p>
                <span className="text-[11px] text-slate-400">cadastrados no sistema</span>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Dossiê Completo</span>
                  <CheckCircle2 size={18} className="text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-700">{summary.completeCount}</p>
                <span className="text-[11px] text-emerald-600 font-medium">
                  {summary.totalLots > 0
                    ? `${Math.round((summary.completeCount / summary.totalLots) * 100)}% dos lotes prontos`
                    : '0%'}
                </span>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Com Pendências</span>
                  <Clock size={18} className="text-amber-600" />
                </div>
                <p className="mt-2 text-2xl font-black text-amber-700">{summary.pendingCount}</p>
                <span className="text-[11px] text-amber-600 font-medium">docs em análise ou incompletos</span>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sem Documentos</span>
                  <AlertCircle size={18} className="text-slate-400" />
                </div>
                <p className="mt-2 text-2xl font-black text-slate-700">{summary.emptyCount + summary.noOwnerCount}</p>
                <span className="text-[11px] text-slate-400">aguardando recebimento</span>
              </div>
            </div>
          )}

          {/* PAINEL DE FILTROS */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
              <h3 className="flex items-center gap-2 font-semibold text-[#1c3b45] text-sm">
                <Filter size={16} /> Filtros de Pesquisa
              </h3>
              {(selectedProject || selectedBlock || selectedStatus || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProject('');
                    setSelectedBlock('');
                    setSelectedStatus('');
                    setSearchTerm('');
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Projeto</label>
                <select
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                    setSelectedBlock('');
                  }}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0f5964]"
                >
                  <option value="">Todos os Projetos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quadra</label>
                <select
                  value={selectedBlock}
                  onChange={(e) => setSelectedBlock(e.target.value)}
                  disabled={!selectedProject && filteredBlocks.length > 20}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0f5964] disabled:bg-slate-50"
                >
                  <option value="">Todas as Quadras</option>
                  {filteredBlocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      Quadra {b.number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Situação do Dossiê</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0f5964]"
                >
                  <option value="">Todas as situações</option>
                  <option value="COMPLETE">Completo (100% dos docs)</option>
                  <option value="PENDING">Com Pendências (Incompleto)</option>
                  <option value="EMPTY">Sem Documentos anexados</option>
                  <option value="NO_OWNER">Sem Titular vinculado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Buscar Titular / Lote / CPF</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Nome, CPF ou número..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && loadDossiers()}
                    className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0f5964]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* TABELA DE DOSSIÊS */}
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-soft">
            {loadingDossiers ? (
              <div className="p-12 text-center text-sm font-semibold text-slate-500">
                <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-[#0f5964]" />
                Carregando controle de dossiês...
              </div>
            ) : dossiers.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Nenhum dossiê encontrado para os filtros selecionados.
              </div>
            ) : (
              <table className="w-full min-w-[1000px] text-left text-xs text-slate-700">
                <thead>
                  <tr className="border-b bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-5 py-3.5">Lote / Quadra</th>
                    <th className="px-5 py-3.5">Titular do Lote</th>
                    <th className="px-5 py-3.5">Progresso</th>
                    <th className="px-5 py-3.5">Checklist de Documentos</th>
                    <th className="px-5 py-3.5">Google Drive (G:)</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dossiers.map((item) => {
                    const isComplete = item.status === 'COMPLETE';
                    const hasDocs = item.totalUploaded > 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition">
                        {/* LOTE / QUADRA */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-900 text-sm">
                            Lote {item.lotNumber}
                          </div>
                          <div className="text-slate-500 font-medium">
                            Quadra {item.block.number} • {item.project.name}
                          </div>
                        </td>

                        {/* TITULAR */}
                        <td className="px-5 py-4">
                          {item.owner ? (
                            <div>
                              <div className="font-semibold text-slate-900">{item.owner.fullName}</div>
                              <div className="text-slate-500">
                                CPF: {formatCpf(item.owner.cpf) || 'Não informado'}
                              </div>
                              {item.owner.spouse && (
                                <div className="text-[11px] text-[#0f5964] font-medium mt-0.5">
                                  Cônjuge: {item.owner.spouse.fullName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                              Sem Titular
                            </span>
                          )}
                        </td>

                        {/* PROGRESSO */}
                        <td className="px-5 py-4 min-w-[160px]">
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[11px] font-bold ${
                                isComplete
                                  ? 'text-emerald-700'
                                  : hasDocs
                                  ? 'text-[#0f5964]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {item.progressPercent}%
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {item.completedRequired} de {item.totalRequired}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${
                                isComplete ? 'bg-emerald-500' : 'bg-[#0f5964]'
                              }`}
                              style={{ width: `${item.progressPercent}%` }}
                            />
                          </div>
                          <div className="mt-1">
                            {isComplete ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                <CheckCircle2 size={11} /> Dossiê Completo
                              </span>
                            ) : item.status === 'NO_OWNER' ? (
                              <span className="text-[10px] text-slate-400">Lote Vago</span>
                            ) : hasDocs ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700">
                                <Clock size={11} /> Pendente
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">Sem Documentos</span>
                            )}
                          </div>
                        </td>

                        {/* CHECKLIST VISUAL COM BADGES */}
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                            {item.checklist
                              .filter((chk) => chk.isApplicable)
                              .map((chk) => {
                                const labels = CHECKLIST_LABELS[chk.key] || { short: chk.label, full: chk.label };
                                return (
                                  <span
                                    key={chk.key}
                                    title={`${labels.full}: ${chk.hasDoc ? 'Anexado' : 'Pendente'}`}
                                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                                      chk.hasDoc
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : chk.required
                                        ? 'bg-red-50 text-red-600 border border-red-200'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}
                                  >
                                    {chk.hasDoc ? <Check size={10} className="stroke-[3]" /> : <X size={10} />}
                                    {labels.short}
                                  </span>
                                );
                              })}
                          </div>
                        </td>

                        {/* GOOGLE DRIVE PATH */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleCopyPath(item.drivePath)}
                              title={`Copiar caminho no Google Drive:\n${item.drivePath}`}
                              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-[#0f5964] transition"
                            >
                              {copiedPath === item.drivePath ? (
                                <>
                                  <Check size={13} className="text-emerald-600" />
                                  <span className="text-emerald-600">Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={13} className="text-slate-500" />
                                  <span>Copiar Caminho</span>
                                </>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* AÇÕES */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedDossier(item)}
                              className="flex items-center gap-1 rounded-xl bg-[#0f5964]/10 px-3 py-1.5 text-xs font-semibold text-[#0f5964] hover:bg-[#0f5964] hover:text-white transition"
                              title="Ver todos os documentos e anexar novos"
                            >
                              <Eye size={13} /> Dossiê ({item.totalUploaded})
                            </button>
                            <Link
                              to={`/lots/${item.id}`}
                              className="rounded-xl border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition"
                              title="Abrir página completa do Lote"
                            >
                              <ArrowRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ABA 2: LISTA GERAL DE ARQUIVOS */}
      {activeTab === 'files' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
            <h3 className="font-semibold text-[#1c3b45] text-sm">Todos os Documentos Anexados</h3>
            <div className="flex items-center gap-3">
              <select
                value={fileStatusFilter}
                onChange={(e) => setFileStatusFilter(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none"
              >
                <option value="">Todos os status</option>
                <option value="PENDING">Pendente</option>
                <option value="APPROVED">Aprovado</option>
                <option value="REJECTED">Rejeitado</option>
              </select>
              <button
                type="button"
                onClick={loadAllDocs}
                className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"
              >
                <RefreshCw size={14} className={loadingAllDocs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-soft">
            {loadingAllDocs ? (
              <div className="p-12 text-center text-sm text-slate-500">Carregando arquivos...</div>
            ) : allDocs.length === 0 ? (
              <div className="p-12 text-center text-sm text-slate-500">Nenhum documento encontrado.</div>
            ) : (
              <table className="w-full text-left text-xs text-slate-700">
                <thead>
                  <tr className="border-b bg-slate-50/80 font-bold uppercase tracking-wider text-slate-600">
                    <th className="px-5 py-3.5">Nome do Arquivo</th>
                    <th className="px-5 py-3.5">Titular / Lote</th>
                    <th className="px-5 py-3.5">Categoria</th>
                    <th className="px-5 py-3.5">Data de Envio</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allDocs.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/60 transition">
                      <td className="px-5 py-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-[#0f5964]" />
                          <span>{doc.originalName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div>{doc.person?.fullName || 'Sem titular'}</div>
                        {doc.lot && <span className="text-slate-400">Lote {doc.lot.number}</span>}
                      </td>
                      <td className="px-5 py-4">{doc.documentType?.name || doc.category || 'Geral'}</td>
                      <td className="px-5 py-4 text-slate-500">
                        {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                          {doc.status || 'Ativo'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <a
                            href={doc.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-100 transition"
                            title="Visualizar / Baixar"
                          >
                            <Download size={13} />
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-700 hover:bg-red-100 transition"
                            title="Excluir Documento"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ABA 3: GOOGLE DRIVE STATUS & INFORMAÇÕES */}
      {activeTab === 'drive' && (
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft space-y-6">
            <div className="flex items-center gap-3 border-b pb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-[#0f5964]">
                <FolderOpen size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Sincronização com o Google Drive (G:)</h3>
                <p className="text-xs text-slate-500">
                  Gerenciamento automático de pastas espelhadas em tempo real no seu computador.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Caminho Raiz no PC</span>
                <p className="font-mono text-xs font-bold text-slate-800">
                  {summary?.driveBasePath || 'G:\\Meu Drive\\GENESIS_REURB'}
                </p>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={14} /> Unidade G: detectada e conectada
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase">Estrutura Automática</span>
                <p className="text-xs text-slate-700 font-medium">
                  [Projeto] &gt; Quadra [X] &gt; Lote [Y] - [Nome do Titular] - [CPF]
                </p>
                <div className="pt-2 text-xs text-slate-500">
                  Ao trocar o titular ou CPF, a pasta é renomeada preservando os arquivos.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
              <div className="text-xs text-slate-500">
                Se você adicionou arquivos manualmente pelo Windows Explorer ou deseja garantir que todas as pastas
                existam, clique no botão ao lado.
              </div>
              <button
                type="button"
                onClick={handleSyncDrive}
                disabled={syncingDrive}
                className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c4952] transition disabled:opacity-50"
              >
                <RefreshCw size={15} className={syncingDrive ? 'animate-spin' : ''} />
                {syncingDrive ? 'Sincronizando agora...' : 'Forçar Sincronização Geral'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALHES DO DOSSIÊ DO LOTE */}
      {selectedDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div className="flex items-start justify-between border-b pb-4">
              <div>
                <span className="text-xs font-bold uppercase text-[#0f5964]">
                  Dossiê Documental REURB
                </span>
                <h3 className="text-xl font-bold text-slate-900">
                  Lote {selectedDossier.lotNumber} • Quadra {selectedDossier.block.number}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Titular: <strong>{selectedDossier.owner?.fullName || 'Sem Titular'}</strong>
                  {selectedDossier.owner?.cpf && ` (CPF: ${formatCpf(selectedDossier.owner.cpf)})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDossier(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* BARRA DE PROGRESSO NO MODAL */}
            <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>Progresso dos Documentos Obrigatórios</span>
                <span
                  className={
                    selectedDossier.progressPercent === 100 ? 'text-emerald-700' : 'text-[#0f5964]'
                  }
                >
                  {selectedDossier.progressPercent}% ({selectedDossier.completedRequired} de{' '}
                  {selectedDossier.totalRequired})
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${
                    selectedDossier.progressPercent === 100 ? 'bg-emerald-500' : 'bg-[#0f5964]'
                  }`}
                  style={{ width: `${selectedDossier.progressPercent}%` }}
                />
              </div>
            </div>

            {/* CHECKLIST COM OPÇÃO DE ANEXAR DIRETO */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Checklist Oficial do Lote
              </h4>
              <div className="space-y-2">
                {selectedDossier.checklist
                  .filter((chk) => chk.isApplicable)
                  .map((chk) => {
                    const labels = CHECKLIST_LABELS[chk.key] || { short: chk.label, full: chk.label };
                    return (
                      <div
                        key={chk.key}
                        className={`flex items-center justify-between rounded-xl border p-3 transition ${
                          chk.hasDoc
                            ? 'border-emerald-200 bg-emerald-50/20'
                            : chk.required
                            ? 'border-amber-200 bg-amber-50/20'
                            : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                              chk.hasDoc
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {chk.hasDoc ? <Check size={16} className="stroke-[3]" /> : <FileText size={16} />}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-800">{labels.full}</div>
                            <div className="text-[11px] text-slate-500">
                              {chk.hasDoc
                                ? `${chk.count} arquivo(s) anexado(s)`
                                : chk.required
                                ? 'Obrigatório para titulação'
                                : 'Opcional / Complementar'}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setUploadLotId(selectedDossier.id);
                            setUploadCategory(labels.full);
                            setIsUploadModalOpen(true);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          <Upload size={12} /> {chk.hasDoc ? 'Anexar outro' : 'Anexar'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* LISTA DE ARQUIVOS ANEXADOS DESTE LOTE */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Arquivos do Lote ({selectedDossier.documents.length})
              </h4>
              {selectedDossier.documents.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum arquivo enviado ainda.</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {selectedDossier.documents.map((d: any) => (
                    <div key={d.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2.5">
                        <FileText size={16} className="text-[#0f5964]" />
                        <div>
                          <p className="text-xs font-semibold text-slate-800">{d.originalName}</p>
                          <span className="text-[10px] text-slate-400">
                            {d.category || d.documentType?.name || 'Geral'} •{' '}
                            {new Date(d.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={d.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                          title="Baixar / Visualizar"
                        >
                          <Download size={13} />
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(d.id)}
                          className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100"
                          title="Excluir"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CAMINHO DO GOOGLE DRIVE */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3 text-xs">
              <div className="truncate">
                <span className="font-semibold text-slate-700 block">Pasta no Google Drive:</span>
                <span className="font-mono text-[11px] text-slate-500 truncate block">
                  {selectedDossier.drivePath}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyPath(selectedDossier.drivePath)}
                className="shrink-0 flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
              >
                {copiedPath === selectedDossier.drivePath ? <Check size={13} /> : <Copy size={13} />}
                {copiedPath === selectedDossier.drivePath ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <button
                type="button"
                onClick={() => setSelectedDossier(null)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE UPLOAD / ANEXAR NOVO DOCUMENTO */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-base">Anexar Documento</h3>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Vincular ao Lote (Opcional se for avulso)
                </label>
                <select
                  value={uploadLotId}
                  onChange={(e) => setUploadLotId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0f5964]"
                >
                  <option value="">Selecione um lote (ou deixe vazio para geral)...</option>
                  {dossiers.map((d) => (
                    <option key={d.id} value={d.id}>
                      Lote {d.lotNumber} (Q{d.block.number}) - {d.owner?.fullName || 'Sem Titular'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Categoria do Documento
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0f5964]"
                  required
                >
                  <option value="RG/CPF ou CNH do Titular">1. RG/CPF ou CNH do Titular</option>
                  <option value="Documento do Cônjuge">2. Documento do Cônjuge</option>
                  <option value="Certidão de Casamento ou Nascimento">
                    3. Certidão de Casamento ou Nascimento
                  </option>
                  <option value="Comprovante de Residência">4. Comprovante de Residência</option>
                  <option value="Contrato de Compra e Venda do Lote">
                    5. Contrato de Compra e Venda do Lote
                  </option>
                  <option value="Sequência de Contrato (Cadeia Dominial)">
                    6. Sequência de Contrato (Cadeia Dominial)
                  </option>
                  <option value="Contrato de Prestação de Serviços (REURB)">
                    7. Contrato de Prestação de Serviços (REURB)
                  </option>
                  <option value="Documentos Complementares">8. Documentos Complementares</option>
                  <option value="Outros">Outros Documentos</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Arquivo (PDF, Imagens, DOCX)
                </label>
                <input
                  ref={uploadFileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.docx,.zip"
                  className="hidden"
                  onChange={(e) => {
                    setUploadFile(e.target.files?.[0] || null);
                    if (e.target) e.target.value = '';
                  }}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingUpload(true);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingUpload(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingUpload(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDraggingUpload(false);
                    const droppedFile = e.dataTransfer.files?.[0] || null;
                    if (droppedFile) setUploadFile(droppedFile);
                  }}
                  onClick={() => uploadFileInputRef.current?.click()}
                  className={`group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-5 text-center transition cursor-pointer ${
                    isDraggingUpload
                      ? 'border-[#0f5964] bg-teal-50/80 ring-4 ring-teal-500/20 scale-[1.01]'
                      : uploadFile
                      ? 'border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70'
                      : 'border-slate-300 hover:border-[#0f5964] hover:bg-slate-50'
                  }`}
                >
                  {uploadFile ? (
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm mb-1.5">
                        <CheckCircle2 size={20} />
                      </div>
                      <p className="text-xs font-bold text-slate-800 break-all px-2 max-w-full">
                        {uploadFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB · Pronto para envio
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#0f5964] border border-slate-200 shadow-xs group-hover:bg-slate-50">
                          Trocar arquivo
                        </span>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setUploadFile(null);
                          }}
                          className="rounded-lg bg-white p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
                          title="Remover arquivo"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl mb-1.5 transition-all ${
                          isDraggingUpload
                            ? 'bg-[#0f5964] text-white scale-110 shadow-md animate-pulse'
                            : 'bg-teal-50 text-[#0f5964]'
                        }`}
                      >
                        <Upload size={20} />
                      </div>
                      <p className="text-xs font-bold text-slate-800">
                        {isDraggingUpload ? 'Solte o arquivo aqui agora' : 'Arraste e solte o documento aqui'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        ou clique para selecionar do computador
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Observações (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Documento com averbação..."
                  value={uploadNotes}
                  onChange={(e) => setUploadNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 outline-none focus:border-[#0f5964]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  disabled={isUploading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="rounded-xl bg-[#0f5964] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0c4952] disabled:opacity-50"
                >
                  {isUploading ? 'Enviando...' : 'Salvar Documento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}