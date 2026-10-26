/** Chỉ cho phép xóa/tạo lại schema có tên rõ là test. */
export function testSchema(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get('schema') ?? '';
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/^(?:vitest|codex_test)(?:_[a-z0-9]+)*$/i.test(schema)) {
    throw new Error(
      'TEST_DATABASE_URL phải dùng schema vitest/codex_test riêng; không dùng public hoặc schema nghiệp vụ.'
    );
  }
  return schema;
}
