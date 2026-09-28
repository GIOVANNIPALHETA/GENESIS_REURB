import { useEffect, useState } from 'react';
import axios from 'axios';
import { Edit3, Plus, Search, Trash2, UserRound, Building2, X, AlertCircle, AlertTriangle, User } from 'lucide-react';
import { formatCpf, formatPhone, formatCnpj, isValidCpf, isValidCnpj } from '../utils/cpf';

type Spouse = {
  id?: string;
  fullName: string;
  cpf?: string;
  rg?: string;
  rgIssuer?: string;
  profession?: string;
  phone?: string;
};

type Person = {
  id: string;
  fullName: string;
  personType?: 'FISICA' | 'JURIDICA';
  cpf?: string;
  cnpj?: string;
  companyName?: string;
  representativeName?: string;
  representativeCpf?: string;
  rg?: string;
  rgIssuer?: string;
  profession?: string;
  maritalStatus?: string;
  phone?: string;
  email?: string;
  spouse?: Spouse | null;
};

type PersonForm = {
  personType: 'FISICA' | 'JURIDICA';
  fullName: string;
  cpf: string;
  cnpj: string;
  companyName: string;
  representativeName: string;
  representativeCpf: string;
  rg: string;
  rgIssuer: string;
  profession: string;
  maritalStatus: string;
  phone: string;
  email: string;
  spouse: Spouse;
};

const emptyForm: PersonForm = {
  personType: 'FISICA',
  fullName: '',
  cpf: '',
  cnpj: '',
  companyName: '',
  representativeName: '',
  representativeCpf: '',
  rg: '',
  rgIssuer: '',
  profession: '',
  maritalStatus: '',
  phone: '',
  email: '',
  spouse: {
    fullName: '',
    cpf: '',
    rg: '',
    rgIssuer: '',
    profession: '',
    phone: '',
  },
};

const maritalLabels: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  SEPARADO: 'Separado(a)',
  UNIAO_ESTAVEL: 'União estável',
};

