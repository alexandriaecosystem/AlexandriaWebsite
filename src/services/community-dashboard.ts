import type { SupabaseClient } from '@supabase/supabase-js';

export type CommunityPlatform = 'TELEGRAM' | 'DISCORD' | 'WHATSAPP';

export type CommunityPlatformStat = {
  platform: CommunityPlatform;
  knownUsers: number;
  generalMembers: number;
  vipMembers: number;
  verifiedMembers: number;
  lastVerifiedAt: string | null;
  verificationConnected: boolean;
};

export type CommunityPlatformStats = {
  platforms: CommunityPlatformStat[];
  overall: {
    knownUsers: number;
    generalMembers: number;
    vipMembers: number;
    verifiedMembers: number;
  };
};

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableString = (value: unknown) => value == null ? null : String(value);

export async function getCommunityPlatformStats(client: SupabaseClient): Promise<CommunityPlatformStats> {
  const { data, error } = await client.rpc('admin_get_community_platform_stats');
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('The server returned no community membership data.');

  const value = data as Record<string, unknown>;
  const rawPlatforms = Array.isArray(value.platforms) ? value.platforms as Record<string, unknown>[] : [];
  const overall = value.overall && typeof value.overall === 'object' ? value.overall as Record<string, unknown> : {};

  return {
    platforms: rawPlatforms.map((item) => ({
      platform: String(item.platform).toUpperCase() as CommunityPlatform,
      knownUsers: numberValue(item.known_users),
      generalMembers: numberValue(item.general_members),
      vipMembers: numberValue(item.vip_members),
      verifiedMembers: numberValue(item.verified_members),
      lastVerifiedAt: nullableString(item.last_verified_at),
      verificationConnected: item.verification_connected === true,
    })),
    overall: {
      knownUsers: numberValue(overall.known_users),
      generalMembers: numberValue(overall.general_members),
      vipMembers: numberValue(overall.vip_members),
      verifiedMembers: numberValue(overall.verified_members),
    },
  };
}
