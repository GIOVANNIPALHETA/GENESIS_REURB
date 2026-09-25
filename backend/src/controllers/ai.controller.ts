import { Request, Response } from 'express';
import { processGeminiChatMessage, processGeminiChatMessageStream } from '../services/gemini.service';

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
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
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

export async function chatStreamHandler(req: Request, res: Response) {
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
      return res.status(400).json({
        success: false,
        message: 'A mensagem do usuário é obrigatória.',
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendSSE = (payload: any) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const userId = req.user?.id;

    await processGeminiChatMessageStream(
      message.trim(),
      Array.isArray(history) ? history : [],
      {
        onToken: (token: string) => {
          sendSSE({ type: 'token', content: token });
        },
        onToolCall: (toolName: string) => {
          sendSSE({ type: 'tool', toolName });
        },
        onStatus: (statusMessage: string) => {
          sendSSE({ type: 'status', message: statusMessage });
        },
      },
      undefined,
      userId
    );

    sendSSE({ type: 'done' });
    res.end();
  } catch (error: any) {
    console.error('[AI Controller Stream] Erro:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error?.message || 'Erro ao processar streaming.' })}\n\n`);
    res.end();
  }
}
