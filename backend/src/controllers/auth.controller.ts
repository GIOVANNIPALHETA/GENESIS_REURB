import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function login(req: Request, res: Response) {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ success: false, data: null, message: 'Dados inválidos' });
  }

  const { email, password } = result.data;
  // If DATABASE_URL is not set (dev without DB), return a mocked admin user/token
  if (!process.env.DATABASE_URL) {
    if (email !== 'admin@genesisreurb.com.br' || password !== 'Genesis@123') {
      return res.status(401).json({ success: false, data: null, message: 'Credenciais incorretas (mock)' });
    }
    const mockUser = { id: 'mock-admin', name: 'Administrador', email, role: 'ADMIN' } as any;
    const secret: any = process.env.JWT_SECRET || 'secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    const token = jwt.sign({ userId: mockUser.id, role: mockUser.role, email: mockUser.email }, secret, { expiresIn });
    const refreshToken = jwt.sign({ userId: mockUser.id }, secret, { expiresIn: refreshExpiresIn });
    return res.json({
      success: true,
      data: { token, refreshToken, user: { id: mockUser.id, name: mockUser.name, email: mockUser.email, role: mockUser.role } },
      message: 'Login mock realizado com sucesso',
    });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, data: null, message: 'Credenciais incorretas' });
  }

  const secret: any = process.env.JWT_SECRET || 'secret';
  const expiresIn = process.env.JWT_EXPIRES_IN || '30d';
  const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '60d';

  const token = jwt.sign({ userId: user.id, role: user.role, email: user.email }, secret, { expiresIn });
  const refreshToken = jwt.sign({ userId: user.id }, secret, { expiresIn: refreshExpiresIn });

  return res.json({
    success: true,
    data: { token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    message: 'Login realizado com sucesso',
  });
}
