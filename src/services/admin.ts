import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ApplicationAuditDetail,
  DeadLetterOperation,
  MessagingPlatform,
  Recommendation,
  ReviewCounts,
  ReviewDetail,
  ReviewListItem,
} from '../types/contracts';

export class AdminApiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
  }
}

function assertRpc<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) throw new AdminApiError(error.message, error.code);
  if (data == null) throw new AdminApiError('The server returned no data.');
  return data;
}

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asStrings = (value: unknown) => Array.isArray(value) ? value.map(String) : [];

export async function getReviewCounts(client: SupabaseClient): Promise<ReviewCounts> {
  const { data, error } = await client.rpc('admin_get_review_counts');
  const value = assertRpc(data as Record<string, unknown> | null, error);
  return {
    pendingReviews: asNumber(value.pending_reviews),
    failedOperations: asNumber(value.failed_operations),
  };
}

export async function listPendingReviews(client: SupabaseClient, offset = 0): Promise<ReviewListItem[]> {
  const { data, error } = await client.rpc('admin_list_pending_reviews', { p_limit: 50, p_offset: offset });
  const value = assertRpc(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({
    applicationId: String(item.application_id),
    userId: String(item.user_id),
    platform: String(item.platform) as MessagingPlatform,
    submittedAt: String(item.submitted_at),
    score: asNumber(item.score),
    recommendation: String(item.recommendation ?? 'MANUAL_REVIEW') as Recommendation,
    version: asNumber(item.version),
  }));
}

export async function getReviewDetail(client: SupabaseClient, applicationId: string): Promise<ReviewDetail> {
  const { data, error } = await client.rpc('admin_get_evaluation_detail', { p_application_id: applicationId });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const categoryScores = value.category_scores && typeof value.category_scores === 'object'
    ? value.category_scores as Record<string, number> : {};
  return {
    applicationId: String(value.application_id), userId: String(value.user_id),
    platform: String(value.platform) as MessagingPlatform,
    submittedAt: String(value.submitted_at), score: asNumber(value.score),
    recommendation: String(value.recommendation ?? 'MANUAL_REVIEW') as Recommendation,
    version: asNumber(value.version), status: String(value.status) as ReviewDetail['status'],
    strengths: asStrings(value.strengths), concerns: asStrings(value.concerns),
    evidence: Array.isArray(value.evidence) ? value.evidence : [],
    summary: String(value.summary ?? ''), categoryScores,
    evaluationRunId: value.evaluation_run_id ? String(value.evaluation_run_id) : null,
  };
}

export async function getApplicationAudit(client: SupabaseClient, applicationId: string): Promise<ApplicationAuditDetail> {
  const { data, error } = await client.rpc('admin_get_application', { p_application_id: applicationId });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  return {
    application: (value.application ?? {}) as Record<string, unknown>,
    answers: Array.isArray(value.answers) ? value.answers : [],
    categoryScores: Array.isArray(value.category_scores) ? value.category_scores : [],
    evaluations: Array.isArray(value.evaluations) ? value.evaluations : [],
    decisions: Array.isArray(value.decisions) ? value.decisions : [],
    access: Array.isArray(value.access) ? value.access : [],
  };
}

export async function decideApplication(client: SupabaseClient, applicationId: string, decision: 'APPROVE' | 'REJECT', reason: string) {
  const { data, error } = await client.rpc('admin_decide_community_application', {
    p_application_id: applicationId, p_decision: decision, p_reason: reason,
    p_idempotency_key: `admin-decision:${applicationId}:${crypto.randomUUID()}`,
  });
  return assertRpc(data, error);
}

export async function createAnnouncement(client: SupabaseClient, input: {
  content: string; destination: 'GENERAL' | 'APPROVED'; platforms: MessagingPlatform[];
}) {
  const created = await client.rpc('admin_create_announcement', {
    p_content: input.content, p_destination_level: input.destination,
    p_platforms: input.platforms, p_translations: {},
  });
  const id = String(assertRpc(created.data, created.error));
  return id;
}

export async function approveAnnouncement(client: SupabaseClient, announcementId: string) {
  const { data, error } = await client.rpc('admin_approve_announcement', { p_announcement_id: announcementId });
  return assertRpc(data, error);
}

export async function listDeadLetterOperations(client: SupabaseClient, offset = 0): Promise<DeadLetterOperation[]> {
  const { data, error } = await client.rpc('admin_list_dead_letter_operations', { p_limit: 50, p_offset: offset });
  const value = assertRpc(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({
    id: String(item.id),
    eventType: String(item.event_type),
    aggregateType: String(item.aggregate_type),
    aggregateId: String(item.aggregate_id),
    lastError: item.last_error == null ? null : String(item.last_error),
    attemptCount: asNumber(item.attempt_count),
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
    claimedAt: item.claimed_at == null ? null : String(item.claimed_at),
  }));
}

export async function retryDeadLetterOperation(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.rpc('admin_retry_dead_letter_operation', { p_event_id: eventId });
  return assertRpc(data, error);
}
