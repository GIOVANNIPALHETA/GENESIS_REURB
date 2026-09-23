import { Request, Response } from 'express';
import { ExpenseStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma/client';

const paymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.string().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  notes: z.string().nullable().optional(),
  accountId: z.string().min(1),
  receiptPath: z.string().nullable().optional(),
  receiptFile: z.any().optional(),
});

const expenseSchema = z.object({
  accountId: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().positive(),
  expenseDate: z.string().datetime().optional(),
  status: z.nativeEnum(ExpenseStatus).default(ExpenseStatus.PAID),
  notes: z.string().optional(),
});

export async function listAccounts(req: Request, res: Response) {
  const accounts = await prisma.financialAccount.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  });
  const result = await Promise.all(
    accounts.map(async (account) => {
      const payments = await prisma.payment.findMany({
        where: { accountId: account.id },
        select: { amount: true },
      });
      const expenses = await prisma.expense.findMany({
        where: { accountId: account.id, status: ExpenseStatus.PAID },
        select: { amount: true },
      });
      const received = payments.reduce((sum, item) => sum + item.amount, 0);
      const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
      return {
        ...account,
        received,
        spent,
        balance: account.openingBalance + received - spent,
      };
    })
  );
  return res.json({ success: true, data: result, message: 'Contas carregadas' });
}

export async function listInstallments(req: Request, res: Response) {
  const { status, projectId, projectIds, ownerName, dateFrom, dateTo } = req.query;
  const where: any = {};
  if (typeof status === 'string' && status) where.status = status;

  const rawProjects = projectIds || projectId;
  if (rawProjects) {
    const pList = Array.isArray(rawProjects)
      ? rawProjects.map(String)
      : String(rawProjects)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    if (pList.length === 1) {
      where.negotiation = { contract: { projectId: pList[0] } };
    } else if (pList.length > 1) {
      where.negotiation = { contract: { projectId: { in: pList } } };
    }
  }
  if (typeof ownerName === 'string' && ownerName) {
    const q = ownerName.trim();
    where.OR = [
      { asaasPaymentId: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      {
        negotiation: {
          contract: {
            OR: [
              { contractNumber: { contains: q, mode: 'insensitive' } },
              { person: { fullName: { contains: q, mode: 'insensitive' } } },
              { person: { cpf: { contains: q } } },
              { lot: { number: { contains: q, mode: 'insensitive' } } },
            ],
          },
        },
      },
    ];
  }
  if (typeof dateFrom === 'string' && dateFrom)
    where.dueDate = { ...where.dueDate, gte: new Date(`${dateFrom}T00:00:00.000Z`) };
  if (typeof dateTo === 'string' && dateTo)
    where.dueDate = { ...where.dueDate, lte: new Date(`${dateTo}T23:59:59.999Z`) };

  const installments = await prisma.installment.findMany({
    where,
    include: {
      negotiation: {
        include: {
          contract: {
            include: {
              project: { select: { id: true, name: true } },
              person: { select: { fullName: true, cpf: true } },
              lot: { select: { number: true, block: { select: { number: true } } } },
            },
          },
        },
      },
      payments: { include: { account: true } },
    },
    orderBy: { dueDate: 'asc' },
  });
  return res.json({ success: true, data: installments, message: 'Parcelas carregadas' });
}

export async function registerPayment(req: Request, res: Response) {
  const result = paymentSchema.safeParse({ ...req.body, amount: Number(req.body.amount) });
  if (!result.success) {
    console.error('[registerPayment] Erro de validação:', result.error.format());
    return res.status(400).json({ success: false, data: null, message: 'Dados de pagamento inválidos', errors: result.error.errors });
  }

  try {
    const installment = await prisma.installment.findUnique({ where: { id: req.params.id } });
    if (!installment)
      return res.status(404).json({ success: false, data: null, message: 'Parcela não encontrada' });

    const remaining = Number((installment.amount - installment.paidAmount).toFixed(2));
    if (result.data.amount > remaining) {
      return res.status(400).json({
        success: false,
        data: null,
        message: `O valor máximo para esta parcela é R$ ${remaining.toFixed(2)}`,
      });
    }

    const paidAmount = Number((installment.paidAmount + result.data.amount).toFixed(2));
    const status = paidAmount >= installment.amount ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID;
    const account = await prisma.financialAccount.findUnique({ where: { id: result.data.accountId } });
    if (!account || !account.active)
      return res.status(400).json({ success: false, data: null, message: 'Conta financeira inválida' });

    const receiptPath = req.file
      ? `/uploads/documents/${req.file.filename}`
      : typeof req.body.receiptPath === 'string' && req.body.receiptPath
      ? req.body.receiptPath
      : null;

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          installmentId: installment.id,
          accountId: result.data.accountId,
          amount: result.data.amount,
          paymentDate: result.data.paymentDate ? new Date(result.data.paymentDate) : new Date(),
          paymentMethod: result.data.paymentMethod,
          notes: result.data.notes || (typeof req.body.notes === 'string' ? req.body.notes : null),
          receiptPath,
        },
      });
      await tx.installment.update({
        where: { id: installment.id },
        data: {
          paidAmount,
          paidAt: status === PaymentStatus.PAID ? new Date() : null,
          paymentMethod: result.data.paymentMethod,
          status,
        },
      });
      return created;
    });

    return res.status(201).json({ success: true, data: payment, message: 'Pagamento registrado' });
  } catch {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível registrar o pagamento' });
  }
}

