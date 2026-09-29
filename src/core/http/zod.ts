import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Bật .openapi() cho mọi schema Zod. File schema import `z` từ đây thay vì từ 'zod' để luôn có phần mở rộng này,
// dù được nạp riêng lẻ (ví dụ trong unit test) hay qua router.
extendZodWithOpenApi(z);

export { z };
