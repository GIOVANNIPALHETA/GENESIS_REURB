import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { createContractDocument } from '../services/contractDocument.service';
import { notifyContractSigned } from '../services/whatsappNotification.service';

const contractSchema = z.object({
  contractNumber: z.string().min(1),
  personId: z.string().min(1),
  lotId: z.string().min(1),
  projectId: z.string().min(1),
  totalValue: z.number().positive(),
  downPayment: z.number().nonnegative(),
  installmentCount: z.number().int().positive().max(120),
  entryDate: z.string().datetime().optional(),
  firstDueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export async function listContracts(req: Request, res: Response) {
  const contracts = await prisma.contract.findMany({
    include: {
      person: { select: { id: true, fullName: true, cpf: true, phone: true, maritalStatus: true } },
      lot: { select: { id: true, number: true, address: true, block: { select: { number: true } } } },
      project: { select: { id: true, name: true, neighborhood: true, city: true, state: true } },
      negotiations: {
        include: {
          installments: {
            include: { payments: { include: { account: true } } },
            orderBy: { installmentNumber: 'asc' },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return res.json({ success: true, data: contracts, message: 'Contratos carregados' });
}

export async function createContract(req: Request, res: Response) {
  const result = contractSchema.safeParse({
    ...req.body,
    totalValue: Number(req.body.totalValue),
    downPayment: Number(req.body.downPayment),
    installmentCount: Number(req.body.installmentCount),
    entryDate: req.body.entryDate,
  });
  if (!result.success || result.data.downPayment > result.data.totalValue) {
    return res.status(400).json({ success: false, data: null, message: 'Dados financeiros inválidos' });
  }

  const payload = result.data;
  const contract = await prisma.$transaction(async (tx) => {
    const created = await tx.contract.create({
      data: {
        contractNumber: payload.contractNumber,
        personId: payload.personId,
        lotId: payload.lotId,
        projectId: payload.projectId,
        totalValue: payload.totalValue,
        notes: payload.notes,
        status: 'ACTIVE',
      },
    });
    const financedAmount = payload.totalValue - payload.downPayment;
    const installmentAmount = Number((financedAmount / payload.installmentCount).toFixed(2));
    const entryDate = payload.entryDate ? new Date(payload.entryDate) : new Date();
    const firstDueDate = payload.firstDueDate ? new Date(payload.firstDueDate) : new Date(entryDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const installments = Array.from({ length: payload.installmentCount }, (_, index) => ({
      negotiationId: '',
      installmentNumber: index + 1,
      description: `Parcela ${index + 1}/${payload.installmentCount}`,
      amount: index === payload.installmentCount - 1 ? Number((financedAmount - installmentAmount * (payload.installmentCount - 1)).toFixed(2)) : installmentAmount,
      dueDate: new Date(firstDueDate.getTime() + index * 30 * 24 * 60 * 60 * 1000),
    }));
    const negotiation = await tx.negotiation.create({
      data: {
        contractId: created.id,
        totalValue: payload.totalValue,
        downPayment: payload.downPayment,
        financedAmount,
        installmentCount: payload.installmentCount,
        firstDueDate,
        installments: { create: [
          ...(payload.downPayment > 0 ? [{ installmentNumber: 0, description: 'Entrada', amount: payload.downPayment, dueDate: entryDate }] : []),
          ...installments.map(({ negotiationId, ...installment }) => installment),
        ] },
      },
      include: { installments: true },
    });
    return { ...created, negotiations: [negotiation] };
  });
  return res.status(201).json({ success: true, data: contract, message: 'Termo de adesão cadastrado' });
}

export async function updateContractStatus(req: Request, res: Response) {
  const result = z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SIGNED', 'CANCELED']) }).safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Status inválido' });
  try {
    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        status: result.data.status,
        signed: result.data.status === 'SIGNED',
        signedAt: result.data.status === 'SIGNED' ? new Date() : null,
      },
      include: {
        person: { select: { fullName: true } },
        lot: { include: { block: true, project: true } },
      },
    });

    // Notify WhatsApp Admin
    try {
      notifyContractSigned({
        contractNumber: contract.contractNumber,
        personName: contract.person?.fullName,
        projectName: contract.lot?.project?.name,
        blockNumber: contract.lot?.block?.number,
        lotNumber: contract.lot?.number,
        status: contract.status === 'SIGNED' ? 'Assinado' : contract.status,
      });
    } catch {}

    return res.json({ success: true, data: contract, message: 'Status do contrato atualizado' });
  } catch {
    return res.status(404).json({ success: false, data: null, message: 'Contrato não encontrado' });
  }
}

export async function downloadContractDocument(req: Request, res: Response) {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: {
        person: { select: { fullName: true, cpf: true, phone: true, maritalStatus: true, spouse: { select: { fullName: true, cpf: true } } } },
        project: { select: { name: true } },
        lot: { select: { number: true, block: { select: { number: true } } } }
      },
    });
    if (!contract) return res.status(404).json({ success: false, data: null, message: 'Contrato não encontrado' });
    const document = createContractDocument({
      sector: contract.project.name,
      name: contract.person.fullName,
      cpf: contract.person.cpf || '',
      phone: contract.person.phone || '',
      maritalStatus: contract.person.maritalStatus || 'Não informado',
      spouseName: contract.person.spouse?.fullName || '',
      spouseCpf: contract.person.spouse?.cpf || '',
      blockNumber: contract.lot?.block?.number || '',
      lotNumber: contract.lot?.number || ''
    });
    const fileName = `contrato-${contract.contractNumber.replace(/[^a-z0-9_-]/gi, '-')}.docx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(document);
  } catch (error) {
    return res.status(500).json({ success: false, data: null, message: error instanceof Error ? error.message : 'Não foi possível gerar o contrato' });
  }
}

export async function deleteContract(req: Request, res: Response) {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.id },
      include: { negotiations: { include: { installments: { include: { payments: true } } } } },
    });

    if (!contract) return res.status(404).json({ success: false, data: null, message: 'Contrato não encontrado' });

    await prisma.$transaction(async (tx) => {
      for (const neg of contract.negotiations) {
        for (const inst of neg.installments) {
          await tx.payment.deleteMany({ where: { installmentId: inst.id } });
        }
        await tx.installment.deleteMany({ where: { negotiationId: neg.id } });
      }
      await tx.negotiation.deleteMany({ where: { contractId: contract.id } });
      await tx.contractChain.deleteMany({ where: { contractId: contract.id } });
      await tx.contract.delete({ where: { id: contract.id } });
    });

    return res.json({ success: true, data: null, message: 'Contrato excluído com sucesso' });
  } catch (error) {
    return res.status(500).json({ success: false, data: null, message: 'Não foi possível excluir o contrato' });
  }
}