export async function createManualPayment(req: Request, res: Response) {
  const manualSchema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod),
    accountId: z.string().min(1),
    description: z.string().min(1),
    notes: z.string().optional(),
    lotId: z.string().optional(),
    targetType: z.enum(['DOWN_PAYMENT', 'INSTALLMENT', 'EXTRA']).optional(),
    targetInstallmentId: z.string().optional(),
  });

  const result = manualSchema.safeParse({ ...req.body, amount: Number(req.body.amount) });
  if (!result.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados de receita inválidos' });
  }

  try {
    const account = await prisma.financialAccount.findUnique({ where: { id: result.data.accountId } });
    if (!account || !account.active) {
      return res.status(400).json({ success: false, data: null, message: 'Conta financeira inválida' });
    }

    const receiptPath = req.file ? `/uploads/documents/${req.file.filename}` : null;
    const { lotId, targetType = 'DOWN_PAYMENT', targetInstallmentId: requestedInstallmentId, ...data } = result.data;

    const payment = await prisma.$transaction(async (tx) => {
      let targetInstallmentId: string | undefined = undefined;

      // Se foi selecionado um lote
      if (lotId) {
        // Buscar lote com ocupantes e contratos
        const lot = await tx.lot.findUnique({
          where: { id: lotId },
          include: {
            occupancies: { where: { current: true, type: 'OWNER' } },
            contracts: {
              include: {
                negotiations: {
                  include: {
                    installments: {
                      orderBy: { installmentNumber: 'asc' },
                    },
                  },
                },
              },
            },
          },
        });

        if (lot) {
          let contract = lot.contracts[0];
          const ownerPersonId = lot.occupancies[0]?.personId;

          // Se não existir contrato para o lote, cria um contrato à vista com o titular
          if (!contract && ownerPersonId) {
            const newContract = await tx.contract.create({
              data: {
                contractNumber: `LOTE-${lot.number}-${Date.now().toString().slice(-4)}`,
                personId: ownerPersonId,
                lotId: lot.id,
                projectId: lot.projectId,
                totalValue: data.amount,
                signed: true,
                status: 'ACTIVE',
                notes: 'Contrato gerado automaticamente via lançamento de receita',
              },
            });

            const newNeg = await tx.negotiation.create({
              data: {
                contractId: newContract.id,
                totalValue: data.amount,
                downPayment: data.amount,
                financedAmount: 0,
                installmentCount: 1,
                firstDueDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                installments: {
                  create: [
                    {
                      installmentNumber: 1,
                      amount: data.amount,
                      paidAmount: data.amount,
                      dueDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                      paidAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                      paymentMethod: data.paymentMethod,
                      status: PaymentStatus.PAID,
                    },
                  ],
                },
              },
              include: {
                installments: true,
              },
            });

            targetInstallmentId = newNeg.installments[0]?.id;
          } else if (contract && contract.negotiations[0]) {
            const negotiation = contract.negotiations[0];

            if (targetType === 'INSTALLMENT' && requestedInstallmentId) {
              // 1. Baixa em parcela específica selecionada pelo usuário
              const openInstallment = negotiation.installments.find(
                (i) => i.id === requestedInstallmentId
              );

              if (openInstallment) {
                targetInstallmentId = openInstallment.id;
                const paidAmount = openInstallment.paidAmount + data.amount;
                const isFull = paidAmount >= openInstallment.amount;

                await tx.installment.update({
                  where: { id: openInstallment.id },
                  data: {
                    paidAmount,
                    paidAt: isFull ? new Date(data.paymentDate || Date.now()) : openInstallment.paidAt,
                    paymentMethod: data.paymentMethod,
                    status: isFull ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID,
                  },
                });
              }
            } else if (targetType === 'EXTRA') {
              // 2. Receita avulsa / extra: adiciona nova parcela quitada ao final
              const maxNumber = negotiation.installments.reduce(
                (max, i) => Math.max(max, i.installmentNumber),
                0
              );
              const nextNumber = maxNumber + 1;
              const newInst = await tx.installment.create({
                data: {
                  negotiationId: negotiation.id,
                  installmentNumber: nextNumber,
                  description: data.description || `Recebimento Avulso #${nextNumber}`,
                  amount: data.amount,
                  paidAmount: data.amount,
                  dueDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                  paidAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                  paymentMethod: data.paymentMethod,
                  status: PaymentStatus.PAID,
                },
              });
              targetInstallmentId = newInst.id;

              await tx.negotiation.update({
                where: { id: negotiation.id },
                data: {
                  totalValue: (negotiation.totalValue || 0) + data.amount,
                },
              });
              await tx.contract.update({
                where: { id: contract.id },
                data: {
                  totalValue: (contract.totalValue || 0) + data.amount,
                },
              });
            } else {
              // 3. targetType === 'DOWN_PAYMENT' (Padrão para Entrada / Sinal)
              // Verifica se já existe uma parcela de entrada
              const existingEntrada = negotiation.installments.find(
                (i) =>
                  i.installmentNumber === 0 ||
                  (i.description && i.description.toLowerCase().includes('entrada'))
              );

              if (existingEntrada && existingEntrada.status !== PaymentStatus.PAID) {
                targetInstallmentId = existingEntrada.id;
                const paidAmount = existingEntrada.paidAmount + data.amount;
                const isFull = paidAmount >= existingEntrada.amount;

                await tx.installment.update({
                  where: { id: existingEntrada.id },
                  data: {
                    paidAmount,
                    paidAt: isFull ? new Date(data.paymentDate || Date.now()) : existingEntrada.paidAt,
                    paymentMethod: data.paymentMethod,
                    status: isFull ? PaymentStatus.PAID : PaymentStatus.PARTIALLY_PAID,
                  },
                });

                if (paidAmount > existingEntrada.amount) {
                  const diff = paidAmount - existingEntrada.amount;
                  await tx.negotiation.update({
                    where: { id: negotiation.id },
                    data: {
                      downPayment: (negotiation.downPayment || 0) + diff,
                      totalValue: (negotiation.totalValue || 0) + diff,
                    },
                  });
                  await tx.contract.update({
                    where: { id: contract.id },
                    data: {
                      totalValue: (contract.totalValue || 0) + diff,
                    },
                  });
                }
              } else {
                // Não existe entrada cadastrada ou já estava quitada: cria parcela de Entrada (número 0)
                const newInst = await tx.installment.create({
                  data: {
                    negotiationId: negotiation.id,
                    installmentNumber: 0,
                    description: data.description || 'Entrada',
                    amount: data.amount,
                    paidAmount: data.amount,
                    dueDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                    paidAt: data.paymentDate ? new Date(data.paymentDate) : new Date(),
                    paymentMethod: data.paymentMethod,
                    status: PaymentStatus.PAID,
                  },
                });
                targetInstallmentId = newInst.id;

                await tx.negotiation.update({
                  where: { id: negotiation.id },
                  data: {
                    downPayment: (negotiation.downPayment || 0) + data.amount,
                    totalValue: (negotiation.totalValue || 0) + data.amount,
                  },
                });
                await tx.contract.update({
                  where: { id: contract.id },
                  data: {
                    totalValue: (contract.totalValue || 0) + data.amount,
                  },
                });
              }
            }
          }
        }
      }

      const created = await tx.payment.create({
        data: {
          amount: data.amount,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          paymentMethod: data.paymentMethod,
          accountId: data.accountId,
          installmentId: targetInstallmentId,
          notes: data.notes ? (data.description ? `${data.description} - ${data.notes}` : data.notes) : data.description,
          receiptPath,
        },
        include: {
          account: true,
        },
      });

      return created;
    });

    return res.status(201).json({ success: true, data: payment, message: 'Receita registrada com sucesso!' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao registrar receita' });
  }
}

export async function listExpenses(req: Request, res: Response) {
  const expenses = await prisma.expense.findMany({
    include: { account: true, user: { select: { name: true } } },
    orderBy: { expenseDate: 'desc' },
  });
  return res.json({ success: true, data: expenses, message: 'Saídas carregadas' });
}

export async function createExpense(req: Request, res: Response) {
  const result = expenseSchema.safeParse({ ...req.body, amount: Number(req.body.amount) });
  if (!result.success || !req.user)
    return res.status(400).json({ success: false, data: null, message: 'Dados da saída inválidos' });

  const account = await prisma.financialAccount.findUnique({ where: { id: result.data.accountId } });
  if (!account || !account.active)
    return res.status(400).json({ success: false, data: null, message: 'Conta financeira inválida' });

  const expense = await prisma.expense.create({
    data: {
      ...result.data,
      expenseDate: result.data.expenseDate ? new Date(result.data.expenseDate) : new Date(),
      userId: req.user.id,
    },
  });
  return res.status(201).json({ success: true, data: expense, message: 'Saída registrada' });
}

export async function updatePayment(req: Request, res: Response) {
  const result = paymentSchema.safeParse({ ...req.body, amount: Number(req.body.amount) });
  if (!result.success) {
    console.error('[updatePayment] Erro de validação:', result.error.format());
    return res.status(400).json({ success: false, data: null, message: 'Dados de recebimento inválidos', errors: result.error.errors });
  }

  try {
    const account = await prisma.financialAccount.findUnique({ where: { id: result.data.accountId } });
    if (!account || !account.active)
      return res.status(400).json({ success: false, data: null, message: 'Conta financeira inválida' });

    const receiptPath = req.file
      ? `/uploads/documents/${req.file.filename}`
      : typeof req.body.receiptPath === 'string'
      ? req.body.receiptPath
      : undefined;

    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: req.params.paymentId },
        data: {
          amount: result.data.amount,
          paymentDate: result.data.paymentDate ? new Date(result.data.paymentDate) : new Date(),
          paymentMethod: result.data.paymentMethod,
          accountId: result.data.accountId,
          notes: result.data.notes,
          ...(receiptPath !== undefined ? { receiptPath } : {}),
        },
      });
      const payments = await tx.payment.findMany({
        where: { installmentId: updated.installmentId },
        select: { amount: true, paymentDate: true, paymentMethod: true },
      });
      const paidAmount = Number(payments.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
      const installment = await tx.installment.findUnique({
        where: { id: updated.installmentId || '' },
      });
      const latestPayment = payments.sort(
        (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      )[0];
      if (installment && updated.installmentId) {
        await tx.installment.update({
          where: { id: updated.installmentId },
          data: {
            paidAmount,
            paidAt:
              paidAmount >= installment.amount
                ? latestPayment?.paymentDate ?? updated.paymentDate
                : null,
            paymentMethod: latestPayment?.paymentMethod ?? null,
            status:
              paidAmount >= installment.amount
                ? PaymentStatus.PAID
                : paidAmount > 0
                ? PaymentStatus.PARTIALLY_PAID
                : PaymentStatus.PENDING,
          },
        });
      }
      return updated;
    });
    return res.json({ success: true, data: payment, message: 'Recebimento atualizado' });
  } catch {
    return res.status(404).json({ success: false, data: null, message: 'Recebimento não encontrado' });
  }
}

