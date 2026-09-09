import type { SupabaseClient } from '@supabase/supabase-js';

export type OfficialSourceIndexRequest = {
  accepted: true;
  action: 'BOOTSTRAP';
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function requestOfficialSourceIndex(client: SupabaseClient): Promise<OfficialSourceIndexRequest> {
  const { data, error } = await client.functions.invoke('official-source-admin', {
    body: { action: 'BOOTSTRAP' },
  });
  if (error) throw new Error(error.message || 'Could not start official-source indexing.');

  const payload = asRecord(data);
  if (payload.accepted !== true) {
    throw new Error(String(payload.message ?? 'Could not start official-source indexing.'));
  }
  return { accepted: true, action: 'BOOTSTRAP' };
}
