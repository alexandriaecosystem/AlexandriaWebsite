import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiUsageSeriesPoint,
  AiUsageSummary,
  ApplicationAuditDetail,
  DashboardMetrics,
  DeadLetterOperation,
  KnowledgeDocumentDetail,
  KnowledgeDocumentSummary,
  MessagingPlatform,
  ModelUsageStat,
  PlatformStat,
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
const asNullableString = (value: unknown) => value == null ? null : String(value);

export async function getReviewCounts(client: SupabaseClient): Promise<ReviewCounts> {
  const { data, error } = await client.rpc('admin_get_review_counts');
  const value = assertRpc(data as Record<string, unknown> | null, error);
  return {
    pendingReviews: asNumber(value.pending_reviews),
    failedOperations: asNumber(value.failed_operations),
  };
}

export async function getDashboardMetrics(client: SupabaseClient): Promise<DashboardMetrics> {
  const { data, error } = await client.rpc('admin_get_dashboard_metrics');
  const value = assertRpc(data as Record<string, unknown> | null, error);
  return {
    totalUsers: asNumber(value.total_users),
    activeUsers: asNumber(value.active_users),
    approvedUsers: asNumber(value.approved_users),
    pendingReviews: asNumber(value.pending_reviews),
    blockedUsers: asNumber(value.blocked_users),
    totalMessages: asNumber(value.total_messages),
    messagesToday: asNumber(value.messages_today),
    messagesLast7Days: asNumber(value.messages_last_7_days),
    messagesLast30Days: asNumber(value.messages_last_30_days),
    aiResponses: asNumber(value.ai_responses),
    cachedResponses: asNumber(value.cached_responses),
    cacheHitRate: asNumber(value.cache_hit_rate),
    inputTokens: asNumber(value.input_tokens),
    outputTokens: asNumber(value.output_tokens),
    aiCostTotal: asNumber(value.ai_cost_total),
    aiCostToday: asNumber(value.ai_cost_today),
    aiCost7Days: asNumber(value.ai_cost_7_days),
    aiCost30Days: asNumber(value.ai_cost_30_days),
    failedOperations: asNumber(value.failed_operations),
  };
}

export async function getAiUsageSummary(client: SupabaseClient, days = 30): Promise<AiUsageSummary> {
  const { data, error } = await client.rpc('admin_get_ai_usage_summary', { p_days: days });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const purposes = value.by_purpose && typeof value.by_purpose === 'object'
    ? value.by_purpose as Record<string, Record<string, unknown>> : {};
  return {
    days: asNumber(value.days),
    totalCalls: asNumber(value.total_calls),
    successfulCalls: asNumber(value.successful_calls),
    failedCalls: asNumber(value.failed_calls),
    cacheHitCount: asNumber(value.cache_hit_count),
    cacheHitRate: asNumber(value.cache_hit_rate),
    inputTokens: asNumber(value.input_tokens),
    outputTokens: asNumber(value.output_tokens),
    totalTokens: asNumber(value.total_tokens),
    costUsd: asNumber(value.cost_usd),
    avgCostPerCall: asNumber(value.avg_cost_per_call),
    byPurpose: Object.fromEntries(Object.entries(purposes).map(([purpose, item]) => [purpose, {
      calls: asNumber(item.calls), inputTokens: asNumber(item.input_tokens), outputTokens: asNumber(item.output_tokens),
      totalTokens: asNumber(item.total_tokens), costUsd: asNumber(item.cost_usd), cacheHitCount: asNumber(item.cache_hit_count),
    }])),
  };
}

export async function getAiUsageTimeseries(client: SupabaseClient, days = 30): Promise<AiUsageSeriesPoint[]> {
  const { data, error } = await client.rpc('admin_get_ai_usage_timeseries', { p_days: days });
  const value = assertRpc(data as { series?: Record<string, unknown>[] } | null, error);
  return (value.series ?? []).map((item) => ({
    bucketDate: String(item.bucket_date), calls: asNumber(item.calls), inputTokens: asNumber(item.input_tokens),
    outputTokens: asNumber(item.output_tokens), totalTokens: asNumber(item.total_tokens), costUsd: asNumber(item.cost_usd),
    cacheHitCount: asNumber(item.cache_hit_count), failedCount: asNumber(item.failed_count),
  }));
}

export async function getPlatformStats(client: SupabaseClient, days = 30): Promise<PlatformStat[]> {
  const { data, error } = await client.rpc('admin_get_platform_stats', { p_days: days });
  const value = assertRpc(data as { platforms?: Record<string, unknown>[] } | null, error);
  return (value.platforms ?? []).map((item) => ({
    platform: String(item.platform), messages: asNumber(item.messages), aiResponses: asNumber(item.ai_responses),
    cachedResponses: asNumber(item.cached_responses), aiCostUsd: asNumber(item.ai_cost_usd), totalTokens: asNumber(item.total_tokens),
    activeMembers: asNumber(item.active_members),
  }));
}

