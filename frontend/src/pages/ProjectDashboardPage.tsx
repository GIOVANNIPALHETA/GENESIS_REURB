import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, CircleDollarSign, Layers3, Map, TrendingUp } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

type Project = {
  id: string;
  name: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  status?: string;
  active?: boolean;
  lots: Array<{ id: string }>;
  blocks: Array<{ id: string }>;
  contracts: Array<{ id: string }>;
  financial: { contracted: number; received: number; open: number };
  plannedBlocks?: number;
  plannedLots?: number;
};

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabels: Record<string, string> = { PLANNING: 'Planejamento', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', SUSPENDED: 'Suspenso' };

export function ProjectDashboardPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const response = await axios.get('/api/projects');
        const projects = response.data.data || [] as Project[];
        const found = projects.find((item: Project) => item.id === projectId) ?? null;
        setProject(found);
        setError(found ? null : 'Projeto não encontrado.');
      } catch (err) {
        setError('Não foi possível carregar o dashboard do empreendimento.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [projectId]);

  const summary = useMemo(() => ({
    regularization: project?.status === 'IN_PROGRESS' ? 1 : 0,
    lots: project?.lots.length ?? 0,
    blocks: project?.blocks.length ?? 0,
    contracted: project?.financial.contracted ?? 0,
    received: project?.financial.received ?? 0,
    open: project?.financial.open ?? 0,
  }), [project]);

  if (loading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft text-slate-600">Carregando dashboard do empreendimento...</div>;
  }

  if (error || !project) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700 shadow-soft">
        <p className="font-medium">{error ?? 'Projeto não encontrado.'}</p>
        <button onClick={() => navigate('/projects')} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white">Voltar para projetos</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <button onClick={() => navigate('/projects')} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} />
            Voltar
          </button>
          <h1 className="text-2xl font-semibold text-[#1c3b45]">{project.name}</h1>
          <p className="mt-2 text-sm text-slate-500">{project.neighborhood}, {project.city} - {project.state}</p>
        </div>
        <div className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
          {statusLabels[project.status || ''] || project.status || 'Sem status'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<TrendingUp size={19} />} label="Regularizações em andamento" value={summary.regularization} detail={project.status === 'IN_PROGRESS' ? 'Projeto ativo' : 'Sem andamento'} />
        <SummaryCard icon={<Map size={19} />} label="Lotes cadastrados" value={summary.lots} detail={`Estimados: ${project.plannedLots ?? 0}`} />
        <SummaryCard icon={<Layers3 size={19} />} label="Quadras cadastradas" value={summary.blocks} detail={`Previstas: ${project.plannedBlocks ?? 0}`} />
        <SummaryCard icon={<CircleDollarSign size={19} />} label="Balanço financeiro" value={currency(summary.received)} detail={`Em aberto: ${currency(summary.open)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft lg:col-span-2">
          <h2 className="text-lg font-semibold text-[#1c3b45]">Resumo do empreendimento</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <InfoRow label="Total contratado" value={currency(summary.contracted)} />
            <InfoRow label="Recebido" value={currency(summary.received)} />
            <InfoRow label="Saldo em aberto" value={currency(summary.open)} />
            <InfoRow label="Status" value={statusLabels[project.status || ''] || project.status || 'Sem status'} />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-[#1c3b45]">Indicadores</h2>
          <ul className="mt-5 space-y-4 text-sm text-slate-600">
            <li className="flex items-center justify-between"><span>Projetos ativos</span><strong>{project.active ? 'Sim' : 'Não'}</strong></li>
            <li className="flex items-center justify-between"><span>Contratos</span><strong>{project.contracts.length}</strong></li>
            <li className="flex items-center justify-between"><span>Lotes cadastrados</span><strong>{project.lots.length}</strong></li>
            <li className="flex items-center justify-between"><span>Lotes estimados</span><strong>{project.plannedLots ?? 0}</strong></li>
            <li className="flex items-center justify-between"><span>Quadras cadastradas</span><strong>{project.blocks.length}</strong></li>
            <li className="flex items-center justify-between"><span>Quadras previstas</span><strong>{project.plannedBlocks ?? 0}</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2 text-[#0f8b8d]">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-[#17343b]">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-slate-800">{value}</p>
    </div>
  );
}