import { useMemo } from 'react';
import { useCategories } from '../api/queries';
import type { Category } from '../api/types';
import { categoryTone } from '../lib/category-tone';

interface Props {
  name: string;
  /** Màu người dùng đặt cho danh mục (nếu có); được ánh xạ về tông gần nhất. */
  color?: string | null;
  /** Khóa ổn định (id, hoặc tên khi không có id) để chọn tông khi chưa có màu. */
  seed?: string;
}

/** Viên danh mục: nền và chữ cùng tông dịu, không icon. Chỉ dùng để gắn tên danh mục (không dùng làm trang trí). */
export function CategoryChip({ name, color, seed }: Props) {
  const tone = categoryTone(color, seed || name);
  return (
    <span className="category-chip" style={{ background: `var(--cat-${tone})`, color: `var(--cat-${tone}-ink)` }}>
      {name}
    </span>
  );
}

/** Tra màu người dùng đặt theo id hoặc theo tên danh mục (báo cáo chỉ có tên). */
export function useCategoryColors() {
  const { data } = useCategories();
  return useMemo(() => {
    const byId = new Map<string, Category>();
    const byName = new Map<string, Category>();
    for (const category of data ?? []) {
      byId.set(category.id, category);
      if (!byName.has(category.name)) byName.set(category.name, category);
    }
    return {
      colorOf: (id: string | null | undefined, name?: string) =>
        (id ? byId.get(id) : name ? byName.get(name) : undefined)?.color ?? null,
      idOf: (name: string) => byName.get(name)?.id
    };
  }, [data]);
}
