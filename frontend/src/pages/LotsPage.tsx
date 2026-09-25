import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Building2,
  CheckCircle2,
  FileCheck2,
  FileClock,
  Filter,
  Layers,
  Search,
  Trash2,
  X,
  Plus
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { Link, useNavigate } from 'react-router-dom';
import { LotModal } from '../components/LotModal';
import { normalizeText } from '../utils/text';

type Project = { id: string; name: string };
type Block = { id: string; number: string; projectId: string };
type Person = { id: string; fullName: string; cpf?: string };
type Occupancy = {
  id: string;
  type: string;
  current?: boolean;
  person: Person;
};
type InstallmentRef = {
  id: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
};
type NegotiationRef = {
  installments?: InstallmentRef[];
};
type Contract = {
  id: string;
  contractNumber: string;
  signed: boolean;
  person?: Person;
  negotiations?: NegotiationRef[];
};
type Lot = {
  id: string;
  number: string;
  status: string;
  area?: number;
  perimeter?: number;
  block: Block;
  project: Project;
  occupancies?: Occupancy[];
  contracts?: Contract[];
};

const STATUS_CONFIG: Record<string, { label: string; shortLabel: string; style: string }> = {
  NOT_SIGNED: {
    label: 'Não assinou contrato',
    shortLabel: 'Não assinou',
    style: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  CONTRACT_SIGNED: {
    label: 'Contrato assinado',
    shortLabel: 'Assinado',
    style: 'bg-[#edf7f7] text-[#0f5964] border-[#bfe2e6]',
  },
  TITLE_ISSUED: {
    label: 'Título emitido',
    shortLabel: 'Título emitido',
    style: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  REGISTERED: {
    label: 'Registrado em cartório',
    shortLabel: 'Registrado',
    style: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  CANCELLED: {
    label: 'Distrato / Cancelado',
    shortLabel: 'Distrato',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  DISTRATTO: {
    label: 'Distrato / Cancelado',
    shortLabel: 'Distrato',
    style: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

function formatCPF(val?: string | null): string {
  if (!val) return '';
  const digits = String(val).replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return val;
}

const STATUS_OPTIONS = [
  { value: 'NOT_SIGNED', label: 'Não assinou contrato' },
  { value: 'CONTRACT_SIGNED', label: 'Contrato assinado' },
  { value: 'TITLE_ISSUED', label: 'Título emitido' },
  { value: 'REGISTERED', label: 'Registrado em cartório' },
  { value: 'CANCELLED', label: 'Distrato' },
];

export function LotsPage() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados dos Filtros: iniciam todos vazios/limpos (SEM filtro padrão)
  const [search, setSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedBlock, setSelectedBlock] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [isLotModalOpen, setIsLotModalOpen] = useState(false);

  const fetchLots = async () => {
    try {
      const res = await axios.get('/api/lots');
      setLots(res.data.data || []);
    } catch {
      console.error('Failed to fetch lots');
    }
  };

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [lotsRes, projectsRes, blocksRes] = await Promise.all([
          axios.get('/api/lots'),
          axios.get('/api/projects'),
          axios.get('/api/blocks'),
        ]);
        setLots(lotsRes.data.data || []);
        setProjects(projectsRes.data.data || []);
        setBlocks(blocksRes.data.data || []);
        setError(null);
      } catch {
        setError('Não foi possível carregar os lotes.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredBlocks = useMemo(() => {
    if (!selectedProject) return blocks;
    return blocks.filter((b) => b.projectId === selectedProject);
  }, [blocks, selectedProject]);

  const toggleStatus = (statusValue: string) => {
    setSelectedStatuses((prev) =>
      prev.includes(statusValue) ? prev.filter((s) => s !== statusValue) : [...prev, statusValue]
    );
  };

  // Função para identificar o titular do lote com segurança
  const getLotOwner = (lot: Lot, searchQuery?: string): Person | null => {
    const q = normalizeText(searchQuery);
    if (lot.occupancies && lot.occupancies.length > 0) {
      if (q) {
        const matchedOcc = lot.occupancies.find(
          (o) =>
            normalizeText(o.person?.fullName).includes(q) ||
            (o.person?.cpf && normalizeText(o.person.cpf).includes(q))
        );
        if (matchedOcc?.person) return matchedOcc.person;
      }
      const current =
        lot.occupancies.find((o) => o.current && o.type === 'OWNER') ||
        lot.occupancies.find((o) => o.current) ||
        lot.occupancies[0];
      if (current?.person) return current.person;
    }
    if (lot.contracts && lot.contracts.length > 0) {
      if (q) {
        const matchedCtr = lot.contracts.find(
          (c) =>
            normalizeText(c.person?.fullName).includes(q) ||
            (c.person?.cpf && normalizeText(c.person.cpf).includes(q))
        );
        if (matchedCtr?.person) return matchedCtr.person;
      }
      if (lot.contracts[0].person) return lot.contracts[0].person;
    }
    return null;
  };

  // Função para verificar a situação financeira real do lote (Em dia vs Atrasado)
  const getLotFinanceStatus = (
    lot: Lot
  ): {
    hasFinancialPlan: boolean;
    isOverdue: boolean;
    overdueCount: number;
    pendingFutureCount: number;
    isFullyPaid: boolean;
    label: string;
    dotClass: string;
    textClass: string;
  } => {
    const allInstallments: InstallmentRef[] = [];
    if (lot.contracts) {
      for (const c of lot.contracts) {
        if (c.negotiations) {
          for (const n of c.negotiations) {
            if (n.installments) {
              allInstallments.push(...n.installments);
            }
          }
        }
      }
    }

    if (allInstallments.length === 0) {
      return {
        hasFinancialPlan: false,
        isOverdue: false,
        overdueCount: 0,
        pendingFutureCount: 0,
        isFullyPaid: false,
        label: 'Sem plano financeiro',
        dotClass: 'bg-slate-300 ring-slate-100',
        textClass: 'text-slate-400',
      };
    }

    // Início do dia de hoje (00:00:00) para comparação precisa de vencimento
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let overdueCount = 0;
    let pendingFutureCount = 0;
    let paidCount = 0;

    for (const inst of allInstallments) {
      if (inst.status === 'CANCELED') continue;

      if (inst.status === 'PAID') {
        paidCount++;
        continue;
      }

      const due = new Date(inst.dueDate);
      due.setHours(0, 0, 0, 0);

      // Se venceu antes de hoje ou está explicitamente marcado como OVERDUE
      if (inst.status === 'OVERDUE' || due.getTime() < today.getTime()) {
        overdueCount++;
      } else {
        pendingFutureCount++;
      }
    }

    // 1. SE HOUVER PARCELA EM ATRASO -> VERMELHO
    if (overdueCount > 0) {
      return {
        hasFinancialPlan: true,
        isOverdue: true,
        overdueCount,
        pendingFutureCount,
        isFullyPaid: false,
        label: `${overdueCount} em atraso`,
        dotClass: 'bg-rose-500',
        textClass: 'text-rose-600 font-semibold',
      };
    }

    // 2. SE TODAS ESTÃO PAGAS -> VERDE (QUITADO)
    if (pendingFutureCount === 0 && paidCount > 0) {
      return {
        hasFinancialPlan: true,
        isOverdue: false,
        overdueCount: 0,
        pendingFutureCount: 0,
        isFullyPaid: true,
        label: 'Quitado',
        dotClass: 'bg-emerald-500',
        textClass: 'text-emerald-700 font-medium',
      };
    }

    // 3. SE NÃO TEM NENHUMA EM ATRASO E TEM PARCELAS A VENCER -> EM DIA
    return {
      hasFinancialPlan: true,
      isOverdue: false,
      overdueCount: 0,
      pendingFutureCount,
      isFullyPaid: false,
      label: 'Em dia',
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-600 font-medium',
    };
  };

  const filteredLots = useMemo(() => {
    return lots.filter((lot) => {
      const owner = getLotOwner(lot, search);
      const ownerName = normalizeText(owner?.fullName);
      const ownerCpf = normalizeText(owner?.cpf);

      const query = normalizeText(search);
      const matchesSearch =
        !query ||
        normalizeText(lot.number).includes(query) ||
        normalizeText(`lote ${lot.number}`).includes(query) ||
        normalizeText(lot.block.number).includes(query) ||
        normalizeText(`quadra ${lot.block.number}`).includes(query) ||
        normalizeText(`q${lot.block.number}`).includes(query) ||
        ownerName.includes(query) ||
        ownerCpf.includes(query) ||
        Boolean(lot.contracts?.some((c) => normalizeText(c.person?.fullName).includes(query) || (c.person?.cpf && normalizeText(c.person.cpf).includes(query)) || normalizeText(c.contractNumber).includes(query))) ||
        Boolean(lot.occupancies?.some((o) => normalizeText(o.person?.fullName).includes(query) || (o.person?.cpf && normalizeText(o.person.cpf).includes(query))));

      const matchesProject = !selectedProject || lot.project.id === selectedProject;
      const matchesBlock = !selectedBlock || lot.block.id === selectedBlock;
      const matchesStatus =
        selectedStatuses.length === 0 ||
        selectedStatuses.some((st) => {
          if (st === 'CANCELLED' || st === 'DISTRATTO') {
            return lot.status === 'CANCELLED' || lot.status === 'DISTRATTO';
          }
          return lot.status === st;
        });

      return matchesSearch && matchesProject && matchesBlock && matchesStatus;
    });
  }, [lots, search, selectedProject, selectedBlock, selectedStatuses]);

  async function handleDeleteLot(lot: Lot) {
    if (window.confirm(`Deseja realmente excluir o Lote ${lot.number} da Quadra ${lot.block.number}?`)) {
      try {
        await axios.delete(`/api/lots/${lot.id}`);
        setLots((prev) => prev.filter((l) => l.id !== lot.id));
      } catch (err: any) {
        alert(err?.response?.data?.message || 'Erro ao excluir lote.');
      }
    }
  }

  return (
    <div className="space-y-3 pb-12 max-w-full">
      {/* CABEÇALHO COMPACTO */}
      <PageHeader
        title="Gestão de lotes"
        subtitle="Titulares, contratos e acompanhamento da regularização."
      >
        <button
          type="button"
          onClick={() => setIsLotModalOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#0f5964] hover:bg-[#0c4952] px-3.5 py-2 text-sm font-medium text-white transition shadow-xs cursor-pointer"
        >
          <Plus size={16} />
          <span>Novo lote</span>
        </button>
      </PageHeader>

      {/* PAINEL DE FILTROS COMPACTO */}
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Lotes cadastrados</h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
              {lots.length} no cadastro
            </span>
          </div>
          {(search || selectedProject || selectedBlock || selectedStatuses.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedProject('');
                setSelectedBlock('');
                setSelectedStatuses([]);
              }}
              className="text-xs font-medium text-[#0f5964] hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* Linha de Inputs */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Buscar lote ou titular
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Nome, CPF, quadra ou lote"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Projeto
            </label>
            <select
              value={selectedProject}
              onChange={(e) => {
                setSelectedProject(e.target.value);
                setSelectedBlock('');
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
            >
              <option value="">Todos os projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Quadra
            </label>
            <select
              value={selectedBlock}
              onChange={(e) => setSelectedBlock(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[#0f5964] focus:ring-1 focus:ring-[#0f5964] outline-none transition"
            >
              <option value="">Todas as quadras</option>
              {filteredBlocks.map((b) => (
                <option key={b.id} value={b.id}>
                  Quadra {b.number}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Pílulas de Situação (Multi-seleção) */}
        <div className="pt-2 flex items-center gap-2 flex-wrap border-t border-slate-100">
          <button
            type="button"
            onClick={() => setSelectedStatuses([])}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              selectedStatuses.length === 0
                ? 'bg-slate-100 text-slate-800 border border-slate-300'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todos
          </button>
          {STATUS_OPTIONS.map((opt) => {
            const isSelected = selectedStatuses.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition border ${
                  isSelected
                    ? 'bg-[#edf7f7] text-[#0f5964] border-[#0f5964]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {error && <p className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{error}</p>}

      {/* ÁREA DE RESULTADOS: DESKTOP (TABELA) + MOBILE (CARDS) */}
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm shadow-xs">
          Carregando lotes...
        </div>
      ) : filteredLots.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500 text-sm shadow-xs">
          Nenhum lote corresponde aos filtros selecionados.
        </div>
      ) : (
        <>
          {/* 1. TABELA PARA TELAS MÉDIAS E GRANDES (>= md: 768px) */}
          <section className="hidden md:block rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Titular</th>
                    <th className="px-5 py-3">Quadra / lote</th>
                    <th className="px-5 py-3">Projeto</th>
                    <th className="px-5 py-3">Contrato</th>
                    <th className="px-5 py-3">Financeiro</th>
                    <th className="px-5 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLots.map((lot) => {
                    const cfg = STATUS_CONFIG[lot.status] || STATUS_CONFIG.NOT_SIGNED;
                    const fin = getLotFinanceStatus(lot);
                    const owner = getLotOwner(lot, search);

                    return (
                      <tr key={lot.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Titular */}
                        <td className="px-5 py-3.5">
                          {owner ? (
                            <div>
                              <Link
                                to={`/lots/${lot.id}`}
                                className="font-medium text-slate-900 hover:text-[#0f5964] hover:underline"
                              >
                                {owner.fullName}
                              </Link>
                              {owner.cpf && (
                                <div className="text-xs text-slate-400 font-mono mt-0.5">
                                  {formatCPF(owner.cpf)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Sem titular</span>
                          )}
                        </td>

                        {/* Quadra / Lote */}
                        <td className="px-5 py-3.5 text-sm text-slate-700 font-medium whitespace-nowrap">
                          Q. {lot.block.number} · Lt. {lot.number}
                        </td>

                        {/* Projeto */}
                        <td className="px-5 py-3.5 text-sm text-slate-600">
                          {lot.project.name}
                        </td>

                        {/* Contrato (Coluna separada) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.style}`}>
                            {cfg.shortLabel || cfg.label}
                          </span>
                        </td>

                        {/* Financeiro (Coluna separada) */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className={`text-xs font-medium ${fin.textClass}`}>
                            {fin.label}
                          </span>
                        </td>

                        {/* Ações */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            <Link
                              to={`/lots/${lot.id}`}
                              className="text-sm font-medium text-[#0f5964] hover:underline"
                            >
                              Abrir →
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDeleteLot(lot)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition"
                              title="Excluir lote"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Rodapé da Tabela */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-500">
              <span>{filteredLots.length} registros nesta prévia</span>
              <span>Prévia do cadastro</span>
            </div>
          </section>

          {/* 2. CARDS PARA CELULAR (< md: 768px) */}
          <div className="block md:hidden space-y-3">
            {filteredLots.map((lot) => {
              const owner = getLotOwner(lot, search);
              const fin = getLotFinanceStatus(lot);
              const cfg = STATUS_CONFIG[lot.status] || STATUS_CONFIG.NOT_SIGNED;

              return (
                <div
                  key={lot.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/lots/${lot.id}`}
                        className="font-medium text-slate-900 text-sm hover:text-[#0f5964] block truncate"
                      >
                        {owner?.fullName || <span className="text-slate-400 italic">Sem titular</span>}
                      </Link>
                      {owner?.cpf && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          CPF: {formatCPF(owner.cpf)}
                        </div>
                      )}
                    </div>
                    <Link
                      to={`/lots/${lot.id}`}
                      className="shrink-0 text-xs font-medium text-[#0f5964] bg-[#edf7f7] hover:bg-[#dfeeee] px-2.5 py-1.5 rounded-md transition"
                    >
                      Abrir lote →
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">
                      Q. {lot.block.number} · Lt. {lot.number}
                    </span>
                    <span>·</span>
                    <span className="truncate">{lot.project.name}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-md border px-2 py-0.5 font-medium ${cfg.style}`}>
                        {cfg.shortLabel || cfg.label}
                      </span>
                      <span className={`font-medium ${fin.textClass}`}>
                        {fin.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteLot(lot)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                      title="Excluir lote"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="text-center text-xs text-slate-500 py-2">
              {filteredLots.length} registros exibidos
            </div>
          </div>
        </>
      )}

      {/* MODAL DE CADASTRO DE LOTE */}
      <LotModal
        isOpen={isLotModalOpen}
        onClose={() => setIsLotModalOpen(false)}
        onSuccess={fetchLots}
      />
    </div>
  );
}