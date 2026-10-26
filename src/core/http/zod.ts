import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Bật .openapi() cho mọi schema Zod. File schema import `z` từ đây thay vì từ 'zod' để luôn có phần mở rộng này,
// dù được nạp riêng lẻ (ví dụ trong unit test) hay qua router.
extendZodWithOpenApi(z);

export { z };

/** PATCH must leave omitted fields untouched, including fields with CREATE defaults. */
export function partialInput<T extends z.ZodObject>(schema: T) {
  const partial = schema.partial();
  const overrides: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (field instanceof z.ZodDefault) overrides[key] = (field.removeDefault() as z.ZodType).optional();
  }
  return partial.extend(overrides) as typeof partial;
}
