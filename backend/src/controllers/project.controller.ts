import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';

export async function listProjects(req: Request, res: Response) {
  const projects = await prisma.project.findMany({
    include: {
      blocks: { select: { id: true } },
      lots: { select: { id: true } },
      contracts: { select: { id: true, totalValue: true, negotiations: { select: { installments: { select: { amount: true, paidAmount: true, payments: { select: { amount: true } } } } } } } },
    },
  });
  const data = projects.map(({ blocks, lots, contracts, ...project }) => {
    const installments = contracts.flatMap((contract) => contract.negotiations.flatMap((negotiation) => negotiation.installments));
    const contracted = contracts.reduce((sum, contract) => sum + contract.totalValue, 0);
    const received = installments.reduce((sum, installment) => sum + installment.paidAmount, 0);
    const open = installments.reduce((sum, installment) => sum + installment.amount - installment.paidAmount, 0);
    return { ...project, blocks, lots, contracts, financial: { contracted, received, open } };
  });
  return res.json({ success: true, data, message: 'Projetos carregados' });
}

export async function listProjectBlocks(req: Request, res: Response) {
  const { id } = req.params;
  const blocks = await prisma.block.findMany({ where: { projectId: id }, select: { id: true, number: true } });
  return res.json({ success: true, data: blocks, message: 'Quadras carregadas' });
}

const projectSchema = z.object({
  name: z.string().min(1),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['PLANNING', 'IN_PROGRESS', 'COMPLETED', 'SUSPENDED']).optional(),
  active: z.boolean().optional(),
  plannedBlocks: z.number().int().min(0).optional(),
  plannedLots: z.number().int().min(0).optional(),
});

export async function createProject(req: Request, res: Response) {
  const result = projectSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });

  const payload = result.data;
  const project = await prisma.project.create({ data: { ...payload } });
  return res.status(201).json({ success: true, data: project, message: 'Projeto criado' });
}

export async function updateProject(req: Request, res: Response) {
  const { id } = req.params;
  const result = projectSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });

  try {
    const project = await prisma.project.update({ where: { id }, data: result.data });
    return res.json({ success: true, data: project, message: 'Projeto atualizado' });
  } catch (err) {
    return res.status(404).json({ success: false, data: null, message: 'Projeto não encontrado' });
  }
}

export async function deleteProject(req: Request, res: Response) {
  const { id } = req.params;
  try {
    await prisma.project.delete({ where: { id } });
    return res.json({ success: true, data: null, message: 'Projeto excluído' });
  } catch (err) {
    return res.status(404).json({ success: false, data: null, message: 'Projeto não encontrado' });
  }
}
