import type { SupabaseClient } from '@supabase/supabase-js';

export type KnowledgeGapStatus = 'OPEN' | 'RESOLVED' | 'IGNORED';

export type KnowledgeGap = {
  id: string;
  question: string;
  platform: string | null;
  language: string | null;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  status: KnowledgeGapStatus;
  resolvedDocumentId: string | null;
  adminAnswer: string | null;
  answeredAt: string | null;
  answerProcessingStatus?: string | null;
  answerConflictScanStatus?: string | null;
};

const nullable = (value: unknown) => value == null ? null : String(value);

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error('The server returned no data.');
  return data;
}

export async function listKnowledgeGaps(client: SupabaseClient, status = 'OPEN') {
  const { data, error } = await client.rpc('admin_list_knowledge_gaps', {
    p_limit: 200,
    p_status: status === 'ALL' ? null : status,
  });
  const value = assertData(data as { items?: Record<string, unknown>[]; total?: number } | null, error);
  return {
    total: Number(value.total ?? 0),
    items: (value.items ?? []).map((item): KnowledgeGap => ({
      id: String(item.id),
      question: String(item.sample_question ?? ''),
      platform: nullable(item.platform),
      language: nullable(item.language),
      occurrenceCount: Number(item.occurrence_count ?? 1),
      firstSeenAt: String(item.first_seen_at),
      lastSeenAt: String(item.last_seen_at),
      status: String(item.status ?? 'OPEN') as KnowledgeGapStatus,
      resolvedDocumentId: nullable(item.resolved_document_id),
      adminAnswer: nullable(item.admin_answer),
      answeredAt: nullable(item.answered_at),
      answerProcessingStatus: nullable(item.answer_processing_status),
      answerConflictScanStatus: nullable(item.answer_conflict_scan_status),
    })),
  };
}

export async function answerKnowledgeGap(client: SupabaseClient, gapId: string, answer: string) {
  const normalized = answer.trim();
  if (normalized.length < 2 || normalized.length > 20000) {
    throw new Error('Answer must be between 2 and 20000 characters.');
  }
  const { data, error } = await client.rpc('admin_answer_knowledge_gap', {
    p_gap_id: gapId,
    p_answer: normalized,
  });
  return assertData(data, error);
}

export async function reopenKnowledgeGap(client: SupabaseClient, gapId: string) {
  const { data, error } = await client.rpc('admin_reopen_knowledge_gap', { p_gap_id: gapId });
  return assertData(data, error);
}

export async function ignoreKnowledgeGap(client: SupabaseClient, gapId: string) {
  const { data, error } = await client.rpc('admin_update_knowledge_gap_status', {
    p_gap_id: gapId,
    p_status: 'IGNORED',
    p_document_id: null,
  });
  return assertData(data, error);
}
