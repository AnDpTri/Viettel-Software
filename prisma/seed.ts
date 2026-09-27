import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('Demo@123', 12);
  const user = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo', email: 'demo@example.com', fullName: 'Tài khoản Demo', passwordHash,
      wallets: { create: [{ name: 'Tiền mặt', type: 'CASH', openingBalance: 2_000_000 }, { name: 'Tài khoản ngân hàng', type: 'BANK', openingBalance: 10_000_000 }] },
      categories: { create: [{ name: 'Lương', type: 'INCOME', color: '#16A34A' }, { name: 'Ăn uống', type: 'EXPENSE', color: '#F97316' }, { name: 'Di chuyển', type: 'EXPENSE', color: '#3B82F6' }] }
    }
  });
  console.info(`Đã sẵn sàng tài khoản demo: ${user.username}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
