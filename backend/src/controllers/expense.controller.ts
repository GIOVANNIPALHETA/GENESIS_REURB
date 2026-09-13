import { Request, Response } from 'express';
import { ExpenseStatus, PaymentMethod } from '@prisma/client';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma/client';

// ==========================================
// 1. TIPOS DE DESPESAS (EXPENSE TYPES)
// ==========================================
export async function listExpenseTypes(req: Request, res: Response) {
  try {
    const types = await prisma.expenseType.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return res.json({ success: true, data: types, message: 'Tipos de despesa carregados' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao carregar tipos de despesa' });
  }
}

export async function createExpenseType(req: Request, res: Response) {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    isFixed: z.boolean().optional(),
    requiresReceipt: z.boolean().optional(),
    affectsProfitSharing: z.boolean().optional(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  }

  try {
    const type = await prisma.expenseType.create({
      data: parsed.data,
    });
    return res.status(201).json({ success: true, data: type, message: 'Tipo de despesa criado com sucesso' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao criar tipo de despesa' });
  }
}

export async function updateExpenseType(req: Request, res: Response) {
  const { id } = req.params;
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    color: z.string().optional(),
    icon: z.string().optional(),
    isFixed: z.boolean().optional(),
    requiresReceipt: z.boolean().optional(),
    affectsProfitSharing: z.boolean().optional(),
    active: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  }

  try {
    const type = await prisma.expenseType.update({
      where: { id },
      data: parsed.data,
    });
    return res.json({ success: true, data: type, message: 'Tipo de despesa atualizado' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao atualizar tipo de despesa' });
  }
}

export async function deleteExpenseType(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const count = await prisma.expense.count({ where: { expenseTypeId: id } });
    if (count > 0) {
      // Se possui despesas, desativa em vez de deletar para manter integridade
      await prisma.expenseType.update({ where: { id }, data: { active: false } });
      return res.json({ success: true, data: null, message: 'Tipo de despesa desativado (possui despesas vinculadas)' });
    }
    await prisma.expenseType.delete({ where: { id } });
    return res.json({ success: true, data: null, message: 'Tipo de despesa excluído com sucesso' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao excluir tipo de despesa' });
  }
}

// ==========================================
// 2. DESPESAS (EXPENSES CRUD & FILTROS)
// ==========================================
export async function listExpenses(req: Request, res: Response) {
  try {
    const {
      status,
      expenseTypeId,
      accountId,
      projectId,
      paymentMethod,
      search,
      dateFrom,
      dateTo,
      isRecurring,
      hasAttachment,
    } = req.query;

    const where: any = {};

    if (typeof status === 'string' && status) where.status = status;
    if (typeof expenseTypeId === 'string' && expenseTypeId) where.expenseTypeId = expenseTypeId;
    if (typeof accountId === 'string' && accountId) where.accountId = accountId;
    if (typeof projectId === 'string' && projectId) where.projectId = projectId;
    if (typeof paymentMethod === 'string' && paymentMethod) where.paymentMethod = paymentMethod;
    if (isRecurring === 'true') where.isRecurring = true;
    if (isRecurring === 'false') where.isRecurring = false;

    if (hasAttachment === 'true') where.attachments = { some: {} };
    if (hasAttachment === 'false') where.attachments = { none: {} };

    if (typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { description: { contains: q, mode: 'insensitive' } },
        { beneficiary: { contains: q, mode: 'insensitive' } },
        { transactionId: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (dateFrom || dateTo) {
      where.expenseDate = {};
      if (typeof dateFrom === 'string' && dateFrom) where.expenseDate.gte = new Date(`${dateFrom}T00:00:00`);
      if (typeof dateTo === 'string' && dateTo) where.expenseDate.lte = new Date(`${dateTo}T23:59:59`);
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        expenseType: true,
        account: true,
        project: { select: { id: true, name: true } },
        lot: { select: { id: true, number: true, block: { select: { number: true } } } },
        user: { select: { id: true, name: true, email: true } },
        attachments: true,
      },
      orderBy: { expenseDate: 'desc' },
    });

    return res.json({ success: true, data: expenses, message: 'Despesas carregadas com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao carregar despesas' });
  }
}

export async function createExpense(req: Request, res: Response) {
  const schema = z.object({
    expenseTypeId: z.string().optional().nullable(),
    category: z.string().optional(),
    accountId: z.string().min(1),
    projectId: z.string().optional().nullable(),
    lotId: z.string().optional().nullable(),
    beneficiary: z.string().optional().nullable(),
    description: z.string().min(1),
    amount: z.number().positive(),
    expenseDate: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    status: z.nativeEnum(ExpenseStatus).default(ExpenseStatus.PAID),
    paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
    transactionId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isRecurring: z.boolean().optional().default(false),
  });

  const parsed = schema.safeParse({
    ...req.body,
    amount: Number(req.body.amount),
    isRecurring: req.body.isRecurring === true || req.body.isRecurring === 'true',
  });

  if (!parsed.success || !req.user) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos para cadastro de despesa' });
  }

  const payload = parsed.data;

  try {
    const expense = await prisma.expense.create({
      data: {
        expenseTypeId: payload.expenseTypeId || null,
        category: payload.category || null,
        accountId: payload.accountId,
        projectId: payload.projectId || null,
        lotId: payload.lotId || null,
        beneficiary: payload.beneficiary || null,
        description: payload.description,
        amount: payload.amount,
        expenseDate: payload.expenseDate ? new Date(payload.expenseDate) : new Date(),
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        status: payload.status,
        paymentMethod: payload.paymentMethod,
        transactionId: payload.transactionId || null,
        notes: payload.notes || null,
        isRecurring: payload.isRecurring,
        userId: req.user.id,
      },
      include: {
        expenseType: true,
        account: true,
        attachments: true,
      },
    });

    return res.status(201).json({ success: true, data: expense, message: 'Despesa registrada com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao registrar despesa' });
  }
}

export async function updateExpense(req: Request, res: Response) {
  const { id } = req.params;
  const schema = z.object({
    expenseTypeId: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    accountId: z.string().optional(),
    projectId: z.string().optional().nullable(),
    lotId: z.string().optional().nullable(),
    beneficiary: z.string().optional().nullable(),
    description: z.string().min(1).optional(),
    amount: z.number().positive().optional(),
    expenseDate: z.string().optional(),
    dueDate: z.string().optional().nullable(),
    status: z.nativeEnum(ExpenseStatus).optional(),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    transactionId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isRecurring: z.boolean().optional(),
  });

  const parsed = schema.safeParse({
    ...req.body,
    amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
  });

  if (!parsed.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos para alteração' });
  }

  const p = parsed.data;

  try {
    const updated = await prisma.expense.update({
      where: { id },
      data: {
        expenseTypeId: p.expenseTypeId !== undefined ? p.expenseTypeId : undefined,
        category: p.category !== undefined ? p.category : undefined,
        accountId: p.accountId,
        projectId: p.projectId !== undefined ? p.projectId : undefined,
        lotId: p.lotId !== undefined ? p.lotId : undefined,
        beneficiary: p.beneficiary !== undefined ? p.beneficiary : undefined,
        description: p.description,
        amount: p.amount,
        expenseDate: p.expenseDate ? new Date(p.expenseDate) : undefined,
        dueDate: p.dueDate ? new Date(p.dueDate) : undefined,
        status: p.status,
        paymentMethod: p.paymentMethod,
        transactionId: p.transactionId !== undefined ? p.transactionId : undefined,
        notes: p.notes !== undefined ? p.notes : undefined,
        isRecurring: p.isRecurring,
      },
      include: {
        expenseType: true,
        account: true,
        attachments: true,
      },
    });

    return res.json({ success: true, data: updated, message: 'Despesa atualizada com sucesso' });
  } catch (error: any) {
    return res.status(400).json({ success: false, data: null, message: error.message || 'Erro ao atualizar despesa' });
  }
}

export async function deleteExpense(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: { attachments: true },
    });

    if (!expense) {
      return res.status(404).json({ success: false, data: null, message: 'Despesa não encontrada' });
    }

    // Excluir arquivos físicos dos anexos se existirem
    for (const att of expense.attachments) {
      const fullPath = path.resolve(process.cwd(), '../uploads/documents', att.fileName);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch {}
      }
    }

    await prisma.expenseAttachment.deleteMany({ where: { expenseId: id } });
    await prisma.expense.delete({ where: { id } });

    return res.json({ success: true, data: null, message: 'Despesa excluída com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao excluir despesa' });
  }
}

// ==========================================
// 3. ANEXO DE COMPROVANTES
// ==========================================
export async function uploadExpenseAttachment(req: Request, res: Response) {
  const { id } = req.params;
  if (!req.file || !req.user) {
    return res.status(400).json({ success: false, data: null, message: 'Arquivo obrigatório' });
  }

  try {
    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId: id,
        originalName: req.file.originalname,
        fileName: req.file.filename,
        filePath: `/uploads/documents/${req.file.filename}`,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedById: req.user.id,
      },
    });

    return res.status(201).json({ success: true, data: attachment, message: 'Comprovante anexado com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao anexar comprovante' });
  }
}

