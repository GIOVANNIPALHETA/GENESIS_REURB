import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  LockKeyhole,
  Save,
  Settings as SettingsIcon,
  MessageCircle,
  ExternalLink,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BellRing,
} from 'lucide-react';
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

type WhatsAppConfig = {
  enabled: boolean;
  phone: string;
  apiKey: string;
  events: {
    payments: boolean;
    documents: boolean;
    occupants: boolean;
    contracts: boolean;
  };
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

const defaultWhatsAppConfig: WhatsAppConfig = {
  enabled: false,
  phone: '',
  apiKey: '',
  events: {
    payments: true,
    documents: true,
    occupants: true,
    contracts: true,
  },
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
  const [whatsappConfig, setWhatsAppConfig] = useState<WhatsAppConfig>(defaultWhatsAppConfig);
  const [saved, setSaved] = useState(false);
  const [testingWhatsApp, setTestingWhatsApp] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    async function fetchWhatsAppConfig() {
      try {
        const res = await axios.get('/api/notifications/whatsapp/config');
        if (res.data?.success && res.data?.data) {
          setWhatsAppConfig(res.data.data);
        }
      } catch (err) {
        console.warn('Não foi possível carregar config do WhatsApp:', err);
      }
    }
    fetchWhatsAppConfig();
  }, []);

  function update(name: keyof Settings, value: string) {
    setSettings((current) => ({ ...current, [name]: value }));
    setSaved(false);
  }

  function updateWhatsApp(field: keyof WhatsAppConfig, value: any) {
    setWhatsAppConfig((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setTestResult(null);
  }

  function toggleWhatsAppEvent(eventKey: keyof WhatsAppConfig['events']) {
    setWhatsAppConfig((prev) => ({
      ...prev,
      events: {
        ...prev.events,
        [eventKey]: !prev.events[eventKey],
      },
    }));
    setSaved(false);
  }

  async function handleTestWhatsApp() {
    if (!whatsappConfig.phone || !whatsappConfig.apiKey) {
      setTestResult({
        success: false,
        message: 'Por favor, informe seu número de WhatsApp e a Chave API antes de testar.',
      });
      return;
    }

    setTestingWhatsApp(true);
    setTestResult(null);

    try {
      const res = await axios.post('/api/notifications/whatsapp/test', {
        phone: whatsappConfig.phone,
        apiKey: whatsappConfig.apiKey,
      });

      setTestResult({
        success: true,
        message: res.data?.message || 'Mensagem enviada com sucesso! Verifique seu WhatsApp.',
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message:
          err?.response?.data?.message || err?.message || 'Falha ao conectar com o serviço de WhatsApp.',
      });
    } finally {
      setTestingWhatsApp(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    localStorage.setItem(storageKey, JSON.stringify(settings));
    localStorage.setItem(menuOrderStorageKey, JSON.stringify(menuOrder));
    window.dispatchEvent(new Event('genesis-menu-order-updated'));

    try {
      await axios.put('/api/notifications/whatsapp/config', whatsappConfig);
    } catch (err) {
      console.error('Erro ao salvar config do WhatsApp:', err);
    }

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

      {/* WhatsApp Notifications Section */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-soft">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <SectionTitle
            icon={<BellRing size={18} className="text-emerald-600" />}
            title="Notificações no WhatsApp (Alertas do Administrador)"
          />
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={whatsappConfig.enabled}
              onChange={(e) => updateWhatsApp('enabled', e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-2.5 text-xs font-semibold text-slate-700">
              {whatsappConfig.enabled ? 'Alertas Ativados' : 'Desativados'}
            </span>
          </label>
        </div>

        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          Receba notificações instantâneas no seu WhatsApp pessoal sempre que ocorrerem movimentações importantes no sistema (novos pagamentos, envio de documentos, alterações de moradores ou contratos).
        </p>

        {/* Tutorial CallMeBot */}
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 uppercase tracking-wide">
            <MessageCircle size={15} className="text-emerald-700" />
            Como ativar em 1 minuto (Gratuito):
          </h4>
          <ol className="mt-2 space-y-1.5 text-xs text-emerald-800 list-decimal list-inside">
            <li>
              Clique no botão abaixo para abrir o WhatsApp oficial do bot:
              <a
                href="https://wa.me/34924145512?text=I%20allow%20callmebot%20to%20send%20me%20messages"
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition text-[11px] block sm:inline-block w-fit"
              >
                <ExternalLink size={13} />
                1. Abrir WhatsApp e Enviar Mensagem de Ativação
              </a>
            </li>
            <li className="mt-1">
              Envie a mensagem pronta: <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-950 font-bold">I allow callmebot to send me messages</code>
            </li>
            <li>
              O bot responderá imediatamente com a sua <strong>Chave API</strong> (ex: <code className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-950 font-bold">123456</code>).
            </li>
            <li>Preencha seu WhatsApp e a Chave API nos campos abaixo e clique em <strong>Testar Envio</strong>!</li>
          </ol>
        </div>

        {/* Form Inputs */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm text-slate-700">
            Seu Número do WhatsApp (com DDD)
            <input
              type="text"
              placeholder="Ex: 66981396187 ou 5566981396187"
              value={whatsappConfig.phone}
              onChange={(e) => updateWhatsApp('phone', e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Apenas números (DDD + celular). O sistema adiciona o código do Brasil (55) automaticamente.</span>
          </label>

          <label className="block text-sm text-slate-700">
            Chave API CallMeBot
            <input
              type="text"
              placeholder="Ex: 849204"
              value={whatsappConfig.apiKey}
              onChange={(e) => updateWhatsApp('apiKey', e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 font-mono"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Código numérico recebido no WhatsApp do bot após a autorização.</span>
          </label>
        </div>

        {/* Escolha dos Eventos */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
            Escolha os eventos que você deseja receber:
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={whatsappConfig.events.payments}
                onChange={() => toggleWhatsAppEvent('payments')}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>💰 <strong>Pagamentos e Recebimentos</strong> (baixas de parcelas)</span>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={whatsappConfig.events.documents}
                onChange={() => toggleWhatsAppEvent('documents')}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>📄 <strong>Novos Documentos</strong> (upload, scanner ou IA)</span>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={whatsappConfig.events.occupants}
                onChange={() => toggleWhatsAppEvent('occupants')}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>👤 <strong>Alterações de Morador / Lote</strong> (novos titulares)</span>
            </label>

            <label className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer text-xs text-slate-700 font-medium">
              <input
                type="checkbox"
                checked={whatsappConfig.events.contracts}
                onChange={() => toggleWhatsAppEvent('contracts')}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>📜 <strong>Contratos</strong> (assinaturas e formalizações)</span>
            </label>
          </div>
        </div>

        {/* Botão de Testar Envio */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button
            type="button"
            disabled={testingWhatsApp || !whatsappConfig.phone || !whatsappConfig.apiKey}
            onClick={handleTestWhatsApp}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer shadow-2xs"
          >
            {testingWhatsApp ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Enviando teste para o WhatsApp...
              </>
            ) : (
              <>
                <Send size={14} />
                Testar Envio no WhatsApp
              </>
            )}
          </button>

          {testResult && (
            <div
              className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg ${
                testResult.success
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={15} className="text-red-600 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
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
