import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiUsageSeriesPoint,
  AiUsageSummary,
  ApplicationAuditDetail,
  DashboardMetrics,
  DeadLetterOperation,
  KnowledgeApprovalResult,
  KnowledgeCandidate,
  KnowledgeConflict,
  KnowledgeDocumentDetail,
  KnowledgeDocumentSummary,
  KnowledgeIntelligenceStatus,
  MessagingPlatform,
  ModelUsageStat,
  OfficialCrawlRunSummary,
  OfficialSourceChange,
  OfficialSourceHealth,
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

export class KnowledgeApprovalBlockedError extends AdminApiError {
  constructor(public readonly result: KnowledgeApprovalResult) {
    super(formatKnowledgeApprovalBlockedMessage(result), result.code ?? 'KNOWLEDGE_APPROVAL_BLOCKED');
  }
}

function assertRpc<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) throw new AdminApiError(error.message, error.code);
  if (data == null) throw new AdminApiError('The server returned no data.');
  return data;
}

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const asNullableNumber = (value: unknown) => value == null || !Number.isFinite(Number(value)) ? null : Number(value);
const asStrings = (value: unknown) => Array.isArray(value) ? value.map(String) : [];
const asNullableString = (value: unknown) => value == null ? null : String(value);
const asObject = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function mapKnowledgeConflict(item: Record<string, unknown>): KnowledgeConflict {
  return {
    id: String(item.id ?? ''),
    sourceAKind: asNullableString(item.source_a_kind),
    sourceADocumentId: asNullableString(item.source_a_document_id),
    sourceAOfficialSourceId: asNullableString(item.source_a_official_source_id),
    sourceAVersion: asNullableNumber(item.source_a_version),
    sourceATitle: String(item.source_a_title ?? 'Source A'),
    claimA: String(item.claim_a ?? ''),
    authorityACode: asNullableString(item.authority_a_code),
    authorityALabel: asNullableString(item.authority_a_label ?? item.authority_a),
    authorityAPriority: asNumber(item.authority_a_priority),
    sourceAUrl: asNullableString(item.source_a_url),
    sourceBKind: asNullableString(item.source_b_kind),
    sourceBDocumentId: asNullableString(item.source_b_document_id),
    sourceBOfficialSourceId: asNullableString(item.source_b_official_source_id),
    sourceBVersion: asNullableNumber(item.source_b_version),
    sourceBTitle: String(item.source_b_title ?? 'Source B'),
    claimB: String(item.claim_b ?? ''),
    authorityBCode: asNullableString(item.authority_b_code),
    authorityBLabel: asNullableString(item.authority_b_label ?? item.authority_b),
    authorityBPriority: asNumber(item.authority_b_priority),
    sourceBUrl: asNullableString(item.source_b_url),
    explanation: asNullableString(item.explanation),
    category: asNullableString(item.category),
    topic: asNullableString(item.topic),
    conflictType: asNullableString(item.conflict_type),
    timeScope: asNullableString(item.time_scope),
    severity: String(item.severity ?? 'UNKNOWN'),
    confidence: asNumber(item.confidence),
    blocking: item.blocking === true,
    status: String(item.status ?? 'OPEN'),
    detectedAt: asNullableString(item.detected_at),
    resolvedAt: asNullableString(item.resolved_at),
    resolution: asNullableString(item.resolution),
    relatedKnowledgeDocumentId: asNullableString(item.related_knowledge_document_id),
    relatedWebsiteSourceId: asNullableString(item.related_website_source_id),
  };
}

function formatKnowledgeApprovalBlockedMessage(result: KnowledgeApprovalResult) {
  if (result.code === 'CONFLICT_SCAN_REQUIRED') {
    return 'Approval blocked: the contradiction scan for this document version is not complete. Reprocess or wait for the scan to finish before approving.';
  }
  if (result.code === 'DOCUMENT_NOT_READY') {
    return 'Approval blocked: this document has not finished processing yet.';
  }
  if (result.code === 'KNOWLEDGE_CONFLICT_BLOCKING') {
    const conflict = result.conflicts[0];
    if (conflict) {
      const authorityA = conflict.authorityALabel || conflict.authorityACode || 'authority unavailable';
      const authorityB = conflict.authorityBLabel || conflict.authorityBCode || 'authority unavailable';
      const confidence = Math.round(conflict.confidence * 100);
      return `Approval blocked: “${conflict.sourceATitle}” says “${conflict.claimA}”, while “${conflict.sourceBTitle}” says “${conflict.claimB}”. Authority: ${authorityA} vs ${authorityB}. Severity: ${conflict.severity}; confidence: ${confidence}%. Review the contradiction in Knowledge Intelligence before approving.`;
    }
    return 'Approval blocked because an unresolved material knowledge contradiction exists. Review Knowledge Intelligence before approving.';
  }
  return 'Approval was not confirmed by the database safety gate. Review this document before trying again.';
}

