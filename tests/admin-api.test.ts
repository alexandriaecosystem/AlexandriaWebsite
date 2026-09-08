import { describe, expect, it, vi } from 'vitest';
import {
  approveKnowledgeDocument,
  decideApplication,
  getAiUsageSummary,
  getReviewCounts,
  listKnowledgeDocuments,
  listPendingReviews,
} from '../src/services/admin';

describe('admin RPC boundary', () => {
  it('normalizes review counts and pending records', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { pending_reviews: 3, failed_operations: 1 }, error: null })
      .mockResolvedValueOnce({ data: { items: [{ application_id: 'a', user_id: 'u', platform: 'telegram', submitted_at: '2026-01-01T00:00:00Z', score: '72', recommendation: 'RECOMMENDED', version: 2 }] }, error: null });
    const client = { rpc } as never;
    await expect(getReviewCounts(client)).resolves.toEqual({ pendingReviews: 3, failedOperations: 1 });
    await expect(listPendingReviews(client)).resolves.toMatchObject([{ applicationId: 'a', score: 72, platform: 'telegram' }]);
  });

  it('uses only the explicit admin decision RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: 'APPROVED' }, error: null });
    await decideApplication({ rpc } as never, 'application-id', 'APPROVE', 'Reviewed by administrator');
    expect(rpc).toHaveBeenCalledWith('admin_decide_community_application', expect.objectContaining({
      p_application_id: 'application-id', p_decision: 'APPROVE', p_reason: 'Reviewed by administrator',
    }));
  });

  it('preserves a fail-closed knowledge approval response', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        blocked: true,
        code: 'KNOWLEDGE_CONFLICT_BLOCKING',
        conflict_count: 1,
        conflicts: [{
          id: 'conflict-1',
          claim_a: 'Uploaded claim',
          claim_b: 'Verified claim',
          source_a_title: 'Uploaded document',
          source_b_title: 'Alexandria Redemption Policy',
          authority_a: 'Admin upload',
          authority_b: 'Official policy',
          severity: 'HIGH',
          confidence: 0.97,
          blocking: true,
          status: 'OPEN',
        }],
      },
      error: null,
    });

    await expect(approveKnowledgeDocument({ rpc } as never, 'document-id')).resolves.toMatchObject({
      blocked: true,
      code: 'KNOWLEDGE_CONFLICT_BLOCKING',
      conflictCount: 1,
      conflicts: [{
        claimA: 'Uploaded claim',
        claimB: 'Verified claim',
        sourceBTitle: 'Alexandria Redemption Policy',
        blocking: true,
      }],
    });
  });

  it('maps conflict scan readiness fields on knowledge documents', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        total: 1,
        items: [{
          id: 'doc-1', title: 'Policy', category: 'PROJECT_OFFICIAL', language: 'en', is_approved: false,
          processing_status: 'READY', processing_error: null, version: 4, approved_by: null, approved_at: null,
          created_at: '2026-09-08T00:00:00Z', updated_at: '2026-09-08T01:00:00Z', chunk_count: 3,
          conflict_scan_status: 'READY', conflict_scanned_version: 4, conflict_scanned_at: '2026-09-08T01:01:00Z',
          conflict_scan_error: null, open_conflict_count: 2, blocking_conflict_count: 1, approval_blocked: true,
        }],
      },
      error: null,
    });

    await expect(listKnowledgeDocuments({ rpc } as never)).resolves.toMatchObject({
      items: [{
        conflictScanStatus: 'READY', conflictScannedVersion: 4, openConflictCount: 2,
        blockingConflictCount: 1, approvalBlocked: true,
      }],
    });
  });

  it('maps AI tracking visibility so an empty ledger is not mistaken for zero cost', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        days: 30, total_calls: 0, successful_calls: 0, failed_calls: 0, cache_hit_count: 0,
        cache_hit_rate: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0,
        avg_cost_per_call: 0, by_purpose: {}, tracking_has_events: false, tracking_last_recorded_at: null,
        tracking_missing: true,
      },
      error: null,
    });

    await expect(getAiUsageSummary({ rpc } as never, 30)).resolves.toMatchObject({
      trackingHasEvents: false,
      trackingLastRecordedAt: null,
      trackingMissing: true,
    });
  });
});
