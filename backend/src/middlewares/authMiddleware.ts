import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../prisma/client';
import { jwtSecret } from '../utils/security';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const match = /^Bearer (\S+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ success: false, data: null, message: 'Token não informado' });
  let decoded: jwt.JwtPayload;
  try {
    const payload = jwt.verify(match[1], jwtSecret(), { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.userId !== 'string' || typeof payload.role !== 'string') throw new Error('Invalid token');
    decoded = payload;
  } catch {
    return res.status(401).json({ success: false, data: null, message: 'Token inválido' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, role: true, email: true, active: true, updatedAt: true } });
    if (!user?.active || (decoded.userVersion && decoded.userVersion !== user.updatedAt.toISOString())) {
      return res.status(401).json({ success: false, data: null, message: 'Sessão encerrada. Entre novamente.' });
    }
    req.user = { id: user.id, role: user.role, email: user.email };
    return next();
  } catch (error) { return next(error); }
}

export function authorize(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ success: false, data: null, message: 'Seu perfil não permite esta operação.' });
    return next();
  };
}
