import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'button:not([disabled]),a[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Hộp thoại đang mở theo thứ tự; phím Esc và giữ Tab chỉ áp dụng cho hộp trên cùng. */
const openStack: string[] = [];

interface ModalProps {
  id: string;
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  /** Phần tử nhận focus khi mở (mặc định: ô nhập hoặc nút đầu tiên). */
  initialFocus?: string;
  children: ReactNode;
}

/** Khung hộp thoại: luôn có trong DOM (ẩn bằng class `hidden`) để giữ trạng thái form và cho kiểm thử tìm thấy;
 * bấm nền hoặc Esc để đóng, focus được giữ trong hộp và trả lại phần tử đã mở nó. */
export function Modal({ id, open, onClose, labelledBy, initialFocus, children }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    openStack.push(id);
    document.body.classList.add('modal-open');
    const frame = requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>(initialFocus ?? 'input:not([type="hidden"]),select,button')?.focus()
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (openStack.at(-1) !== id || !ref.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (item) => item.offsetParent !== null
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
      openStack.splice(openStack.lastIndexOf(id), 1);
      if (!openStack.length) document.body.classList.remove('modal-open');
      if (opener?.isConnected) opener.focus();
    };
  }, [open, id, initialFocus]);

  return (
    <div
      ref={ref}
      id={id}
      className={`modal${open ? '' : ' hidden'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-hidden={!open}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

export function ModalClose({ modalId, label, onClose }: { modalId: string; label: string; onClose: () => void }) {
  return (
    <button type="button" className="modal-close" data-close-modal={modalId} aria-label={label} onClick={onClose}>
      ×
    </button>
  );
}
