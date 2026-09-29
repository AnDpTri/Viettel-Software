import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Tài khoản dùng thử cho người đánh giá: `demo` / `Demo@123`, hạng VIP để thử cả Trợ lý AI.
 * Chạy lại an toàn: lần đầu tạo kèm ví và danh mục mẫu; các lần sau đưa tài khoản về trạng thái dùng được
 * (đúng mật khẩu, VIP, chưa bị xóa) mà không đụng dữ liệu tài chính người dùng đã nhập. */
async function main() {
  const passwordHash = await bcrypt.hash('Demo@123', 12);
  const account = { passwordHash, accountTier: 'VIP' as const, vipExpiresAt: null, deletedAt: null, email: 'demo@example.com', fullName: 'Tài khoản Demo' };
  const user = await prisma.user.upsert({
    where: { username: 'demo' },
    update: account,
    create: {
      username: 'demo', ...account,
      wallets: { create: [{ name: 'Tiền mặt', type: 'CASH', openingBalance: 2_000_000 }, { name: 'Tài khoản ngân hàng', type: 'BANK', openingBalance: 10_000_000 }] },
      categories: { create: [{ name: 'Lương', type: 'INCOME', color: '#16A34A' }, { name: 'Ăn uống', type: 'EXPENSE', color: '#F97316' }, { name: 'Di chuyển', type: 'EXPENSE', color: '#3B82F6' }] }
    }
  });
  console.info(`Đã sẵn sàng tài khoản demo: ${user.username} (${user.accountTier})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
