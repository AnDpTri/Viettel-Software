import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { config } from './config';
import { success } from './lib/response';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiter, requestLogger } from './middleware/request-observability';
import { authRouter } from './routes/auth.routes';
import { budgetRouter } from './routes/budget.routes';
import { categoryRouter } from './routes/category.routes';
import { goalRouter } from './routes/goal.routes';
import { profileRouter } from './routes/profile.routes';
import { reportRouter } from './routes/report.routes';
import { transactionRouter } from './routes/transaction.routes';
import { walletRouter } from './routes/wallet.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((item) => item.trim()), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/health', (_req, res) => success(res, { status: 'UP', timestamp: new Date().toISOString() }));
  const specification = YAML.load(path.resolve(process.cwd(), 'openapi.yaml'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specification, { customSiteTitle: 'Sổ thu chi API' }));

  const api = express.Router();
  api.use('/auth', createRateLimiter({ windowMs: 15 * 60_000, max: 100, keyPrefix: 'auth' }), authRouter);
  api.use('/profile', profileRouter);
  api.use('/wallets', walletRouter);
  api.use('/categories', categoryRouter);
  api.use('/transactions', transactionRouter);
  api.use('/budgets', budgetRouter);
  api.use('/goals', goalRouter);
  api.use('/reports', reportRouter);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
