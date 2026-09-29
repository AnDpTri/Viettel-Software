import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ShowToast = (message: string, error?: boolean) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

/** Thông báo ngắn ở góc màn hình, tự ẩn sau 3,2 giây. Chỉ có một thông báo tại một thời điểm. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; error: boolean; visible: boolean }>({
    message: '',
    error: false,
    visible: false
  });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback<ShowToast>((message, error = false) => {
    clearTimeout(timer.current);
    setToast({ message, error, visible: true });
    timer.current = setTimeout(() => setToast((current) => ({ ...current, visible: false })), 3200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      <div
        id="toast"
        className={`toast${toast.visible ? ' show' : ''}${toast.error ? ' error' : ''}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast.message}
      </div>
      {children}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Thông điệp của lỗi bất kỳ để hiện cho người dùng. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Đã có lỗi xảy ra, vui lòng thử lại.';