const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none focus:ring-1 focus:ring-[#0f5964] transition bg-white';

export function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<PersonForm>(emptyForm);
  const [editing, setEditing] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSpouseWarning, setShowSpouseWarning] = useState(false);

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
    setShowSpouseWarning(false);
    setOpen(true);
  }

  function openEdit(person: Person) {
    setEditing(person);
    const isPj = person.personType === 'JURIDICA' || Boolean(person.cnpj);
    setForm({
      personType: isPj ? 'JURIDICA' : 'FISICA',
      fullName: person.fullName || '',
      cpf: formatCpf(person.cpf || ''),
      cnpj: formatCnpj(person.cnpj || ''),
      companyName: person.companyName || '',
      representativeName: person.representativeName || '',
      representativeCpf: formatCpf(person.representativeCpf || ''),
      rg: person.rg || '',
      rgIssuer: person.rgIssuer || '',
      profession: person.profession || '',
      maritalStatus: person.maritalStatus || '',
      phone: formatPhone(person.phone || ''),
      email: person.email || '',
      spouse: {
        fullName: person.spouse?.fullName || '',
        cpf: formatCpf(person.spouse?.cpf || ''),
        rg: person.spouse?.rg || '',
        rgIssuer: person.spouse?.rgIssuer || '',
        profession: person.spouse?.profession || '',
        phone: formatPhone(person.spouse?.phone || ''),
      },
    });
    setShowSpouseWarning(false);
    setOpen(true);
  }

  function update(name: keyof PersonForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateSpouse(name: keyof Spouse, value: string) {
    setForm((current) => ({
      ...current,
      spouse: { ...current.spouse, [name]: value },
    }));
  }

  const isTitularCpfValid = !form.cpf || isValidCpf(form.cpf);
  const isCnpjValid = !form.cnpj || isValidCnpj(form.cnpj);
  const isRepCpfValid = !form.representativeCpf || isValidCpf(form.representativeCpf);
  const isSpouseCpfValid = !form.spouse.cpf || isValidCpf(form.spouse.cpf);

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (form.personType === 'FISICA') {
      if (!form.fullName.trim()) {
        alert('⚠️ Informe o nome completo da pessoa física.');
        return;
      }
      if (form.cpf && !isTitularCpfValid) {
        alert('⚠️ O CPF do titular informado é inválido. Verifique os dígitos e tente novamente.');
        return;
      }
      if (form.spouse.cpf && !isSpouseCpfValid) {
        alert('⚠️ O CPF do cônjuge informado é inválido. Verifique os dígitos e tente novamente.');
        return;
      }

      // Verificação de cônjuge em branco para Casado / União Estável
      const isMarried = form.maritalStatus === 'CASADO' || form.maritalStatus === 'UNIAO_ESTAVEL';
      const hasSpouseName = Boolean(form.spouse.fullName.trim());
      if (isMarried && !hasSpouseName) {
        setShowSpouseWarning(true);
        return;
      }
    } else {
      if (!form.companyName.trim() && !form.fullName.trim()) {
        alert('⚠️ Informe a Razão Social da empresa.');
        return;
      }
      if (form.cnpj && !isCnpjValid) {
        alert('⚠️ O CNPJ da empresa informado é inválido. Verifique os dígitos e tente novamente.');
        return;
      }
      if (form.representativeCpf && !isRepCpfValid) {
        alert('⚠️ O CPF do representante legal informado é inválido.');
        return;
      }
    }

    await executeSave();
  }

  async function executeSave() {
    setSaving(true);
    try {
      let payload: any;
      if (form.personType === 'JURIDICA') {
        const compName = form.companyName.trim() || form.fullName.trim();
        const fanName = form.fullName.trim() || compName;
        payload = {
          personType: 'JURIDICA',
          fullName: fanName,
          companyName: compName,
          cnpj: form.cnpj.trim() || undefined,
          representativeName: form.representativeName.trim() || undefined,
          representativeCpf: form.representativeCpf.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          spouse: undefined,
        };
      } else {
        const hasSpouse = Boolean(form.spouse.fullName.trim());
        payload = {
          personType: 'FISICA',
          fullName: form.fullName.trim(),
          cpf: form.cpf.trim() || undefined,
          rg: form.rg.trim() || undefined,
          rgIssuer: form.rgIssuer.trim() || undefined,
          profession: form.profession.trim() || undefined,
          maritalStatus: form.maritalStatus || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          spouse: hasSpouse ? form.spouse : undefined,
        };
      }

      if (editing) {
        await axios.put(`/api/people/${editing.id}`, payload);
      } else {
        await axios.post('/api/people', payload);
      }

      setOpen(false);
      setShowSpouseWarning(false);
      await load();
    } catch (requestError: unknown) {
      const msg = axios.isAxiosError(requestError)
        ? requestError.response?.data?.message || 'Não foi possível salvar a pessoa.'
        : 'Não foi possível salvar a pessoa.';
      alert(`⚠️ ${msg}`);
      setError(msg);
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#0f8b8d]">Cadastros</p>
          <h1 className="text-2xl font-bold text-[#1c3b45]">Pessoas</h1>
          <p className="mt-1 text-sm text-slate-500">
            Cadastre beneficiários e pessoas jurídicas para utilizar nos lotes, contratos e relatórios.
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
            Buscar pessoa ou empresa
          </label>
          <div className="relative flex items-center">
            <Search size={18} className="absolute left-3.5 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nome, Razão Social, CPF, CNPJ ou RG"
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
                <th className="px-4 py-3">Pessoa / Empresa</th>
                <th className="px-4 py-3">Documento (CPF / CNPJ)</th>
                <th className="px-4 py-3">Tipo / Profissão</th>
                <th className="px-4 py-3">Estado civil</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const isPj = person.personType === 'JURIDICA' || Boolean(person.cnpj);
                return (
                  <tr key={person.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full p-2 ${isPj ? 'bg-indigo-50 text-indigo-700' : 'bg-[#e5f4f2] text-[#0f8b8d]'}`}>
                          {isPj ? <Building2 size={16} /> : <UserRound size={16} />}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">
                              {person.companyName || person.fullName}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isPj ? 'bg-indigo-100 text-indigo-800' : 'bg-teal-100 text-teal-800'}`}>
                              {isPj ? 'PJ' : 'PF'}
                            </span>
                          </div>
                          {isPj && person.fullName && person.companyName && person.fullName !== person.companyName && (
                            <span className="text-xs text-slate-500 block">Fantasia: {person.fullName}</span>
                          )}
                          {isPj && person.representativeName && (
                            <span className="text-xs text-slate-500 block">
                              Repr.: {person.representativeName} {person.representativeCpf ? `(${formatCpf(person.representativeCpf)})` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {isPj ? (
                        <div>
                          <span className="font-mono font-medium text-slate-900">{formatCnpj(person.cnpj) || 'Sem CNPJ'}</span>
                        </div>
                      ) : (
                        <div>
                          <span className="font-mono font-medium text-slate-900">{formatCpf(person.cpf) || 'Sem CPF'}</span>
                          <br />
                          <span className="text-xs text-slate-500">
                            RG {person.rg || 'não informado'}
                            {person.rgIssuer ? ` · ${person.rgIssuer}` : ''}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isPj ? (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-1 rounded-lg">Pessoa Jurídica</span>
                      ) : (
                        person.profession || 'Não informada'
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {isPj ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <>
                          {maritalLabels[person.maritalStatus || ''] || 'Não informado'}
                          {person.spouse && (
                            <>
                              <br />
                              <span className="text-xs text-slate-500">
                                Cônjuge: {person.spouse.fullName} {person.spouse.cpf && `(${formatCpf(person.spouse.cpf)})`}
                              </span>
                            </>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {person.phone ? (
                        <span className="font-mono text-xs text-slate-800 block">{formatPhone(person.phone)}</span>
                      ) : null}
                      {person.email ? (
                        <span className="text-xs text-slate-500 block">{person.email}</span>
                      ) : null}
                      {!person.phone && !person.email && <span className="text-slate-400 text-xs">Não informado</span>}
                    </td>
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
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && !people.length && <p className="pt-5 text-slate-500 text-center">Nenhuma pessoa encontrada.</p>}
      </section>

      {/* MODAL DE CRIAÇÃO / EDIÇÃO */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <form
            onSubmit={handleFormSubmit}
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-bold text-[#17343b]">{editing ? 'Editar cadastro' : 'Novo cadastro'}</h2>
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

            {/* Alternador Pessoa Física / Pessoa Jurídica */}
            <div className="flex rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setForm((c) => ({ ...c, personType: 'FISICA' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-xl transition ${
                  form.personType === 'FISICA'
                    ? 'bg-white text-[#0f5964] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User size={16} />
                Pessoa Física (PF)
              </button>
              <button
                type="button"
                onClick={() => setForm((c) => ({ ...c, personType: 'JURIDICA' }))}
                className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold rounded-xl transition ${
                  form.personType === 'JURIDICA'
                    ? 'bg-white text-[#0f5964] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 size={16} />
                Pessoa Jurídica (PJ)
              </button>
            </div>

            {/* CAMPOS PESSOA FÍSICA */}
            {form.personType === 'FISICA' && (
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Nome completo *
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
                    onChange={(event) => update('cpf', formatCpf(event.target.value))}
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

                {/* TELEFONE COM MÁSCARA (00) 9 9999-9999 */}
                <label className="text-sm font-semibold text-slate-700">
                  Telefone
                  <input
                    value={form.phone}
                    maxLength={17}
                    onChange={(event) => update('phone', formatPhone(event.target.value))}
                    placeholder="(00) 9 9999-9999"
                    className={`${input} font-mono`}
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
            )}

            {/* SEÇÃO DO CÔNJUGE (QUANDO CASADO OU UNIÃO ESTÁVEL) */}
            {form.personType === 'FISICA' && (form.maritalStatus === 'CASADO' || form.maritalStatus === 'UNIAO_ESTAVEL') && (
              <div className="mt-4 grid gap-4 rounded-2xl border border-teal-200 bg-[#f8fffe] p-5 md:grid-cols-3 transition">
                <div className="flex items-center justify-between border-b border-teal-100 pb-2 md:col-span-3">
                  <h3 className="font-bold text-[#0f5964]">
                    Dados do Cônjuge / Esposo(a)
                  </h3>
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                    Opcional
                  </span>
                </div>

                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Nome completo do cônjuge
                  <input
                    value={form.spouse.fullName}
                    onChange={(event) => updateSpouse('fullName', event.target.value)}
                    placeholder="Nome completo do(a) cônjuge (opcional)"
                    className={input}
                  />
                </label>

                <label className="text-sm font-semibold text-slate-700">
                  CPF do cônjuge
                  <input
                    value={form.spouse.cpf || ''}
                    maxLength={14}
                    onChange={(event) => updateSpouse('cpf', formatCpf(event.target.value))}
                    placeholder="000.000.000-00 (opcional)"
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

                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  Telefone do cônjuge
                  <input
                    value={form.spouse.phone}
                    maxLength={17}
                    onChange={(event) => updateSpouse('phone', formatPhone(event.target.value))}
                    placeholder="(00) 9 9999-9999"
                    className={`${input} font-mono`}
                  />
                </label>
              </div>
            )}

            {/* CAMPOS PESSOA JURÍDICA */}
            {form.personType === 'JURIDICA' && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm font-semibold text-slate-700">
                    Número do CNPJ *
                    <input
                      required
                      value={form.cnpj}
                      maxLength={18}
                      onChange={(event) => update('cnpj', formatCnpj(event.target.value))}
                      placeholder="00.000.000/0000-00"
                      className={`${input} font-mono ${!isCnpjValid ? 'border-red-400 bg-red-50/50' : ''}`}
                    />
                    {!isCnpjValid && (
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                        <AlertCircle size={12} /> CNPJ inválido
                      </span>
                    )}
                  </label>

                  <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                    Razão Social *
                    <input
                      required
                      value={form.companyName}
                      onChange={(event) => update('companyName', event.target.value)}
                      placeholder="Razão Social completa"
                      className={input}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                    Nome Fantasia
                    <input
                      value={form.fullName}
                      onChange={(event) => update('fullName', event.target.value)}
                      placeholder="Nome Fantasia (opcional)"
                      className={input}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700">
                    Telefone da empresa
                    <input
                      value={form.phone}
                      maxLength={17}
                      onChange={(event) => update('phone', formatPhone(event.target.value))}
                      placeholder="(00) 9 9999-9999"
                      className={`${input} font-mono`}
                    />
                  </label>

                  <label className="text-sm font-semibold text-slate-700 md:col-span-3">
                    E-mail da empresa
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => update('email', event.target.value)}
                      placeholder="financeiro@empresa.com.br"
                      className={input}
                    />
                  </label>
                </div>

                {/* REPRESENTANTE LEGAL */}
                <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4.5 space-y-3">
                  <h3 className="font-bold text-[#0f5964] border-b border-sky-100 pb-2 flex items-center gap-2">
                    <User size={16} /> Representante Legal
                  </h3>

                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                      Nome do representante
                      <input
                        value={form.representativeName}
                        onChange={(event) => update('representativeName', event.target.value)}
                        placeholder="Nome completo do representante legal"
                        className={input}
                      />
                    </label>

                    <label className="text-sm font-semibold text-slate-700">
                      CPF do representante
                      <input
                        value={form.representativeCpf}
                        maxLength={14}
                        onChange={(event) => update('representativeCpf', formatCpf(event.target.value))}
                        placeholder="000.000.000-00"
                        className={`${input} font-mono ${!isRepCpfValid ? 'border-red-400 bg-red-50/50' : ''}`}
                      />
                      {!isRepCpfValid && (
                        <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <AlertCircle size={12} /> CPF do representante inválido
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#0f5964] px-5 py-2 text-sm font-semibold text-white hover:bg-[#0c4952] transition shadow-xs disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar pessoa'}
              </button>
            </div>
          </form>

          {/* MODAL DE CONFIRMAÇÃO PARA CÔNJUGE EM BRANCO */}
          {showSpouseWarning && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-amber-100 p-2.5 text-amber-600 shrink-0">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Salvar dados do cônjuge em branco?</h3>
                    <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                      Esse cadastro está com o estado civil de <strong>{maritalLabels[form.maritalStatus] || 'Casado(a)'}</strong>. Deseja salvar os dados em branco do cônjuge?
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSpouseWarning(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    Voltar e preencher
                  </button>
                  <button
                    type="button"
                    onClick={executeSave}
                    disabled={saving}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition shadow-xs"
                  >
                    {saving ? 'Salvando...' : 'Sim, salvar em branco'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
