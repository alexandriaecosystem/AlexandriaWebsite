import type { SupabaseClient } from '@supabase/supabase-js';

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error('The server returned no data.');
  return data;
}

const nullable = (value: unknown) => value == null ? null : String(value);

export type ApprovedCommunityItem = {
  accessId: string;
  userId: string;
  name: string | null;
  userStatus: string;
  platform: string | null;
  username: string | null;
  phoneNumber: string | null;
  platformUserId: string | null;
  state: string;
  inviteSentAt: string | null;
  joinRequestedAt: string | null;
  activatedAt: string | null;
  leftAt: string | null;
  removedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  retryCount: number;
  finalScore: number | null;
  recommendation: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type KnowledgeGap = {
  id: string;
  question: string;
  platform: string | null;
  language: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: 'OPEN' | 'RESOLVED' | 'IGNORED';
  resolvedDocumentId: string | null;
};

export type SystemHealth = {
  databaseStatus: string;
  checkedAt: string;
  platforms: Record<string, { lastInboundAt: string | null; messages24h: number }>;
  outboxPending: number;
  outboxDeadLetter: number;
  knowledgeFailed: number;
  knowledgeProcessing: number;
  aiUsageEvents: number;
  aiLastRecordedAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastKnowledgeUpdateAt: string | null;
  n8nHealth: string;
};

export type ActivityItem = {
  type: string;
  occurredAt: string;
  entityId: string | null;
  title: string;
  detail: string | null;
  platform: string | null;
  status: string | null;
};

export type AdminUserItem = {
  userId: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string | null;
  isCurrentUser: boolean;
};

export type AnnouncementHistoryItem = {
  id: string;
  content: string;
  destinationLevel: string;
  selectedPlatforms: string[];
  status: string;
  scheduledFor: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  deliveryCount: number;
  sentCount: number;
  failedCount: number;
  deliveries: Array<{ platform: string; status: string; attemptCount: number; sentAt: string | null; error: string | null }>;
};

export async function listApprovedCommunity(client: SupabaseClient, search = '') {
  const { data, error } = await client.rpc('admin_list_approved_community', { p_limit: 200, p_offset: 0, p_search: search.trim() || null });
  const value = assertData(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return {
    total: Number(value.total ?? 0),
    items: (value.items ?? []).map((item): ApprovedCommunityItem => ({
      accessId: String(item.access_id), userId: String(item.user_id), name: nullable(item.name), userStatus: String(item.user_status ?? 'ACTIVE'),
      platform: nullable(item.platform), username: nullable(item.username), phoneNumber: nullable(item.phone_number), platformUserId: nullable(item.platform_user_id),
      state: String(item.state ?? 'APPROVED'), inviteSentAt: nullable(item.invite_sent_at), joinRequestedAt: nullable(item.join_requested_at), activatedAt: nullable(item.activated_at),
      leftAt: nullable(item.left_at), removedAt: nullable(item.removed_at), lastVerifiedAt: nullable(item.last_verified_at), lastError: nullable(item.last_error), retryCount: Number(item.retry_count ?? 0),
      finalScore: item.final_score == null ? null : Number(item.final_score), recommendation: nullable(item.recommendation), reviewedAt: nullable(item.reviewed_at), updatedAt: String(item.updated_at),
    })),
  };
}

export async function listKnowledgeGaps(client: SupabaseClient, status = 'OPEN') {
  const { data, error } = await client.rpc('admin_list_knowledge_gaps', { p_limit: 200, p_status: status === 'ALL' ? null : status });
  const value = assertData(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return {
    total: Number(value.total ?? 0),
    items: (value.items ?? []).map((item): KnowledgeGap => ({
      id: String(item.id), question: String(item.sample_question ?? ''), platform: nullable(item.platform), language: nullable(item.language), occurrenceCount: Number(item.occurrence_count ?? 1),
      firstSeenAt: String(item.first_seen_at), lastSeenAt: String(item.last_seen_at), status: String(item.status ?? 'OPEN') as KnowledgeGap['status'], resolvedDocumentId: nullable(item.resolved_document_id),
    })),
  };
}

export async function updateKnowledgeGapStatus(client: SupabaseClient, gapId: string, status: KnowledgeGap['status']) {
  const { data, error } = await client.rpc('admin_update_knowledge_gap_status', { p_gap_id: gapId, p_status: status, p_document_id: null });
  return assertData(data, error);
}

export async function getSystemHealth(client: SupabaseClient): Promise<SystemHealth> {
  const { data, error } = await client.rpc('admin_get_system_health');
  const value = assertData(data as Record<string, unknown> | null, error);
  const rawPlatforms = value.platforms && typeof value.platforms === 'object' ? value.platforms as Record<string, Record<string, unknown>> : {};
  return {
    databaseStatus: String(value.database_status ?? 'UNKNOWN'), checkedAt: String(value.checked_at),
    platforms: Object.fromEntries(Object.entries(rawPlatforms).map(([key, item]) => [key, { lastInboundAt: nullable(item.last_inbound_at), messages24h: Number(item.messages_24h ?? 0) }])),
    outboxPending: Number(value.outbox_pending ?? 0), outboxDeadLetter: Number(value.outbox_dead_letter ?? 0), knowledgeFailed: Number(value.knowledge_failed ?? 0), knowledgeProcessing: Number(value.knowledge_processing ?? 0),
    aiUsageEvents: Number(value.ai_usage_events ?? 0), aiLastRecordedAt: nullable(value.ai_last_recorded_at), lastInboundAt: nullable(value.last_inbound_at), lastOutboundAt: nullable(value.last_outbound_at),
    lastKnowledgeUpdateAt: nullable(value.last_knowledge_update_at), n8nHealth: String(value.n8n_health ?? 'UNKNOWN'),
  };
}

export async function getActivityFeed(client: SupabaseClient, limit = 100): Promise<ActivityItem[]> {
  const { data, error } = await client.rpc('admin_get_activity_feed', { p_limit: limit });
  const value = assertData(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({ type: String(item.type), occurredAt: String(item.occurred_at), entityId: nullable(item.entity_id), title: String(item.title ?? ''), detail: nullable(item.detail), platform: nullable(item.platform), status: nullable(item.status) }));
}

export async function listAdminUsers(client: SupabaseClient): Promise<AdminUserItem[]> {
  const { data, error } = await client.rpc('admin_list_admin_users');
  const value = assertData(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({ userId: String(item.user_id), email: nullable(item.email), isActive: item.is_active === true, createdAt: String(item.created_at), createdBy: nullable(item.created_by), isCurrentUser: item.is_current_user === true }));
}

export async function listAnnouncementHistory(client: SupabaseClient): Promise<AnnouncementHistoryItem[]> {
  const { data, error } = await client.rpc('admin_list_announcements', { p_limit: 100 });
  const value = assertData(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({
    id: String(item.id), content: String(item.content ?? ''), destinationLevel: String(item.destination_level ?? 'GENERAL'),
    selectedPlatforms: Array.isArray(item.selected_platforms) ? item.selected_platforms.map(String) : [], status: String(item.status ?? 'DRAFT'),
    scheduledFor: nullable(item.scheduled_for), approvedAt: nullable(item.approved_at), publishedAt: nullable(item.published_at), createdAt: String(item.created_at),
    deliveryCount: Number(item.delivery_count ?? 0), sentCount: Number(item.sent_count ?? 0), failedCount: Number(item.failed_count ?? 0),
    deliveries: Array.isArray(item.deliveries) ? (item.deliveries as Record<string, unknown>[]).map((delivery) => ({ platform: String(delivery.platform), status: String(delivery.status), attemptCount: Number(delivery.attempt_count ?? 0), sentAt: nullable(delivery.sent_at), error: nullable(delivery.error) })) : [],
  }));
}
