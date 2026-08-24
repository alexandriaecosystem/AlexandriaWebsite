import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessagingPlatform } from '../types/contracts';

export type AnnouncementAudience = 'GENERAL' | 'APPROVED' | 'BOTH';

export type AdminUiSettings = {
  announcementDefaultAudience: AnnouncementAudience;
  announcementDefaultPlatforms: MessagingPlatform[];
  tokenLargeTransferThreshold: number;
  tokenAutoRefreshSeconds: 0 | 30 | 60 | 120 | 300;
};

const allowedPlatforms: MessagingPlatform[] = ['telegram', 'discord', 'whatsapp'];
const allowedRefresh = [0, 30, 60, 120, 300] as const;

function parseSettings(value: Record<string, unknown>): AdminUiSettings {
  const audienceRaw = String(value.announcement_default_audience ?? 'GENERAL');
  const announcementDefaultAudience: AnnouncementAudience = ['GENERAL', 'APPROVED', 'BOTH'].includes(audienceRaw)
    ? audienceRaw as AnnouncementAudience
    : 'GENERAL';

  const platformRaw = String(value.announcement_default_platforms ?? 'telegram');
  const announcementDefaultPlatforms = platformRaw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is MessagingPlatform => allowedPlatforms.includes(item as MessagingPlatform));

  const threshold = Number(value.token_large_transfer_threshold ?? 100000);
  const refreshRaw = Number(value.token_auto_refresh_seconds ?? 60);
  const tokenAutoRefreshSeconds = allowedRefresh.includes(refreshRaw as (typeof allowedRefresh)[number])
    ? refreshRaw as AdminUiSettings['tokenAutoRefreshSeconds']
    : 60;

  return {
    announcementDefaultAudience,
    announcementDefaultPlatforms: announcementDefaultPlatforms.length ? announcementDefaultPlatforms : ['telegram'],
    tokenLargeTransferThreshold: Number.isFinite(threshold) && threshold >= 0 ? threshold : 100000,
    tokenAutoRefreshSeconds,
  };
}

export async function getAdminUiSettings(client: SupabaseClient): Promise<AdminUiSettings> {
  const { data, error } = await client.rpc('admin_get_ui_settings');
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('Settings could not be loaded.');
  return parseSettings(data as Record<string, unknown>);
}

export async function updateAdminUiSettings(client: SupabaseClient, settings: AdminUiSettings): Promise<AdminUiSettings> {
  const { data, error } = await client.rpc('admin_update_ui_settings', {
    p_announcement_default_audience: settings.announcementDefaultAudience,
    p_announcement_default_platforms: settings.announcementDefaultPlatforms,
    p_token_large_transfer_threshold: settings.tokenLargeTransferThreshold,
    p_token_auto_refresh_seconds: settings.tokenAutoRefreshSeconds,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object') throw new Error('Settings were saved but could not be reloaded.');
  return parseSettings(data as Record<string, unknown>);
}
