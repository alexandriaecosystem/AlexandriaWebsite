import type { SupabaseClient } from '@supabase/supabase-js';

export type AdmissionStage =
  | 'SCORE_REVIEW'
  | 'FORM_PENDING'
  | 'INFORMATION_REVIEW'
  | 'CORRECTIONS_REQUIRED'
  | 'APPROVED'
  | 'NOT_READY'
  | string;

export type AdmissionListItem = {
  applicationId: string;
  name: string;
  platform: string;
  stage: AdmissionStage;
  quizScore: number | null;
  personaScore: number | null;
  totalScore: number | null;
  version: number;
  updatedAt: string;
};

export type AdmissionInformation = {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  phone: string;
  xHandle: string | null;
  telegramId: string | null;
  submittedAt: string | null;
  hasIdentification: boolean;
};

export type AdmissionDecisionHistory = {
  stage: string;
  decision: string;
  reason: string;
  createdAt: string | null;
};

export type AdmissionDetail = {
  applicationId: string;
  platform: string;
  stage: AdmissionStage;
  quizScore: number | null;
  personaScore: number | null;
  totalScore: number | null;
  version: number;
  updatedAt: string;
  information: AdmissionInformation | null;
  personaEvidence: unknown[];
  personaSummary: string;
  history: AdmissionDecisionHistory[];
  formOriginConfigured: boolean;
};

export type AdmissionDecisionInput = {
  applicationId: string;
  stage: 'SCORE_REVIEW' | 'INFORMATION_REVIEW';
  decision: 'APPROVE' | 'REJECT' | 'CORRECTIONS';
  reason: string;
  version: number;
};

export type AdmissionDecisionResult = {
  applicationId: string;
  stage: string;
  accessQueued: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown, fallback = ''): string {
  return value === null || value === undefined ? fallback : String(value);
}

function idempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapListItem(value: unknown): AdmissionListItem | null {
  const row = asRecord(value);
  const applicationId = text(row.application_id ?? row.applicationId).trim();
  if (!applicationId) return null;
  return {
    applicationId,
    name: text(row.name).trim() || applicationId.slice(0, 8),
    platform: text(row.platform, 'unknown').toLowerCase(),
    stage: text(row.stage, 'SCORE_REVIEW'),
    quizScore: nullableNumber(row.quiz_score ?? row.quizScore),
    personaScore: nullableNumber(row.persona_score ?? row.personaScore),
    totalScore: nullableNumber(row.total_score ?? row.totalScore),
    version: Number(row.version) || 0,
    updatedAt: text(row.updated_at ?? row.updatedAt),
  };
}

export async function listAdmissions(client: SupabaseClient): Promise<AdmissionListItem[]> {
  const { data, error } = await client.rpc('admin_list_admissions');
  if (error) throw new Error(error.message || 'Could not load admission reviews.');
  return (Array.isArray(data) ? data : []).flatMap((item) => {
    const mapped = mapListItem(item);
    return mapped ? [mapped] : [];
  });
}

async function readFormOriginConfigured(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client
    .from('admission_settings')
    .select('form_origin')
    .eq('singleton', true)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Could not load admission configuration.');
  return Boolean(asRecord(data).form_origin);
}

function mapInformation(value: unknown): AdmissionInformation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = asRecord(value);
  return {
    firstName: text(row.first_name ?? row.firstName),
    lastName: text(row.last_name ?? row.lastName),
    email: text(row.email),
    country: text(row.country),
    phone: text(row.phone),
    xHandle: text(row.x_handle ?? row.xHandle).trim() || null,
    telegramId: text(row.telegram_id ?? row.telegramId).trim() || null,
    submittedAt: text(row.submitted_at ?? row.submittedAt).trim() || null,
    hasIdentification: Boolean(row.identification_path ?? row.has_identification ?? row.hasIdentification),
  };
}

function mapHistory(value: unknown): AdmissionDecisionHistory[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = asRecord(item);
    return {
      stage: text(row.stage),
      decision: text(row.decision),
      reason: text(row.reason),
      createdAt: text(row.created_at ?? row.createdAt).trim() || null,
    };
  });
}

export async function getAdmissionDetail(client: SupabaseClient, applicationId: string): Promise<AdmissionDetail> {
  const [{ data, error }, formOriginConfigured] = await Promise.all([
    client.rpc('admin_get_admission', { p_application_id: applicationId }),
    readFormOriginConfigured(client),
  ]);
  if (error) throw new Error(error.message || 'Could not load the admission review.');

  const payload = asRecord(data);
  const review = asRecord(payload.review);
  const id = text(review.application_id ?? applicationId).trim();
  if (!id) throw new Error('The admission review returned no application ID.');

  return {
    applicationId: id,
    platform: text(review.platform ?? payload.platform, 'unknown').toLowerCase(),
    stage: text(review.stage, 'SCORE_REVIEW'),
    quizScore: nullableNumber(review.quiz_score),
    personaScore: nullableNumber(review.persona_score),
    totalScore: nullableNumber(review.total_score),
    version: Number(review.version) || 0,
    updatedAt: text(review.updated_at),
    information: mapInformation(payload.information),
    personaEvidence: Array.isArray(payload.persona_evidence) ? payload.persona_evidence : [],
    personaSummary: text(payload.persona_summary),
    history: mapHistory(payload.history),
    formOriginConfigured,
  };
}

export async function decideAdmission(client: SupabaseClient, input: AdmissionDecisionInput): Promise<AdmissionDecisionResult> {
  const { data, error } = await client.rpc('admin_admission_decide', {
    p_application_id: input.applicationId,
    p_stage: input.stage,
    p_decision: input.decision,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey(),
    p_version: input.version,
  });
  if (error) throw new Error(error.message || 'Could not save the admission decision.');
  const row = asRecord(data);
  return {
    applicationId: text(row.application_id ?? input.applicationId),
    stage: text(row.stage),
    accessQueued: row.access_queued === true,
  };
}

export async function reissueAdmissionForm(client: SupabaseClient, applicationId: string, version: number): Promise<void> {
  const { error } = await client.rpc('admin_reissue_admission_form', {
    p_application_id: applicationId,
    p_version: version,
  });
  if (error) throw new Error(error.message || 'Could not reissue the information request.');
}

export async function getIdentificationUrl(client: SupabaseClient, applicationId: string): Promise<string> {
  const { data, error } = await client.functions.invoke('community-admission', {
    body: { action: 'IDENTIFICATION', application_id: applicationId },
  });
  if (error) throw new Error(error.message || 'Could not open the protected identification document.');
  const url = text(asRecord(data).url).trim();
  if (!url) throw new Error('The protected identification URL was not returned.');
  return url;
}
