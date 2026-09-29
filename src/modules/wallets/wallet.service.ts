import type { Wallet } from '@prisma/client';
import { notFound } from '../../core/errors/app-error';
import { calculateWalletBalance } from '../../shared/wallet-balance';
import type { WalletRepository } from './wallet.repository';
import type { WalletInput } from './wallet.schemas';

export type WalletWithBalance = Wallet & { balance: number };

/** Nghiệp vụ ví: số dư không lưu trong bảng mà luôn tính từ giao dịch, xóa ví là lưu trữ để giữ lịch sử. */
export class WalletService {
  constructor(private readonly wallets: WalletRepository) {}

  async list(userId: string, includeArchived: boolean): Promise<WalletWithBalance[]> {
    const rows = await this.wallets.list(userId, includeArchived);
    return this.withBalances(userId, rows);
  }

  async get(userId: string, id: string): Promise<WalletWithBalance> {
    const [wallet] = await this.withBalances(userId, [await this.requireOwned(userId, id)]);
    return wallet!;
  }

  async create(userId: string, input: WalletInput): Promise<WalletWithBalance> {
    const wallet = await this.wallets.create(userId, input);
    return { ...wallet, balance: Number(wallet.openingBalance) };
  }

  async update(userId: string, id: string, input: Partial<WalletInput>): Promise<WalletWithBalance> {
    await this.requireOwned(userId, id);
    const [wallet] = await this.withBalances(userId, [await this.wallets.update(id, input)]);
    return wallet!;
  }

  async archive(userId: string, id: string) {
    await this.requireOwned(userId, id);
    await this.wallets.update(id, { archivedAt: new Date() });
  }

  async restore(userId: string, id: string) {
    await this.requireOwned(userId, id);
    return this.wallets.update(id, { archivedAt: null });
  }

  private async requireOwned(userId: string, id: string) {
    const wallet = await this.wallets.findOwned(userId, id);
    if (!wallet) throw notFound('Ví');
    return wallet;
  }

  /** Tính số dư cho nhiều ví bằng một truy vấn giao dịch (thay vì mỗi ví một truy vấn). */
  private async withBalances(userId: string, wallets: Wallet[]): Promise<WalletWithBalance[]> {
    if (!wallets.length) return [];
    const movements = await this.wallets.balanceMovements(
      userId,
      wallets.map((wallet) => wallet.id)
    );
    return wallets.map((wallet) => ({
      ...wallet,
      balance: calculateWalletBalance(wallet.id, Number(wallet.openingBalance), movements)
    }));
  }
}
