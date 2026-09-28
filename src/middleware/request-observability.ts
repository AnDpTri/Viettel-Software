import { randomUUID } from 'node:crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header('x-request-id')?.slice(0, 100) || randomUUID();
  const startedAt = performance.now();
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test') return;
    console.info(JSON.stringify({
      level: 'info', event: 'http_request', requestId, method: req.method, path: req.originalUrl,
      statusCode: res.statusCode, durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      userId: req.user?.id ?? null
    }));
  });
  next();
}

type Counter = { count: number; resetsAt: number };

export function createRateLimiter(options: { windowMs: number; max: number; keyPrefix?: string; key?: (req: Request) => string }): RequestHandler {
  const counters = new Map<string, Counter>();
  return (req, res, next) => {
    const now = Date.now();
    if (counters.size > 10_000) for (const [storedKey, value] of counters) if (value.resetsAt <= now) counters.delete(storedKey);
    const key = `${options.keyPrefix ?? 'global'}:${options.key?.(req) ?? req.ip}`;
    let counter = counters.get(key);
    if (!counter || counter.resetsAt <= now) {
      counter = { count: 0, resetsAt: now + options.windowMs };
      counters.set(key, counter);
    }
    counter.count += 1;
    const remaining = Math.max(0, options.max - counter.count);
    res.setHeader('x-ratelimit-limit', options.max);
    res.setHeader('x-ratelimit-remaining', remaining);
    res.setHeader('x-ratelimit-reset', Math.ceil(counter.resetsAt / 1000));
    if (counter.count > options.max) {
      res.setHeader('retry-after', Math.ceil((counter.resetsAt - now) / 1000));
      return next(new AppError(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau.'));
    }
    next();
  };
}
