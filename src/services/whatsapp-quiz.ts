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

export type AdmissionQuestionBankItem = {
  id: string;
  number: number;
  prompt: string;
};

export type AdmissionQuizSettings = {
  greeting: string;
  questionIds: string[];
  formOrigin: string | null;
  updatedAt: string | null;
  questionBank: AdmissionQuestionBankItem[];
};

export type WhatsAppQuizAdminData = {
  targets: WhatsAppQuizTarget[];
  schedule: WhatsAppQuizSchedule;
  questions: WhatsAppQuizPreviewQuestion[];
  questionStats: WhatsAppQuizQuestionStats | null;
  questionPreviewStatus: QuizPreviewStatus;
  admission: AdmissionQuizSettings;
};

export type SaveWhatsappQuizScheduleInput = {
  enabled: boolean;
  communityId: string;
  frequency: QuizFrequency;
  timeOfDay: string;
  timezone: string;
  daysOfWeek: number[];
};

export type SaveAdmissionQuizSettingsInput = {
  greeting: string;
  questionIds: string[];
  formOrigin: string | null;
};

export type AddWhatsappQuizQuestionInput = {
  prompt: string;
  options: [string, string, string, string] | string[];
  correctOptionIndex: number;
};

type SchedulerState = Pick<WhatsAppQuizAdminData, 'targets' | 'schedule'>;
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
    if (total !== null && active !== null && excluded !== null) questionStats = { total, active, excluded };
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

function mapSchedulerResponse(value: unknown): SchedulerState {
  const payload = asRecord(value);
  const schedule = asRecord(payload.schedule ?? {});
  const daysRaw = Array.isArray(schedule.days_of_week)
    ? schedule.days_of_week
    : Array.isArray(schedule.daysOfWeek)
      ? schedule.daysOfWeek
      : [];

  return {
    targets: mapTargets(payload.targets),
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

function preferredQuizTarget(targets: WhatsAppQuizTarget[]): WhatsAppQuizTarget | undefined {
  return targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && /general/i.test(target.name) && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL');
}

function schedulerUnavailableState(targets: WhatsAppQuizTarget[]): SchedulerState {
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
      lastError: 'Quiz scheduler connection needs attention. Settings can still be reviewed, but saving may fail until the connection recovers.',
    },
  };
}

async function loadQuestionPreview(client: SupabaseClient): Promise<QuestionPreviewState> {
  const { data, error } = await client.rpc('admin_get_whatsapp_quiz_preview', { p_limit: 5 });
  if (error) return unavailableQuestionPreview();
  try {
    return mapQuestionPreview(data);
  } catch {
    return unavailableQuestionPreview();
  }
}

function mapAdmissionQuestionBank(value: unknown): AdmissionQuestionBankItem[] {
  return (Array.isArray(value) ? value : []).flatMap((item): AdmissionQuestionBankItem[] => {
    try {
      const row = asRecord(item);
      const id = String(row.id ?? '').trim();
      const prompt = String(row.prompt ?? '').trim();
      const number = Number(row.number);
      if (!id || !prompt || !Number.isFinite(number)) return [];
      return [{ id, number, prompt }];
    } catch {
      return [];
    }
  });
}

async function loadAdmissionSettings(client: SupabaseClient): Promise<AdmissionQuizSettings> {
  const [settingsResult, bankResult] = await Promise.all([
    client.from('admission_settings').select('greeting, question_ids, form_origin, updated_at').eq('singleton', true).maybeSingle(),
    client.rpc('admin_admission_question_bank'),
  ]);
  if (settingsResult.error) throw new Error(settingsResult.error.message || 'Could not load admission settings.');
  if (bankResult.error) throw new Error(bankResult.error.message || 'Could not load the admission question bank.');

  const row = settingsResult.data ? asRecord(settingsResult.data) : {};
  return {
    greeting: String(row.greeting ?? ''),
    questionIds: Array.isArray(row.question_ids) ? row.question_ids.map(String) : [],
    formOrigin: row.form_origin == null || String(row.form_origin).trim() === '' ? null : String(row.form_origin),
    updatedAt: row.updated_at == null ? null : String(row.updated_at),
    questionBank: mapAdmissionQuestionBank(bankResult.data),
  };
}

async function invokeScheduler(client: SupabaseClient, body: Record<string, unknown>): Promise<SchedulerState> {
  const { data, error } = await client.functions.invoke('whatsapp-quiz-admin', { body });
  if (error) throw new Error(error.message || 'Could not update the WhatsApp quiz settings.');
  return mapSchedulerResponse(data);
}

export async function loadWhatsappQuizAdmin(client: SupabaseClient): Promise<WhatsAppQuizAdminData> {
  const previewPromise = loadQuestionPreview(client);
  const admissionPromise = loadAdmissionSettings(client);
  try {
    const scheduler = await invokeScheduler(client, { action: 'STATUS' });
    const [preview, admission] = await Promise.all([previewPromise, admissionPromise]);
    return { ...scheduler, ...preview, admission };
  } catch (primaryError) {
    const { data, error } = await client.rpc('admin_list_takeover_targets');
    if (error) throw primaryError;

    const targets = mapTargets(data).filter((target) => {
      const source = Array.isArray(data)
        ? data.find((item) => {
          try { return String(asRecord(item).community_id ?? '') === target.communityId; } catch { return false; }
        })
        : undefined;
      if (!source) return false;
      try { return String(asRecord(source).platform ?? '').toUpperCase() === 'WHATSAPP'; } catch { return false; }
    });
    const [preview, admission] = await Promise.all([previewPromise, admissionPromise]);
    return { ...schedulerUnavailableState(targets), ...preview, admission };
  }
}

export async function saveWhatsappQuizSchedule(client: SupabaseClient, input: SaveWhatsappQuizScheduleInput): Promise<void> {
  await invokeScheduler(client, {
    action: 'SAVE',
    community_id: input.communityId,
    enabled: input.enabled,
    frequency: input.frequency,
    time_of_day: input.timeOfDay,
    timezone: input.timezone,
    days_of_week: input.daysOfWeek,
  });
}

export async function saveAdmissionQuizSettings(client: SupabaseClient, input: SaveAdmissionQuizSettingsInput): Promise<void> {
  const { error } = await client.rpc('admin_save_admission_settings', {
    p_form_origin: input.formOrigin,
    p_question_ids: input.questionIds,
    p_greeting: input.greeting.trim(),
  });
  if (error) throw new Error(error.message || 'Could not save the admission quiz settings.');
}

export async function addWhatsappQuizQuestion(client: SupabaseClient, input: AddWhatsappQuizQuestionInput): Promise<void> {
  await invokeScheduler(client, {
    action: 'ADD_QUESTION',
    prompt: input.prompt,
    options: input.options,
    correct_option_index: input.correctOptionIndex,
  });
}
