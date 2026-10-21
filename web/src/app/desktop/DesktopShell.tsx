import { Sidebar } from '../shell-parts';
import { useUi } from '../ui-state';

/**
 * Phần khung của giao diện máy tính: thanh bên 232px (từ 761 tới 1100px thu thành thanh ngang trên cùng).
 * Chỉ chứa khung điều hướng; nội dung các màn do AppShell đặt một chỗ cố định nên không bị dựng lại khi đổi vỏ.
 */
export function DesktopShell() {
  const { sidebarOpen, setSidebarOpen, openModal } = useUi();
  return (
    <>
      <Sidebar phone={false} />
      <div
        id="sidebar-backdrop"
        className={`sidebar-backdrop${sidebarOpen ? ' show' : ''}`}
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />
      {/* Nút ghi nhanh thật nằm trong thanh tab của điện thoại; ở máy tính giữ id (ẩn) cho test và hướng dẫn cũ. */}
      <button
        id="mobile-add-transaction"
        className="mobile-fab"
        type="button"
        hidden
        aria-label="Ghi giao dịch mới"
        onClick={() => openModal('transaction', null)}
      >
        +
      </button>
    </>
  );
}
