import { Request, Response } from 'express';
import { processGeminiChatMessage } from '../services/gemini.service';

export async function chatHandler(req: Request, res: Response) {
  try {
    let { message, history } = req.body;

    if (typeof history === 'string') {
      try {
        history = JSON.parse(history);
      } catch {
        history = [];
      }
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      if (req.file) {
        message = 'Fiz o upload deste documento. Por favor, analise e vincule ao lote correspondente se solicitado.';
      } else {
        return res.status(400).json({
          success: false,
          message: 'A mensagem do usuário é obrigatória.',
        });
      }
    }

    const userId = req.user?.id;
    const result = await processGeminiChatMessage(
      message.trim(),
      Array.isArray(history) ? history : [],
      req.file,
      userId
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[AI Controller] Erro no processamento do chat:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Falha ao processar solicitação com o Assistente Gemini.',
    });
  }
}

export async function statusHandler(_req: Request, res: Response) {
  const hasKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  return res.json({
    success: true,
    data: {
      configured: hasKey,
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      provider: 'Google Gemini',
      features: [
        'Upload e vinculação automática de documentos via chat',
        'Resumo de projetos (Vila Nova, Tatão, Dardanelos)',
        'Consulta de lotes e quadras',
        'Inadimplência e parcelas em atraso',
        'Pesquisa de titulares por nome ou CPF',
        'Tira-dúvidas sobre a Lei 13.465/2017 (REURB)',
      ],
    },
  });
}