export async function cancelPayment(req: Request, res: Response) {
  try {
    const payment = await prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({ where: { id: req.params.paymentId } });
      if (!current || !current.installmentId) throw new Error('NOT_FOUND');
      const installment = await tx.installment.findUnique({
        where: { id: current.installmentId },
      });
      if (!installment) throw new Error('NOT_FOUND');
      const remainingPayments = await tx.payment.findMany({
        where: { installmentId: current.installmentId, id: { not: current.id } },
        orderBy: { paymentDate: 'desc' },
        select: { amount: true, paymentDate: true, paymentMethod: true },
      });
      const paidAmount = Number(Math.max(installment.paidAmount - current.amount, 0).toFixed(2));
      const latestPayment = remainingPayments[0];

      // Se for lançamento de Entrada (installmentNumber === 0), ajusta o downPayment e totalValue da negociação
      if (installment.installmentNumber === 0) {
        const negotiation = await tx.negotiation.findUnique({
          where: { id: installment.negotiationId },
          include: { contract: true },
        });
        if (negotiation) {
          const newDownPayment = Math.max(0, (negotiation.downPayment || 0) - current.amount);
          const newTotal = Math.max(0, (negotiation.totalValue || 0) - current.amount);
          await tx.negotiation.update({
            where: { id: negotiation.id },
            data: { downPayment: newDownPayment, totalValue: newTotal },
          });
          if (negotiation.contract) {
            await tx.contract.update({
              where: { id: negotiation.contract.id },
              data: { totalValue: Math.max(0, negotiation.contract.totalValue - current.amount) },
            });
          }

          // Se não restar nenhum pagamento e a entrada estiver zerada, remove a parcela criada avulsa
          if (remainingPayments.length === 0 && newDownPayment === 0) {
            await tx.payment.delete({ where: { id: current.id } });
            await tx.installment.delete({ where: { id: installment.id } });
            if (req.user) {
              await tx.auditLog.create({
                data: {
                  userId: req.user.id,
                  action: 'ESTORNO',
                  entity: 'Payment',
                  entityId: current.id,
                  previousData: current as any,
                  newData: { status: 'ESTORNADO_E_EXCLUIDO' },
                },
              });
            }
            return { ...current, installment: null };
          }
        }
      }

      const updatedInstallment = await tx.installment.update({
        where: { id: current.installmentId },
        data: {
          paidAmount,
          paidAt: paidAmount >= installment.amount ? latestPayment?.paymentDate ?? null : null,
          paymentMethod: latestPayment?.paymentMethod ?? null,
          status:
            paidAmount >= installment.amount
              ? PaymentStatus.PAID
              : paidAmount > 0
              ? PaymentStatus.PARTIALLY_PAID
              : PaymentStatus.PENDING,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: req.user!.id,
          action: 'ESTORNO',
          entity: 'Payment',
          entityId: current.id,
          previousData: current,
          newData: { status: 'ESTORNADO' },
        },
      });
      await tx.payment.delete({ where: { id: current.id } });
      return { ...current, installment: updatedInstallment };
    });
    return res.json({ success: true, data: payment, message: 'Recebimento cancelado' });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND')
      return res.status(404).json({ success: false, data: null, message: 'Recebimento não encontrado' });
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível cancelar o recebimento' });
  }
}

