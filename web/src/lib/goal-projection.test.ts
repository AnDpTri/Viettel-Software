import { describe, expect, it } from 'vitest';
import { projectGoalCompletion } from './goal-projection';

describe('goal-projection', () => {
  const now = new Date(2026, 9, 21); // 21/10/2026

  it('báo chưa đủ dữ liệu khi không có khoản đóng góp nào', () => {
    const res = projectGoalCompletion({
      targetAmount: 50_000_000,
      currentAmount: 10_000_000,
      contributions: [],
      now
    });
    expect(res).toBe('Chưa đủ dữ liệu để dự kiến');
  });

  it('dự kiến ngày đạt chính xác dựa trên tốc độ đóng góp 3 tháng qua', () => {
    // Đích: 20tr, Hiện tại: 5tr => Còn thiếu 15tr.
    // 3 tháng qua góp 3 lần, mỗi lần 1.5tr (tháng 8, 9, 10). Tổng = 4.5tr.
    // Bình quân = 4.5 / 3 = 1.5tr/tháng.
    // Cần 15 / 1.5 = 10 tháng.
    // Tháng 10/2026 + 10 tháng => Tháng 8/2027.
    const contributions = [
      { amount: 1_500_000, createdAt: new Date(2026, 9, 15) },
      { amount: 1_500_000, createdAt: new Date(2026, 8, 15) },
      { amount: 1_500_000, createdAt: new Date(2026, 7, 25) }
    ];

    const res = projectGoalCompletion({
      targetAmount: 20_000_000,
      currentAmount: 5_000_000,
      contributions,
      now
    });

    expect(res).toBe('Dự kiến đạt vào tháng 8/2027 theo tốc độ góp 3 tháng qua');
  });

  it('trường hợp ví dụ trong đặc tả (đạt vào tháng 3/2027)', () => {
    // Còn thiếu: 10tr.
    // 3 tháng qua góp 6tr => bình quân 2tr/tháng.
    // Cần 10 / 2 = 5 tháng.
    // 10/2026 + 5 tháng => Tháng 3/2027.
    const contributions = [
      { amount: 2_000_000, createdAt: new Date(2026, 9, 10) },
      { amount: 2_000_000, createdAt: new Date(2026, 8, 10) },
      { amount: 2_000_000, createdAt: new Date(2026, 7, 28) }
    ];

    const res = projectGoalCompletion({
      targetAmount: 30_000_000,
      currentAmount: 20_000_000,
      contributions,
      now
    });

    expect(res).toBe('Dự kiến đạt vào tháng 3/2027 theo tốc độ góp 3 tháng qua');
  });

  it('đã hoàn thành nếu số tiền hiện tại bằng hoặc lớn hơn đích', () => {
    const res = projectGoalCompletion({
      targetAmount: 10_000_000,
      currentAmount: 10_000_000,
      contributions: [],
      now
    });
    expect(res).toBe('Đã hoàn thành mục tiêu');
  });

  it('bỏ qua các đóng góp quá 90 ngày', () => {
    const contributions = [
      { amount: 10_000_000, createdAt: new Date(2026, 5, 1) } // 4 tháng trước
    ];
    const res = projectGoalCompletion({
      targetAmount: 20_000_000,
      currentAmount: 10_000_000,
      contributions,
      now
    });
    expect(res).toBe('Chưa đủ dữ liệu để dự kiến');
  });
});
