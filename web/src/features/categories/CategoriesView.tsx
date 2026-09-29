import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import { useCategories, useRefreshLedger } from '../../api/queries';
import type { Category } from '../../api/types';
import { useModal, useUi } from '../../app/ui-state';
import { Empty, PanelHead, SectionTitle, ViewSection } from '../../app/view';
import { Modal, ModalClose } from '../../ui/Modal';
import { errorMessage, useToast } from '../../ui/Toast';

type Mode = 'tree' | 'flat';

/** Danh mục theo thứ tự hiển thị: dạng cây (con nằm dưới cha, thụt lề theo cấp) hoặc danh sách theo tên. */
export function orderCategories(items: Category[], mode: Mode) {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'vi');
  if (mode === 'flat') return [...items].sort(byName).map((item) => ({ item, level: 0 }));
  const children = new Map<string, Category[]>();
  for (const item of items) {
    const key = item.parentId && items.some((parent) => parent.id === item.parentId) ? item.parentId : 'root';
    children.set(key, [...(children.get(key) ?? []), item]);
  }
  const output: Array<{ item: Category; level: number }> = [];
  const visit = (parentId: string, level: number) => {
    for (const item of [...(children.get(parentId) ?? [])].sort(byName)) {
      output.push({ item, level });
      visit(item.id, level + 1);
    }
  };
  visit('root', 0);
  return output;
}

export function CategoriesView() {
  const categories = useCategories().data ?? [];
  const { openModal } = useUi();
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const [mode, setMode] = useState<Mode>('tree');

  async function remove(category: Category) {
    if (!confirm(`Xóa danh mục “${category.name}”?`)) return;
    try {
      await api(`/categories/${category.id}`, { method: 'DELETE' });
      await refreshLedger();
      toast('Đã xóa danh mục.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  const column = (type: 'INCOME' | 'EXPENSE') => {
    const rows = orderCategories(
      categories.filter((item) => item.type === type),
      mode
    );
    const prefix = type === 'INCOME' ? 'income' : 'expense';
    return (
      <section className="panel">
        <PanelHead
          eyebrow={type === 'INCOME' ? 'DÒNG TIỀN VÀO' : 'DÒNG TIỀN RA'}
          title={type === 'INCOME' ? 'Danh mục thu' : 'Danh mục chi'}
          action={
            <span className="count-badge" id={`${prefix}-category-count`}>
              {rows.length}
            </span>
          }
        />
        <div id={`${prefix}-categories`} className="category-list">
          {rows.length ? (
            rows.map(({ item, level }) => {
              const parent = categories.find((category) => category.id === item.parentId);
              return (
                <article key={item.id} className="category-item" style={{ marginLeft: Math.min(level, 4) * 24 }}>
                  <span className="category-dot" style={{ background: item.color ?? undefined }} aria-hidden="true" />
                  <span className="category-icon" aria-hidden="true">
                    {item.icon || (item.type === 'INCOME' ? '↙' : '↗')}
                  </span>
                  <div className="category-info">
                    <strong>{item.name}</strong>
                    <small>{parent ? `Thuộc ${parent.name}` : 'Danh mục gốc'}</small>
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal('category', item)}>
                      Sửa
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => remove(item)}>
                      Xóa
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <Empty text={type === 'INCOME' ? 'Chưa có danh mục thu.' : 'Chưa có danh mục chi.'} />
          )}
        </div>
      </section>
    );
  };

  return (
    <ViewSection view="categories">
      <SectionTitle
        eyebrow="PHÂN LOẠI"
        title="Danh mục thu chi"
        actions={
          <>
            <div className="segmented" role="group" aria-label="Cách hiển thị">
              {(['tree', 'flat'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={mode === value ? 'active' : ''}
                  data-category-mode={value}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {value === 'tree' ? 'Dạng cây' : 'Danh sách'}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm"
              id="open-category"
              type="button"
              onClick={() => openModal('category', null)}
            >
              ＋ Thêm danh mục
            </button>
          </>
        }
      />
      <div className="category-columns">
        {column('INCOME')}
        {column('EXPENSE')}
      </div>
    </ViewSection>
  );
}

type CategoryForm = { name: string; type: 'INCOME' | 'EXPENSE'; parentId: string; icon: string; color: string };

const categoryForm = (category: Category | null): CategoryForm => ({
  name: category?.name ?? '',
  type: category?.type ?? 'EXPENSE',
  parentId: category?.parentId ?? '',
  icon: category?.icon ?? '',
  color: category?.color ?? '#23654f'
});

export function CategoryModal() {
  const { open, payload, seq, close } = useModal('category');
  const categories = useCategories().data ?? [];
  const toast = useToast();
  const refreshLedger = useRefreshLedger();
  const editing = payload ?? null;
  const [form, setForm] = useState(() => categoryForm(null));
  useEffect(() => {
    if (open) setForm(categoryForm(editing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nạp lại form mỗi lần mở
  }, [open, seq]);
  const parents = categories.filter((item) => item.type === form.type && item.id !== editing?.id);
  const bind = (name: keyof CategoryForm) => ({
    value: form[name],
    onChange: (event: { target: { value: string } }) => setForm({ ...form, [name]: event.target.value })
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api(editing ? `/categories/${editing.id}` : '/categories', {
        method: editing ? 'PATCH' : 'POST',
        body: {
          name: form.name,
          type: form.type,
          parentId: form.parentId || null,
          icon: form.icon || null,
          color: form.color || null
        }
      });
      close();
      await refreshLedger();
      toast(editing ? 'Đã cập nhật danh mục.' : 'Đã tạo danh mục mới.');
    } catch (error) {
      toast(errorMessage(error), true);
    }
  }

  return (
    <Modal
      id="category-modal"
      open={open}
      onClose={close}
      labelledBy="category-modal-title"
      initialFocus="#category-name"
    >
      <form id="category-form" className="modal-card" onSubmit={submit}>
        <ModalClose modalId="category-modal" label="Đóng cửa sổ danh mục" onClose={close} />
        <span className="eyebrow">PHÂN LOẠI GIAO DỊCH</span>
        <h2 id="category-modal-title">{editing ? 'Chỉnh sửa danh mục' : 'Thêm danh mục'}</h2>
        <label>
          Tên danh mục
          <input id="category-name" maxLength={100} placeholder="Ví dụ: Mua sắm" required {...bind('name')} />
        </label>
        <div className="form-row">
          <label>
            Loại
            <select
              id="category-type"
              required
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value as CategoryForm['type'], parentId: '' })}
            >
              <option value="EXPENSE">Khoản chi</option>
              <option value="INCOME">Khoản thu</option>
            </select>
          </label>
          <label>
            Danh mục cha
            <select id="category-parent" {...bind('parentId')}>
              <option value="">Không có</option>
              {parents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Biểu tượng
            <input id="category-icon" maxLength={50} placeholder="Ví dụ: 🛒" {...bind('icon')} />
          </label>
          <label>
            Màu sắc
            <input id="category-color" type="color" {...bind('color')} />
          </label>
        </div>
        <button className="btn btn-primary btn-block" type="submit">
          Lưu danh mục <span aria-hidden="true">→</span>
        </button>
      </form>
    </Modal>
  );
}
