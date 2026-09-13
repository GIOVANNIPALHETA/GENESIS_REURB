import { useState } from 'react';
import { Building2, Check, ChevronDown, ChevronUp, CreditCard, FileText, LockKeyhole, Save, Settings as SettingsIcon } from 'lucide-react';
import { getMenuOrder, menuItems, menuOrderStorageKey, MenuItemId } from '../config/menuItems';

type Settings = {
  companyName: string;
  companyCnpj: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  pixKey: string;
  defaultPaymentMethod: string;
  installmentInterval: string;
  lateFee: string;
  interestRate: string;
  contractNotes: string;
};

const defaultSettings: Settings = {
  companyName: 'GÊNESIS ENGENHARIA E CONSULTORIA LTDA.',
  companyCnpj: '04.398.199/0001-09',
  companyPhone: '',
  companyEmail: '',
  companyAddress: '',
  pixKey: '',
  defaultPaymentMethod: 'PIX',
  installmentInterval: '30',
  lateFee: '2',
  interestRate: '1',
  contractNotes: '',
};

const storageKey = 'genesis-reurb-settings';

function loadSettings(): Settings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(storageKey) || '{}') };
  } catch {
    return defaultSettings;
  }
}

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [menuOrder, setMenuOrder] = useState<MenuItemId[]>(getMenuOrder);
  const [saved, setSaved] = useState(false);

  function update(name: keyof Settings, value: string) {
    setSettings((current) => ({ ...current, [name]: value }));
    setSaved(false);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    localStorage.setItem(storageKey, JSON.stringify(settings));
    localStorage.setItem(menuOrderStorageKey, JSON.stringify(menuOrder));
    window.dispatchEvent(new Event('genesis-menu-order-updated'));
    setSaved(true);
  }

  function moveModule(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= menuOrder.length) return;
    setMenuOrder((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setSaved(false);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-[#0f8b8d]">Sistema</p>
        <h1 className="text-2xl font-semibold text-[#17343b]">Configurações</h1>
        <p className="mt-2 text-sm text-slate-500">Configure os dados usados nos contratos, recebimentos e documentos.</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SectionTitle icon={<Building2 size={18} />} title="Dados da empresa" />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Razão social" value={settings.companyName} onChange={(value) => update('companyName', value)} />
          <Field label="CNPJ" value={settings.companyCnpj} onChange={(value) => update('companyCnpj', value)} />
          <Field label="Telefone" value={settings.companyPhone} onChange={(value) => update('companyPhone', value)} />
          <Field label="E-mail" type="email" value={settings.companyEmail} onChange={(value) => update('companyEmail', value)} />
          <Field label="Endereço" value={settings.companyAddress} onChange={(value) => update('companyAddress', value)} className="md:col-span-2" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SectionTitle icon={<CreditCard size={18} />} title="Configurações financeiras" />
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Chave Pix / conta" value={settings.pixKey} onChange={(value) => update('pixKey', value)} className="lg:col-span-2" />
          <SelectField label="Método padrão" value={settings.defaultPaymentMethod} onChange={(value) => update('defaultPaymentMethod', value)} options={['PIX', 'DINHEIRO', 'TRANSFERÊNCIA', 'CARTÃO']} />
          <Field label="Intervalo das parcelas (dias)" type="number" min="1" value={settings.installmentInterval} onChange={(value) => update('installmentInterval', value)} />
          <Field label="Multa por atraso (%)" type="number" min="0" step="0.01" value={settings.lateFee} onChange={(value) => update('lateFee', value)} />
          <Field label="Juros mensais (%)" type="number" min="0" step="0.01" value={settings.interestRate} onChange={(value) => update('interestRate', value)} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SectionTitle icon={<FileText size={18} />} title="Documentos e contratos" />
        <label className="mt-4 block text-sm text-slate-700">Observação padrão dos contratos
          <textarea value={settings.contractNotes} onChange={(event) => update('contractNotes', event.target.value)} rows={4} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="Texto adicional para os contratos..." />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SectionTitle icon={<SettingsIcon size={18} />} title="Ordem dos módulos" />
        <div className="mt-4 space-y-2">
          {menuOrder.map((id, index) => {
            const module = menuItems.find((item) => item.id === id)!;
            return <div key={id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <span>{module.label}</span>
              <span className="flex gap-1">
                <button type="button" disabled={index === 0} onClick={() => moveModule(index, -1)} aria-label={`Mover ${module.label} para cima`} className="rounded border border-slate-200 p-1 disabled:opacity-30"><ChevronUp size={16} /></button>
                <button type="button" disabled={index === menuOrder.length - 1} onClick={() => moveModule(index, 1)} aria-label={`Mover ${module.label} para baixo`} className="rounded border border-slate-200 p-1 disabled:opacity-30"><ChevronDown size={16} /></button>
              </span>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <SectionTitle icon={<LockKeyhole size={18} />} title="Segurança" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>O gerenciamento de usuários e permissões fica disponível no módulo Usuários.</span>
          <button type="button" onClick={() => { localStorage.removeItem('token'); sessionStorage.removeItem('token'); window.location.href = '/login'; }} className="rounded-lg border border-red-200 px-4 py-2 font-medium text-red-700 hover:bg-red-50">Encerrar sessão</button>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" className="flex items-center gap-2 rounded-lg bg-[#0f5964] px-4 py-2 font-semibold text-white hover:bg-[#0c4b55]"><Save size={17} /> Salvar configurações</button>
        {saved && <span className="flex items-center gap-1 text-sm font-medium text-emerald-700"><Check size={16} /> Salvo</span>}
      </div>
    </form>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2 border-b border-slate-100 pb-3 text-base font-semibold text-[#17343b]"><span className="text-[#0f8b8d]">{icon}</span>{title}</div>;
}

function Field({ label, value, onChange, type = 'text', min, step, className = '' }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string; className?: string }) {
  return <label className={`block text-sm text-slate-700 ${className}`}>{label}<input type={type} min={min} step={step} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block text-sm text-slate-700">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900">{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
}
