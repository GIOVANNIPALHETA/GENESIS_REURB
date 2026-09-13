import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { CircleDollarSign, Layers3, Map, TrendingUp } from 'lucide-react';

type Project = {
  id: string;
  name: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  status?: string;
  active?: boolean;
  plannedBlocks?: number;
  plannedLots?: number;
  lots: Array<{ id: string }>;
  blocks: Array<{ id: string }>;
  contracts: Array<{ id: string }>;
  financial: { contracted: number; received: number; open: number };
};

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabels: Record<string, string> = { PLANNING: 'Planejamento', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', SUSPENDED: 'Suspenso' };

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: '', plannedBlocks: '0', plannedLots: '0', status: 'PLANNING', active: true });
  const [formError, setFormError] = useState<string | null>(null);

  async function loadProjects() {
    setLoading(true);
    try {
      const response = await axios.get('/api/projects');
      setProjects(response.data.data || []);
      setError(null);
    } catch (err) {
      setError('Não foi possível carregar os projetos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  const summary = useMemo(() => ({
    ongoing: projects.filter((project) => project.status === 'IN_PROGRESS').length,
    lots: projects.reduce((sum, project) => sum + project.lots.length, 0),
    blocks: projects.reduce((sum, project) => sum + project.blocks.length, 0),
    contracted: projects.reduce((sum, project) => sum + project.financial.contracted, 0),
    received: projects.reduce((sum, project) => sum + project.financial.received, 0),
    open: projects.reduce((sum, project) => sum + project.financial.open, 0),
  }), [projects]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', plannedBlocks: '0', plannedLots: '0', status: 'PLANNING', active: true });
    setFormError(null);
    setFormVisible(true);
  }

  function openEdit(p: Project) {
    setEditing(p);
    setForm({ name: p.name, plannedBlocks: String(p.plannedBlocks ?? p.blocks.length), plannedLots: String(p.plannedLots ?? p.lots.length), status: p.status || 'PLANNING', active: !!p.active });
    setFormError(null);
    setFormVisible(true);
  }

  async function handleDelete(projectId: string) {
    if (!window.confirm('Deseja excluir este projeto?')) return;
    try {
      await axios.delete(`/api/projects/${projectId}`);
      await loadProjects();
    } catch (err) {
      setError('Não foi possível excluir o projeto.');
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target as HTMLInputElement;
    setForm((s) => ({ ...s, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = { ...form, plannedBlocks: Number(form.plannedBlocks), plannedLots: Number(form.plannedLots) };
      if (editing) {
        await axios.put(`/api/projects/${editing.id}`, payload);
      } else {
        await axios.post('/api/projects', payload);
      }
      setFormVisible(false);
      await loadProjects();
    } catch (err) {
      // Try to extract server error message for better feedback
      // @ts-ignore
      const msg = err?.response?.data?.message || err?.message || 'Erro ao salvar projeto';
      setFormError(String(msg));
      console.error('Erro ao salvar projeto', err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <h1 className="text-2xl font-semibold text-[#1c3b45]">Projetos</h1>
          <p className="mt-2 text-sm text-slate-500">Lista de projetos cadastrados e seus status.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={openCreate} className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Novo Projeto</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard icon={<TrendingUp size={19} />} label="Regularizações em andamento" value={summary.ongoing} detail={`${projects.length} projeto(s) no total`} />
        <SummaryCard icon={<Map size={19} />} label="Lotes cadastrados" value={summary.lots} detail={`${summary.blocks} quadra(s)`} />
        <SummaryCard icon={<Layers3 size={19} />} label="Quadras cadastradas" value={summary.blocks} detail="Base territorial" />
        <SummaryCard icon={<CircleDollarSign size={19} />} label="Recebido até agora" value={currency(summary.received)} detail={`Em aberto: ${currency(summary.open)}`} />
      </div>

      {formVisible && (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm">Nome</label>
              <input name="name" value={form.name} onChange={handleChange} required className="w-full rounded-md border px-3 py-2 text-slate-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm">Quadras previstas</label>
              <input name="plannedBlocks" type="number" min="0" value={form.plannedBlocks} onChange={handleChange} className="w-full rounded-md border px-3 py-2 text-slate-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm">Lotes estimados</label>
              <input name="plannedLots" type="number" min="0" value={form.plannedLots} onChange={handleChange} className="w-full rounded-md border px-3 py-2 text-slate-900 bg-white" />
            </div>
            <div>
              <label className="block text-sm">Status</label>
              <select name="status" value={form.status} onChange={handleChange} className="w-full rounded-md border px-3 py-2 text-slate-900 bg-white">
                <option value="PLANNING">Planejamento</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="COMPLETED">Concluído</option>
                <option value="SUSPENDED">Suspenso</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" name="active" checked={!!form.active} onChange={handleChange} />
                Ativo
              </label>
            </div>
            <p className="text-xs text-slate-500 md:col-span-2">Os quantitativos reais serão calculados a partir das quadras e lotes cadastrados.</p>
            <div className="md:col-span-2 flex gap-3 items-center">
              <button type="submit" className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Salvar</button>
              <button type="button" onClick={() => setFormVisible(false)} className="rounded-lg border px-4 py-2">Cancelar</button>
              {formError && <div className="text-sm text-red-600">{formError}</div>}
            </div>
          </form>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        {loading ? (
          <p className="text-slate-500">Carregando projetos...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : projects.length === 0 ? (
          <p className="text-slate-500">Nenhum projeto encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm text-slate-700">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-semibold">Projeto</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Quadras cadastradas</th>
                  <th className="px-4 py-3 font-semibold">Lotes cadastrados</th>
                  <th className="px-4 py-3 font-semibold">Contratos</th>
                  <th className="px-4 py-3 font-semibold">Balanço financeiro</th>
                  <th className="px-4 py-3 font-semibold">Ativo</th>
                  <th className="px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="cursor-pointer border-b border-slate-200 hover:bg-slate-50" onClick={() => navigate(`/projects/${project.id}`)}>
                    <td className="px-4 py-4 font-medium text-slate-900">{project.name}</td>
                    <td className="px-4 py-4 text-slate-600">{statusLabels[project.status || ''] || project.status}</td>
                    <td className="px-4 py-4">{project.blocks.length}<div className="text-xs text-slate-500">Previstas: {project.plannedBlocks ?? 0}</div></td>
                    <td className="px-4 py-4">{project.lots.length}<div className="text-xs text-slate-500">Estimados: {project.plannedLots ?? 0}</div></td>
                    <td className="px-4 py-4">{project.contracts.length}</td>
                    <td className="px-4 py-4"><div className="font-semibold text-emerald-700">Recebido: {currency(project.financial.received)}</div><div className="text-xs text-slate-500">Contratado: {currency(project.financial.contracted)}</div><div className="text-xs text-amber-700">Em aberto: {currency(project.financial.open)}</div></td>
                    <td className="px-4 py-4">{project.active ? 'Sim' : 'Não'}</td>
                    <td className="px-4 py-4 flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); openEdit(project); }} className="rounded-md border px-3 py-1 text-sm">Editar</button>
                      <button onClick={(e) => { e.stopPropagation(); void handleDelete(project.id); }} className="rounded-md border border-red-500 px-3 py-1 text-sm text-red-600">Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: number | string; detail: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft"><div className="flex items-center gap-2 text-[#0f8b8d]">{icon}<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span></div><p className="mt-3 text-2xl font-semibold text-[#17343b]">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
