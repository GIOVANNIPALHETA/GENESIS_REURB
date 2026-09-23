import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { dashboardSummary } from '../utils/dashboardSummary';

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const now = new Date();
    const recent = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [projectsCount, lotsCount, peopleCount, signedContracts, contractTotal, payments, installments, documents, incompletePeople, unsignedContracts, newPeople, newDocuments, newContracts, newPayments] = await Promise.all([
      prisma.project.count({ where: { active: true } }),
      prisma.lot.count(),
      prisma.person.count(),
      prisma.contract.count({ where: { signed: true } }),
      prisma.contract.aggregate({ _sum: { totalValue: true } }),
      prisma.payment.findMany({ select: { amount: true, paymentDate: true } }),
      prisma.installment.findMany({ select: { amount: true, paidAmount: true, dueDate: true, status: true } }),
      prisma.document.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.person.count({ where: { OR: [{ cpf: null }, { cpf: '' }, { phone: null }, { phone: '' }] } }),
      prisma.contract.count({ where: { signed: false } }),
      prisma.person.count({ where: { createdAt: { gte: recent, lte: now } } }),
      prisma.document.count({ where: { createdAt: { gte: recent, lte: now } } }),
      prisma.contract.count({ where: { signed: true, signedAt: { gte: recent, lte: now } } }),
      prisma.payment.count({ where: { createdAt: { gte: recent, lte: now } } }),
    ]);
    const names: Record<string, string> = { PENDING: 'Pendentes', UNDER_REVIEW: 'Em revisão', APPROVED: 'Aprovados', REJECTED: 'Rejeitados', NOT_APPLICABLE: 'Não aplicáveis', EXPIRED: 'Vencidos', ILLEGIBLE: 'Ilegíveis' };
    const summary = dashboardSummary(payments, installments, now);
    return res.json({ success: true, data: {
      projectsCount, lotsCount, peopleCount, signedContracts,
      totalContractValue: contractTotal._sum.totalValue || 0,
      financeData: summary.financeData,
      financialSummary: summary.financialSummary,
      documentStatus: documents.map(item => ({ name: names[item.status] || item.status, value: item._count._all })),
      pending: { documents: documents.filter(item => ['PENDING', 'REJECTED', 'EXPIRED', 'ILLEGIBLE'].includes(item.status)).reduce((sum, item) => sum + item._count._all, 0), incompletePeople, unsignedContracts, overdueInstallments: summary.overdueCount },
      recent: { people: newPeople, documents: newDocuments, contracts: newContracts, payments: newPayments },
    }, message: 'Dashboard carregado' });
  } catch (error) { return next(error); }
}
