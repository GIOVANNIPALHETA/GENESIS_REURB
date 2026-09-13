import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';
  return res.status(status).json({ success: false, data: null, message });
}
