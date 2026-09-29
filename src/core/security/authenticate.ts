import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { verifyAccessToken } from './tokens';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập.'));
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== 'access') throw new Error('Sai loại token');
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Access token không hợp lệ hoặc đã hết hạn.'));
  }
}
