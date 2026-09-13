import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';

const blockSchema = z.object({
  projectId: z.string().min(1),
  number: z.string().trim().min(1),
  description: z.string().optional(),
  active: z.boolean().optional(),
});

const bulkBlockSchema = z.object({
  projectId: z.string().min(1),
  quantity: z.number().int().min(1).max(500),
  startNumber: z.number().int().min(0).default(1),
});

export async function listBlocks(req: Request, res: Response) {
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const blocks = await prisma.block.findMany({
    where: { projectId },
    include: { project: { select: { id: true, name: true } }, _count: { select: { lots: true } } },
    orderBy: [{ project: { name: 'asc' } }, { number: 'asc' }],
  });
  return res.json({ success: true, data: blocks, message: 'Quadras carregadas' });
}

export async function createBlock(req: Request, res: Response) {
  const result = blockSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  try {
    const block = await prisma.block.create({ data: result.data });
    return res.status(201).json({ success: true, data: block, message: 'Quadra criada' });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, data: null, message: 'Já existe uma quadra com essa identificação neste projeto.' });
    throw error;
  }
}

export async function updateBlock(req: Request, res: Response) {
  const result = blockSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  try {
    const block = await prisma.block.update({ where: { id: req.params.id }, data: result.data });
    return res.json({ success: true, data: block, message: 'Quadra atualizada' });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, data: null, message: 'Já existe uma quadra com essa identificação neste projeto.' });
    return res.status(404).json({ success: false, data: null, message: 'Quadra não encontrada' });
  }
}

export async function deleteBlock(req: Request, res: Response) {
  const block = await prisma.block.findUnique({ where: { id: req.params.id }, include: { _count: { select: { lots: true } } } });
  if (!block) return res.status(404).json({ success: false, data: null, message: 'Quadra não encontrada' });
  if (block._count.lots > 0) return res.status(409).json({ success: false, data: null, message: 'Não é possível excluir esta quadra enquanto houver lotes vinculados. Remova ou transfira os lotes antes.' });
  await prisma.block.delete({ where: { id: req.params.id } });
  return res.json({ success: true, data: null, message: 'Quadra excluída' });
}

export async function createBlocksBulk(req: Request, res: Response) {
  const result = bulkBlockSchema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Informe uma quantidade válida de quadras.' });
  const { projectId, quantity, startNumber } = result.data;
  try {
    const blocks = Array.from({ length: quantity }, (_, index) => ({ projectId, number: String(startNumber + index), active: true }));
    await prisma.block.createMany({ data: blocks });
    return res.status(201).json({ success: true, data: { created: quantity }, message: `${quantity} quadra(s) criada(s)` });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, data: null, message: 'Uma ou mais identificações já existem neste projeto.' });
    throw error;
  }
}