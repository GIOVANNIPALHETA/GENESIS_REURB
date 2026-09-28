import { useState } from 'react';
import axios from 'axios';
import { X, Building2, User, AlertCircle, AlertTriangle } from 'lucide-react';
import { formatCpf, formatPhone, formatCnpj, isValidCpf, isValidCnpj } from '../utils/cpf';

export type Spouse = {
  fullName: string;
  cpf: string;
  rg: string;
  rgIssuer: string;
  profession: string;
  phone: string;
};

export type QuickPerson = {
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

type Form = {
  personType: 'FISICA' | 'JURIDICA';
  fullName: string;
  cpf: string;
  cnpj: string;
  companyName: string;
  representativeName: string;
  representativeCpf: string;
  representativePhone: string;
  rg: string;
  rgIssuer: string;
  profession: string;
  maritalStatus: string;
  phone: string;
  email: string;
  spouse: Spouse;
};

const empty: Form = {
  personType: 'FISICA',
  fullName: '',
  cpf: '',
  cnpj: '',
  companyName: '',
  representativeName: '',
  representativeCpf: '',
  representativePhone: '',
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

const input = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0f5964] focus:outline-none focus:ring-1 focus:ring-[#0f5964] transition bg-white';
const marital: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  SEPARADO: 'Separado(a)',
  UNIAO_ESTAVEL: 'União estável',
};

export function QuickPersonModal({ onClose, onCreated }: { onClose: () => void; onCreated: (person: QuickPerson) => void }) {
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSpouseWarning, setShowSpouseWarning] = useState(false);

  function update(name: keyof Form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function updateSpouse(name: keyof Spouse, value: string) {
    setForm((current) => ({ ...current, spouse: { ...current.spouse, [name]: value } }));
  }

  const isCpfValid = !form.cpf || isValidCpf(form.cpf);
  const isCnpjValid = !form.cnpj || isValidCnpj(form.cnpj);
  const isRepCpfValid = !form.representativeCpf || isValidCpf(form.representativeCpf);
  const isSpouseCpfValid = !form.spouse.cpf || isValidCpf(form.spouse.cpf);

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // Validações básicas
    if (form.personType === 'FISICA') {
      if (!form.fullName.trim()) {
        setError('Informe o nome completo da pessoa física.');
        return;
      }
      if (form.cpf && !isCpfValid) {
        setError('CPF do titular inválido. Verifique os dígitos informados.');
        return;
      }
      if (form.spouse.cpf && !isSpouseCpfValid) {
        setError('CPF do cônjuge inválido. Verifique os dígitos informados.');
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
        setError('Informe ao menos a Razão Social da empresa.');
        return;
      }
      if (form.cnpj && !isCnpjValid) {
        setError('CNPJ da empresa inválido. Verifique os dígitos informados.');
        return;
      }
      if (form.representativeCpf && !isRepCpfValid) {
        setError('CPF do representante legal inválido.');
        return;
      }
    }

    await executeSave();
  }

  async function executeSave() {
    setSaving(true);
    setError(null);
    try {
      let payload: any;
      if (form.personType === 'JURIDICA') {
        const compName = form.companyName.trim() || form.fullName.trim();
        const fanName = form.fullName.trim() || compName;
        payload = {
          personType: 'JURIDICA',
          fullName: fanName, // Nome Fantasia (se preenchido) ou Razão Social
          companyName: compName, // Razão Social
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

      const response = await axios.post('/api/people', payload);
      onCreated(response.data.data);
    } catch (requestError: unknown) {
      const msg = axios.isAxiosError(requestError)
        ? requestError.response?.data?.message || 'Não foi possível cadastrar a pessoa.'
        : 'Não foi possível cadastrar a pessoa.';
      setError(msg);
    } finally {
      setSaving(false);
      setShowSpouseWarning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <form onSubmit={handleFormSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl space-y-5">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-xl font-bold text-[#17343b]">Cadastrar pessoa</h2>
            <p className="mt-0.5 text-xs text-slate-500">Depois de salvar, ela será selecionada automaticamente no lote.</p>
          </div>
          <button
            type="button"
            title="Fechar"
            onClick={onClose}
            className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={20} />
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

        {/* CAMPOS DE PESSOA FÍSICA */}
        {form.personType === 'FISICA' && (
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">
              Nome completo *
              <input
                required
                value={form.fullName}
                onChange={(event) => update('fullName', event.target.value)}
                placeholder="Ex: Maria dos Santos"
                className={input}
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              CPF
              <input
                value={form.cpf}
                maxLength={14}
                onChange={(event) => update('cpf', formatCpf(event.target.value))}
                placeholder="000.000.000-00"
                className={`${input} font-mono ${!isCpfValid ? 'border-red-400 bg-red-50/50' : ''}`}
              />
              {!isCpfValid && (
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
                placeholder="Ex: SSP/MT"
                className={input}
              />
            </label>

            <label className="text-sm font-semibold text-slate-700">
              Profissão
              <input
                value={form.profession}
                onChange={(event) => update('profession', event.target.value)}
                placeholder="Ex: Agricultor, Comerciante"
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
                {Object.entries(marital).map(([value, label]) => (
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

        {/* DADOS DA ESPOSA / CÔNJUGE (QUANDO CASADO OU UNIÃO ESTÁVEL) */}
        {form.personType === 'FISICA' && (form.maritalStatus === 'CASADO' || form.maritalStatus === 'UNIAO_ESTAVEL') && (
          <div className="rounded-2xl border border-teal-200 bg-[#f8fffe] p-4.5 space-y-3 transition">
            <div className="flex items-center justify-between border-b border-teal-100 pb-2">
              <h3 className="font-bold text-[#0f5964]">Dados do Cônjuge / Esposo(a)</h3>
              <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5">
                Opcional
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Nome completo do cônjuge
                <input
                  value={form.spouse.fullName}
                  onChange={(event) => updateSpouse('fullName', event.target.value)}
                  placeholder="Nome do cônjuge (opcional)"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                CPF do cônjuge
                <input
                  value={form.spouse.cpf}
                  maxLength={14}
                  onChange={(event) => updateSpouse('cpf', formatCpf(event.target.value))}
                  placeholder="000.000.000-00"
                  className={`${input} font-mono ${!isSpouseCpfValid ? 'border-red-400 bg-red-50/50' : ''}`}
                />
                {!isSpouseCpfValid && (
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
                  placeholder="RG do cônjuge"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Órgão expedidor
                <input
                  value={form.spouse.rgIssuer}
                  onChange={(event) => updateSpouse('rgIssuer', event.target.value)}
                  placeholder="Ex: SSP/MT"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700">
                Profissão
                <input
                  value={form.spouse.profession}
                  onChange={(event) => updateSpouse('profession', event.target.value)}
                  placeholder="Profissão do cônjuge"
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
          </div>
        )}

        {/* CAMPOS DE PESSOA JURÍDICA */}
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
                  placeholder="Razão Social da empresa"
                  className={input}
                />
              </label>

              <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                Nome Fantasia
                <input
                  value={form.fullName}
                  onChange={(event) => update('fullName', event.target.value)}
                  placeholder="Nome fantasia (opcional)"
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
                  placeholder="contato@empresa.com.br"
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

        {/* Mensagem de Erro */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Botões de Ação */}
        <div className="flex justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
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
                  Esse cadastro está com o estado civil de <strong>{marital[form.maritalStatus] || 'Casado(a)'}</strong>. Deseja salvar os dados em branco do cônjuge?
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
  );
}
