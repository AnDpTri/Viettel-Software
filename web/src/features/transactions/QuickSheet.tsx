import { useModal, useUi } from '../../app/ui-state';
import { Modal, ModalClose } from '../../ui/Modal';
import { QuickEntry } from './QuickEntry';

/** Bảng trượt từ đáy (điện thoại): ô ghi nhanh một dòng, kèm lối sang biểu mẫu đầy đủ. Mở bằng nút + ở giữa thanh tab. */
export function QuickSheet() {
  const { open, close } = useModal('quick');
  const { openModal } = useUi();
  return (
    <Modal
      id="quick-modal"
      className="sheet"
      open={open}
      onClose={close}
      labelledBy="quick-modal-title"
      initialFocus="#quick-sheet-input"
    >
      <div className="modal-card sheet-card">
        <ModalClose modalId="quick-modal" label="Đóng ghi nhanh" onClose={close} />
        <h2 id="quick-modal-title">Ghi nhanh</h2>
        {open && <QuickEntry inputId="quick-sheet-input" onDone={close} />}
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          id="quick-open-full"
          onClick={() => {
            close();
            openModal('transaction', null);
          }}
        >
          Nhập chi tiết đầy đủ
        </button>
      </div>
    </Modal>
  );
}
