import { describe, expect, it } from 'vitest';
import { testSchema } from './database-safety';

describe('isolated test database guard', () => {
  it('allows the CI schema and a namespaced review schema', () => {
    expect(testSchema('postgresql://test:test@localhost/db?schema=vitest')).toBe('vitest');
    expect(testSchema('postgresql://test:test@localhost/db?schema=vitest_codex_review')).toBe('vitest_codex_review');
  });
  it.each(['', '?schema=public', '?schema=finance', '?schema=information_schema', '?schema=vitest%22%3BCREATE'])(
    'rejects unsafe schema %s',
    (suffix) => {
      expect(() => testSchema(`postgresql://test:test@localhost/db${suffix}`)).toThrow();
    }
  );
});
