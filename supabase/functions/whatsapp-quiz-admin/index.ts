import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const N8N_BASE_URL = (
  Deno.env.get("CRYPTO_N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_BASE_URL")
  ?? ""
).replace(/\/$/, "");
const INTERNAL_SECRET = Deno.env.get("CRYPTO_INTERNAL_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type AdminContext = { userClient: SupabaseClient; serviceClient: SupabaseClient; userId: string };
type QuizTarget = { community_id: string; name: string; community_level: string; external_target_id: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function verifyAdmin(req: Request): Promise<AdminContext> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("unauthorized");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("server_config_missing");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sessionData, error: sessionError } = await userClient.rpc("admin_get_session");
  if (sessionError || !sessionData) throw new Error("forbidden");
  const session = asRecord(Array.isArray(sessionData) ? sessionData[0] : sessionData);
  if (session.is_admin !== true || session.is_active === false) throw new Error("forbidden");

  let userId = typeof session.user_id === "string" ? session.user_id : "";
  if (!userId) {
    const user = await userClient.auth.getUser();
    userId = user.data.user?.id ?? "";
  }
  if (!userId) throw new Error("unauthorized");

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userClient, serviceClient, userId };
}

async function listTargets(ctx: AdminContext): Promise<QuizTarget[]> {
  const { data, error } = await ctx.userClient.rpc("admin_list_takeover_targets");
  if (error) throw new Error("targets_unavailable");
  const friendly = Array.isArray(data) ? data.map(asRecord) : [];
  const whatsapp = friendly.filter((row) => String(row.platform ?? "").toUpperCase() === "WHATSAPP");
  if (!whatsapp.length) return [];

  const ids = whatsapp.map((row) => String(row.community_id ?? "")).filter(Boolean);
  const { data: communities, error: communitiesError } = await ctx.serviceClient
    .from("communities")
    .select("id,name,community_level,external_target_id,platform,is_active")
    .in("id", ids)
    .eq("is_active", true);
  if (communitiesError) throw new Error("targets_unavailable");

  const byId = new Map((communities ?? []).map((row) => [String(row.id), row]));
  return whatsapp.flatMap((row) => {
    const communityId = String(row.community_id ?? "");
    const stored = byId.get(communityId) as Record<string, unknown> | undefined;
    const externalTargetId = String(stored?.external_target_id ?? "").trim();
    if (!stored || String(stored.platform ?? "").toUpperCase() !== "WHATSAPP" || !externalTargetId) return [];
    return [{
      community_id: communityId,
      name: String(row.name ?? stored.name ?? "WhatsApp community"),
      community_level: String(row.community_level ?? stored.community_level ?? ""),
      external_target_id: externalTargetId,
    }];
  });
}

function preferredQuizTarget(targets: QuizTarget[]): QuizTarget | undefined {
  return targets.find((target) => target.community_level.toUpperCase() === "GENERAL" && /general/i.test(target.name) && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.community_level.toUpperCase() === "GENERAL" && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.community_level.toUpperCase() === "GENERAL")
    ?? targets[0];
}

function webhookUrl(path: string): string {
  if (!N8N_BASE_URL || !INTERNAL_SECRET) throw new Error("quiz_backend_not_configured");
  return `${N8N_BASE_URL}/webhook/${path}`;
}

async function callN8n(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(webhookUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-crypto-internal-secret": INTERNAL_SECRET,
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
  });
  if (!response.ok) throw new Error("quiz_backend_unavailable");
  try {
    return await response.json();
  } catch {
    throw new Error("quiz_backend_invalid_response");
  }
}

function parseDays(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
}

function friendlyLastError(value: unknown): string {
  return String(value ?? "").trim()
    ? "Quiz delivery failed. Please check the connection and try again."
    : "";
}

function publicTargets(targets: QuizTarget[]) {
  return targets.map(({ community_id, name, community_level }) => ({ community_id, name, community_level }));
}

function publicSchedule(raw: Record<string, unknown>, targets: QuizTarget[]) {
  const externalTargetId = String(raw.external_target_id ?? "").trim();
  const target = targets.find((item) => item.external_target_id === externalTargetId)
    ?? preferredQuizTarget(targets);
  const status = String(raw.status ?? (raw.enabled === true ? "READY" : "PAUSED")).toUpperCase();
  return {
    enabled: raw.enabled === true,
    community_id: target?.community_id ?? null,
    community_name: target?.name ?? null,
    frequency: ["daily", "weekly", "custom"].includes(String(raw.frequency ?? "").toLowerCase())
      ? String(raw.frequency).toLowerCase()
      : "daily",
    time_of_day: /^\d{2}:\d{2}$/.test(String(raw.time_of_day ?? "")) ? String(raw.time_of_day) : "19:00",
    timezone: String(raw.timezone ?? "Asia/Beirut") || "Asia/Beirut",
    days_of_week: parseDays(raw.days_of_week),
    status,
    last_run_at: raw.last_run_at_iso ? String(raw.last_run_at_iso) : null,
    next_run_at: raw.next_run_at_iso ? String(raw.next_run_at_iso) : null,
    last_error: friendlyLastError(raw.last_error),
  };
}

