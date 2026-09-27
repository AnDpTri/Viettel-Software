import { createServer } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { prisma } from './lib/prisma';

const server = createServer(createApp());

server.listen(config.PORT, () => {
  console.info(`Sổ thu chi API đang chạy tại ${config.APP_URL}`);
  console.info(`OpenAPI: ${config.APP_URL}/api-docs`);
});

async function shutdown(signal: string) {
  console.info(`Nhận ${signal}, đang dừng dịch vụ...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
