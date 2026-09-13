import { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit3, Plus, Search, Trash2, UserRound, X, AlertCircle } from 'lucide-react';
import { formatCpf, isValidCpf } from '../utils/cpf';

type Spouse = { id?: string; fullName: string; cpf?: string; rg?: string; rgIssuer?: string; profession?: string; phone?: string };
type Person = { id: string; fullName: string; cpf?: string; rg?: string; rgIssuer?: string; profession?: string; maritalStatus?: string; phone?: string; email?: string; spouse?: Spouse | null };
type PersonForm = { fullName: string; cpf: string; rg: string; rgIssuer: string; profession: string; maritalStatus: string; phone: string; email: string; spouse: Spouse };

const emptyForm: PersonForm = { fullName: '', cpf: '', rg: '', rgIssuer: '', profession: '', maritalStatus: '', phone: '', email: '', spouse: { fullName: '', cpf: '', rg: '', rgIssuer: '', profession: '', phone: '' } };
const maritalLabels: Record<string, string> = { SOLTEIRO: 'Solteiro(a)', CASADO: 'Casado(a)', DIVORCIADO: 'Divorciado(a)', VIUVO: 'Viúvo(a)', SEPARADO: 'Separado(a)', UNIAO_ESTAVEL: 'União estável' };
const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none focus:ring-1 focus:ring-[#0f5964] transition';

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [editing, setEditing] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await axios.get('/api/people', { params: search ? { search } : undefined });
      setPeople(response.data.data || []);
      setError(null);
    } catch {
      setError('Não foi possível carregar as pessoas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [search]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(person: Person) {
    setEditing(person);
    setForm({
      fullName: person.fullName,
      cpf: formatCpf(person.cpf || ''),
      rg: person.rg || '',
      rgIssuer: person.rgIssuer || '',
      profession: person.profession || '',
      maritalStatus: person.maritalStatus || '',
      phone: person.phone || '',
      email: person.email || '',
      spouse: {
        fullName: person.spouse?.fullName || '',
        cpf: formatCpf(person.spouse?.cpf || ''),
        rg: person.spouse?.rg || '',
        rgIssuer: person.spouse?.rgIssuer || '',
        profession: person.spouse?.profession || '',
        phone: person.spouse?.phone || '',
      },
    });
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();

    // Validação de CPF do Titular (se preenchido)
    if (form.cpf && !isValidCpf(form.cpf)) {
      alert('⚠️ O CPF do titular informado é inválido. Verifique os dígitos e tente novamente.');
      return;
    }

    // Validação de CPF da Esposa (se casado e preenchido)
    if (form.maritalStatus === 'CASADO' && form.spouse.cpf && !isValidCpf(form.spouse.cpf)) {
      alert('⚠️ O CPF da esposa informado é inválido. Verifique os dígitos e tente novamente.');
      return;
    }

    try {
      const payload = form.maritalStatus === 'CASADO' ? form : { ...form, spouse: undefined };
      if (editing) await axios.put(`/api/people/${editing.id}`, payload);
      else await axios.post('/api/people', payload);
      setOpen(false);
      await load();
    } catch (requestError: unknown) {
      const msg = axios.isAxiosError(requestError)
        ? requestError.response?.data?.message || 'Não foi possível salvar a pessoa.'
        : 'Não foi possível salvar a pessoa.';
      alert(`⚠️ ${msg}`);
      setError(msg);
    }
  }

  async function remove(person: Person) {
    if (!window.confirm(`Excluir a pessoa ${person.fullName}?`)) return;
    try {
      await axios.delete(`/api/people/${person.id}`);
      await load();
    } catch (requestError: unknown) {
      setError(
        axios.isAxiosError(requestError)
          ? requestError.response?.data?.message || 'Não foi possível excluir a pessoa.'
          : 'Não foi possível excluir a pessoa.'
      );
    }
  }

  function update(name: keyof PersonForm, value: string) {
    if (name === 'cpf') {
      setForm((current) => ({ ...current, cpf: formatCpf(value) }));
    } else {
      setForm((current) => ({ ...current, [name]: value }));
    }
  }

  function updateSpouse(name: keyof Spouse, value: string) {
    if (name === 'cpf') {
      setForm((current) => ({
        ...current,
        spouse: { ...current.spouse, cpf: formatCpf(value) },
      }));
    } else {
      setForm((current) => ({
        ...current,
        spouse: { ...current.spouse, [name]: value },
      }));
    }
  }

  const isTitularCpfValid = !form.cpf || isValidCpf(form.cpf);
  const isSpouseCpfValid = !form.spouse.cpf || isValidCpf(form.spouse.cpf);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0f8b8d]">Cadastros</p>
          <h1 className="text-2xl font-bold text-[#1c3b45]">Pessoas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre beneficiários uma única vez e reutilize seus dados nos lotes, contratos e relatórios.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-[#0f5964] px-4 py-2.5 font-semibold text-white shadow-sm hover:bg-[#0c4952] transition"
        >
          <Plus size={17} /> Nova pessoa
        </button>
      </header>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="max-w-xl">
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Buscar pessoa
          </label>
          <div className="relative flex items-center">
            <Search size={18} className="absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, CPF ou RG"
              className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none focus:ring-1 focus:ring-[#0f5964] transition"
            />
          </div>
        </div>
      </section>

      {error && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      <section className="overflow-x-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        {loading ? (
          <p className="text-slate-500">Carregando pessoas...</p>
        ) : (
          <table className="w-full min-w-[850px] text-left text-sm text-slate-700">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Pessoa</th>
                <th className="px-4 py-3">CPF / RG</th>
                <th className="px-4 py-3">Profissão</th>
                <th className="px-4 py-3">Estado civil</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-[#e5f4f2] p-2 text-[#0f8b8d]">
                        <UserRound size={16} />
                      </span>
                      <span className="font-semibold text-slate-900">{person.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono font-medium text-slate-900">{formatCpf(person.cpf)}</span>
                    <br />
                    <span className="text-xs text-slate-500">
                      RG {person.rg || 'não informado'}
                      {person.rgIssuer ? ` · ${person.rgIssuer}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-4">{person.profession || 'Não informada'}</td>
                  <td className="px-4 py-4">
                    {maritalLabels[person.maritalStatus || ''] || 'Não informado'}
                    {person.spouse && (
                      <>
                        <br />
                        <span className="text-xs text-slate-500">
                          Esposa: {person.spouse.fullName} {person.spouse.cpf && `(${formatCpf(person.spouse.cpf)})`}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-4">{person.phone || person.email || 'Não informado'}</td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        title="Editar pessoa"
                        onClick={() => openEdit(person)}
                        className="rounded-xl border border-slate-300 p-2 text-slate-700 hover:bg-slate-100 transition"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        title="Excluir pessoa"
                        onClick={() => void remove(person)}
                        className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 hover:bg-red-100 transition"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && !people.length && <p className="pt-5 text-slate-500 text-center">Nenhuma pessoa encontrada.</p>}
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={save}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-bold text-[#17343b]">{editing ? 'Editar pessoa' : 'Nova pessoa'}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Os dados poderão ser utilizados automaticamente nos contratos.</p>
              </div>
              <button
                type="button"
                title="Fechar"
                onClick={() => setOpen(false)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 transition"
              >
                <X size={19} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Nome completo
                <input
                  required
                  value={form.fullName}
                  onChange={(event) => update('fullName', event.target.value)}
                  placeholder="Nome completo do titular"
                  className={input}
                />
              </label>

              {/* CPF DO TITULAR COM MÁSCARA E VALIDAÇÃO */}
              <label className="text-sm font-semibold text-slate-700">
                CPF
                <input
                  value={form.cpf}
                  maxLength={14}
                  onChange={(event) => update('cpf', event.target.value)}
                  placeholder="000.000.000-00"
                  className={`${input} font-mono ${!isTitularCpfValid ? 'border-red-400 bg-red-50/50' : ''}`}
                />
                {!isTitularCpfValid && (
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                    <AlertCircle size={12} /> CPF inválido
                  </span>
                )}
              </label>

              <label className="text-sm font-semibold text-slate-700">
                RG
                <input
                  value={form.rg}
                  onChange={(event) => update('rg', event.target.value)}
                  placeholder="Número do RG"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Órgão expedidor
                <input
                  value={form.rgIssuer}
                  onChange={(event) => update('rgIssuer', event.target.value)}
                  placeholder="Ex.: SSP/MT"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Profissão
                <input
                  value={form.profession}
                  onChange={(event) => update('profession', event.target.value)}
                  placeholder="Ex.: Autônomo, Professor..."
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Estado civil
                <select
                  value={form.maritalStatus}
                  onChange={(event) => update('maritalStatus', event.target.value)}
                  className={input}
                >
                  <option value="">Selecione</option>
                  {Object.entries(maritalLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Telefone
                <input
                  value={form.phone}
                  onChange={(event) => update('phone', event.target.value)}
                  placeholder="(00) 00000-0000"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                E-mail
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                  placeholder="email@exemplo.com"
                  className={input}
                />
              </label>
            </div>

            {/* SEÇÃO DO CÔNJUGE */}
            {(form.maritalStatus === 'CASADO' || form.maritalStatus === 'UNIAO_ESTAVEL') && (
              <div className="mt-4 grid gap-4 rounded-2xl border border-teal-200 bg-[#f8fffe] p-5 md:grid-cols-3">
                <h3 className="font-bold text-[#0f5964] md:col-span-3 border-b border-teal-100 pb-2">
                  Dados do Cônjuge / Esposo(a)
                </h3>

                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Nome completo do cônjuge
                  <input
                    required
                    value={form.spouse.fullName}
                    onChange={(event) => updateSpouse('fullName', event.target.value)}
                    placeholder="Nome completo do(a) cônjuge"
                    className={input}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>CPF do cônjuge</span>
                    <span className="text-[11px] font-normal text-slate-400">Opcional</span>
                  </div>
                  <input
                    value={form.spouse.cpf || ''}
                    maxLength={14}
                    onChange={(event) => updateSpouse('cpf', event.target.value)}
                    placeholder="000.000.000-00 (ou deixe em branco)"
                    className={`${input} font-mono ${!isSpouseCpfValid ? 'border-red-400 bg-red-50/50' : ''}`}
                  />
                  {!isSpouseCpfValid && form.spouse.cpf && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                      <AlertCircle size={12} /> CPF do cônjuge inválido
                    </span>
                  )}
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  RG
                  <input
                    value={form.spouse.rg}
                    onChange={(event) => updateSpouse('rg', event.target.value)}
                    placeholder="RG da cônjuge"
                    className={input}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Órgão expedidor
                  <input
                    value={form.spouse.rgIssuer}
                    onChange={(event) => updateSpouse('rgIssuer', event.target.value)}
                    placeholder="Ex.: SSP/MT"
                    className={input}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Profissão
                  <input
                    value={form.spouse.profession}
                    onChange={(event) => updateSpouse('profession', event.target.value)}
                    placeholder="Profissão da cônjuge"
                    className={input}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  Telefone
                  <input
                    value={form.spouse.phone}
                    onChange={(event) => updateSpouse('phone', event.target.value)}
                    placeholder="(00) 00000-0000"
                    className={input}
                  />
                </label>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#0f5964] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0c4952] transition"
              >
                Salvar pessoa
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
