import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Knowledge Intelligence bootstrap', () => {
  it('exposes a real admin indexing action instead of treating status refresh as a crawl', () => {
    const panel = source('src/components/KnowledgeIntelligencePanel.tsx');
    expect(panel).toContain('requestOfficialSourceIndex');
    expect(panel).toContain("tr('Index official sources'");
    expect(panel).toContain("setLocalRefresh((value) => value + 1)");
  });

  it('routes the browser through an authenticated Supabase Edge Function', () => {
    expect(existsSync(resolve(process.cwd(), 'src/services/official-source-index.ts'))).toBe(true);
    const service = source('src/services/official-source-index.ts');
    expect(service).toContain("client.functions.invoke('official-source-admin'");
    expect(service).toContain("action: 'BOOTSTRAP'");
  });

  it('keeps the n8n internal secret server-side and verifies the admin session', () => {
    expect(existsSync(resolve(process.cwd(), 'supabase/functions/official-source-admin/index.ts'))).toBe(true);
    const fn = source('supabase/functions/official-source-admin/index.ts');
    expect(fn).toContain('admin_get_session');
    expect(fn).toContain('CRYPTO_INTERNAL_WEBHOOK_SECRET');
    expect(fn).toContain('x-crypto-internal-secret');
    expect(fn).toContain('/webhook/crypto-official-source-index');
  });
});
