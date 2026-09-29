import { describe, expect, it } from 'vitest';
import { buildCategoryTree, wouldCreateCycle } from '../src/shared/category-tree';

const categories = [
  { id: 'food', parentId: null, name: 'Ăn uống' },
  { id: 'lunch', parentId: 'food', name: 'Ăn trưa' },
  { id: 'office', parentId: 'lunch', name: 'Cơm văn phòng' }
];

describe('category-tree', () => {
  it('dựng cây đúng quan hệ cha con', () => {
    const tree = buildCategoryTree(categories);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe('lunch');
    expect((tree[0]?.children[0] as (typeof categories)[0] & { children: typeof categories })?.children[0]?.id).toBe(
      'office'
    );
  });

  it('đưa bản ghi mất cha về gốc', () => {
    expect(buildCategoryTree([{ id: 'x', parentId: 'missing' }])).toHaveLength(1);
  });

  it('phát hiện tự tham chiếu và vòng lặp sâu', () => {
    expect(wouldCreateCycle(categories, 'food', 'food')).toBe(true);
    expect(wouldCreateCycle(categories, 'food', 'office')).toBe(true);
    expect(wouldCreateCycle(categories, 'office', 'food')).toBe(false);
    expect(wouldCreateCycle(categories, 'office', null)).toBe(false);
  });
});