function mapKnowledgeDocument(item: Record<string, unknown>): KnowledgeDocumentSummary {
  const processingStatus = String(item.processing_status ?? 'PENDING');
  const version = asNumber(item.version);
  const conflictScanStatus = String(item.conflict_scan_status ?? 'PENDING');
  const conflictScannedVersion = asNullableNumber(item.conflict_scanned_version);
  const blockingConflictCount = asNumber(item.blocking_conflict_count);
  const computedApprovalBlocked = processingStatus !== 'READY'
    || conflictScanStatus !== 'READY'
    || conflictScannedVersion !== version
    || blockingConflictCount > 0;

  return {
    id: String(item.id),
    title: String(item.title),
    category: String(item.category),
    language: String(item.language),
    isApproved: item.is_approved === true,
    processingStatus,
    processingError: asNullableString(item.processing_error),
    version,
    approvedBy: asNullableString(item.approved_by),
    approvedAt: asNullableString(item.approved_at),
    createdAt: String(item.created_at),
    updatedAt: String(item.updated_at),
    chunkCount: asNumber(item.chunk_count),
    conflictScanStatus,
    conflictScannedVersion,
    conflictScannedAt: asNullableString(item.conflict_scanned_at),
    conflictScanError: asNullableString(item.conflict_scan_error),
    openConflictCount: asNumber(item.open_conflict_count),
    blockingConflictCount,
    approvalBlocked: typeof item.approval_blocked === 'boolean' ? item.approval_blocked : computedApprovalBlocked,
  };
}

function mapOfficialSourceHealth(item: Record<string, unknown>): OfficialSourceHealth {
  return {
    sourceId: String(item.source_id ?? ''),
    familyId: asNullableString(item.family_id),
    pageTitle: String(item.page_title ?? item.canonical_url ?? 'Official source'),
    canonicalUrl: String(item.canonical_url ?? ''),
    language: String(item.language ?? ''),
    canonicalLanguage: asNullableString(item.canonical_language),
    isFamilyCanonical: item.is_family_canonical === true,
    sourceType: String(item.source_type ?? ''),
    authorityCode: String(item.authority_code ?? ''),
    authorityPriority: asNumber(item.authority_priority),
    extractionStatus: String(item.extraction_status ?? 'PENDING'),
    currentVersion: asNumber(item.current_version),
    conflictScanStatus: String(item.conflict_scan_status ?? 'PENDING'),
    conflictScannedVersion: asNullableNumber(item.conflict_scanned_version),
    lastFetchedAt: asNullableString(item.last_fetched_at),
    lastSuccessfulFetch: asNullableString(item.last_successful_fetch),
    lastChangedAt: asNullableString(item.last_changed_at),
    freshnessTtlSeconds: asNumber(item.freshness_ttl_seconds),
    isStale: item.is_stale === true,
    hasBlockingConflict: item.has_blocking_conflict === true,
    lastError: asNullableString(item.last_error),
    isActive: item.is_active !== false,
    removedAt: asNullableString(item.removed_at),
    nextCrawlAt: asNullableString(item.next_crawl_at),
  };
}

function mapCrawlRun(item: Record<string, unknown>): OfficialCrawlRunSummary {
  return {
    id: String(item.id ?? ''),
    syncType: String(item.sync_type ?? ''),
    status: String(item.status ?? ''),
    startedAt: asNullableString(item.started_at),
    finishedAt: asNullableString(item.finished_at),
    fetchedCount: asNumber(item.fetched_count),
    unchangedCount: asNumber(item.unchanged_count),
    changedCount: asNumber(item.changed_count),
    newCount: asNumber(item.new_count),
    removedCount: asNumber(item.removed_count),
    failedCount: asNumber(item.failed_count),
    blockedCount: asNumber(item.blocked_count),
    unsupportedCount: asNumber(item.unsupported_count),
    errorSummary: asNullableString(item.error_summary),
  };
}

