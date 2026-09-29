import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/** Test API chạy trên schema Postgres riêng (mặc định `vitest`), được tạo lại sạch rồi chạy migration thật mỗi lần chạy test. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
  ?? 'postgresql://finance:finance_secret@localhost:5432/personal_finance?schema=vitest';

export default async function setup() {
  const schema = new URL(TEST_DATABASE_URL).searchParams.get('schema');
  if (!schema || schema === 'public') throw new Error('TEST_DATABASE_URL phải trỏ tới một schema riêng cho test (?schema=vitest), không dùng public.');
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  try {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } catch (error) {
    throw new Error(`Không kết nối được PostgreSQL cho test (${new URL(TEST_DATABASE_URL).host}). Hãy chạy: docker compose up -d db\n${String(error)}`);
  } finally {
    await prisma.$disconnect();
  }
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } });
}
