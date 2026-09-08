import type { SupabaseClient } from '@supabase/supabase-js';

export type QuizFrequency = 'daily' | 'weekly' | 'custom';

export type WhatsAppQuizTarget = {
  communityId: string;
  name: string;
  communityLevel: string;
};

export type WhatsAppQuizSchedule = {
  enabled: boolean;
  communityId: string | null;
  communityName: string | null;
  frequency: QuizFrequency;
  timeOfDay: string;
  timezone: string;
  daysOfWeek: number[];
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string;
};

export type WhatsAppQuizAdminData = {
  targets: WhatsAppQuizTarget[];
  schedule: WhatsAppQuizSchedule;
};

export type SaveWhatsappQuizScheduleInput = {
  enabled: boolean;
  communityId: string;
  frequency: QuizFrequency;
  timeOfDay: string;
  timezone: string;
  daysOfWeek: number[];
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The quiz service returned an invalid response.');
  }
  return value as Record<string, unknown>;
}

function normalizeFrequency(value: unknown): QuizFrequency {
  return value === 'weekly' || value === 'custom' ? value : 'daily';
}

function mapResponse(value: unknown): WhatsAppQuizAdminData {
  const payload = asRecord(value);
  const rawTargets = Array.isArray(payload.targets) ? payload.targets : [];
  const schedule = asRecord(payload.schedule ?? {});

  const targets = rawTargets.map((item) => {
    const row = asRecord(item);
    return {
      communityId: String(row.community_id ?? row.communityId ?? ''),
      name: String(row.name ?? 'WhatsApp community'),
      communityLevel: String(row.community_level ?? row.communityLevel ?? ''),
    };
  }).filter((item) => item.communityId);

  const daysRaw = Array.isArray(schedule.days_of_week)
    ? schedule.days_of_week
    : Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek
      : [];

  return {
    targets,
    schedule: {
      enabled: schedule.enabled === true,
      communityId: schedule.community_id == null && schedule.communityId == null
        ? null
        : String(schedule.community_id ?? schedule.communityId),
      communityName: schedule.community_name == null && schedule.communityName == null
        ? null
        : String(schedule.community_name ?? schedule.communityName),
      frequency: normalizeFrequency(schedule.frequency),
      timeOfDay: String(schedule.time_of_day ?? schedule.timeOfDay ?? '19:00'),
      timezone: String(schedule.timezone ?? 'Asia/Beirut'),
      daysOfWeek: daysRaw.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7),
      status: String(schedule.status ?? 'PAUSED'),
      lastRunAt: schedule.last_run_at == null && schedule.lastRunAt == null ? null : String(schedule.last_run_at ?? schedule.lastRunAt),
      nextRunAt: schedule.next_run_at == null && schedule.nextRunAt == null ? null : String(schedule.next_run_at ?? schedule.nextRunAt),
      lastError: String(schedule.last_error ?? schedule.lastError ?? ''),
    },
  };
}

async function invoke(client: SupabaseClient, body: Record<string, unknown>): Promise<WhatsAppQuizAdminData> {
  const { data, error } = await client.functions.invoke('whatsapp-quiz-admin', { body });
  if (error) throw new Error(error.message || 'Could not update the WhatsApp quiz settings.');
  return mapResponse(data);
}

export function loadWhatsappQuizAdmin(client: SupabaseClient): Promise<WhatsAppQuizAdminData> {
  return invoke(client, { action: 'STATUS' });
}

export async function saveWhatsappQuizSchedule(client: SupabaseClient, input: SaveWhatsappQuizScheduleInput): Promise<WhatsAppQuizAdminData> {
  return invoke(client, {
    action: 'SAVE',
    community_id: input.communityId,
    enabled: input.enabled,
    frequency: input.frequency,
    time_of_day: input.timeOfDay,
    timezone: input.timezone,
    days_of_week: input.daysOfWeek,
    question_count: 10,
  });
}

export function sendWhatsappQuizNow(client: SupabaseClient, communityId: string): Promise<WhatsAppQuizAdminData> {
  return invoke(client, { action: 'RUN_NOW', community_id: communityId, question_count: 10 });
}

export function pauseWhatsappQuiz(client: SupabaseClient): Promise<WhatsAppQuizAdminData> {
  return invoke(client, { action: 'PAUSE' });
}
