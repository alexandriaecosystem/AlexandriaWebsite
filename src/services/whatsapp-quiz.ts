import type { SupabaseClient } from '@supabase/supabase-js';

export type QuizFrequency = 'daily' | 'weekly' | 'custom';
export type QuizPreviewStatus = 'READY' | 'ERROR';

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

export type WhatsAppQuizPreviewQuestion = {
  id: string;
  sourceQuestionNo: number;
  prompt: string;
  options: string[];
  rewardCredits: number;
};

export type WhatsAppQuizQuestionStats = {
  total: number;
  active: number;
  excluded: number;
};

export type WhatsAppQuizAdminData = {
  targets: WhatsAppQuizTarget[];
  schedule: WhatsAppQuizSchedule;
  questions: WhatsAppQuizPreviewQuestion[];
  questionStats: WhatsAppQuizQuestionStats | null;
  questionPreviewStatus: QuizPreviewStatus;
};

export type SaveWhatsappQuizScheduleInput = {
  enabled: boolean;
  communityId: string;
  frequency: QuizFrequency;
  timeOfDay: string;
  timezone: string;
  daysOfWeek: number[];
};

export type AddWhatsappQuizQuestionInput = {
  prompt: string;
  options: [string, string, string, string] | string[];
  correctOptionIndex: number;
};

type QuestionPreviewState = Pick<WhatsAppQuizAdminData, 'questions' | 'questionStats' | 'questionPreviewStatus'>;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The quiz service returned an invalid response.');
  }
  return value as Record<string, unknown>;
}

function normalizeFrequency(value: unknown): QuizFrequency {
  return value === 'weekly' || value === 'custom' ? value : 'daily';
}

function mapTargets(value: unknown): WhatsAppQuizTarget[] {
  const rawTargets = Array.isArray(value) ? value : [];
  return rawTargets.map((item) => {
    const row = asRecord(item);
    return {
      communityId: String(row.community_id ?? row.communityId ?? ''),
      name: String(row.name ?? 'WhatsApp community'),
      communityLevel: String(row.community_level ?? row.communityLevel ?? ''),
    };
  }).filter((item) => item.communityId);
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mapQuestionPreview(value: unknown): QuestionPreviewState {
  const payload = asRecord(value);
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];
  const questions = rawQuestions.flatMap((item): WhatsAppQuizPreviewQuestion[] => {
    try {
      const row = asRecord(item);
      const id = String(row.id ?? '').trim();
      const prompt = String(row.prompt ?? '').trim();
      const sourceQuestionNo = nonNegativeInteger(row.source_question_no ?? row.sourceQuestionNo);
      const options = Array.isArray(row.options)
        ? row.options.map((option) => String(option).trim()).filter(Boolean)
        : [];
      const rewardCredits = nonNegativeInteger(row.reward_credits ?? row.rewardCredits) ?? 0;
      if (!id || !prompt || sourceQuestionNo === null || options.length < 2) return [];
      return [{ id, sourceQuestionNo, prompt, options, rewardCredits }];
    } catch {
      return [];
    }
  });

  let questionStats: WhatsAppQuizQuestionStats | null = null;
  try {
    const stats = asRecord(payload.question_stats ?? payload.questionStats ?? {});
    const total = nonNegativeInteger(stats.total);
    const active = nonNegativeInteger(stats.active);
    const excluded = nonNegativeInteger(stats.excluded);
    if (total !== null && active !== null && excluded !== null) {
      questionStats = { total, active, excluded };
    }
  } catch {
    questionStats = null;
  }

  const rawStatus = String(payload.question_preview_status ?? payload.questionPreviewStatus ?? '').toUpperCase();
  return {
    questions,
    questionStats,
    questionPreviewStatus: rawStatus === 'READY' ? 'READY' : 'ERROR',
  };
}

function unavailableQuestionPreview(): QuestionPreviewState {
  return { questions: [], questionStats: null, questionPreviewStatus: 'ERROR' };
}

function mapResponse(value: unknown): WhatsAppQuizAdminData {
  const payload = asRecord(value);
  const schedule = asRecord(payload.schedule ?? {});
  const targets = mapTargets(payload.targets);

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
    ...unavailableQuestionPreview(),
  };
}

function preferredQuizTarget(targets: WhatsAppQuizTarget[]): WhatsAppQuizTarget | undefined {
  return targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && /general/i.test(target.name) && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL')
    ?? targets[0];
}

function schedulerUnavailableState(targets: WhatsAppQuizTarget[]): WhatsAppQuizAdminData {
  const preferred = preferredQuizTarget(targets);
  return {
    targets,
    schedule: {
      enabled: false,
      communityId: preferred?.communityId ?? null,
      communityName: preferred?.name ?? null,
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      daysOfWeek: [],
      status: 'ERROR',
      lastRunAt: null,
      nextRunAt: null,
      lastError: 'Quiz scheduler connection needs attention. Settings can still be reviewed, but saving or sending may fail until the connection recovers.',
    },
    ...unavailableQuestionPreview(),
  };
}

async function loadQuestionPreview(client: SupabaseClient): Promise<QuestionPreviewState> {
  const { data, error } = await client.rpc('admin_get_whatsapp_quiz_preview', { p_limit: 10 });
  if (error) return unavailableQuestionPreview();
  try {
    return mapQuestionPreview(data);
  } catch {
    return unavailableQuestionPreview();
  }
}

async function invoke(client: SupabaseClient, body: Record<string, unknown>): Promise<WhatsAppQuizAdminData> {
  const { data, error } = await client.functions.invoke('whatsapp-quiz-admin', { body });
  if (error) throw new Error(error.message || 'Could not update the WhatsApp quiz settings.');
  return mapResponse(data);
}

export async function loadWhatsappQuizAdmin(client: SupabaseClient): Promise<WhatsAppQuizAdminData> {
  const previewPromise = loadQuestionPreview(client);
  try {
    const state = await invoke(client, { action: 'STATUS' });
    const preview = await previewPromise;
    return { ...state, ...preview };
  } catch (primaryError) {
    const { data, error } = await client.rpc('admin_list_takeover_targets');
    if (error) throw primaryError;

    const targets = mapTargets(data).filter((target) => {
      const source = Array.isArray(data)
        ? data.find((item) => {
          try {
            return String(asRecord(item).community_id ?? '') === target.communityId;
          } catch {
            return false;
          }
        })
        : undefined;
      if (!source) return false;
      try {
        return String(asRecord(source).platform ?? '').toUpperCase() === 'WHATSAPP';
      } catch {
        return false;
      }
    });

    const preview = await previewPromise;
    return { ...schedulerUnavailableState(targets), ...preview };
  }
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

export function addWhatsappQuizQuestion(client: SupabaseClient, input: AddWhatsappQuizQuestionInput): Promise<WhatsAppQuizAdminData> {
  return invoke(client, {
    action: 'ADD_QUESTION',
    prompt: input.prompt,
    options: input.options,
    correct_option_index: input.correctOptionIndex,
  });
}
