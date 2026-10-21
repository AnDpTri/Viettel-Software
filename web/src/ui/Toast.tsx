import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

type ShowToast = (message: string, error?: boolean, action?: ToastAction) => void;

/** Thông báo có nút hoàn tác ở lại 5 giây; thông báo thường 3,2 giây. */
const UNDO_MS = 5000;

const ToastContext = createContext<ShowToast>(() => undefined);

/** Thông báo ngắn ở góc màn hình, tự ẩn sau 3,2 giây. Chỉ có một thông báo tại một thời điểm. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; error: boolean; visible: boolean; action?: ToastAction }>({
    message: '',
    error: false,
    visible: false
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback<ShowToast>((message, error = false, action) => {
    clearTimeout(timer.current);
    setToast({ message, error, visible: true, action });
    timer.current = setTimeout(() => setToast((current) => ({ ...current, visible: false })), action ? UNDO_MS : 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <div
        id="toast"
        className={`toast${toast.visible ? ' show' : ''}${toast.error ? ' error' : ''}${toast.action ? ' has-action' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span>{toast.message}</span>
        {toast.action && toast.visible && (
          <button
            type="button"
            className="toast-action"
            onClick={() => {
              const { onClick } = toast.action!;
              clearTimeout(timer.current);
              setToast((current) => ({ ...current, visible: false }));
              onClick();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      {children}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Thông điệp của lỗi bất kỳ để hiện cho người dùng. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Đã có lỗi xảy ra, vui lòng thử lại.';
