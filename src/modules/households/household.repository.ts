import type { PrismaClient } from '@prisma/client';

export class HouseholdRepository {
  constructor(private readonly db: PrismaClient) {}

  listForMember(userId: string) {
    return this.db.household.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, username: true, fullName: true } } } },
        wallets: true
      }
    });
  }

  createWithOwner(ownerId: string, name: string, inviteCode: string) {
    return this.db.household.create({
      data: { name, ownerId, inviteCode, members: { create: { userId: ownerId, role: 'OWNER' } } },
      include: { members: true }
    });
  }

  findByInvite(inviteCode: string) {
    return this.db.household.findUnique({ where: { inviteCode } });
  }

  addMember(householdId: string, userId: string) {
    return this.db.householdMember.upsert({
      where: { householdId_userId: { householdId, userId } },
      create: { householdId, userId },
      update: {}
    });
  }
}
