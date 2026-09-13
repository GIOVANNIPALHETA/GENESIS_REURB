import { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit3, Plus, Trash2, X } from 'lucide-react';

type Project = { id: string; name: string };
type Block = { id: string; number: string; description?: string | null; active: boolean; project: Project; _count: { lots: number } };
type BlockForm = { projectId: string; number: string; description: string; active: boolean };

const emptyForm: BlockForm = { projectId: '', number: '', description: '', active: true };

export function BlocksPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<BlockForm>(emptyForm);
  const [editing, setEditing] = useState<Block | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkVisible, setBulkVisible] = useState(false);
  const [bulkForm, setBulkForm] = useState({ projectId: '', quantity: '20', startNumber: '1' });

  async function load() {
    try {
      const [blocksResponse, projectsResponse] = await Promise.all([axios.get('/api/blocks'), axios.get('/api/projects')]);
      setBlocks(blocksResponse.data.data || []);
      setProjects((projectsResponse.data.data || []).map((project: Project) => ({ id: project.id, name: project.name })));
      setError(null);
    } catch {
      setError('Não foi possível carregar as quadras.');
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() { setEditing(null); setForm(emptyForm); setVisible(true); }
  function openEdit(block: Block) { setEditing(block); setForm({ projectId: block.project.id, number: block.number, description: block.description || '', active: block.active }); setVisible(true); }
  function change(event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : value }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editing) await axios.put(`/api/blocks/${editing.id}`, form);
      else await axios.post('/api/blocks', form);
      setVisible(false);
      await load();
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message || 'Erro ao salvar quadra.' : 'Erro ao salvar quadra.');
    }
  }
  async function submitBulk(event: React.FormEvent) {
    event.preventDefault();
    try {
      await axios.post('/api/blocks/bulk', { projectId: bulkForm.projectId, quantity: Number(bulkForm.quantity), startNumber: Number(bulkForm.startNumber) });
      setBulkVisible(false);
      await load();
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message || 'Erro ao cadastrar quadras.' : 'Erro ao cadastrar quadras.');
    }
  }
  async function remove(block: Block) {
    if (!window.confirm(`Excluir a quadra ${block.number}?`)) return;
    try { await axios.delete(`/api/blocks/${block.id}`); await load(); }
    catch (requestError: unknown) { setError(axios.isAxiosError(requestError) ? requestError.response?.data?.message || 'Erro ao excluir quadra.' : 'Erro ao excluir quadra.'); }
  }

  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#0f8b8d]">Cadastro territorial</p><h1 className="text-2xl font-semibold text-[#1c3b45]">Quadras</h1></div><div className="flex gap-2"><button onClick={() => setBulkVisible(true)} className="flex items-center gap-2 rounded-lg border border-[#1c3b45] px-4 py-2 text-[#1c3b45]"><Plus size={17} /> Cadastrar várias</button><button onClick={openCreate} className="flex items-center gap-2 rounded-lg bg-[#1c3b45] px-4 py-2 text-white"><Plus size={17} /> Nova quadra</button></div></header>
    {bulkVisible && <form onSubmit={submitBulk} className="grid gap-4 rounded-3xl border border-[#b8dedd] bg-[#f8fffe] p-6 shadow-soft md:grid-cols-3"><div className="flex items-center justify-between md:col-span-3"><h2 className="font-semibold text-[#17343b]">Cadastrar várias quadras</h2><button type="button" title="Fechar" onClick={() => setBulkVisible(false)}><X size={18} /></button></div><label className="text-sm">Projeto<select required value={bulkForm.projectId} onChange={(event) => setBulkForm((current) => ({ ...current, projectId: event.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900"><option value="">Selecione</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-sm">Quantidade<input required type="number" min="1" max="500" value={bulkForm.quantity} onChange={(event) => setBulkForm((current) => ({ ...current, quantity: event.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label><label className="text-sm">Começar pela identificação<input required type="number" min="0" value={bulkForm.startNumber} onChange={(event) => setBulkForm((current) => ({ ...current, startNumber: event.target.value }))} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label><p className="text-xs text-slate-500 md:col-span-3">Serão criadas identificações sequenciais, sem limitar o cadastro de lotes.</p><div className="flex gap-3 md:col-span-3"><button type="submit" className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Cadastrar quadras</button><button type="button" onClick={() => setBulkVisible(false)} className="rounded-lg border px-4 py-2">Cancelar</button></div></form>}
    {visible && <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft md:grid-cols-2"><label className="text-sm">Projeto<select required name="projectId" value={form.projectId} onChange={change} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900"><option value="">Selecione</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-sm">Identificação da quadra<input required name="number" value={form.number} onChange={change} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label><label className="text-sm md:col-span-2">Observações<textarea name="description" value={form.description} onChange={change} rows={2} className="mt-1 w-full rounded-md border px-3 py-2 text-slate-900" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" checked={form.active} onChange={change} /> Ativa</label><div className="flex gap-3 md:col-span-2"><button type="submit" className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Salvar</button><button type="button" onClick={() => setVisible(false)} className="rounded-lg border px-4 py-2">Cancelar</button></div></form>}
    {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"><table className="w-full min-w-[650px] text-left text-sm text-slate-700"><thead><tr className="border-b border-slate-200 bg-slate-50"><th className="px-4 py-3">Quadra</th><th className="px-4 py-3">Projeto</th><th className="px-4 py-3">Lotes cadastrados</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Ações</th></tr></thead><tbody>{blocks.map((block) => <tr key={block.id} className="border-b border-slate-100"><td className="px-4 py-4 font-medium text-slate-900">{block.number}</td><td className="px-4 py-4">{block.project.name}</td><td className="px-4 py-4">{block._count.lots}</td><td className="px-4 py-4">{block.active ? 'Ativa' : 'Inativa'}</td><td className="flex gap-2 px-4 py-4"><button title="Editar" onClick={() => openEdit(block)} className="rounded-lg border p-2 text-[#1c3b45]"><Edit3 size={16} /></button><button title="Excluir" onClick={() => void remove(block)} className="rounded-lg border border-red-300 p-2 text-red-600"><Trash2 size={16} /></button></td></tr>)}</tbody></table>{!blocks.length && <p className="pt-5 text-slate-500">Nenhuma quadra cadastrada.</p>}</section>
  </div>;
}
