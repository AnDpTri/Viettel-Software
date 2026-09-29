import { randomUUID } from 'node:crypto';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../config/env';
import { AppError } from '../errors/app-error';
import { logger } from './logger';

/* v8 ignore start -- detailed local diagnostics are verified by Docker integration */
function featureFromPath(path: string) {
  const area = path.split('?')[0]!.split('/').filter(Boolean)[2] ?? 'web';
  const names: Record<string, string> = {
    auth: 'xác thực',
    profile: 'hồ sơ',
    wallets: 'ví',
    categories: 'danh mục',
    transactions: 'giao dịch',
    budgets: 'ngân sách',
    goals: 'mục tiêu',
    reports: 'báo cáo',
    productivity: 'tiện ích',
    insights: 'trợ lý thông minh'
  };
  return names[area] ?? area;
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = req.header('x-request-id')?.slice(0, 100) || randomUUID();
  const startedAt = performance.now();
  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  res.on('finish', () => {
    logger.info(
      {
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        userId: req.user?.id ?? null,
        username: req.user?.username ?? null,
        ...(config.LOG_HTTP_DETAILS
          ? {
              feature: featureFromPath(req.originalUrl),
              bodyFields: req.body && typeof req.body === 'object' ? Object.keys(req.body).sort() : [],
              queryFields: Object.keys(req.query).sort(),
              contentType: req.get('content-type')?.split(';')[0] ?? null,
              errorCode: res.locals.errorCode ?? null
            }
          : {})
      },
      'http_request'
    );
  });
  next();
}
/* v8 ignore stop */

type Counter = { count: number; resetsAt: number };

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  key?: (req: Request) => string;
}): RequestHandler {
  const counters = new Map<string, Counter>();
  return (req, res, next) => {
    const now = Date.now();
    if (counters.size > 10_000)
      for (const [storedKey, value] of counters) if (value.resetsAt <= now) counters.delete(storedKey);
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
