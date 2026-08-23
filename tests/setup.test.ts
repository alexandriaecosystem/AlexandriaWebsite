import { describe, expect, it } from 'vitest';

describe('admin test harness', () => {
  it('loads the browser test environment', () => {
    expect(document).toBeDefined();
  });
});
