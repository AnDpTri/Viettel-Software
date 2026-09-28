import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [action, rawUsernames, rawExpiry] = process.argv.slice(2);
  if (!['grant', 'revoke'].includes(action ?? '') || !rawUsernames) {
    throw new Error('Cách dùng: npm run vip:grant -- user1,user2 [YYYY-MM-DD|never] hoặc npm run vip:revoke -- user1,user2');
  }
  const usernames = [...new Set(rawUsernames.split(',').map((item) => item.trim()).filter(Boolean))];
  if (!usernames.length) throw new Error('Cần ít nhất một username.');
  const users = await prisma.user.findMany({ where: { username: { in: usernames }, deletedAt: null }, select: { username: true } });
  const found = new Set(users.map((item) => item.username));
  const missing = usernames.filter((username) => !found.has(username));
  if (missing.length) throw new Error(`Không tìm thấy tài khoản: ${missing.join(', ')}`);
  if (action === 'revoke') {
    await prisma.user.updateMany({ where: { username: { in: usernames } }, data: { accountTier: 'FREE', vipExpiresAt: null } });
    console.info(`Đã thu hồi VIP: ${usernames.join(', ')}`);
    return;
  }
  let vipExpiresAt: Date | null = null;
  if (rawExpiry && rawExpiry.toLowerCase() !== 'never') {
    vipExpiresAt = new Date(`${rawExpiry}T23:59:59.999Z`);
    if (Number.isNaN(vipExpiresAt.getTime()) || vipExpiresAt <= new Date()) throw new Error('Ngày hết hạn VIP phải hợp lệ và nằm trong tương lai.');
  }
  await prisma.user.updateMany({ where: { username: { in: usernames } }, data: { accountTier: 'VIP', vipExpiresAt } });
  console.info(`Đã cấp VIP cho ${usernames.join(', ')}${vipExpiresAt ? ` đến ${vipExpiresAt.toISOString()}` : ' vĩnh viễn'}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
