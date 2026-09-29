// Xuất tài liệu OpenAPI sinh từ code ra tệp tĩnh (để import vào Postman hoặc nộp kèm): npm run docs:openapi [đường-dẫn]
import { writeFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../src/docs/openapi';
import { createContainer } from '../src/container';
import { createApiMounts } from '../src/routes';

const apiMounts = createApiMounts(createContainer());

const target = process.argv[2] ?? 'openapi.json';
const document = buildOpenApiDocument(apiMounts);
writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Đã ghi ${Object.keys(document.paths).length} đường dẫn vào ${target}`);