function mapSourceChange(item: Record<string, unknown>): OfficialSourceChange {
  return {
    id: String(item.id ?? ''),
    sourceId: String(item.source_id ?? ''),
    sourceTitle: String(item.source_title ?? item.source_url ?? 'Official source'),
    sourceUrl: String(item.source_url ?? ''),
    previousVersion: asNullableNumber(item.previous_version),
    currentVersion: asNumber(item.current_version),
    changeKind: String(item.change_kind ?? 'CHANGED'),
    detectedAt: String(item.detected_at ?? ''),
    changeSummary: asNullableString(item.change_summary),
    important: item.important === true,
    conflictCount: asNumber(item.conflict_count),
    reviewStatus: String(item.review_status ?? 'PENDING'),
  };
}

function mapCandidate(item: Record<string, unknown>): KnowledgeCandidate {
  return {
    id: String(item.id ?? ''),
    originalQuestion: String(item.original_question ?? ''),
    proposedAnswer: String(item.proposed_answer ?? ''),
    extractedClaim: asNullableString(item.extracted_claim),
    officialSourceId: String(item.official_source_id ?? ''),
    sourceVersion: asNumber(item.source_version),
    sourceUrl: String(item.source_url ?? ''),
    sourceTitle: String(item.source_title ?? item.source_url ?? 'Official source'),
    language: String(item.language ?? ''),
    proposedCategory: String(item.proposed_category ?? 'PROJECT_OFFICIAL'),
    authorityCode: asNullableString(item.authority_code),
    authorityPriority: asNumber(item.authority_priority),
    status: String(item.status ?? 'PENDING'),
    discoveryCount: asNumber(item.discovery_count),
    firstDiscoveredAt: String(item.first_discovered_at ?? ''),
    lastDiscoveredAt: String(item.last_discovered_at ?? ''),
    promotedDocumentId: asNullableString(item.promoted_document_id),
  };
}

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
    activeUsers7Days: value.active_users_7_days == null ? null : asNumber(value.active_users_7_days),
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
    trackingHasEvents: value.tracking_has_events === true,
    trackingLastRecordedAt: asNullableString(value.tracking_last_recorded_at),
    trackingMissing: value.tracking_missing === true,
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
  content: string; destination: 'GENERAL' | 'APPROVED' | 'BOTH'; platforms: MessagingPlatform[];
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
    items: (value.items ?? []).map(mapKnowledgeDocument),
  };
}

export async function getKnowledgeDocument(client: SupabaseClient, documentId: string): Promise<KnowledgeDocumentDetail> {
  const { data, error } = await client.rpc('admin_get_knowledge_document', { p_document_id: documentId });
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const chunks = Array.isArray(value.chunks) ? value.chunks as Record<string, unknown>[] : [];
  return {
    ...mapKnowledgeDocument({ ...value, chunk_count: value.chunk_count ?? chunks.length }),
    chunks: chunks.map((chunk) => ({ id: String(chunk.id), chunkIndex: asNumber(chunk.chunk_index), content: String(chunk.content ?? ''), version: asNumber(chunk.version) })),
  };
}

