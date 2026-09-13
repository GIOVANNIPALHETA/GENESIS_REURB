import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

const userSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'GESTOR', 'ATENDENTE', 'FINANCEIRO', 'DOCUMENTAL', 'JURIDICO', 'CONSULTA']),
  active: z.boolean().optional(),
});

const userSelect = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

export async function getUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({ select: userSelect, orderBy: { name: 'asc' } });
  return res.json({ success: true, data: users, message: 'Usuários listados com sucesso' });
}

export async function createUser(req: Request, res: Response) {
  const result = userSchema.required({ password: true }).safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Nome, e-mail, senha e perfil são obrigatórios.' });
  try {
    const { password, ...data } = result.data;
    const user = await prisma.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 12) }, select: userSelect });
    return res.status(201).json({ success: true, data: user, message: 'Usuário criado com sucesso' });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, data: null, message: 'Este e-mail já está cadastrado.' });
    throw error;
  }
}

export async function updateUser(req: Request, res: Response) {
  const result = userSchema.partial().safeParse(req.body);
  if (!result.success) return res.status(400).json({ success: false, data: null, message: 'Dados inválidos.' });
  try {
    const { password, ...data } = result.data;
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { ...data, ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}) }, select: userSelect });
    return res.json({ success: true, data: user, message: 'Usuário atualizado com sucesso' });
  } catch (error: any) {
    if (error?.code === 'P2002') return res.status(409).json({ success: false, data: null, message: 'Este e-mail já está cadastrado.' });
    if (error?.code === 'P2025') return res.status(404).json({ success: false, data: null, message: 'Usuário não encontrado.' });
    throw error;
  }
}

export async function deleteUser(req: Request, res: Response) {
  if (req.user?.id === req.params.id) return res.status(400).json({ success: false, data: null, message: 'Não é possível excluir o próprio usuário.' });
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null, message: 'Usuário excluído com sucesso' });
  } catch (error: any) {
    if (error?.code === 'P2025') return res.status(404).json({ success: false, data: null, message: 'Usuário não encontrado.' });
    throw error;
  }
}
