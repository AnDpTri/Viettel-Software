import { $, $$ } from './dom';

let lastFocusedElement: HTMLElement | null = null;

/** Mở hộp thoại, khóa cuộn nền và đưa focus vào phần tử đầu tiên phù hợp. */
export function openNamedModal(id: string, focusSelector = 'input:not([type="hidden"]),select,button') {
  lastFocusedElement = document.activeElement as HTMLElement | null;
  const modal = $(`#${id}`);
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => modal.querySelector(focusSelector)?.focus());
}

/** Đóng hộp thoại và trả focus về phần tử đã mở nó. */
export function closeNamedModal(id: string) {
  $(`#${id}`).classList.add('hidden');
  document.body.classList.toggle('modal-open', Boolean($('.modal:not(.hidden)')));
  if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
}

const BACKDROP_CLOSABLE = [
  'wallet-modal',
  'wallet-detail-modal',
  'category-modal',
  'budget-modal',
  'goal-modal',
  'contribution-modal',
  'profile-modal',
  'forgot-password-modal',
  'register-modal',
  'reset-password-modal'
];

/** Nút đóng, bấm nền để đóng, Esc để đóng và giữ phím Tab trong hộp thoại đang mở. */
export function setupModals(closeSidebar: () => void) {
  $$('[data-close-modal]').forEach((button) =>
    button.addEventListener('click', () => closeNamedModal(button.dataset.closeModal))
  );
  BACKDROP_CLOSABLE.forEach((id) =>
    $(`#${id}`).addEventListener('click', (event: MouseEvent) => {
      if (event.target === event.currentTarget) closeNamedModal(id);
    })
  );
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    const modal = $('.modal:not(.hidden)');
    if (event.key === 'Escape') {
      if (modal) {
        closeNamedModal(modal.id);
        return;
      }
      if ($('.sidebar.open')) closeSidebar();
    }
    if (event.key !== 'Tab' || !modal) return;
    const focusable = [
      ...modal.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )
    ].filter((item) => item.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0],
      last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
