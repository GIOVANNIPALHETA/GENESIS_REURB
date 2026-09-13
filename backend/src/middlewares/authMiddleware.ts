import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  role: string;
  email: string;
  iat: number;
  exp: number;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, data: null, message: 'Token não informado' });
  }

  try {
    const secret: any = process.env.JWT_SECRET || 'secret';
    const decoded = (jwt as any).verify(token, secret) as TokenPayload;
    req.user = { id: decoded.userId, role: decoded.role, email: decoded.email };
    return next();
  } catch {
    return res.status(401).json({ success: false, data: null, message: 'Token inválido' });
  }
}

export function authorize(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ success: false, data: null, message: 'Acesso negado' });
    }
    return next();
  };
}
