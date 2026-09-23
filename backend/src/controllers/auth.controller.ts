import { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { jwtSecret } from '../utils/security';

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
  if (!process.env.DATABASE_URL) return res.status(503).json({ success: false, data: null, message: 'Banco de dados não configurado.' });

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, data: null, message: 'Credenciais incorretas' });
  }

  const secret = jwtSecret();
  const expiresIn = (process.env.JWT_EXPIRES_IN || '30d') as jwt.SignOptions['expiresIn'];
  const refreshExpiresIn = (process.env.JWT_REFRESH_EXPIRES_IN || '60d') as jwt.SignOptions['expiresIn'];

  const token = jwt.sign({ userId: user.id, role: user.role, email: user.email, userVersion: user.updatedAt.toISOString() }, secret, { expiresIn });
  const refreshToken = jwt.sign({ userId: user.id }, secret, { expiresIn: refreshExpiresIn });

  return res.json({
    success: true,
    data: { token, refreshToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    message: 'Login realizado com sucesso',
  });
}
