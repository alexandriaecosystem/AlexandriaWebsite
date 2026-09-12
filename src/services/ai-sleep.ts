import type { SupabaseClient } from '@supabase/supabase-js';

export type AiSleepPlatform = 'TELEGRAM' | 'DISCORD' | 'WHATSAPP';
export type AiSleepWindowStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'CANCELLED';

export type AiSleepWindow = {
  id: string;
  platform: AiSleepPlatform;
  externalChannelId: string;
  externalChannelName: string | null;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  createdBy: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  status: AiSleepWindowStatus;
};

export type AiSleepWindowList = {
  items: AiSleepWindow[];
  total: number;
};

export type AiSleepWindowFilters = {
  platform?: AiSleepPlatform | null;
  status?: AiSleepWindowStatus | null;
  limit?: number;
  offset?: number;
};

export type CreateAiSleepWindowInput = {
  platform: AiSleepPlatform;
  externalChannelId: string;
  externalChannelName?: string | null;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
};

export type KnownAiSleepChannel = {
  platform: AiSleepPlatform;
  externalChannelId: string;
  name: string;
  communityLevel: string;
};

const MAX_SLEEP_MS = 30 * 24 * 60 * 60 * 1000;

function nullableString(value: unknown): string | null {
  return value == null || value === '' ? null : String(value);
}

function normalizePlatform(value: unknown): AiSleepPlatform {
  const platform = String(value ?? '').toUpperCase();
  if (platform !== 'TELEGRAM' && platform !== 'DISCORD' && platform !== 'WHATSAPP') {
    throw new Error('The server returned an invalid sleep platform.');
  }
  return platform;
}

function normalizeStatus(value: unknown): AiSleepWindowStatus {
  const status = String(value ?? '').toUpperCase();
  if (status === 'ACTIVE' || status === 'UPCOMING' || status === 'ENDED' || status === 'CANCELLED') return status;
  throw new Error('The server returned an invalid sleep status.');
}

function normalizeWindow(value: Record<string, unknown>): AiSleepWindow {
  return {
    id: String(value.id),
    platform: normalizePlatform(value.platform),
    externalChannelId: String(value.external_channel_id),
    externalChannelName: nullableString(value.external_channel_name),
    startsAt: String(value.starts_at),
    endsAt: String(value.ends_at),
    reason: nullableString(value.reason),
    createdBy: String(value.created_by),
    createdAt: String(value.created_at),
    cancelledAt: nullableString(value.cancelled_at),
    cancelledBy: nullableString(value.cancelled_by),
    status: normalizeStatus(value.status),
  };
}

function assertRpc(data: unknown, error: { message?: string } | null): unknown {
  if (error) throw new Error(error.message || 'AI sleep mode request failed.');
  if (data == null) throw new Error('The server returned no AI sleep mode data.');
  return data;
}

export async function listAiSleepWindows(
  client: SupabaseClient,
  filters: AiSleepWindowFilters = {},
): Promise<AiSleepWindowList> {
  const { data, error } = await client.rpc('admin_list_ai_sleep_windows', {
    p_platform: filters.platform ?? null,
    p_status: filters.status ?? null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  });
  const raw = assertRpc(data, error) as Record<string, unknown>;
  const items = Array.isArray(raw.items) ? raw.items as Record<string, unknown>[] : [];
  return {
    items: items.map(normalizeWindow),
    total: Number(raw.total ?? items.length),
  };
}

export async function createAiSleepWindow(
  client: SupabaseClient,
  input: CreateAiSleepWindowInput,
): Promise<unknown> {
  const { data, error } = await client.rpc('admin_create_ai_sleep_window', {
    p_platform: input.platform,
    p_external_channel_id: input.externalChannelId.trim(),
    p_external_channel_name: input.externalChannelName?.trim() || null,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_reason: input.reason?.trim() || null,
  });
  return assertRpc(data, error);
}

export async function cancelAiSleepWindow(client: SupabaseClient, windowId: string): Promise<void> {
  const { error } = await client.rpc('admin_cancel_ai_sleep_window', { p_window_id: windowId });
  if (error) throw new Error(error.message || 'Could not wake the AI.');
}

function normalizeKnownChannel(value: Record<string, unknown>): KnownAiSleepChannel {
  return {
    platform: normalizePlatform(value.platform),
    externalChannelId: String(value.external_target_id),
    name: String(value.name ?? ''),
    communityLevel: String(value.community_level ?? ''),
  };
}

export async function listKnownAiSleepChannels(client: SupabaseClient): Promise<KnownAiSleepChannel[]> {
  const { data, error } = await client.rpc('admin_list_known_ai_sleep_channels');
  if (error) throw new Error(error.message || 'Could not load known channels.');
  const items = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  return items.map(normalizeKnownChannel);
}

export function localDateTimeToIso(value: string): string {
  const parsed = new Date(value);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error('Invalid date or time.');
  return parsed.toISOString();
}

export function validateSleepRange(startLocal: string, endLocal: string): { startsAt: string; endsAt: string } {
  const startsAt = localDateTimeToIso(startLocal);
  const endsAt = localDateTimeToIso(endLocal);
  const startMs = new Date(startsAt).getTime();
  const endMs = new Date(endsAt).getTime();
  if (endMs <= startMs) throw new Error('Sleep end time must be after the start time.');
  if (endMs - startMs > MAX_SLEEP_MS) throw new Error('Sleep windows cannot be longer than 30 days.');
  return { startsAt, endsAt };
}

export function classifyAiSleepWindow(window: Pick<AiSleepWindow, 'startsAt' | 'endsAt' | 'cancelledAt'>, now = new Date()): AiSleepWindowStatus {
  if (window.cancelledAt) return 'CANCELLED';
  const current = now.getTime();
  const start = new Date(window.startsAt).getTime();
  const end = new Date(window.endsAt).getTime();
  if (current < start) return 'UPCOMING';
  if (current >= end) return 'ENDED';
  return 'ACTIVE';
}

function durationParts(milliseconds: number): { days: number; hours: number; minutes: number } {
  const minutesTotal = Math.max(0, Math.floor(milliseconds / 60_000));
  const days = Math.floor(minutesTotal / 1440);
  const hours = Math.floor((minutesTotal % 1440) / 60);
  const minutes = minutesTotal % 60;
  return { days, hours, minutes };
}

function compactDuration(milliseconds: number): string {
  const { days, hours, minutes } = durationParts(milliseconds);
  if (days) return `${days}d${hours ? ` ${hours}h` : ''}`;
  if (hours) return `${hours}h${minutes ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

export function formatSleepDuration(startsAt: string, endsAt: string): string {
  return compactDuration(new Date(endsAt).getTime() - new Date(startsAt).getTime());
}

export function formatWakeCountdown(endsAt: string, now = new Date()): string {
  return compactDuration(new Date(endsAt).getTime() - now.getTime());
}
