import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Transaction } from '../api/types';
import { TransactionRow } from '../features/transactions/TransactionRow';
import { Modal, ModalClose } from './Modal';

function ModalHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    onClose();
  };
  return (
    <Modal id="demo-modal" open={open} onClose={close} labelledBy="demo-title">
      <form className="modal-card">
        <ModalClose modalId="demo-modal" label="Đóng" onClose={close} />
        <h2 id="demo-title">Tiêu đề</h2>
        <input aria-label="Tên" />
      </form>
    </Modal>
  );
}

describe('Modal', () => {
  it('đóng bằng phím Esc, luôn còn trong DOM với class hidden', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Tiêu đề' });
    expect(dialog.className).toBe('modal');
    expect(document.body.classList.contains('modal-open')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.getElementById('demo-modal')!.className).toBe('modal hidden');
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  it('đóng khi bấm ra nền, không đóng khi bấm vào nội dung', () => {
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);
    fireEvent.mouseDown(screen.getByRole('textbox', { name: 'Tên' }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

const transaction: Transaction = {
  id: 't1',
  type: 'EXPENSE',
  amount: '120000',
  walletId: 'w1',
  destinationWalletId: null,
  categoryId: 'c1',
  payee: null,
  status: 'CLEARED',
  paymentMethod: null,
  reference: null,
  location: null,
  note: 'Ăn trưa',
  occurredAt: '2026-09-28T05:00:00.000Z',
  wallet: { name: 'Tiền mặt', currency: 'VND' },
  destinationWallet: null,
  category: { name: 'Ăn uống' }
};

describe('TransactionRow', () => {
  it('hiện ghi chú, ví, danh mục và số tiền có dấu theo loại giao dịch', () => {
    render(<TransactionRow transaction={transaction} fallbackCurrency="VND" />);
    expect(screen.getByText('Ăn trưa')).toBeTruthy();
    expect(screen.getByText(/Tiền mặt · Ăn uống/)).toBeTruthy();
    expect(screen.getByText(/−\s*120\.000/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('có nút Sửa và Xóa khi truyền hành động', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(<TransactionRow transaction={transaction} fallbackCurrency="VND" onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(onEdit).toHaveBeenCalledWith(transaction);
    expect(onDelete).toHaveBeenCalledWith(transaction);
  });
});
