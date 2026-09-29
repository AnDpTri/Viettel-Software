import { describe, expect, it } from 'vitest';
import type { Category } from '../../api/types';
import { orderCategories } from './CategoriesView';

const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  name,
  type: 'EXPENSE',
  parentId,
  icon: null,
  color: null
});

const items = [
  category('b', 'Nhà cửa'),
  category('c', 'Tiền điện', 'b'),
  category('a', 'Ăn uống'),
  category('d', 'Cà phê', 'a'),
  category('e', 'Mồ côi', 'khong-ton-tai')
];

describe('orderCategories', () => {
  it('dạng cây: con nằm ngay dưới cha, sắp theo tên tiếng Việt, cấp thụt lề tăng dần', () => {
    expect(orderCategories(items, 'tree').map(({ item, level }) => `${level}:${item.name}`)).toEqual([
      '0:Ăn uống',
      '1:Cà phê',
      '0:Mồ côi',
      '0:Nhà cửa',
      '1:Tiền điện'
    ]);
  });

  it('dạng danh sách: tất cả cùng cấp, sắp theo tên', () => {
    expect(orderCategories(items, 'flat').map(({ item, level }) => `${level}:${item.name}`)).toEqual([
      '0:Ăn uống',
      '0:Cà phê',
      '0:Mồ côi',
      '0:Nhà cửa',
      '0:Tiền điện'
    ]);
  });
});
