import { storageGet, storageSet } from '../../lib/storage';

export interface TourStep {
  /** Một hoặc nhiều selector; lấy phần tử đầu tiên đang hiển thị (ví dụ nút trên desktop hoặc trên mobile). */
  target: string | string[];
  title: string;
  text: string;
}

/** Hướng dẫn tại chỗ: vòng chính giới thiệu các khu vực, và vòng ngắn tự hiện ở lần đầu mở một số màn hình. */
export const TOURS: Record<string, TourStep[]> = {
  main: [
    {
      target: ['#open-transaction', '#mobile-add-transaction'],
      title: 'Ghi một khoản thu chi',
      text: 'Tiêu gì, nhận gì thì bấm đây. Chỉ cần số tiền và nhóm, chừng 5 giây.'
    },
    {
      target: '.nav-item[data-view="dashboard"]',
      title: 'Tổng quan',
      text: 'Tiền đang có và thu chi tháng này. Tab Báo cáo nằm ngay trong đây.'
    },
    {
      target: '.nav-item[data-view="transactions"]',
      title: 'Giao dịch',
      text: 'Xem lại, tìm, sửa hoặc xuất CSV mọi khoản đã ghi.'
    },
    {
      target: '.nav-item[data-view="budgets"]',
      title: 'Kế hoạch',
      text: 'Hạn mức chi tiêu, mục tiêu tiết kiệm, khoản định kỳ và hóa đơn: những thứ giúp bạn chủ động.'
    },
    {
      target: '.nav-item[data-view="insights"]',
      title: 'Trợ lý',
      text: 'Gõ tự nhiên như “ăn trưa 45k” là Trợ lý ghi giúp. Mọi thay đổi đều hỏi bạn trước.'
    },
    {
      target: '.nav-item[data-view="wallets"]',
      title: 'Thiết lập',
      text: 'Ví và danh mục: tạo một lần, ít khi phải sửa lại.'
    },
    {
      target: '#open-profile',
      title: 'Hồ sơ và cài đặt',
      text: 'Đổi tên, bảo mật, làm lại thiết lập. Xem lại hướng dẫn này ở “Hướng dẫn nhanh” cuối menu.'
    }
  ],
  transactions: [
    {
      target: '#transaction-keyword-filter',
      title: 'Tìm nhanh',
      text: 'Gõ từ khóa rồi Enter. Lọc theo ví, danh mục, ngày thì mở “Lọc thêm”.'
    },
    { target: '#export-csv', title: 'Xuất CSV', text: 'Tải danh sách đang hiển thị về máy, mở được bằng Excel.' }
  ],
  reports: [
    { target: '#report-presets', title: 'Chọn kỳ báo cáo', text: 'Bấm một kỳ hoặc đổi ngày, số liệu tự tính lại.' },
    {
      target: '#reconciliation-list',
      title: 'Đối soát số dư',
      text: 'Số dư từng ví theo sổ. Nếu khác số tiền thật, kiểm tra lại các giao dịch của ví đó.'
    },
    { target: '.report-export', title: 'Tải về', text: 'Xuất bảng tổng hợp hoặc đối soát dạng CSV.' }
  ],
  budgets: [
    {
      target: '#hub-tabs',
      title: 'Các phần của Kế hoạch',
      text: 'Ngân sách, Mục tiêu, Định kỳ, Hóa đơn… chuyển qua lại ở đây.'
    },
    {
      target: '#open-budget',
      title: 'Đặt hạn mức',
      text: 'Ví dụ: Ăn uống 3 triệu mỗi tháng. Thanh tiến độ cho biết còn được tiêu bao nhiêu.'
    }
  ],
  goals: [
    {
      target: '#open-goal',
      title: 'Tạo mục tiêu tiết kiệm',
      text: 'Đặt số tiền cần có và chọn một ví tiết kiệm; mỗi lần góp sẽ chuyển tiền thật vào ví đó.'
    }
  ],
  planning: [
    {
      target: '#run-recurring',
      title: 'Ghi các khoản đến hạn',
      text: 'Bấm để ghi ngay những khoản định kỳ đã tới ngày.'
    }
  ],
  insights: [
    {
      target: '#assistant-question',
      title: 'Nói chuyện với Trợ lý',
      text: 'Hỏi “tháng này tôi tiêu bao nhiêu?” hoặc nhờ “ghi 50k cà phê”. Trợ lý luôn cho xem trước để bạn xác nhận.'
    }
  ]
};

export const tourStorageKey = (userId: string) => `somoc_tours_${userId}`;

export function seenTours(userId: string): string[] {
  try {
    const value = JSON.parse(storageGet(tourStorageKey(userId)) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function markTourSeen(userId: string, id: string) {
  storageSet(tourStorageKey(userId), JSON.stringify([...new Set([...seenTours(userId), id])]));
}

/** Kiểm thử tự động tắt hướng dẫn tự bật để lớp phủ không che các nút cần bấm. */
export const autoToursDisabled = () => storageGet('somoc_tours_off') === '1';

/** Phần tử đích đầu tiên đang hiển thị của một bước. */
export function tourTarget(step: TourStep) {
  for (const selector of ([] as string[]).concat(step.target)) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && element.getClientRects().length) return element;
  }
  return null;
}
