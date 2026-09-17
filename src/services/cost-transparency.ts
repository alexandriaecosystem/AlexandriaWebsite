import type { SupabaseClient } from '@supabase/supabase-js';

export type CommunityMemberStat = {
  communityId: string;
  name: string;
  platform: string;
  communityLevel: string;
  liveMemberCount: number | null;
  liveFetchedAt: string | null;
  trackedMembers: number;
};

export type ServiceSubscription = {
  serviceKey: string;
  labelEn: string;
  labelAr: string;
  descriptionEn: string;
  descriptionAr: string;
  billingKind: 'USAGE' | 'SUBSCRIPTION' | 'FREE';
  monthlyCostUsd: number | null;
  manageUrl: string | null;
};

export type AiBilling = {
  creditsPurchasedUsd: number | null;
  creditsUsedUsd: number | null;
  creditsRemainingUsd: number | null;
  fetchedAt: string | null;
  monthSpendUsd: number;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function listCommunityMemberStats(client: SupabaseClient): Promise<CommunityMemberStat[]> {
  const { data, error } = await client.rpc('admin_list_community_member_stats');
  if (error) throw new Error(error.message);
  const items = Array.isArray(asObject(data).items) ? asObject(data).items as unknown[] : [];
  return items.map((raw) => {
    const item = asObject(raw);
    return {
      communityId: String(item.community_id ?? ''),
      name: String(item.name ?? ''),
      platform: String(item.platform ?? ''),
      communityLevel: String(item.community_level ?? 'GENERAL'),
      liveMemberCount: nullableNumber(item.live_member_count),
      liveFetchedAt: item.live_fetched_at ? String(item.live_fetched_at) : null,
      trackedMembers: Number(item.tracked_members ?? 0),
    };
  });
}

export async function listServiceSubscriptions(client: SupabaseClient): Promise<ServiceSubscription[]> {
  const { data, error } = await client.rpc('admin_list_service_subscriptions');
  if (error) throw new Error(error.message);
  const items = Array.isArray(asObject(data).items) ? asObject(data).items as unknown[] : [];
  return items.map((raw) => {
    const item = asObject(raw);
    const kind = String(item.billing_kind ?? 'FREE');
    return {
      serviceKey: String(item.service_key ?? ''),
      labelEn: String(item.label_en ?? ''),
      labelAr: String(item.label_ar ?? ''),
      descriptionEn: String(item.description_en ?? ''),
      descriptionAr: String(item.description_ar ?? ''),
      billingKind: kind === 'USAGE' || kind === 'SUBSCRIPTION' ? kind : 'FREE',
      monthlyCostUsd: nullableNumber(item.monthly_cost_usd),
      manageUrl: item.manage_url ? String(item.manage_url) : null,
    };
  });
}

export async function updateServiceSubscriptionCost(client: SupabaseClient, serviceKey: string, monthlyCostUsd: number | null) {
  const { error } = await client.rpc('admin_update_service_subscription', {
    p_service_key: serviceKey,
    p_monthly_cost_usd: monthlyCostUsd,
  });
  if (error) throw new Error(error.message);
}

export async function getAiBilling(client: SupabaseClient): Promise<AiBilling> {
  const { data, error } = await client.rpc('admin_get_ai_billing');
  if (error) throw new Error(error.message);
  const value = asObject(data);
  return {
    creditsPurchasedUsd: nullableNumber(value.credits_purchased_usd),
    creditsUsedUsd: nullableNumber(value.credits_used_usd),
    creditsRemainingUsd: nullableNumber(value.credits_remaining_usd),
    fetchedAt: value.fetched_at ? String(value.fetched_at) : null,
    monthSpendUsd: Number(value.month_spend_usd ?? 0),
  };
}
