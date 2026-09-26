import fs from 'fs';
import path from 'path';
import https from 'https';

export interface WhatsAppNotificationConfig {
  enabled: boolean;
  phone: string; // Ex: 5566981396187
  apiKey: string; // CallMeBot API Key
  events: {
    payments: boolean;
    documents: boolean;
    occupants: boolean;
    contracts: boolean;
  };
}

const CONFIG_DIR = path.resolve(__dirname, '../../data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'whatsapp-notification-config.json');

const DEFAULT_CONFIG: WhatsAppNotificationConfig = {
  enabled: false,
  phone: process.env.WHATSAPP_ADMIN_PHONE || '',
  apiKey: process.env.WHATSAPP_CALLMEBOT_APIKEY || '',
  events: {
    payments: true,
    documents: true,
    occupants: true,
    contracts: true,
  },
};

/**
 * Normaliza número para formato internacional (ex: 5566981396187)
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // Se já tem DDI (ex: 55...)
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  // Se tem DDD e número (10 ou 11 dígitos), adiciona DDI Brasil 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

export function getWhatsAppConfig(): WhatsAppNotificationConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        events: { ...DEFAULT_CONFIG.events, ...(parsed.events || {}) },
      };
    }
  } catch (err) {
    console.warn('[WhatsApp Notifier] Erro ao carregar config:', err);
  }
  return DEFAULT_CONFIG;
}

export function saveWhatsAppConfig(config: Partial<WhatsAppNotificationConfig>): WhatsAppNotificationConfig {
  const current = getWhatsAppConfig();
  const updated: WhatsAppNotificationConfig = {
    ...current,
    ...config,
    phone: config.phone !== undefined ? normalizePhoneNumber(config.phone) : current.phone,
    events: {
      ...current.events,
      ...(config.events || {}),
    },
  };

  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.error('[WhatsApp Notifier] Erro ao salvar config:', err);
  }

  return updated;
}

/**
 * Disparo HTTP para CallMeBot API
 */
export async function sendRawCallMeBotMessage(
  phone: string,
  apiKey: string,
  text: string
): Promise<{ success: boolean; message: string }> {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone || !apiKey) {
    return { success: false, message: 'Telefone ou Chave API CallMeBot não informados.' };
  }

  const encodedText = encodeURIComponent(text);
  const url = `https://api.callmebot.com/whatsapp.php?phone=${normalizedPhone}&text=${encodedText}&apikey=${apiKey}`;

  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const lower = body.toLowerCase();
          if (lower.includes('invalid') || lower.includes('error')) {
            resolve({
              success: false,
              message: body.replace(/<[^>]*>/g, '').trim() || 'Chave API ou telefone inválidos.',
            });
          } else {
            resolve({
              success: true,
              message: 'Mensagem enviada com sucesso para o WhatsApp.',
            });
          }
        });
      })
      .on('error', (err) => {
        console.error('[WhatsApp Notifier] Erro na requisição:', err.message);
        resolve({ success: false, message: `Falha de rede: ${err.message}` });
      });
  });
}

/**
 * Envia notificação ao Administrador (respeitando se está ativado)
 */
export async function sendWhatsAppAdminAlert(text: string): Promise<boolean> {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.phone || !config.apiKey) {
    return false;
  }

  try {
    const res = await sendRawCallMeBotMessage(config.phone, config.apiKey, text);
    if (!res.success) {
      console.warn('[WhatsApp Notifier] Falha no envio do alerta:', res.message);
    }
    return res.success;
  } catch (err: any) {
    console.warn('[WhatsApp Notifier] Exceção ao enviar alerta:', err?.message || err);
    return false;
  }
}

// ============================================================================
// EVENTOS ESPECÍFICOS DE NOTIFICAÇÃO
// ============================================================================

