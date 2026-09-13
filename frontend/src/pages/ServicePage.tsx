import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Plus } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';

type Person = { id: string; fullName: string; cpf?: string | null };
type Project = { id: string; name: string };
type Lot = { id: string; projectId: string; number: string; block: { number: string }; project: { name: string } };
type Service = { id: string; serviceDate: string; description: string; pendingActions?: string | null; nextContactDate?: string | null; person: { fullName: string }; project: { name: string }; lot: { number: string; block: { number: string } }; user: { name: string } };

export function ServicePage() {
  const [services, setServices] = useState<Service[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ personId: '', projectId: '', lotId: '', serviceDate: new Date().toISOString().slice(0, 10), description: '', pendingActions: '', nextContactDate: '' });

  async function loadServices() {
    setLoading(true);
    try { const response = await axios.get('/api/service'); setServices(response.data.data || []); setError(null); }
    catch { setError('Não foi possível carregar os atendimentos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([axios.get('/api/people'), axios.get('/api/projects'), axios.get('/api/lots')])
      .then(([peopleResponse, projectResponse, lotResponse]) => { setPeople(peopleResponse.data.data || []); setProjects(projectResponse.data.data || []); setLots(lotResponse.data.data || []); })
      .catch(() => setError('Não foi possível carregar os dados do formulário.'));
    loadServices();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try { await axios.post('/api/service', { ...form, serviceDate: new Date(`${form.serviceDate}T12:00:00`).toISOString(), nextContactDate: form.nextContactDate ? new Date(`${form.nextContactDate}T12:00:00`).toISOString() : undefined }); setOpen(false); setForm({ ...form, personId: '', projectId: '', lotId: '', description: '', pendingActions: '', nextContactDate: '' }); await loadServices(); }
    catch (requestError: any) { setError(requestError?.response?.data?.message || 'Não foi possível registrar o atendimento.'); }
  }

  const availableLots = lots.filter((lot) => !form.projectId || lot.projectId === form.projectId);

  return <div className="space-y-6">
    <PageHeader title="Atendimentos" subtitle="Registre orientações, pendências e próximos contatos das famílias." />
    <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-soft"><div className="flex items-center gap-3"><Activity className="text-[#2a8a7f]" size={22} /><span className="text-sm text-slate-600">Histórico de atendimentos</span></div><button onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-lg bg-[#1c3b45] px-4 py-2 text-white"><Plus size={18} /> Novo atendimento</button></div>
    {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {open && <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft md:grid-cols-3"><label className="text-sm text-slate-700">Pessoa<select required value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label><label className="text-sm text-slate-700">Projeto<select required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, lotId: '' })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="text-sm text-slate-700">Lote<select required value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{availableLots.map((lot) => <option key={lot.id} value={lot.id}>Quadra {lot.block.number}, lote {lot.number}</option>)}</select></label><label className="text-sm text-slate-700">Data<input required type="date" value={form.serviceDate} onChange={(e) => setForm({ ...form, serviceDate: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label><label className="text-sm text-slate-700">Próximo contato<input type="date" value={form.nextContactDate} onChange={(e) => setForm({ ...form, nextContactDate: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label><label className="text-sm text-slate-700 md:col-span-3">Descrição<textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label><label className="text-sm text-slate-700 md:col-span-3">Pendências / ações<textarea rows={2} value={form.pendingActions} onChange={(e) => setForm({ ...form, pendingActions: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label><div className="flex gap-3 md:col-span-3"><button type="submit" className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Registrar atendimento</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-slate-700">Cancelar</button></div></form>}
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">{loading ? <p className="text-slate-500">Carregando atendimentos...</p> : services.length === 0 ? <p className="text-slate-500">Nenhum atendimento registrado.</p> : <table className="w-full min-w-[950px] text-left text-sm text-slate-700"><thead><tr className="border-b bg-slate-50"><th className="px-4 py-3">Data</th><th className="px-4 py-3">Pessoa</th><th className="px-4 py-3">Imóvel</th><th className="px-4 py-3">Atendimento</th><th className="px-4 py-3">Pendências</th><th className="px-4 py-3">Próximo contato</th><th className="px-4 py-3">Responsável</th></tr></thead><tbody>{services.map((service) => <tr key={service.id} className="border-b border-slate-100 align-top"><td className="px-4 py-4">{new Date(service.serviceDate).toLocaleDateString('pt-BR')}</td><td className="px-4 py-4 font-medium text-slate-900">{service.person.fullName}</td><td className="px-4 py-4">Q{service.lot.block.number} / Lote {service.lot.number}</td><td className="max-w-xs px-4 py-4">{service.description}</td><td className="max-w-xs px-4 py-4 text-slate-600">{service.pendingActions || 'Nenhuma'}</td><td className="px-4 py-4">{service.nextContactDate ? new Date(service.nextContactDate).toLocaleDateString('pt-BR') : '—'}</td><td className="px-4 py-4">{service.user.name}</td></tr>)}</tbody></table>}</div>
  </div>;
}