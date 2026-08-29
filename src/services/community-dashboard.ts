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

const platforms: CommunityPlatform[] = ['TELEGRAM', 'DISCORD', 'WHATSAPP'];
const fallbackPageSize = 200;

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const nullableString = (value: unknown) => value == null ? null : String(value);

function normalizeStats(data: Record<string, unknown>): CommunityPlatformStats {
  const rawPlatforms = Array.isArray(data.platforms) ? data.platforms as Record<string, unknown>[] : [];
  const overall = data.overall && typeof data.overall === 'object' ? data.overall as Record<string, unknown> : {};

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

async function getKnownUserPlatformFallback(client: SupabaseClient): Promise<CommunityPlatformStats> {
  const usersByPlatform = new Map<CommunityPlatform, Set<string>>(
    platforms.map((platform) => [platform, new Set<string>()] as const),
  );
  const knownUsers = new Set<string>();
  let offset = 0;
  let total = 0;

  do {
    const { data, error } = await client.rpc('admin_list_users', {
      p_limit: fallbackPageSize,
      p_offset: offset,
      p_search: null,
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== 'object') throw new Error('The server returned no user data for platform distribution.');

    const value = data as Record<string, unknown>;
    const items = Array.isArray(value.items) ? value.items as Record<string, unknown>[] : [];
    total = numberValue(value.total);

    items.forEach((item, index) => {
      const userId = item.id == null ? `fallback-${offset + index}` : String(item.id);
      const userPlatforms = Array.isArray(item.platforms)
        ? new Set(item.platforms.map((platform) => String(platform).toUpperCase()))
        : new Set<string>();

      let hasSupportedPlatform = false;
      for (const platform of platforms) {
        if (!userPlatforms.has(platform)) continue;
        usersByPlatform.get(platform)?.add(userId);
        hasSupportedPlatform = true;
      }
      if (hasSupportedPlatform) knownUsers.add(userId);
    });

    if (items.length === 0) break;
    offset += items.length;
  } while (offset < total);

  return {
    platforms: platforms.map((platform) => ({
      platform,
      knownUsers: usersByPlatform.get(platform)?.size ?? 0,
      generalMembers: 0,
      vipMembers: 0,
      verifiedMembers: 0,
      lastVerifiedAt: null,
      verificationConnected: false,
    })),
    overall: {
      knownUsers: knownUsers.size,
      generalMembers: 0,
      vipMembers: 0,
      verifiedMembers: 0,
    },
  };
}

export async function getCommunityPlatformStats(client: SupabaseClient): Promise<CommunityPlatformStats> {
  const { data, error } = await client.rpc('admin_get_community_platform_stats');
  if (!error && data && typeof data === 'object') return normalizeStats(data as Record<string, unknown>);

  return getKnownUserPlatformFallback(client);
}
