import type { SupabaseClient } from '@supabase/supabase-js';

export type DashboardAttention = {
  knowledgeConflicts: number;
  failedAnnouncements: number;
};

const count = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export async function getDashboardAttention(client: SupabaseClient): Promise<DashboardAttention> {
  const { data, error } = await client.rpc('admin_get_dashboard_attention');
  if (error) throw new Error(error.message || 'Could not load dashboard alerts.');
  const value = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  return {
    knowledgeConflicts: count(value.knowledge_conflicts),
    failedAnnouncements: count(value.failed_announcements),
  };
}
