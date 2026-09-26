import { Request, Response } from 'express';
import {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  sendRawCallMeBotMessage,
  normalizePhoneNumber,
} from '../services/whatsappNotification.service';

export async function getWhatsAppNotificationConfigHandler(_req: Request, res: Response) {
  try {
    const config = getWhatsAppConfig();
    return res.json({
      success: true,
      data: config,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao carregar configurações de notificação do WhatsApp.',
    });
  }
}

export async function updateWhatsAppNotificationConfigHandler(req: Request, res: Response) {
  try {
    const { enabled, phone, apiKey, events } = req.body;

    const updated = saveWhatsAppConfig({
      enabled: typeof enabled === 'boolean' ? enabled : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey.trim() : undefined,
      events: typeof events === 'object' ? events : undefined,
    });

    return res.json({
      success: true,
      message: 'Configurações de notificação do WhatsApp salvas com sucesso!',
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Erro ao salvar configurações de notificação do WhatsApp.',
    });
  }
}

export async function testWhatsAppNotificationHandler(req: Request, res: Response) {
  try {
    const currentConfig = getWhatsAppConfig();
    const phone = req.body.phone ? normalizePhoneNumber(req.body.phone) : currentConfig.phone;
    const apiKey = req.body.apiKey ? String(req.body.apiKey).trim() : currentConfig.apiKey;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, informe seu número de WhatsApp com DDD.',
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Por favor, informe a Chave API CallMeBot gerada no WhatsApp.',
      });
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Cuiaba' });
    const testMessage = `🔔 *GÊNESIS REURB - TESTE DE NOTIFICAÇÃO*\n\n✅ Parabéns! O seu WhatsApp foi configurado com sucesso no sistema Gênesis REURB.\n\nA partir de agora, você receberá alertas em tempo real sobre pagamentos, novos documentos e alterações no sistema!\n\n⏱️ *Horário do Teste:* ${now}`;

    const result = await sendRawCallMeBotMessage(phone, apiKey, testMessage);

    if (result.success) {
      return res.json({
        success: true,
        message: `Mensagem de teste enviada com sucesso para +${phone}! Verifique seu WhatsApp.`,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Falha ao enviar mensagem pelo CallMeBot: ${result.message}`,
      });
    }
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error?.message || 'Erro inesperado ao disparar teste no WhatsApp.',
    });
  }
}