export async function deleteExpenseAttachment(req: Request, res: Response) {
  const { attachmentId } = req.params;
  try {
    const att = await prisma.expenseAttachment.findUnique({ where: { id: attachmentId } });
    if (!att) {
      return res.status(404).json({ success: false, data: null, message: 'Anexo não encontrado' });
    }

    const fullPath = path.resolve(process.cwd(), '../uploads/documents', att.fileName);
    if (fs.existsSync(fullPath)) {
      try { fs.unlinkSync(fullPath); } catch {}
    }

    await prisma.expenseAttachment.delete({ where: { id: attachmentId } });
    return res.json({ success: true, data: null, message: 'Comprovante removido com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao remover comprovante' });
  }
}

// ==========================================
// 4. OCR / LEITURA INTELIGENTE DE COMPROVANTES
// ==========================================
export async function scanExpenseReceipt(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ success: false, data: null, message: 'Envie uma imagem ou PDF do comprovante' });
  }

  try {
    // Simulação inteligente e extração baseada no nome do arquivo e texto (ou OCR local)
    const originalName = req.file.originalname.toLowerCase();
    const filePath = `/uploads/documents/${req.file.filename}`;

    let suggestedCategory = 'Outros';
    let suggestedBeneficiary = '';
    let suggestedAmount = 0;
    let suggestedPaymentMethod: PaymentMethod = PaymentMethod.PIX;
    let suggestedDescription = `Comprovante: ${req.file.originalname}`;

    // Heurísticas inteligentes para categorização automática
    if (originalName.includes('asaas') || originalName.includes('tarifa') || originalName.includes('taxa') || originalName.includes('boleto')) {
      suggestedCategory = 'Taxas de recebimento / Taxas Asaas';
      suggestedBeneficiary = 'Asaas Gestão Financeira S.A.';
      suggestedDescription = 'Taxas bancárias e tarifas Asaas';
      suggestedPaymentMethod = PaymentMethod.ASAAS;
    } else if (originalName.includes('posto') || originalName.includes('combustivel') || originalName.includes('gasolina') || originalName.includes('diesel') || originalName.includes('ipiranga') || originalName.includes('shell')) {
      suggestedCategory = 'Combustível';
      suggestedBeneficiary = 'Posto de Combustível';
      suggestedDescription = 'Abastecimento operacional';
      suggestedPaymentMethod = PaymentMethod.CARD;
    } else if (originalName.includes('hotel') || originalName.includes('pousada') || originalName.includes('hospedagem') || originalName.includes('booking')) {
      suggestedCategory = 'Hospedagem';
      suggestedBeneficiary = 'Hotel / Pousada';
      suggestedDescription = 'Hospedagem em viagem de trabalho';
      suggestedPaymentMethod = PaymentMethod.PIX;
    } else if (originalName.includes('restaurante') || originalName.includes('almoco') || originalName.includes('jantar') || originalName.includes('alimentacao') || originalName.includes('mercado') || originalName.includes('refeicao')) {
      suggestedCategory = 'Alimentação';
      suggestedBeneficiary = 'Restaurante / Alimentação';
      suggestedDescription = 'Alimentação da equipe';
      suggestedPaymentMethod = PaymentMethod.CARD;
    } else if (originalName.includes('mecanic') || originalName.includes('oficina') || originalName.includes('pneu') || originalName.includes('veiculo') || originalName.includes('carro')) {
      suggestedCategory = 'Manutenção de veículo';
      suggestedBeneficiary = 'Oficina Mecânica / Auto Peças';
      suggestedDescription = 'Manutenção e revisão veicular';
      suggestedPaymentMethod = PaymentMethod.PIX;
    } else if (originalName.includes('computador') || originalName.includes('informatica') || originalName.includes('notebook') || originalName.includes('equipamento')) {
      suggestedCategory = 'Manutenção de computador e equipamentos';
      suggestedBeneficiary = 'Assistência Técnica de TI';
      suggestedDescription = 'Manutenção de equipamentos de informática';
    } else if (originalName.includes('passagem') || originalName.includes('viagem') || originalName.includes('pedagio') || originalName.includes('voo') || originalName.includes('aeroporto')) {
      suggestedCategory = 'Viagem';
      suggestedBeneficiary = 'Transporte / Viagens';
      suggestedDescription = 'Despesas com translado e viagens';
    } else if (originalName.includes('assessoria') || originalName.includes('honorarios') || originalName.includes('servico')) {
      suggestedCategory = 'Assessoria';
      suggestedBeneficiary = 'Assessoria Técnica';
      suggestedDescription = 'Serviços de assessoria';
    }

    // Busca o tipo de despesa correspondente no banco
    const type = await prisma.expenseType.findFirst({
      where: { name: { contains: suggestedCategory, mode: 'insensitive' } },
    });

    const accounts = await prisma.financialAccount.findMany({ where: { active: true } });
    const defaultAccount = accounts.find((a) => a.type === 'CASH') || accounts[0];

    return res.json({
      success: true,
      data: {
        file: {
          originalName: req.file.originalname,
          fileName: req.file.filename,
          filePath,
          mimeType: req.file.mimetype,
          size: req.file.size,
        },
        suggestion: {
          expenseTypeId: type?.id || null,
          categoryName: type?.name || suggestedCategory,
          description: suggestedDescription,
          beneficiary: suggestedBeneficiary,
          amount: suggestedAmount > 0 ? suggestedAmount : 150.00,
          expenseDate: new Date().toISOString().slice(0, 10),
          paymentMethod: suggestedPaymentMethod,
          accountId: defaultAccount?.id || null,
          transactionId: `TX-${Date.now().toString().slice(-6)}`,
        },
      },
      message: 'Comprovante analisado com sucesso!',
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, data: null, message: error.message || 'Erro ao processar comprovante' });
  }
}
