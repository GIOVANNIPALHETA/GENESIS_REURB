import { useEffect, useState } from 'react';
import axios from 'axios';
import { Download, FilePlus } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { formatCpf } from '../utils/cpf';

type Project = { id: string; name: string };
type Lot = { id: string; number: string; projectId: string; block: { number: string }; project: { name: string } };
type Person = { id: string; fullName: string; cpf?: string | null };
type Contract = { id: string; contractNumber: string; status: string; totalValue: number; signed: boolean; person: { fullName: string; cpf?: string | null; phone?: string | null; maritalStatus?: string | null }; lot: { number: string; address?: string | null; block: { number: string } }; project: { name: string; neighborhood: string; city: string; state: string }; negotiations: Array<{ downPayment: number; installmentCount: number; installments: Array<{ amount: number; dueDate: string; status: string }> }> };

const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ contractNumber: '', projectId: '', lotId: '', personId: '', totalValue: '3500', downPayment: '500', installmentCount: '10', firstDueDate: '', notes: '' });

  async function loadContracts() {
    setLoading(true);
    try { const response = await axios.get('/api/contracts'); const loadedContracts = (response.data.data || []).map((contract: Contract) => ({ ...contract, person: { ...contract.person, cpf: formatCpf(contract.person.cpf) } })); setContracts(loadedContracts); setError(null); }
    catch { setError('Não foi possível carregar os contratos.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([axios.get('/api/projects'), axios.get('/api/lots'), axios.get('/api/people')])
      .then(([projectResponse, lotResponse, peopleResponse]) => {
        setProjects(projectResponse.data.data || []);
        setLots(lotResponse.data.data || []);
        setPeople(peopleResponse.data.data || []);
      })
      .catch(() => setError('Não foi possível carregar os dados do formulário.'));
    loadContracts();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      await axios.post('/api/contracts', { ...form, totalValue: Number(form.totalValue), downPayment: Number(form.downPayment), installmentCount: Number(form.installmentCount), firstDueDate: form.firstDueDate ? new Date(`${form.firstDueDate}T12:00:00`).toISOString() : undefined });
      setOpen(false); setForm({ ...form, contractNumber: '', projectId: '', lotId: '', personId: '', notes: '' }); await loadContracts();
    } catch (requestError: any) { setError(requestError?.response?.data?.message || 'Não foi possível cadastrar o contrato.'); }
  }

  async function changeStatus(id: string, status: string) {
    try { await axios.patch(`/api/contracts/${id}/status`, { status }); await loadContracts(); }
    catch { setError('Não foi possível atualizar o contrato.'); }
  }

  function printContract(contract: Contract) {
    const negotiation = contract.negotiations[0];
    const installments = negotiation?.installments || [];
    const popup = window.open('', '_blank', 'width=900,height=900');
    if (!popup) return setError('Permita pop-ups para imprimir o termo.');
    const installmentRows = installments.map((installment, index) => `<tr><td>${index + 1}</td><td>${new Date(installment.dueDate).toLocaleDateString('pt-BR')}</td><td>${currency(installment.amount)}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Termo ${contract.contractNumber}</title><style>body{font-family:Georgia,serif;color:#111;max-width:800px;margin:40px auto;line-height:1.5}h1{text-align:center;font-size:18px}h2{font-size:14px;margin-top:22px}p{text-align:justify}.header{text-align:center;margin-bottom:28px}.meta{border:1px solid #999;padding:12px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:70px;text-align:center}.signature{border-top:1px solid #111;padding-top:8px}.payments{width:100%;border-collapse:collapse}.payments th,.payments td{border:1px solid #999;padding:6px;text-align:left}@media print{body{margin:20mm auto}}</style></head><body><div class="header"><strong>GÊNESIS ENGENHARIA E CONSULTORIA LTDA.</strong><br>CNPJ 04.398.199/0001-09</div><h1>TERMO DE ADESÃO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS TÉCNICOS DE REGULARIZAÇÃO FUNDIÁRIA URBANA - REURB</h1><p>Pelo presente instrumento, a GÊNESIS ENGENHARIA E CONSULTORIA LTDA., doravante CONTRATADA, e o(a) beneficiário(a) abaixo identificado(a), resolvem firmar o presente TERMO DE ADESÃO.</p><div class="meta"><strong>TERMO:</strong> ${contract.contractNumber}<br><strong>BENEFICIÁRIO:</strong> ${contract.person.fullName}<br><strong>CPF:</strong> ${contract.person.cpf || 'Não informado'}<br><strong>TELEFONE:</strong> ${contract.person.phone || 'Não informado'}<br><strong>PROJETO:</strong> ${contract.project.name}<br><strong>IMÓVEL:</strong> ${contract.project.neighborhood}, Quadra ${contract.lot.block.number}, Lote ${contract.lot.number}${contract.lot.address ? `, ${contract.lot.address}` : ''}</div><h2>CLÁUSULA PRIMEIRA - DO OBJETO</h2><p>O presente Termo de Adesão tem por objeto a inclusão do(a) BENEFICIÁRIO(A) no Projeto de Regularização Fundiária Urbana - REURB, nos termos da Lei Federal nº 13.465/2017 e demais normas aplicáveis.</p><h2>CLÁUSULA SEGUNDA - DOS SERVIÇOS</h2><p>A CONTRATADA executará os serviços técnicos necessários à Regularização Fundiária Urbana - REURB, compreendendo levantamento topográfico georreferenciado, cadastro socioeconômico, planta individual do lote, memorial descritivo, projeto técnico e acompanhamento perante os órgãos competentes.</p><h2>CLÁUSULA TERCEIRA - DOS VALORES E PAGAMENTO</h2><p>O valor total dos serviços é de <strong>${currency(contract.totalValue)}</strong>, sendo a entrada de <strong>${currency(negotiation?.downPayment || 0)}</strong> e o saldo dividido em ${negotiation?.installmentCount || 0} parcelas.</p><table class="payments"><thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>${installmentRows}</tbody></table><h2>CLÁUSULA QUARTA - DA TITULAÇÃO</h2><p>O(A) BENEFICIÁRIO(A) declara estar ciente de que a aprovação da REURB e o registro imobiliário dependem da análise dos órgãos públicos competentes, sendo a obrigação da CONTRATADA de meio, e não de resultado.</p><p>Aripuanã-MT, ____ de ____________________ de ______.</p><div class="signatures"><div class="signature">GÊNESIS ENGENHARIA E CONSULTORIA LTDA.<br>CONTRATADA</div><div class="signature">${contract.person.fullName}<br>CONTRATANTE/BENEFICIÁRIO(A)</div></div><script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  }

  async function downloadContract(contract: Contract) {
    try {
      const response = await axios.get(`/api/contracts/${contract.id}/document`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `contrato-${contract.contractNumber}.docx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch { setError('Não foi possível gerar o contrato original preenchido.'); }
  }

  const availableLots = lots.filter((lot) => !form.projectId || lot.projectId === form.projectId);

  return <div className="space-y-6">
    <PageHeader title="Contratos" subtitle="Termos de adesão, assinatura e condições de pagamento dos beneficiários." />
    <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <span className="text-sm text-slate-600">{contracts.length} contrato(s) cadastrado(s)</span>
      <button onClick={() => setOpen((value) => !value)} className="flex items-center gap-2 rounded-lg bg-[#1c3b45] px-4 py-2 text-white"><FilePlus size={18} /> Novo termo</button>
    </div>
    {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {open && <form onSubmit={submit} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft md:grid-cols-3">
      <label className="text-sm text-slate-700">Número do termo<input required value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} placeholder="TA-0002" className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <label className="text-sm text-slate-700">Beneficiário<select required value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
      <label className="text-sm text-slate-700">Projeto<select required value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, lotId: '' })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="text-sm text-slate-700">Lote<select required value={form.lotId} onChange={(e) => setForm({ ...form, lotId: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900"><option value="">Selecione</option>{availableLots.map((lot) => <option key={lot.id} value={lot.id}>Quadra {lot.block.number}, lote {lot.number}</option>)}</select></label>
      <label className="text-sm text-slate-700">Valor total<input required type="number" min="0" step="0.01" value={form.totalValue} onChange={(e) => setForm({ ...form, totalValue: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <label className="text-sm text-slate-700">Entrada<input required type="number" min="0" step="0.01" value={form.downPayment} onChange={(e) => setForm({ ...form, downPayment: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <label className="text-sm text-slate-700">Parcelas<input required type="number" min="1" max="120" value={form.installmentCount} onChange={(e) => setForm({ ...form, installmentCount: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <label className="text-sm text-slate-700">Primeiro vencimento<input type="date" value={form.firstDueDate} onChange={(e) => setForm({ ...form, firstDueDate: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <label className="text-sm text-slate-700 md:col-span-2">Observações<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 w-full rounded-lg border px-3 py-2 text-slate-900" /></label>
      <div className="flex gap-3 md:col-span-3"><button type="submit" className="rounded-lg bg-[#1c3b45] px-4 py-2 text-white">Cadastrar termo</button><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-slate-700">Cancelar</button></div>
    </form>}
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">{loading ? <p className="text-slate-500">Carregando contratos...</p> : contracts.length === 0 ? <p className="text-slate-500">Nenhum contrato cadastrado.</p> : <table className="w-full min-w-[980px] text-left text-sm text-slate-700"><thead><tr className="border-b bg-slate-50"><th className="px-4 py-3">Termo</th><th className="px-4 py-3">Beneficiário</th><th className="px-4 py-3">Imóvel</th><th className="px-4 py-3">Valor</th><th className="px-4 py-3">Parcelamento</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Documento</th></tr></thead><tbody>{contracts.map((contract) => { const negotiation = contract.negotiations[0]; return <tr key={contract.id} className="border-b border-slate-100"><td className="px-4 py-4 font-medium text-slate-900">{contract.contractNumber}</td><td className="px-4 py-4">{contract.person.fullName}</td><td className="px-4 py-4">Q{contract.lot.block.number} / Lote {contract.lot.number}</td><td className="px-4 py-4">{currency(contract.totalValue)}</td><td className="px-4 py-4">Entrada {currency(negotiation?.downPayment || 0)}<br />{negotiation?.installmentCount || 0} parcelas</td><td className="px-4 py-4"><select value={contract.status} onChange={(e) => changeStatus(contract.id, e.target.value)} className="rounded-full border-0 bg-slate-100 px-3 py-1 text-xs font-semibold"><option value="PENDING">Pendente</option><option value="ACTIVE">Ativo</option><option value="SIGNED">Assinado</option><option value="CANCELED">Cancelado</option></select></td><td className="px-4 py-4"><button title="Baixar contrato original preenchido" onClick={() => downloadContract(contract)} className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50"><Download size={18} /></button></td></tr>; })}</tbody></table>}</div>
  </div>;
}