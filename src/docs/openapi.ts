import { OpenAPIRegistry, OpenApiGeneratorV3, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { Router } from 'express';
import { z } from 'zod';
import { routeDoc } from './route-docs';

export interface ApiMount { prefix: string; tag: string; router: Router }

interface ExpressLayer {
  name: string;
  handle: unknown;
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: ExpressLayer[] };
}

export interface DiscoveredRoute { method: string; path: string; expressPath: string; secured: boolean; tag: string; router: Router }

/** Đọc trực tiếp bảng route của Express: route mới thêm tự xuất hiện trong tài liệu, không phải khai báo lại ở nơi khác. */
export function discoverRoutes(mounts: ApiMount[]): DiscoveredRoute[] {
  const routes: DiscoveredRoute[] = [];
  for (const mount of mounts) {
    let guarded = false;
    for (const layer of (mount.router as unknown as { stack: ExpressLayer[] }).stack) {
      if (!layer.route) {
        // router.use(authenticate) bảo vệ mọi route khai báo sau nó.
        if (layer.name === 'authenticate') guarded = true;
        continue;
      }
      const secured = guarded || layer.route.stack.some((item) => item.name === 'authenticate');
      for (const expressPath of ([] as string[]).concat(layer.route.path)) {
        for (const method of Object.keys(layer.route.methods).filter((item) => item !== '_all')) {
          const suffix = expressPath === '/' ? '' : expressPath;
          routes.push({ method, expressPath, secured, tag: mount.tag, router: mount.router, path: `${mount.prefix}${suffix}`.replace(/:(\w+)/g, '{$1}') || '/' });
        }
      }
    }
  }
  return routes;
}

const errorEnvelope = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string().openapi({ example: 'VALIDATION_ERROR' }), message: z.string().openapi({ example: 'Dữ liệu không hợp lệ.' }), details: z.unknown().optional() })
}).openapi('ErrorEnvelope');
const pageMeta = z.object({ page: z.number().int(), limit: z.number().int(), total: z.number().int(), totalPages: z.number().int() }).openapi('PaginationMeta');
const successEnvelope = z.object({ success: z.literal(true), message: z.string().openapi({ example: 'Thành công.' }), data: z.unknown().nullable().openapi({ example: {} }) }).openapi('SuccessEnvelope');
const pagedEnvelope = successEnvelope.extend({ data: z.array(z.unknown()).openapi({ example: [] }), meta: pageMeta }).openapi('PagedEnvelope');
/** Mô tả lỗi dạng 'MA_LOI – giải thích': mã đầu tiên được dùng làm ví dụ error.code. */
const errorResponse = (description: string) => {
  const code = description.match(/[A-Z][A-Z_]+[A-Z]/)?.[0] ?? 'ERROR';
  return { description, content: { 'application/json': { schema: errorEnvelope, example: { success: false, error: { code, message: description.split(' – ')[1] ?? description } } } } };
};

const paramSchema = (name: string) => name === 'provider'
  ? z.enum(['google', 'github'])
  : z.string().uuid();

function successResponse(doc: ReturnType<typeof routeDoc>) {
  if (doc?.produces === 'csv') return { description: 'Tệp CSV UTF-8 có BOM (mở được bằng Excel).', content: { 'text/csv': { schema: z.string() } } };
  if (doc?.produces === 'file') return { description: 'Nội dung tệp gốc (JPG, PNG hoặc PDF).', content: { 'application/octet-stream': { schema: z.string().openapi({ format: 'binary' }) } } };
  if (doc?.produces === 'redirect') return { description: 'Chuyển hướng (302).' };
  return { description: 'Thành công', content: { 'application/json': { schema: doc?.paginated ? pagedEnvelope : successEnvelope } } };
}

/** Sinh tài liệu OpenAPI 3 từ route thật của Express và schema Zod dùng để kiểm tra dữ liệu. */
export function buildOpenApiDocument(mounts: ApiMount[]) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  registry.register('ErrorEnvelope', errorEnvelope);
  registry.register('SuccessEnvelope', successEnvelope);

  for (const route of discoverRoutes(mounts)) {
    const doc = routeDoc(route.router, route.method, route.expressPath);
    const paramNames = [...route.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
    const request: RouteConfig['request'] = {};
    if (paramNames.length) request.params = z.object(Object.fromEntries(paramNames.map((name) => [name, paramSchema(name)])));
    if (doc?.query) request.query = doc.query;
    if (doc?.body) request.body = { required: true, content: { 'application/json': { schema: doc.body } } };
    if (doc?.file) request.body = { required: true, content: { 'multipart/form-data': { schema: z.object({ [doc.file]: z.string().openapi({ format: 'binary' }) }) } } };

    const responses: RouteConfig['responses'] = { [String(doc?.status ?? (doc?.produces === 'redirect' ? 302 : 200))]: successResponse(doc) };
    for (const [status, text] of Object.entries(doc?.errors ?? {})) responses[status] = errorResponse(text);
    if (route.secured) responses['401'] ??= errorResponse('UNAUTHORIZED – chưa gửi access token (INVALID_TOKEN nếu token sai hoặc hết hạn).');
    if (paramNames.length) responses['404'] ??= errorResponse('NOT_FOUND – không tìm thấy dữ liệu hoặc dữ liệu không thuộc về người dùng.');
    if (doc?.body || doc?.query || doc?.file || paramNames.length) responses['422'] ??= errorResponse('VALIDATION_ERROR – dữ liệu không hợp lệ, lỗi từng trường nằm trong error.details.');
    responses['500'] = errorResponse('INTERNAL_ERROR – hệ thống đang gặp sự cố.');

    registry.registerPath({
      method: route.method as RouteConfig['method'],
      path: route.path,
      tags: [doc?.tag ?? route.tag],
      summary: doc?.summary ?? `${route.method.toUpperCase()} ${route.path}`,
      description: doc?.description,
      security: route.secured ? [{ bearerAuth: [] }] : [],
      request,
      responses
    });
  }

  return new OpenApiGeneratorV3(registry.definitions).generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'API Sổ thu chi cá nhân',
      version: '2.0.0',
      description: 'Tài liệu được sinh tự động từ route Express và schema Zod của mã nguồn (@asteasolutions/zod-to-openapi). Mọi phản hồi JSON dùng chung envelope: thành công `{ success: true, message, data, meta? }`, lỗi `{ success: false, error: { code, message, details? } }`.'
    },
    servers: [{ url: '/api/v1' }]
  });
}

/** Route chưa có mô tả: kiểm thử dùng để bắt buộc mọi endpoint đều được tài liệu hóa. */
export function undocumentedRoutes(mounts: ApiMount[]) {
  return discoverRoutes(mounts).filter((route) => !routeDoc(route.router, route.method, route.expressPath)).map((route) => `${route.method.toUpperCase()} ${route.path}`);
}
