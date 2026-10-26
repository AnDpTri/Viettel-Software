import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './core/config/env';
import { buildOpenApiDocument } from './docs/openapi';
import './core/i18n/zod-vi';
import { success } from './core/http/response';
import { errorHandler, notFoundHandler } from './core/errors/error-handler';
import { createRateLimiter, requestLogger } from './core/observability/http';
import { createContainer } from './container';
import { createApiMounts } from './routes';
import { prisma } from './core/database/prisma';

const WEB_ROOT = path.resolve(process.cwd(), 'web', 'dist');

export function createApp(
  container = createContainer(),
  readinessCheck: () => Promise<unknown> = () => prisma.$queryRaw`SELECT 1`
) {
  const apiMounts = createApiMounts(container);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Giao diện chỉ còn module JS do Vite build, không có script nội tuyến.
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"]
        }
      }
    })
  );
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((item) => item.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  // Giao diện do Vite build vào web/dist (`npm run build:web`); tệp có hash trong tên nên được cache lâu dài.
  app.use('/assets', express.static(path.join(WEB_ROOT, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(WEB_ROOT));
  app.get('/reset-password', (_req, res) => res.sendFile(path.join(WEB_ROOT, 'index.html')));

  app.get('/health', (_req, res) => success(res, { status: 'UP', timestamp: new Date().toISOString() }));
  // Liveness không phụ thuộc DB; readiness dùng cho load balancer/cloud probe.
  app.get('/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        readinessCheck(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('readiness timeout')), 2000);
          timer.unref();
        })
      ]);
      return success(res, { status: 'READY' });
    } catch {
      return res.status(503).json({
        success: false,
        error: { code: 'NOT_READY', message: 'Dịch vụ chưa sẵn sàng, vui lòng thử lại sau.' }
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  });
  // Tài liệu sinh từ route và schema Zod thật lúc khởi động, không còn tệp YAML viết tay.
  const specification = buildOpenApiDocument(apiMounts);
  app.get('/api-docs.json', (_req, res) => res.json(specification));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specification, { customSiteTitle: 'Sổ thu chi API' }));

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use(
    '/auth',
    createRateLimiter({
      windowMs: 15 * 60_000,
      max: 100,
      keyPrefix: 'auth',
      key: (req) =>
        `${req.path}:${req.ip}:${String(req.body?.identifier ?? req.body?.email ?? '')
          .toLowerCase()
          .slice(0, 100)}`
    })
  );
  for (const mount of apiMounts) api.use(mount.prefix, mount.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