export async function updateInstallment(req: Request, res: Response) {
  const amount = Number(req.body.amount);
  const dueDate = typeof req.body.dueDate === 'string' ? new Date(req.body.dueDate) : undefined;
  if (!Number.isFinite(amount) || amount <= 0 || !dueDate || Number.isNaN(dueDate.getTime())) {
    return res.status(400).json({ success: false, data: null, message: 'Valor ou vencimento inválido' });
  }

  const requestedStatus =
    req.body.status && Object.values(PaymentStatus).includes(req.body.status as PaymentStatus)
      ? (req.body.status as PaymentStatus)
      : undefined;
  const paymentMethod =
    req.body.paymentMethod && Object.values(PaymentMethod).includes(req.body.paymentMethod as PaymentMethod)
      ? (req.body.paymentMethod as PaymentMethod)
      : undefined;
  const accountId = typeof req.body.accountId === 'string' && req.body.accountId ? req.body.accountId : undefined;
  const paymentDate = typeof req.body.paymentDate === 'string' ? new Date(req.body.paymentDate) : undefined;
  const receiptPath = req.file
    ? `/uploads/documents/${req.file.filename}`
    : typeof req.body.receiptPath === 'string'
    ? req.body.receiptPath
    : undefined;
  const notes = typeof req.body.notes === 'string' ? req.body.notes : undefined;
  const asaasPaymentId =
    typeof req.body.asaasPaymentId === 'string' ? req.body.asaasPaymentId.trim() || null : undefined;
  const invoiceUrl =
    typeof req.body.invoiceUrl === 'string' ? req.body.invoiceUrl.trim() || null : undefined;
  const bankSlipUrl =
    typeof req.body.bankSlipUrl === 'string' ? req.body.bankSlipUrl.trim() || null : undefined;
  const pixCode =
    typeof req.body.pixCode === 'string' ? req.body.pixCode.trim() || null : undefined;

  try {
    const installment = await prisma.installment.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!installment)
      return res.status(404).json({ success: false, data: null, message: 'Parcela não encontrada' });

    let status =
      requestedStatus ||
      (installment.paidAmount >= amount
        ? PaymentStatus.PAID
        : installment.paidAmount > 0
        ? PaymentStatus.PARTIALLY_PAID
        : PaymentStatus.PENDING);
    let paidAmount = installment.paidAmount;
    let paidAt = installment.paidAt;

    if (status === PaymentStatus.PAID) {
      paidAmount = amount;
      paidAt = paymentDate && !isNaN(paymentDate.getTime()) ? paymentDate : (installment.paidAt || new Date());
    } else if (status === PaymentStatus.PENDING) {
      if (req.body.resetPayments || paidAmount === amount) {
        paidAmount = 0;
        paidAt = null;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.installment.update({
        where: { id: installment.id },
        data: {
          amount,
          dueDate,
          status,
          paidAmount,
          paidAt,
          paymentMethod: paymentMethod !== undefined ? paymentMethod : installment.paymentMethod,
          ...(asaasPaymentId !== undefined ? { asaasPaymentId } : {}),
          ...(invoiceUrl !== undefined ? { invoiceUrl } : {}),
          ...(bankSlipUrl !== undefined ? { bankSlipUrl } : {}),
          ...(pixCode !== undefined ? { pixCode } : {}),
        },
      });

      if (status === PaymentStatus.PAID || paidAmount > 0) {
        if (installment.payments.length > 0) {
          await tx.payment.updateMany({
            where: { installmentId: installment.id },
            data: {
              ...(paymentMethod ? { paymentMethod } : {}),
              ...(accountId ? { accountId } : {}),
              ...(paymentDate && !isNaN(paymentDate.getTime()) ? { paymentDate } : {}),
              ...(notes !== undefined ? { notes } : {}),
              ...(receiptPath !== undefined ? { receiptPath } : {}),
            },
          });
        } else if (accountId && (paymentMethod || installment.paymentMethod)) {
          await tx.payment.create({
            data: {
              installmentId: installment.id,
              accountId,
              amount: paidAmount || amount,
              paymentDate: paymentDate && !isNaN(paymentDate.getTime()) ? paymentDate : new Date(),
              paymentMethod: paymentMethod || installment.paymentMethod || PaymentMethod.CASH,
              notes: notes || 'Atualizado via edição de parcela',
              receiptPath: receiptPath || null,
            },
          });
        }
      } else if (status === PaymentStatus.PENDING && paidAmount === 0 && installment.payments.length > 0) {
        await tx.payment.deleteMany({ where: { installmentId: installment.id } });
      }

      if (req.user) {
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'ATUALIZACAO',
            entity: 'Installment',
            entityId: installment.id,
            previousData: installment as any,
            newData: result as any,
          },
        });
      }
      return result;
    });

    return res.json({ success: true, data: updated, message: 'Parcela atualizada' });
  } catch {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível atualizar a parcela' });
  }
}

