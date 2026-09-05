import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiSleepPlatform } from './ai-sleep';

export type TakeoverTarget = {
  communityId: string;
  platform: AiSleepPlatform;
  name: string;
  communityLevel: string;
};

export type CreateCommunityTakeoverInput = {
  communityId: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

function normalizePlatform(value: unknown): AiSleepPlatform {
  const platform = String(value ?? '').toUpperCase();
  if (platform !== 'TELEGRAM' && platform !== 'DISCORD' && platform !== 'WHATSAPP') {
    throw new Error('The server returned an unsupported takeover platform.');
  }
  return platform;
}

export async function listTakeoverTargets(client: SupabaseClient): Promise<TakeoverTarget[]> {
  const { data, error } = await client.rpc('admin_list_takeover_targets');
  if (error) throw new Error(error.message || 'Could not load takeover targets.');
  if (!Array.isArray(data)) throw new Error('The server returned invalid takeover targets.');

  return data.map((row) => {
    const value = row as Record<string, unknown>;
    return {
      communityId: String(value.community_id),
      platform: normalizePlatform(value.platform),
      name: String(value.name ?? 'Unnamed community'),
      communityLevel: String(value.community_level ?? ''),
    };
  });
}

export async function createCommunityTakeover(
  client: SupabaseClient,
  input: CreateCommunityTakeoverInput,
): Promise<unknown> {
  const communityId = input.communityId.trim();
  if (!communityId) throw new Error('Choose a community or conversation.');

  const { data, error } = await client.rpc('admin_create_community_takeover', {
    p_community_id: communityId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason?.trim() || null,
  });

  if (error) throw new Error(error.message || 'Could not schedule the takeover.');
  if (data == null) throw new Error('The server returned no takeover data.');
  return data;
}
