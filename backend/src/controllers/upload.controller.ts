import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { prisma } from '../prisma/client';

export async function downloadUpload(req: Request, res: Response, next: NextFunction) {
  const { fileName } = req.params;
  if (!fileName || fileName.startsWith('.') || /[\\/:\x00]/.test(fileName)) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
  const filePath = `/uploads/documents/${fileName}`;
  try {
    const [document, attachment, payment, withdrawal] = await Promise.all([
      prisma.document.findFirst({ where: { filePath }, select: { originalName: true } }),
      prisma.expenseAttachment.findFirst({ where: { filePath }, select: { originalName: true } }),
      prisma.payment.findFirst({ where: { receiptPath: filePath }, select: { id: true } }),
      prisma.profitWithdrawal.findFirst({ where: { receiptPath: filePath }, select: { id: true } }),
    ]);
    if (!document && !attachment && !payment && !withdrawal) return res.status(404).json({ success: false, message: 'Arquivo não encontrado.' });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.type('application/octet-stream');
    return res.download(path.resolve(process.cwd(), '../uploads/documents', fileName), document?.originalName || attachment?.originalName || fileName, error => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) { return next(error); }
}
