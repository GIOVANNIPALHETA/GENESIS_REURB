import { Request, Response } from 'express';
import { parseAsaasWorkbook, processAsaasSync, syncSingleAsaasPayment } from '../services/asaas-sync.service';

export async function syncAsaasSpreadsheet(req: Request, res: Response) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Nenhum arquivo .xlsx enviado para processamento.',
      });
    }

    const dryRun = req.body.dryRun === 'true' || req.body.dryRun === true;
    const clientBlocks = parseAsaasWorkbook(req.file.buffer);

    if (!clientBlocks.length) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Nenhuma conta ou cliente identificável encontrado na planilha enviada.',
      });
    }

    const result = await processAsaasSync(clientBlocks, {
      dryRun,
      userId: req.user?.id,
    });

    return res.json({
      success: true,
      data: result,
      message: dryRun
        ? `Simulação concluída: ${result.summary.totalRows} cobranças analisadas.`
        : `Sincronização concluída: ${result.summary.paidCount} baixas realizadas e ${result.summary.createdCount} parcelas criadas.`,
    });
  } catch (error: any) {
    console.error('[Asaas Sync Controller Error]:', error);
    return res.status(500).json({
      success: false,
      data: null,
      message: error?.message || 'Erro ao processar planilha do Asaas.',
    });
  }
}

export async function handleAsaasWebhook(req: Request, res: Response) {
  try {
    const { event, payment } = req.body;

    if (!payment || !payment.id) {
      return res.status(400).json({ success: false, message: 'Payload inválido do Asaas' });
    }

    const result = await syncSingleAsaasPayment({
      paymentId: payment.id,
      customerCpf: payment.customerCpf || payment.customerCpfCnpj || payment.cpfCnpj || '',
      customerName: payment.customerName,
      amount: payment.value || payment.netValue || 0,
      dueDate: new Date(payment.dueDate),
      status: payment.status,
      paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : (payment.clientPaymentDate ? new Date(payment.clientPaymentDate) : undefined),
      bankSlipUrl: payment.bankSlipUrl,
      invoiceUrl: payment.invoiceUrl,
      pixCode: payment.pixTransaction?.qrCode || payment.pixQrCode,
      notes: `Evento Asaas: ${event || payment.status}`,
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[Asaas Webhook Error]:', error);
    return res.status(500).json({ success: false, message: error?.message || 'Erro no webhook' });
  }
}
