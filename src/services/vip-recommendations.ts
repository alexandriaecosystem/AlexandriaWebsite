import type { SupabaseClient } from '@supabase/supabase-js';

export type VipRecommendation = {
  userId: string;
  name: string | null;
  country: string | null;
  language: string | null;
  qualificationScore: number | null;
  answerCount: number;
  lastEvidenceAt: string | null;
  platforms: string[];
};

export type MemberPortfolio = {
  qualification: {
    score: number | null;
    answerCount: number;
    reviewRequired: boolean;
    status: string;
    firstEvidenceAt: string | null;
    lastEvidenceAt: string | null;
  } | null;
  evidenceCount: number;
  admissionInformation: Record<string, unknown> | null;
  communities: Array<{ communityId: string; state: string }>;
};

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error('The server returned no data.');
  return data;
}

const asNullableString = (value: unknown) => value == null ? null : String(value);
const asNumberOrNull = (value: unknown) => value == null || value === '' ? null : Number(value);

export async function listVipRecommendations(client: SupabaseClient): Promise<VipRecommendation[]> {
  const { data, error } = await client.rpc('admin_list_vip_recommendations');
  const value = assertData(data as { items?: Record<string, unknown>[] } | null, error);
  return (value.items ?? []).map((item) => ({
    userId: String(item.user_id),
    name: asNullableString(item.name),
    country: asNullableString(item.country),
    language: asNullableString(item.language),
    qualificationScore: asNumberOrNull(item.qualification_score),
    answerCount: Number(item.answer_count ?? 0),
    lastEvidenceAt: asNullableString(item.last_evidence_at),
    platforms: Array.isArray(item.platforms) ? item.platforms.map(String) : [],
  }));
}

export async function approveVipRecommendation(client: SupabaseClient, userId: string, reason?: string): Promise<{ applicationId: string; platform: string }> {
  const { data, error } = await client.rpc('admin_approve_vip_recommendation', {
    p_user_id: userId,
    p_reason: reason?.trim() || null,
  });
  const value = assertData(data as Record<string, unknown> | null, error);
  return { applicationId: String(value.application_id), platform: String(value.platform ?? '') };
}

export async function dismissVipRecommendation(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.rpc('admin_dismiss_vip_recommendation', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export async function getMemberPortfolio(client: SupabaseClient, userId: string): Promise<MemberPortfolio> {
  const { data, error } = await client.rpc('admin_get_member_portfolio', { p_user_id: userId });
  const value = assertData(data as Record<string, unknown> | null, error);
  const q = value.qualification && typeof value.qualification === 'object'
    ? value.qualification as Record<string, unknown>
    : null;
  const communities = Array.isArray(value.communities) ? value.communities as Record<string, unknown>[] : [];
  return {
    qualification: q ? {
      score: asNumberOrNull(q.score),
      answerCount: Number(q.answer_count ?? 0),
      reviewRequired: q.review_required === true,
      status: String(q.status ?? 'ACTIVE'),
      firstEvidenceAt: asNullableString(q.first_evidence_at),
      lastEvidenceAt: asNullableString(q.last_evidence_at),
    } : null,
    evidenceCount: Number(value.evidence_count ?? 0),
    admissionInformation: value.admission_information && typeof value.admission_information === 'object'
      ? value.admission_information as Record<string, unknown>
      : null,
    communities: communities.map((item) => ({
      communityId: String(item.community_id),
      state: String(item.state ?? ''),
    })),
  };
}

export async function mergeMembers(client: SupabaseClient, primaryUserId: string, duplicateUserId: string): Promise<{ accountsMoved: number }> {
  const { data, error } = await client.rpc('admin_merge_members', {
    p_primary_user_id: primaryUserId,
    p_duplicate_user_id: duplicateUserId,
  });
  const value = assertData(data as Record<string, unknown> | null, error);
  return { accountsMoved: Number(value.accounts_moved ?? 0) };
}
