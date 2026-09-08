import { describe, expect, it, vi } from 'vitest';
import { getAiUsageSummary, getDashboardMetrics, listKnowledgeDocuments } from '../src/services/admin';

describe('analytics and knowledge RPC boundary', () => {
  it('normalizes dashboard metrics including real seven-day activity', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      total_users: 4, active_users: 4, active_users_7_days: 3, approved_users: 1, pending_reviews: 2, blocked_users: 0,
      total_messages: 45, messages_today: 5, messages_last_7_days: 30, messages_last_30_days: 45,
      ai_responses: 4, cached_responses: 2, cache_hit_rate: 0.3333,
      input_tokens: 512, output_tokens: 128, ai_cost_total: 0.0021, ai_cost_today: 0.0021,
      ai_cost_7_days: 0.0021, ai_cost_30_days: 0.0021, failed_operations: 3,
    }, error: null });
    const result = await getDashboardMetrics({ rpc } as never);
    expect(result).toMatchObject({
      totalUsers: 4,
      activeUsers: 4,
      activeUsers7Days: 3,
      totalMessages: 45,
      aiCostTotal: 0.0021,
      failedOperations: 3,
    });
    expect(rpc).toHaveBeenCalledWith('admin_get_dashboard_metrics');
  });

  it('normalizes AI usage and knowledge documents', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { days: 30, total_calls: 1, successful_calls: 1, failed_calls: 0, cache_hit_count: 0, cache_hit_rate: 0, input_tokens: 512, output_tokens: 128, total_tokens: 640, cost_usd: 0.0021, avg_cost_per_call: 0.0021, by_purpose: { CHAT_REPLY: { calls: 1, input_tokens: 512, output_tokens: 128, total_tokens: 640, cost_usd: 0.0021, cache_hit_count: 0 } } }, error: null })
      .mockResolvedValueOnce({ data: { total: 1, items: [{ id: 'doc-1', title: 'White Paper', category: 'PROJECT_OFFICIAL', language: 'ar', is_approved: true, processing_status: 'READY', processing_error: null, version: 3, approved_by: null, approved_at: null, created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', chunk_count: 21 }] }, error: null });
    const client = { rpc } as never;
    await expect(getAiUsageSummary(client, 30)).resolves.toMatchObject({ totalCalls: 1, totalTokens: 640, costUsd: 0.0021 });
    await expect(listKnowledgeDocuments(client)).resolves.toMatchObject({ total: 1, items: [{ id: 'doc-1', isApproved: true, chunkCount: 21 }] });
  });
});
