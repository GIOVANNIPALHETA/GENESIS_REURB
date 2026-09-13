import { Request, Response } from 'express';
import { PaymentMethod, PaymentStatus, ExpenseStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma/client';

// ==========================================
// 1. BENEFICIÁRIOS DE LUCRO (SÓCIOS)
// ==========================================
export async function listProfitBeneficiaries(req: Request, res: Response) {
  try {
    const beneficiaries = await prisma.profitBeneficiary.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        withdrawals: {
          orderBy: { withdrawalDate: 'desc' },
          include: { account: true },
        },
      },
    });

    const result = beneficiaries.map((b) => {
      const totalWithdrawn = b.withdrawals.reduce((sum, w) => sum + w.amount, 0);
      return {
        ...b,
        totalWithdrawn,
      };
    });

    return res.json({ success: true, data: result, message: 'Beneficiários carregados' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao carregar beneficiários' });
  }
}

export async function createProfitBeneficiary(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1),
    type: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
    documentNumber: z.string().optional().nullable(),
    defaultPercentage: z.number().min(0).max(100).default(0),
    paymentInfo: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    active: z.boolean().optional().default(true),
  });

  const parsed = schema.safeParse({
    ...req.body,
    defaultPercentage: req.body.defaultPercentage ? Number(req.body.defaultPercentage) : 0,
  });

  if (!parsed.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  }

  try {
    const created = await prisma.profitBeneficiary.create({
      data: parsed.data,
    });
    return res.status(201).json({ success: true, data: created, message: 'Beneficiário criado com sucesso' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao criar beneficiário' });
  }
}

export async function updateProfitBeneficiary(req: Request, res: Response) {
  const { id } = req.params;
  const schema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
    documentNumber: z.string().optional().nullable(),
    defaultPercentage: z.number().min(0).max(100).optional(),
    paymentInfo: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse({
    ...req.body,
    defaultPercentage: req.body.defaultPercentage !== undefined ? Number(req.body.defaultPercentage) : undefined,
  });

  if (!parsed.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  }

  try {
    const updated = await prisma.profitBeneficiary.update({
      where: { id },
      data: parsed.data,
    });
    return res.json({ success: true, data: updated, message: 'Beneficiário atualizado com sucesso' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao atualizar beneficiário' });
  }
}

// ==========================================
// 2. APURAÇÃO E PERÍODOS DE DIVISÃO DE LUCRO
// ==========================================
export async function getProfitSummary(req: Request, res: Response) {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || new Date().getMonth() + 1;

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // 1. Total de Receitas Realizadas no Mês (Pagamentos recebidos de lotes/contratos)
    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: { gte: startDate, lte: endDate },
      },
      select: { amount: true },
    });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    // 2. Total de Despesas Operacionais Pagas no Mês (que impactam lucros)
    const expenses = await prisma.expense.findMany({
      where: {
        status: ExpenseStatus.PAID,
        expenseDate: { gte: startDate, lte: endDate },
        expenseType: {
          affectsProfitSharing: true,
        },
      },
      include: { expenseType: true },
    });
    const operationalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // 3. Taxas Asaas do período
    const asaasFees = expenses
      .filter((e) => e.expenseType?.name.includes('Asaas') || e.expenseType?.name.includes('Taxa'))
      .reduce((sum, e) => sum + e.amount, 0);

    // 4. Lucro Líquido Real Apurado
    const netProfit = Math.max(totalRevenue - operationalExpenses, 0);

    // 5. Beneficiários Ativos
    const beneficiaries = await prisma.profitBeneficiary.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });

    // 6. Retiradas já realizadas no período
    const withdrawals = await prisma.profitWithdrawal.findMany({
      where: {
        withdrawalDate: { gte: startDate, lte: endDate },
      },
      include: { beneficiary: true, account: true },
    });

    const totalWithdrawn = withdrawals.reduce((sum, w) => sum + w.amount, 0);

    // Montar cálculo por sócio/beneficiário
    const items = beneficiaries.map((b) => {
      const allocated = (netProfit * b.defaultPercentage) / 100;
      const withdrawn = withdrawals
        .filter((w) => w.beneficiaryId === b.id)
        .reduce((sum, w) => sum + w.amount, 0);
      const remaining = Math.max(allocated - withdrawn, 0);

      return {
        beneficiaryId: b.id,
        beneficiaryName: b.name,
        beneficiaryType: b.type,
        percentage: b.defaultPercentage,
        allocatedAmount: Number(allocated.toFixed(2)),
        withdrawnAmount: Number(withdrawn.toFixed(2)),
        remainingAmount: Number(remaining.toFixed(2)),
      };
    });

    return res.json({
      success: true,
      data: {
        period: { year, month, label: `${String(month).padStart(2, '0')}/${year}` },
        totalRevenue: Number(totalRevenue.toFixed(2)),
        operationalExpenses: Number(operationalExpenses.toFixed(2)),
        asaasFees: Number(asaasFees.toFixed(2)),
        netProfit: Number(netProfit.toFixed(2)),
        totalWithdrawn: Number(totalWithdrawn.toFixed(2)),
        remainingProfit: Number(Math.max(netProfit - totalWithdrawn, 0).toFixed(2)),
        items,
        withdrawals,
      },
      message: 'Apuração de lucros carregada com sucesso',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao calcular divisão de lucros' });
  }
}

