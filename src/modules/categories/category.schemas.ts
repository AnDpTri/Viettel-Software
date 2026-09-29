import { z } from '../../core/http/zod';
import { uuid } from '../../core/http/validation';
import { named } from '../../docs/route-docs';

export const categoryInput = named(
  'CategoryInput',
  z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(['INCOME', 'EXPENSE']),
    parentId: uuid.nullable().optional(),
    icon: z.string().max(50).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    sortOrder: z.coerce.number().int().min(0).max(10000).default(0)
  })
);

export const categoryListQuery = z.object({
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  tree: z
    .enum(['true', 'false'])
    .optional()
    .openapi({ description: 'Mặc định true: trả dạng cây cha-con; false: danh sách phẳng' }),
  includeArchived: z.enum(['true', 'false']).optional()
});

export const mergeInput = z.object({
  targetId: uuid.openapi({ description: 'Danh mục nhận toàn bộ giao dịch, ngân sách và danh mục con' })
});

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryListQuery = z.infer<typeof categoryListQuery>;
