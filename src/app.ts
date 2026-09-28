import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { config } from './config';
import './lib/zod-vi';
import { success } from './lib/response';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiter, requestLogger } from './middleware/request-observability';
import { authRouter } from './routes/auth.routes';
import { budgetRouter } from './routes/budget.routes';
import { categoryRouter } from './routes/category.routes';
import { goalRouter } from './routes/goal.routes';
import { insightRouter } from './routes/insight.routes';
import { productivityRouter } from './routes/productivity.routes';
import { profileRouter } from './routes/profile.routes';
import { reportRouter } from './routes/report.routes';
import { transactionRouter } from './routes/transaction.routes';
import { walletRouter } from './routes/wallet.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'], imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"]
  } } }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((item) => item.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(express.static(path.resolve(process.cwd(), 'public')));
  app.get('/reset-password', (_req, res) => res.sendFile(path.resolve(process.cwd(), 'public', 'index.html')));

  app.get('/health', (_req, res) => success(res, { status: 'UP', timestamp: new Date().toISOString() }));
  const specification = YAML.load(path.resolve(process.cwd(), 'openapi.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specification, { customSiteTitle: 'Sổ thu chi API' }));

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.use('/auth', createRateLimiter({ windowMs: 15 * 60_000, max: 100, keyPrefix: 'auth', key: (req) => `${req.path}:${req.ip}:${String(req.body?.identifier ?? '').toLowerCase().slice(0, 100)}` }), authRouter);
  api.use('/profile', profileRouter);
  api.use('/wallets', walletRouter);
  api.use('/categories', categoryRouter);
  api.use('/transactions', transactionRouter);
  api.use('/budgets', budgetRouter);
  api.use('/goals', goalRouter);
  api.use('/reports', reportRouter);
  api.use('/productivity', productivityRouter);
  api.use('/insights', insightRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
