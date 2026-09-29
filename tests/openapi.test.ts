import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, discoverRoutes, undocumentedRoutes } from '../src/docs/openapi';
import { apiMounts } from '../src/routes';

describe('Tài liệu OpenAPI sinh tự động', () => {
  const document = buildOpenApiDocument(apiMounts);

  it('mọi route Express đều có mô tả', () => {
    expect(undocumentedRoutes(apiMounts)).toEqual([]);
  });

  it('tài liệu chứa đúng từng route đang chạy', () => {
    const documented = Object.entries(document.paths).flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method} ${path}`)).sort();
    const actual = discoverRoutes(apiMounts).map((route) => `${route.method} ${route.path}`).sort();
    expect(documented).toEqual(actual);
    expect(actual.length).toBeGreaterThan(100);
  });

  it('body lấy từ schema Zod dùng để kiểm tra dữ liệu', () => {
    const register = document.paths['/auth/register']!.post!;
    expect(register.security).toEqual([]);
    expect(JSON.stringify(register.requestBody)).toContain('#/components/schemas/RegisterRequest');
    const schema = document.components!.schemas!.RegisterRequest as { required: string[]; properties: Record<string, { minLength?: number }> };
    expect(schema.required).toEqual(expect.arrayContaining(['username', 'password']));
    expect(schema.properties.password.minLength).toBe(10);
  });

  it('route cần đăng nhập được đánh dấu bearerAuth và có lỗi 401 theo envelope chung', () => {
    const create = document.paths['/wallets']!.post!;
    expect(create.security).toEqual([{ bearerAuth: [] }]);
    expect(Object.keys(create.responses)).toEqual(expect.arrayContaining(['201', '401', '422', '500']));
    expect(JSON.stringify(create.responses['401'])).toContain('#/components/schemas/ErrorEnvelope');
  });

  it('tham số đường dẫn, phân trang, CSV và upload được mô tả', () => {
    expect(document.paths['/transactions/{id}']!.get!.parameters).toEqual(expect.arrayContaining([expect.objectContaining({ in: 'path', name: 'id', required: true })]));
    const list = document.paths['/transactions']!.get!;
    expect(list.parameters!.map((item) => (item as { name: string }).name)).toEqual(expect.arrayContaining(['page', 'limit', 'walletId', 'from', 'to', 'keyword']));
    expect(JSON.stringify(list.responses['200'])).toContain('PagedEnvelope');
    expect(Object.keys((document.paths['/transactions/export.csv']!.get!.responses['200'] as { content: object }).content)).toEqual(['text/csv']);
    expect(JSON.stringify(document.paths['/transactions/{id}/receipts']!.post!.requestBody)).toContain('multipart/form-data');
  });
});
