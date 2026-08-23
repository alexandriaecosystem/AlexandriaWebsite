import { describe, expect, it, vi } from 'vitest';
import { decideApplication, getReviewCounts, listPendingReviews } from '../src/services/admin';

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
});