export async function deleteInstallment(req: Request, res: Response) {
  try {
    const installment = await prisma.installment.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!installment)
      return res.status(404).json({ success: false, data: null, message: 'Parcela não encontrada' });

    await prisma.$transaction(async (tx) => {
      await tx.payment.deleteMany({ where: { installmentId: installment.id } });
      await tx.installment.delete({ where: { id: installment.id } });
      if (req.user) {
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'EXCLUSAO',
            entity: 'Installment',
            entityId: installment.id,
            previousData: installment as any,
          },
        });
      }
    });

    return res.json({ success: true, data: null, message: 'Parcela excluída' });
  } catch {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível excluir a parcela' });
  }
}

export async function cancelInstallment(req: Request, res: Response) {
  try {
    const installment = await prisma.installment.findUnique({ where: { id: req.params.id } });
    if (!installment)
      return res.status(404).json({ success: false, data: null, message: 'Parcela não encontrada' });

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.installment.update({
        where: { id: installment.id },
        data: { status: PaymentStatus.CANCELED },
      });
      if (req.user) {
        await tx.auditLog.create({
          data: {
            userId: req.user.id,
            action: 'CANCELAMENTO',
            entity: 'Installment',
            entityId: installment.id,
            previousData: installment as any,
            newData: result as any,
          },
        });
      }
      return result;
    });

    return res.json({ success: true, data: updated, message: 'Parcela cancelada' });
  } catch {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível cancelar a parcela' });
  }
}

export async function listHistory(req: Request, res: Response) {
  const history = await prisma.auditLog.findMany({
    where: { entity: 'Installment', entityId: req.params.id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: history, message: 'Histórico carregado' });
}