export async function getModelUsage(client: SupabaseClient, days = 30): Promise<ModelUsageStat[]> {
  const { data, error } = await client.rpc('admin_get_model_usage', { p_days: days });
  const value = assertRpc(data as { models?: Record<string, unknown>[] } | null, error);
  return (value.models ?? []).map((item) => ({
    provider: String(item.provider), model: String(item.model), calls: asNumber(item.calls),
    successfulCalls: asNumber(item.successful_calls), failedCalls: asNumber(item.failed_calls), cacheHitCount: asNumber(item.cache_hit_count),
    inputTokens: asNumber(item.input_tokens), outputTokens: asNumber(item.output_tokens), totalTokens: asNumber(item.total_tokens),
    costUsd: asNumber(item.cost_usd), avgCostPerCall: asNumber(item.avg_cost_per_call), successRate: asNumber(item.success_rate),
  }));
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

export async function listKnowledgeDocuments(client: SupabaseClient, status?: string): Promise<{ items: KnowledgeDocumentSummary[]; total: number }> {
  const { data, error } = await client.rpc('admin_list_knowledge_documents', { p_limit: 100, p_offset: 0, p_status: status ?? null });
  const value = assertRpc(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return {
    total: asNumber(value.total),
    items: (value.items ?? []).map((item) => ({
      id: String(item.id), title: String(item.title), category: String(item.category), language: String(item.language),
      isApproved: item.is_approved === true, processingStatus: String(item.processing_status ?? 'PENDING'),
      processingError: asNullableString(item.processing_error), version: asNumber(item.version), approvedBy: asNullableString(item.approved_by),
      approvedAt: asNullableString(item.approved_at), createdAt: String(item.created_at), updatedAt: String(item.updated_at),
      chunkCount: asNumber(item.chunk_count),
    })),
  };
}

export async function getKnowledgeDocument(client: SupabaseClient, documentId: string): Promise<KnowledgeDocumentDetail> {
  const { data, error } = await client.rpc('admin_get_knowledge_document', { p_document_id: documentId });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const chunks = Array.isArray(value.chunks) ? value.chunks as Record<string, unknown>[] : [];
  return {
    id: String(value.id), title: String(value.title), category: String(value.category), language: String(value.language),
    isApproved: value.is_approved === true, processingStatus: String(value.processing_status ?? 'PENDING'),
    processingError: asNullableString(value.processing_error), version: asNumber(value.version), approvedBy: asNullableString(value.approved_by),
    approvedAt: asNullableString(value.approved_at), createdAt: String(value.created_at), updatedAt: String(value.updated_at),
    chunkCount: asNumber(value.chunk_count),
    chunks: chunks.map((chunk) => ({ id: String(chunk.id), chunkIndex: asNumber(chunk.chunk_index), content: String(chunk.content ?? ''), version: asNumber(chunk.version) })),
  };
}

export async function createKnowledgeDocument(client: SupabaseClient, input: { title: string; category: string; language: string; file: File }) {
  const extension = input.file.name.includes('.') ? input.file.name.split('.').pop()!.toLowerCase() : 'txt';
  const created = await client.rpc('admin_create_knowledge_document', {
    p_title: input.title.trim(), p_category: input.category.trim(), p_language: input.language.trim(), p_file_extension: extension,
  });
  const value = assertRpc(created.data as { id?: string; storage_path?: string; bucket?: string } | null, created.error);
  const id = String(value.id);
  const storagePath = String(value.storage_path);
  const bucket = String(value.bucket || 'knowledge-base');
  const upload = await client.storage.from(bucket).upload(storagePath, input.file, { upsert: false, contentType: input.file.type || undefined });
  if (upload.error) {
    await client.rpc('admin_delete_knowledge_document', { p_document_id: id });
    throw new AdminApiError(`Upload failed: ${upload.error.message}`);
  }
  return { id, storagePath, bucket };
}

export async function approveKnowledgeDocument(client: SupabaseClient, documentId: string) {
  const { data, error } = await client.rpc('admin_approve_knowledge_document', { p_document_id: documentId });
  return assertRpc(data, error);
}

export async function requestKnowledgeDocumentReprocessing(client: SupabaseClient, documentId: string) {
  const { data, error } = await client.rpc('admin_request_knowledge_document_reprocessing', { p_document_id: documentId });
  return assertRpc(data, error);
}

export async function deleteKnowledgeDocument(client: SupabaseClient, documentId: string) {
  const { data, error } = await client.rpc('admin_delete_knowledge_document', { p_document_id: documentId });
  const value = assertRpc(data as { storage_path?: string } | null, error);
  if (value.storage_path) {
    const removal = await client.storage.from('knowledge-base').remove([String(value.storage_path)]);
    if (removal.error) throw new AdminApiError(`Document row deleted, but storage cleanup failed: ${removal.error.message}`);
  }
  return value;
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
