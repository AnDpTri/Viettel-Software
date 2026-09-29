/* eslint-disable @typescript-eslint/no-explicit-any -- dữ liệu API và phần tử DOM chưa được gán kiểu chi tiết. */
import { $ } from '../core/dom';
import { state } from '../core/state';
import { storageGet, storageSet } from '../core/storage';
import { setSidebar } from './navigation';

// Hướng dẫn tại chỗ kiểu trò chơi: làm tối màn hình, chỉ sáng đúng nút cần biết, kèm một câu giải thích.
export const TOURS = {
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
let tour: { id: string; index: number } | null = null;
let tourTimer: ReturnType<typeof setTimeout> | undefined;
export function tourStorageKey() {
  return `somoc_tours_${state.user?.id || 'guest'}`;
}
export function seenTours() {
  try {
    return JSON.parse(storageGet(tourStorageKey()) || '[]');
  } catch {
    return [];
  }
}
export function markTourSeen(id) {
  storageSet(tourStorageKey(), JSON.stringify([...new Set([...seenTours(), id])]));
}
// Kiểm thử tự động tắt hướng dẫn tự bật để lớp phủ không che các nút cần bấm.
export function autoToursDisabled() {
  return storageGet('somoc_tours_off') === '1';
}
export function tourTarget(step) {
  for (const selector of ([] as string[]).concat(step.target)) {
    const element = $(selector);
    if (element && element.getClientRects().length) return element;
  }
  return null;
}
export function startTour(id, force = false) {
  if (!TOURS[id] || (!force && seenTours().includes(id))) return;
  tour = { id, index: 0 };
  $('#coach').classList.remove('hidden');
  $('#coach').setAttribute('aria-hidden', 'false');
  showTourStep();
}
export function endTour() {
  if (!tour) return;
  markTourSeen(tour.id);
  tour = null;
  $('#coach').classList.add('hidden');
  $('#coach').setAttribute('aria-hidden', 'true');
  if (matchMedia('(max-width:950px)').matches) setSidebar(false);
}
export function showTourStep() {
  if (!tour) return;
  const steps = TOURS[tour.id];
  const step = steps[tour.index];
  if (!step) {
    endTour();
    return;
  }
  const inSidebar = ([] as string[]).concat(step.target).some((selector) => selector.startsWith('.nav-item'));
  const mobile = matchMedia('(max-width:950px)').matches;
  if (mobile) setSidebar(inSidebar);
  setTimeout(
    () => {
      if (!tour) return;
      const element = tourTarget(step);
      if (!element) {
        tour.index += 1;
        if (tour.index >= steps.length) endTour();
        else showTourStep();
        return;
      }
      if (!element.closest('.sidebar,.topbar')) element.scrollIntoView({ block: 'center' });
      $('#coach-count').textContent = `${tour.index + 1}/${steps.length}`;
      $('#coach-title').textContent = step.title;
      $('#coach-text').textContent = step.text;
      $('#coach-next').textContent = tour.index === steps.length - 1 ? 'Xong' : 'Tiếp';
      $('#coach-skip').classList.toggle('invisible', tour.index === steps.length - 1);
      positionCoach();
      $('#coach-next').focus();
    },
    mobile ? 280 : 0
  );
}
export function positionCoach() {
  if (!tour) return;
  const element = tourTarget(TOURS[tour.id][tour.index]);
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const pad = 6;
  const spot = $('.coach-spot');
  const bubble = $('.coach-bubble');
  Object.assign(spot.style, {
    left: `${rect.left - pad}px`,
    top: `${rect.top - pad}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`
  });
  const width = Math.min(320, innerWidth - 24);
  bubble.style.width = `${width}px`;
  const height = bubble.offsetHeight;
  const below = rect.bottom + pad + 14 + height <= innerHeight;
  const beside = rect.right + pad + 14 + width <= innerWidth && rect.left < innerWidth / 3;
  let left = beside ? rect.right + pad + 14 : rect.left + rect.width / 2 - width / 2;
  let top = beside
    ? rect.top + rect.height / 2 - height / 2
    : below
      ? rect.bottom + pad + 14
      : rect.top - pad - 14 - height;
  left = Math.max(12, Math.min(left, innerWidth - width - 12));
  top = Math.max(12, Math.min(top, innerHeight - height - 12));
  Object.assign(bubble.style, { left: `${left}px`, top: `${top}px` });
}
export function scheduleViewTour(view) {
  clearTimeout(tourTimer);
  if (
    !TOURS[view] ||
    view === 'main' ||
    autoToursDisabled() ||
    !state.onboarding?.welcomeSeen ||
    seenTours().includes(view)
  )
    return;
  tourTimer = setTimeout(() => {
    if (!tour && state.currentView === view && !$('.modal:not(.hidden)')) startTour(view);
  }, 700);
}

/** Nút của lớp hướng dẫn, Esc để thoát, bám vị trí khi cuộn hoặc đổi cỡ màn hình. */
export function setupTours() {
  $('#coach-next').addEventListener('click', () => {
    if (!tour) return;
    tour.index += 1;
    if (tour.index >= TOURS[tour.id].length) endTour();
    else showTourStep();
  });
  $('#coach-skip').addEventListener('click', endTour);
  document.addEventListener('keydown', (event: any) => {
    if (event.key === 'Escape' && tour) endTour();
  });
  window.addEventListener('resize', positionCoach);
  window.addEventListener('scroll', positionCoach, true);
  $('#open-help').addEventListener('click', () => {
    setSidebar(false);
    startTour('main', true);
  });
}