export function notifyPaymentReceived(params: {
  personName?: string;
  projectName?: string;
  blockNumber?: string;
  lotNumber?: string;
  amount: number;
  installmentNumber?: number;
  paymentMethod?: string;
  operatorName?: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.events.payments) return;

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });
  const valorFormatado = Number(params.amount || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  const lines = [
    `🔔 *GÊNESIS REURB - PAGAMENTO RECEBIDO*`,
    ``,
    `💰 *Valor:* ${valorFormatado}`,
    params.installmentNumber !== undefined ? `📑 *Parcela:* Nº ${params.installmentNumber}` : null,
    params.paymentMethod ? `💳 *Forma:* ${params.paymentMethod}` : null,
    params.personName ? `👤 *Titular:* ${params.personName}` : null,
    params.projectName
      ? `📍 *Imóvel:* ${params.projectName}${params.blockNumber ? `, Qd ${params.blockNumber}` : ''}${params.lotNumber ? `, Lt ${params.lotNumber}` : ''}`
      : null,
    params.operatorName ? `✍️ *Registrado por:* ${params.operatorName}` : null,
    `⏱️ *Data/Hora:* ${now}`,
  ].filter(Boolean);

  sendWhatsAppAdminAlert(lines.join('\n')).catch(() => {});
}

export function notifyDocumentUploaded(params: {
  documentType: string;
  originalName: string;
  personName?: string;
  projectName?: string;
  blockNumber?: string;
  lotNumber?: string;
  source?: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.events.documents) return;

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });

  const lines = [
    `🔔 *GÊNESIS REURB - NOVO DOCUMENTO*`,
    ``,
    `📄 *Documento:* ${params.documentType || 'Arquivo'}`,
    `📎 *Arquivo:* ${params.originalName}`,
    params.personName ? `👤 *Titular:* ${params.personName}` : null,
    params.projectName
      ? `📍 *Lote:* ${params.projectName}${params.blockNumber ? `, Qd ${params.blockNumber}` : ''}${params.lotNumber ? `, Lt ${params.lotNumber}` : ''}`
      : null,
    params.source ? `🤖 *Canal:* ${params.source}` : `💻 *Canal:* Sistema Web`,
    `⏱️ *Data/Hora:* ${now}`,
  ].filter(Boolean);

  sendWhatsAppAdminAlert(lines.join('\n')).catch(() => {});
}

export function notifyOccupantChanged(params: {
  projectName?: string;
  blockNumber?: string;
  lotNumber?: string;
  personName: string;
  cpf?: string;
  action: 'VINCULADO' | 'ALTERADO' | 'REMOVIDO';
  operatorName?: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.events.occupants) return;

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });

  const lines = [
    `🔔 *GÊNESIS REURB - MORADOR/LOTE ATUALIZADO*`,
    ``,
    `📌 *Ação:* Titular ${params.action}`,
    `👤 *Morador:* ${params.personName}${params.cpf ? ` (CPF: ${params.cpf})` : ''}`,
    params.projectName
      ? `📍 *Imóvel:* ${params.projectName}${params.blockNumber ? `, Qd ${params.blockNumber}` : ''}${params.lotNumber ? `, Lt ${params.lotNumber}` : ''}`
      : null,
    params.operatorName ? `✍️ *Operador:* ${params.operatorName}` : null,
    `⏱️ *Data/Hora:* ${now}`,
  ].filter(Boolean);

  sendWhatsAppAdminAlert(lines.join('\n')).catch(() => {});
}

export function notifyContractSigned(params: {
  contractNumber: string;
  personName?: string;
  projectName?: string;
  blockNumber?: string;
  lotNumber?: string;
  status?: string;
}) {
  const config = getWhatsAppConfig();
  if (!config.enabled || !config.events.contracts) return;

  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });

  const lines = [
    `🔔 *GÊNESIS REURB - CONTRATO FORMALIZADO*`,
    ``,
    `📜 *Contrato:* Nº ${params.contractNumber}`,
    params.status ? `📋 *Status:* ${params.status}` : null,
    params.personName ? `👤 *Titular:* ${params.personName}` : null,
    params.projectName
      ? `📍 *Imóvel:* ${params.projectName}${params.blockNumber ? `, Qd ${params.blockNumber}` : ''}${params.lotNumber ? `, Lt ${params.lotNumber}` : ''}`
      : null,
    `⏱️ *Data/Hora:* ${now}`,
  ].filter(Boolean);

  sendWhatsAppAdminAlert(lines.join('\n')).catch(() => {});
}
