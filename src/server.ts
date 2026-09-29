import { createServer } from 'node:http';
import { createApp } from './app';
import { config } from './core/config/env';
import { prisma } from './core/database/prisma';
import { logger } from './core/observability/logger';

const server = createServer(createApp());

server.listen(config.PORT, () => {
  logger.info(
    { event: 'server_started', port: config.PORT, url: config.APP_URL },
    `Sổ thu chi API đang chạy tại ${config.APP_URL} (OpenAPI: ${config.APP_URL}/api-docs)`
  );
});

async function shutdown(signal: string) {
  logger.info({ event: 'server_stopping', signal }, `Nhận ${signal}, đang dừng dịch vụ...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