async function loadPublicState(ctx: AdminContext, targets?: QuizTarget[]) {
  const availableTargets = targets ?? await listTargets(ctx);
  const rawStatus = await callN8n("crypto-whatsapp-quiz-schedule-status", "GET");
  const rows = Array.isArray(rawStatus) ? rawStatus.map(asRecord) : [asRecord(rawStatus)];
  const row = rows.find((item) => String(item.schedule_key ?? "") === "general_whatsapp_quiz") ?? rows[0] ?? {};
  return { targets: publicTargets(availableTargets), schedule: publicSchedule(row, availableTargets) };
}

async function resolveTarget(targets: QuizTarget[], communityId: unknown): Promise<QuizTarget> {
  const id = String(communityId ?? "").trim();
  const target = targets.find((item) => item.community_id === id);
  if (!target) throw new Error("invalid_community");
  return target;
}

function publicError(error: unknown) {
  const code = error instanceof Error ? error.message : "quiz_admin_error";
  if (code === "unauthorized") return { status: 401, code, message: "Authentication required." };
  if (code === "forbidden") return { status: 403, code, message: "Administrator access required." };
  if (code === "invalid_community") return { status: 400, code, message: "Choose an available WhatsApp community." };
  if (code === "invalid_schedule") return { status: 400, code, message: "Check the selected frequency, days and time." };
  if (code === "quiz_backend_not_configured") return { status: 503, code, message: "WhatsApp Quiz controls are not connected to the scheduler yet." };
  return { status: 502, code: "quiz_service_unavailable", message: "WhatsApp Quiz controls are temporarily unavailable." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed", message: "Method not allowed." }, 405);

  try {
    const ctx = await verifyAdmin(req);
    const body = asRecord(await req.json());
    const action = String(body.action ?? "STATUS").trim().toUpperCase();
    const targets = await listTargets(ctx);

    if (action === "STATUS") return json(await loadPublicState(ctx, targets));

    if (action === "PAUSE") {
      await callN8n("crypto-whatsapp-quiz-schedule", "POST", {
        action: "PAUSE",
        schedule_key: "general_whatsapp_quiz",
        updated_by: ctx.userId,
      });
      return json(await loadPublicState(ctx, targets));
    }

    const target = await resolveTarget(targets, body.community_id);
    if (action === "RUN_NOW") {
      await callN8n("crypto-whatsapp-quiz-schedule", "POST", {
        action: "RUN_NOW",
        schedule_key: "general_whatsapp_quiz",
        external_target_id: target.external_target_id,
        question_count: 10,
        updated_by: ctx.userId,
      });
      return json(await loadPublicState(ctx, targets));
    }

    if (action !== "SAVE") throw new Error("invalid_schedule");
    const frequency = String(body.frequency ?? "daily").toLowerCase();
    const timeOfDay = String(body.time_of_day ?? "19:00");
    const timezone = String(body.timezone ?? "Asia/Beirut");
    const days = parseDays(body.days_of_week);
    if (!["daily", "weekly", "custom"].includes(frequency) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeOfDay)) throw new Error("invalid_schedule");
    if (frequency === "weekly" && days.length !== 1) throw new Error("invalid_schedule");
    if (frequency === "custom" && !days.length) throw new Error("invalid_schedule");
    if (timezone !== "Asia/Beirut") throw new Error("invalid_schedule");

    await callN8n("crypto-whatsapp-quiz-schedule", "POST", {
      action: "SAVE",
      schedule_key: "general_whatsapp_quiz",
      enabled: body.enabled === true,
      external_target_id: target.external_target_id,
      frequency,
      time_of_day: timeOfDay,
      timezone,
      days_of_week: days,
      question_count: 10,
      updated_by: ctx.userId,
    });
    return json(await loadPublicState(ctx, targets));
  } catch (error) {
    const mapped = publicError(error);
    return json({ code: mapped.code, message: mapped.message }, mapped.status);
  }
});