const KNOWLEDGE_UPLOAD_EXTENSIONS = new Set(['docx', 'txt', 'md', 'pdf']);
const KNOWLEDGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export async function createKnowledgeDocument(client: SupabaseClient, input: { title: string; category: string; language: string; file: File }) {
  const extension = input.file.name.includes('.') ? input.file.name.split('.').pop()!.toLowerCase() : 'txt';
  if (!KNOWLEDGE_UPLOAD_EXTENSIONS.has(extension)) {
    throw new AdminApiError('Only .docx, .pdf, .txt, or .md files can be added to the knowledge base.');
  }
  if (!input.file.size || input.file.size > KNOWLEDGE_UPLOAD_MAX_BYTES) {
    throw new AdminApiError('Knowledge files must be between 1 byte and 20 MB.');
  }
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

export async function approveKnowledgeDocument(client: SupabaseClient, documentId: string, options?: { bypassConflicts?: boolean }): Promise<KnowledgeApprovalResult> {
  const { data, error } = await client.rpc('admin_approve_knowledge_document', { p_document_id: documentId, p_bypass_conflicts: options?.bypassConflicts === true });
  const raw = assertRpc(data as unknown, error);
  const value = asObject(Array.isArray(raw) ? raw[0] : raw);
  const conflicts = Array.isArray(value.conflicts) ? value.conflicts.map((item) => mapKnowledgeConflict(asObject(item))) : [];
  const result: KnowledgeApprovalResult = {
    blocked: value.blocked === true,
    code: asNullableString(value.code),
    isApproved: value.is_approved === true,
    conflictCount: asNumber(value.conflict_count ?? conflicts.length),
    conflicts,
  };
  if (result.blocked || !result.isApproved) throw new KnowledgeApprovalBlockedError(result);
  return result;
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

export async function getKnowledgeIntelligenceStatus(client: SupabaseClient): Promise<KnowledgeIntelligenceStatus> {
  const { data, error } = await client.rpc('admin_get_knowledge_intelligence_status');
  const value = assertRpc(data as Record<string, unknown> | null, error);
  const sources = Array.isArray(value.official_source_health) ? value.official_source_health as Record<string, unknown>[] : [];
  const runs = Array.isArray(value.recent_crawl_runs) ? value.recent_crawl_runs as Record<string, unknown>[] : [];
  const changes = Array.isArray(value.recent_source_changes) ? value.recent_source_changes as Record<string, unknown>[] : [];
  return {
    openConflicts: asNumber(value.open_conflicts),
    blockingConflicts: asNumber(value.blocking_conflicts),
    staleSources: asNumber(value.stale_sources),
    failedSources: asNumber(value.failed_sources),
    pendingCandidates: asNumber(value.pending_candidates),
    lastSuccessfulSync: asNullableString(value.last_successful_sync),
    officialSourceVersion: asNumber(value.official_source_version),
    officialSourceHealth: sources.map(mapOfficialSourceHealth),
    recentCrawlRuns: runs.map(mapCrawlRun),
    recentSourceChanges: changes.map(mapSourceChange),
  };
}

export async function listKnowledgeConflicts(client: SupabaseClient, documentId?: string, status?: string): Promise<{ items: KnowledgeConflict[]; total: number }> {
  const { data, error } = await client.rpc('admin_list_knowledge_conflicts', {
    p_document_id: documentId ?? null,
    p_status: status ?? null,
    p_limit: 100,
    p_offset: 0,
  });
  const value = assertRpc(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return { items: (value.items ?? []).map(mapKnowledgeConflict), total: asNumber(value.total) };
}

export async function getKnowledgeConflict(client: SupabaseClient, conflictId: string): Promise<KnowledgeConflict> {
  const { data, error } = await client.rpc('admin_get_knowledge_conflict', { p_conflict_id: conflictId });
  return mapKnowledgeConflict(assertRpc(data as Record<string, unknown> | null, error));
}

export async function resolveKnowledgeConflict(
  client: SupabaseClient,
  conflictId: string,
  action: 'KEEP_SOURCE_A' | 'KEEP_SOURCE_B' | 'KEEP_EXISTING' | 'DISMISS_FALSE_CONFLICT',
  note: string,
) {
  const { data, error } = await client.rpc('admin_resolve_knowledge_conflict', {
    p_conflict_id: conflictId,
    p_action: action,
    p_note: note.trim(),
  });
  return assertRpc(data, error);
}

export async function listKnowledgeCandidates(client: SupabaseClient, status = 'PENDING'): Promise<{ items: KnowledgeCandidate[]; total: number }> {
  const { data, error } = await client.rpc('admin_list_knowledge_candidates', { p_status: status, p_limit: 100, p_offset: 0 });
  const value = assertRpc(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return { items: (value.items ?? []).map(mapCandidate), total: asNumber(value.total) };
}

export async function promoteKnowledgeCandidate(client: SupabaseClient, candidateId: string) {
  const { data, error } = await client.rpc('admin_promote_knowledge_candidate', { p_candidate_id: candidateId });
  return assertRpc(data, error);
}

export async function rejectKnowledgeCandidate(client: SupabaseClient, candidateId: string, note: string) {
  const { data, error } = await client.rpc('admin_reject_knowledge_candidate', { p_candidate_id: candidateId, p_note: note.trim() });
  return assertRpc(data, error);
}

export async function listDeadLetterOperations(client: SupabaseClient, offset = 0): Promise<DeadLetterOperation[]> {
  const { data, error } = await client.rpc('admin_list_dead_letter_operations', { p_limit: 50, p_offset: offset });
  const value = assertRpc(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({
    id: String(item.id), eventType: String(item.event_type), aggregateType: String(item.aggregate_type), aggregateId: String(item.aggregate_id),
    attemptCount: asNumber(item.attempt_count), lastError: asNullableString(item.last_error), claimedAt: asNullableString(item.claimed_at),
    createdAt: String(item.created_at), updatedAt: String(item.updated_at),
  }));
}

export async function retryDeadLetterOperation(client: SupabaseClient, eventId: string) {
  const { data, error } = await client.rpc('admin_retry_dead_letter_operation', { p_event_id: eventId });
  return assertRpc(data, error);
}
