export type BalanceTransaction = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  amount: number | string | { toString(): string };
  walletId: string;
  destinationWalletId?: string | null;
};

export function calculateWalletBalance(
  walletId: string,
  openingBalance: number,
  transactions: BalanceTransaction[]
): number {
  return transactions.reduce((balance, transaction) => {
    const amount = Number(transaction.amount);
    if (transaction.type === 'INCOME' && transaction.walletId === walletId) return balance + amount;
    if (transaction.type === 'EXPENSE' && transaction.walletId === walletId) return balance - amount;
    if (transaction.type === 'TRANSFER') {
      if (transaction.walletId === walletId) balance -= amount;
      if (transaction.destinationWalletId === walletId) balance += amount;
    }
    return balance;
  }, openingBalance);
}
