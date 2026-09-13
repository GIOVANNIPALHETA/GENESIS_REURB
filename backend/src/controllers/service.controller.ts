import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';

const serviceSchema = z.object({
  personId: z.string().min(1),
  projectId: z.string().min(1),
  lotId: z.string().min(1),
  serviceDate: z.string().datetime().optional(),
  description: z.string().min(1),
  pendingActions: z.string().optional(),
  nextContactDate: z.string().datetime().optional(),
});

export async function listServices(req: Request, res: Response) {
  const services = await prisma.serviceRecord.findMany({
    include: {
      person: { select: { id: true, fullName: true, cpf: true } },
      project: { select: { id: true, name: true } },
      lot: { select: { id: true, number: true, block: { select: { number: true } } } },
      user: { select: { name: true } },
    },
    orderBy: { serviceDate: 'desc' },
  });
  return res.json({ success: true, data: services, message: 'Atendimentos carregados' });
}

export async function createService(req: Request, res: Response) {
  const result = serviceSchema.safeParse(req.body);
  if (!result.success || !req.user) return res.status(400).json({ success: false, data: null, message: 'Dados do atendimento inválidos' });
  const service = await prisma.serviceRecord.create({
    data: { ...result.data, userId: req.user.id, serviceDate: result.data.serviceDate ? new Date(result.data.serviceDate) : new Date(), nextContactDate: result.data.nextContactDate ? new Date(result.data.nextContactDate) : null },
    include: { person: true, project: true, lot: { include: { block: true } }, user: { select: { name: true } } },
  });
  return res.status(201).json({ success: true, data: service, message: 'Atendimento registrado' });
}