// ==========================================
// 3. REGISTRO DE RETIRADA DE LUCRO
// ==========================================
export async function createProfitWithdrawal(req: Request, res: Response) {
  const schema = z.object({
    beneficiaryId: z.string().min(1),
    accountId: z.string().min(1),
    amount: z.number().positive(),
    withdrawalDate: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.PIX),
    notes: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse({
    ...req.body,
    amount: Number(req.body.amount),
  });

  if (!parsed.success || !req.user) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos para retirada de lucro' });
  }

  const p = parsed.data;

  try {
    // 1. Cria o registro de retirada
    const withdrawal = await prisma.profitWithdrawal.create({
      data: {
        beneficiaryId: p.beneficiaryId,
        accountId: p.accountId,
        userId: req.user.id,
        amount: p.amount,
        withdrawalDate: p.withdrawalDate ? new Date(p.withdrawalDate) : new Date(),
        paymentMethod: p.paymentMethod,
        notes: p.notes || null,
      },
      include: {
        beneficiary: true,
        account: true,
      },
    });

    // 2. Registra automaticamente como Despesa de "Retirada de lucros" para abater da conta financeira
    const profitType = await prisma.expenseType.findFirst({
      where: { name: { contains: 'Retirada de lucros', mode: 'insensitive' } },
    });

    await prisma.expense.create({
      data: {
        expenseTypeId: profitType?.id || null,
        accountId: p.accountId,
        userId: req.user.id,
        beneficiary: withdrawal.beneficiary.name,
        description: `Retirada de lucros - ${withdrawal.beneficiary.name}`,
        amount: p.amount,
        expenseDate: withdrawal.withdrawalDate,
        status: ExpenseStatus.PAID,
        paymentMethod: p.paymentMethod,
        notes: p.notes || `Retirada registrada no módulo de Divisão de Lucros`,
        isRecurring: false,
      },
    });

    return res.status(201).json({ success: true, data: withdrawal, message: 'Retirada registrada e caixa atualizado com sucesso!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao registrar retirada de lucros' });
  }
}

// ==========================================
// 4. TAXAS DO ASAAS E CONCILIAÇÃO
// ==========================================
export async function listAsaasFees(req: Request, res: Response) {
  try {
    const fees = await prisma.asaasFeeEntry.findMany({
      orderBy: { feeDate: 'desc' },
    });

    const totalGross = fees.reduce((s, f) => s + f.grossAmount, 0);
    const totalFees = fees.reduce((s, f) => s + f.feeAmount, 0);
    const totalNet = fees.reduce((s, f) => s + f.netAmount, 0);

    return res.json({
      success: true,
      data: {
        fees,
        summary: {
          totalGross: Number(totalGross.toFixed(2)),
          totalFees: Number(totalFees.toFixed(2)),
          totalNet: Number(totalNet.toFixed(2)),
          averageFeePercent: totalGross > 0 ? Number(((totalFees / totalGross) * 100).toFixed(2)) : 0,
        },
      },
      message: 'Taxas Asaas carregadas',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao carregar taxas Asaas' });
  }
}
