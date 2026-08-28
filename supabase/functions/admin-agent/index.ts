import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  ALL_TOOLS,
  NAVIGATION_PATHS,
  WRITE_TOOLS,
  modelTools,
  normalizeToolArgs,
  previewFor,
} from "./tools.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const MODEL_URL = Deno.env.get("ADMIN_AGENT_MODEL_URL") ?? "";
const MODEL_API_KEY = Deno.env.get("ADMIN_AGENT_MODEL_API_KEY") ?? "";
const MODEL = Deno.env.get("ADMIN_AGENT_MODEL") ?? "";
const CONFIRMATION_SECRET = Deno.env.get("ADMIN_AGENT_CONFIRMATION_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Language = "en" | "ar";
type PageContext = { pathname: string; page: string; pageLabel: string; language: Language };
type ConfirmationPayload = {
  v: 1;
  uid: string;
  tool: string;
  args: Record<string, unknown>;
  exp: number;
  nonce: string;
};
type ModelToolCall = { function?: { name?: string; arguments?: string } };

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_request");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, min = 1, max = 4000): string {
  if (typeof value !== "string") throw new Error(`invalid_${name}`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`invalid_${name}`);
  return normalized;
}

function parseContext(value: unknown): PageContext {
  const raw = asRecord(value);
  const pathname = requiredText(raw.pathname, "pathname", 1, 300);
  if (!pathname.startsWith("/")) throw new Error("invalid_pathname");
  const language: Language = raw.language === "ar" ? "ar" : "en";
  const page = typeof raw.page === "string" && raw.page.trim() ? raw.page.trim().slice(0, 80) : "unknown";
  const pageLabel = typeof raw.pageLabel === "string" && raw.pageLabel.trim()
    ? raw.pageLabel.trim().slice(0, 120)
    : language === "ar" ? "صفحة الإدارة" : "Admin page";
  return { pathname, page, pageLabel, language };
}

function b64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function b64UrlDecode(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(value: string): Promise<string> {
  if (CONFIRMATION_SECRET.length < 24) throw new Error("confirmation_secret_not_configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CONFIRMATION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return b64UrlEncode(new Uint8Array(signature));
}

async function signConfirmation(payload: ConfirmationPayload): Promise<string> {
  const encoded = b64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded)}`;
}

async function verifyConfirmation(token: string, userId: string, tool: string): Promise<ConfirmationPayload> {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) throw new Error("invalid_confirmation_token");
  const expectedSignature = await hmac(encoded);
  const supplied = encoder.encode(suppliedSignature);
  const expected = encoder.encode(expectedSignature);
  if (supplied.length !== expected.length) throw new Error("invalid_confirmation_token");
  let mismatch = 0;
  for (let index = 0; index < supplied.length; index++) mismatch |= supplied[index] ^ expected[index];
  if (mismatch !== 0) throw new Error("invalid_confirmation_token");

  let payload: ConfirmationPayload;
  try {
    payload = JSON.parse(decoder.decode(b64UrlDecode(encoded))) as ConfirmationPayload;
  } catch {
    throw new Error("invalid_confirmation_token");
  }
  if (payload.v !== 1 || payload.uid !== userId || payload.tool !== tool) throw new Error("invalid_confirmation_token");
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) throw new Error("confirmation_expired");
  if (!/^[0-9a-f-]{36}$/i.test(payload.nonce) || !payload.args || typeof payload.args !== "object") {
    throw new Error("invalid_confirmation_token");
  }
  return payload;
}

async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}_failed:${error.message}`);
  return data;
}

async function verifyAdmin(req: Request): Promise<{ client: SupabaseClient; userId: string }> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("unauthorized");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("server_supabase_config_missing");

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.error) throw new Error("unauthorized");
  if (aal.data.currentLevel === "aal1" && aal.data.nextLevel === "aal2") throw new Error("mfa_required");

  const { data, error } = await client.rpc("admin_get_session");
  if (error || !data) throw new Error("forbidden");
  const session = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (session?.is_admin !== true || session?.is_active === false) throw new Error("forbidden");

  if (typeof session.user_id === "string") return { client, userId: session.user_id };
  const user = await client.auth.getUser();
  if (user.error || !user.data.user?.id) throw new Error("unauthorized");
  return { client, userId: user.data.user.id };
}

function localized(context: PageContext, en: string, ar: string): string {
  return context.language === "ar" ? ar : en;
}

async function callModel(instruction: string, context: PageContext): Promise<{
  content: string;
  toolCall?: { name: string; args: unknown };
}> {
  if (!MODEL_URL || !MODEL_API_KEY || !MODEL) throw new Error("agent_model_not_configured");
  const system = [
    "You are Alexandria's controlled admin assistant.",
    "Use an allowlisted tool for any request that depends on current Alexandria data or changes admin data.",
    "Never invent current database results. Never request or output SQL, API keys, service-role keys, bot tokens, webhook secrets, or arbitrary URLs.",
    "Known platform users, approved users, and verified external-group members are different concepts. Never substitute one for another.",
    "AI sleep mode means human takeover for one exact external channel/group id between explicit timestamps. Incoming messages remain logged, automated AI replies are skipped, and messages received while sleeping are never replayed automatically after wake.",
    "Never schedule sleep from a display name alone; an exact external_channel_id is required.",
    "Write actions are proposals only; the server requires explicit human confirmation before execution.",
    `Current admin page: ${context.pageLabel} (${context.pathname}). UI language: ${context.language}.`,
    context.language === "ar"
      ? "Reply in Arabic unless the administrator clearly asks for another language."
      : "Reply in English unless the administrator clearly asks for another language.",
  ].join("\n");

  const response = await fetch(MODEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MODEL_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [{ role: "system", content: system }, { role: "user", content: instruction }],
      tools: modelTools,
      tool_choice: "auto",
    }),
  });
  if (!response.ok) throw new Error(`agent_model_request_failed_${response.status}`);

  const payload = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(payload.choices) ? payload.choices as Record<string, unknown>[] : [];
  const message = choices[0]?.message as Record<string, unknown> | undefined;
  if (!message) throw new Error("agent_model_invalid_response");
  const content = typeof message.content === "string" ? message.content.trim() : "";
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls as ModelToolCall[] : [];
  if (!calls.length) return { content: content || "I could not determine a safe admin action for that request." };
  if (calls.length !== 1) throw new Error("multiple_tool_calls_not_allowed");

  const name = String(calls[0].function?.name ?? "");
  if (!ALL_TOOLS.has(name)) throw new Error("unknown_tool");
  let args: unknown;
  try {
    args = JSON.parse(calls[0].function?.arguments ?? "{}");
  } catch {
    throw new Error("invalid_tool_arguments");
  }
  return { content, toolCall: { name, args } };
}

function itemCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  if (Number.isFinite(Number(record.total))) return Number(record.total);
  return Array.isArray(record.items) ? record.items.length : 0;
}

async function executeTool(
  client: SupabaseClient,
  tool: string,
  args: Record<string, unknown>,
  context: PageContext,
): Promise<Record<string, unknown>> {
  switch (tool) {
    case "navigate_to_page":
      return {
        kind: "navigate",
        path: NAVIGATION_PATHS[String(args.page)],
        message: localized(context, "Done. I opened that admin page.", "تم. فتحت صفحة الإدارة المطلوبة."),
      };

    case "search_users": {
      const result = await rpc(client, "admin_list_users", {
        p_limit: args.limit, p_offset: 0, p_search: args.query || null,
      });
      const count = itemCount(result);
      return { kind: "tool_result", tool, result, message: localized(context, `I found ${count} matching user${count === 1 ? "" : "s"}.`, `وجدت ${count} مستخدم مطابق.`) };
    }

    case "get_user_details": {
      const result = await rpc(client, "admin_get_user_conversation", {
        p_user_id: args.user_id, p_limit: 100, p_before: null,
      });
      return { kind: "tool_result", tool, result, message: localized(context, "Loaded the requested user's admin details.", "تم تحميل تفاصيل الإدارة للمستخدم المطلوب.") };
    }

    case "search_knowledge_base": {
      const result = await rpc(client, "admin_list_knowledge_documents", {
        p_limit: 100, p_offset: 0, p_status: args.status,
      });
      const raw = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const query = String(args.query ?? "").toLowerCase();
      const items = (Array.isArray(raw.items) ? raw.items as Record<string, unknown>[] : [])
        .filter((item) => !query || `${item.title ?? ""} ${item.category ?? ""}`.toLowerCase().includes(query))
        .slice(0, Number(args.limit));
      const filtered = { items, total: items.length };
      return { kind: "tool_result", tool, result: filtered, message: localized(context, `I found ${items.length} matching knowledge document${items.length === 1 ? "" : "s"}.`, `وجدت ${items.length} مستند معرفة مطابق.`) };
    }

    case "get_analytics": {
      const [dashboard, ai] = await Promise.all([
        rpc(client, "admin_get_dashboard_metrics"),
        rpc(client, "admin_get_ai_usage_summary", { p_days: args.days }),
      ]);
      return { kind: "tool_result", tool, result: { dashboard, ai }, message: localized(context, `Loaded dashboard and AI analytics for the last ${args.days} days.`, `تم تحميل تحليلات لوحة التحكم والذكاء الاصطناعي لآخر ${args.days} يومًا.`) };
    }

    case "get_community_platform_stats": {
      const result = await rpc(client, "admin_get_community_platform_stats");
      const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const platforms = Array.isArray(data.platforms) ? data.platforms as Record<string, unknown>[] : [];
      const telegram = platforms.find((item) => item.platform === "TELEGRAM");
      const vip = Number(telegram?.vip_members ?? 0);
      const connected = telegram?.verification_connected === true;
      const message = connected
        ? localized(context, `Telegram currently has ${vip} verified VIP membership${vip === 1 ? "" : "s"}.`, `يوجد حاليًا ${vip} عضوية VIP موثقة على Telegram.`)
        : localized(context, "Community stats loaded. Telegram VIP verification is not connected yet, so approved users are not being counted as verified VIP members.", "تم تحميل إحصاءات المجتمع. التحقق من Telegram VIP غير متصل بعد، لذلك لا يتم احتساب المستخدمين المقبولين كأعضاء VIP موثقين.");
      return { kind: "tool_result", tool, result, message };
    }

    case "list_community_members": {
      const result = await rpc(client, "admin_list_community_members", {
        p_platform: args.platform, p_tier: args.tier, p_search: args.search, p_limit: args.limit,
      });
      const count = itemCount(result);
      return { kind: "tool_result", tool, result, message: localized(context, `I found ${count} verified group membership${count === 1 ? "" : "s"} matching those filters.`, `وجدت ${count} عضوية مجموعة موثقة تطابق عوامل التصفية.`) };
    }

    case "list_ai_sleep_windows": {
      const result = await rpc(client, "admin_list_ai_sleep_windows", {
        p_platform: args.platform,
        p_status: args.status,
        p_limit: args.limit,
        p_offset: 0,
      });
      const count = itemCount(result);
      return { kind: "tool_result", tool, result, message: localized(context, `I found ${count} AI sleep window${count === 1 ? "" : "s"} matching those filters.`, `وجدت ${count} فترة إيقاف للذكاء الاصطناعي تطابق عوامل التصفية.`) };
    }

    case "get_ai_sleep_status": {
      const result = await rpc(client, "admin_get_ai_sleep_status", {
        p_platform: args.platform,
        p_external_channel_id: args.external_channel_id,
      });
      const sleeping = result && typeof result === "object" && (result as Record<string, unknown>).policy === "SLEEPING";
      return {
        kind: "tool_result",
        tool,
        result,
        message: sleeping
          ? localized(context, "AI replies are currently sleeping for that channel; human takeover is active.", "ردود الذكاء الاصطناعي متوقفة حاليًا لهذه القناة؛ التحكم البشري نشط.")
          : localized(context, "AI replies are currently enabled for that channel.", "ردود الذكاء الاصطناعي مفعلة حاليًا لهذه القناة."),
      };
    }

    case "schedule_ai_sleep": {
      const result = await rpc(client, "admin_create_ai_sleep_window", {
        p_platform: args.platform,
        p_external_channel_id: args.external_channel_id,
        p_external_channel_name: args.external_channel_name,
        p_starts_at: args.starts_at,
        p_ends_at: args.ends_at,
        p_reason: args.reason,
      });
      return {
        kind: "tool_result", tool, result,
        message: localized(context, "AI sleep was scheduled for that exact channel. Incoming messages will still be logged; automated replies must be suppressed by the connected messaging workflow during the window.", "تمت جدولة إيقاف الذكاء الاصطناعي لهذه القناة المحددة. ستستمر الرسائل الواردة في التسجيل؛ ويجب على سير عمل المنصة المتصل منع الردود الآلية خلال الفترة."),
      };
    }

    case "cancel_ai_sleep": {
      const result = await rpc(client, "admin_cancel_ai_sleep_window", { p_window_id: args.window_id });
      return {
        kind: "tool_result", tool, result,
        message: localized(context, "The sleep window was cancelled. AI is eligible again for new inbound messages; sleeping-period messages are not replayed automatically.", "تم إلغاء فترة الإيقاف. أصبح الذكاء الاصطناعي مؤهلاً مجددًا للرسائل الواردة الجديدة؛ ولا تتم إعادة تشغيل رسائل فترة الإيقاف تلقائيًا."),
      };
    }

    case "create_knowledge_record": {
      const result = await rpc(client, "admin_create_knowledge_text_record", {
        p_title: args.title, p_category: args.category, p_language: args.language, p_content: args.content,
      });
      return { kind: "tool_result", tool, result, message: localized(context, `Created “${args.title}” as a pending, unapproved knowledge record.`, `تم إنشاء «${args.title}» كسجل معرفة معلّق وغير معتمد.`) };
    }

    case "update_knowledge_record": {
      const result = await rpc(client, "admin_update_knowledge_document_content", {
        p_document_id: args.document_id,
        p_title: args.title,
        p_content: args.content,
        p_editor_content_html: args.editor_html,
        p_expected_version: args.expected_version,
      });
      return { kind: "tool_result", tool, result, message: localized(context, "Updated the knowledge record. It is pending and unapproved again until reviewed.", "تم تحديث سجل المعرفة. أصبح معلّقًا وغير معتمد مجددًا حتى تتم مراجعته.") };
    }

    case "approve_document": {
      const result = await rpc(client, "admin_approve_knowledge_document", { p_document_id: args.document_id });
      return { kind: "tool_result", tool, result, message: localized(context, "The knowledge document was approved.", "تم اعتماد مستند المعرفة.") };
    }

    case "send_announcement": {
      const created = await rpc(client, "admin_create_announcement", {
        p_content: args.content,
        p_destination_level: args.destination,
        p_platforms: args.platforms,
        p_translations: {},
      });
      const announcementId = typeof created === "string" ? created : String(created ?? "");
      if (!announcementId) throw new Error("announcement_create_returned_no_id");
      const approval = await rpc(client, "admin_approve_announcement", { p_announcement_id: announcementId });
      return {
        kind: "tool_result", tool,
        result: { announcement_id: announcementId, approval },
        message: localized(context, "The announcement was created, approved and queued for the selected platforms.", "تم إنشاء الإعلان واعتماده ووضعه في قائمة الإرسال للمنصات المحددة."),
      };
    }

    default:
      throw new Error("unknown_tool");
  }
}

function publicError(error: unknown): { code: string; message: string; status: number } {
  const raw = error instanceof Error ? error.message : "unknown_error";
  if (raw === "unauthorized") return { code: raw, message: "Authentication required.", status: 401 };
  if (raw === "mfa_required") return { code: raw, message: "Multi-factor authentication is required for AI admin actions.", status: 403 };
  if (raw === "forbidden") return { code: raw, message: "Administrator access required.", status: 403 };
  if (raw === "confirmation_expired" || raw.includes("CONFIRMATION_EXPIRED")) return { code: "confirmation_expired", message: "That confirmation expired. Please review the action again.", status: 409 };
  if (raw === "invalid_confirmation_token") return { code: raw, message: "That confirmation is invalid. Please review the action again.", status: 409 };
  if (raw.includes("CONFIRMATION_ALREADY_USED")) return { code: "confirmation_already_used", message: "That confirmed action has already been used. Please review it again before another write.", status: 409 };
  if (raw === "agent_model_not_configured") return { code: raw, message: "The AI admin model is not configured on the secure backend.", status: 503 };
  if (raw === "confirmation_secret_not_configured") return { code: raw, message: "Secure write confirmation is not configured on the backend.", status: 503 };
  if (raw.startsWith("agent_model_request_failed_")) return { code: "agent_model_unavailable", message: "The AI admin model is temporarily unavailable.", status: 502 };
  if (raw.startsWith("invalid_") || raw.startsWith("unsupported_") || raw === "unknown_tool" || raw === "multiple_tool_calls_not_allowed" || raw === "sleep_window_too_long") {
    return { code: raw, message: "The requested admin action has invalid or unsupported parameters.", status: 400 };
  }
  if (raw.includes("SLEEP_WINDOW_OVERLAP")) return { code: "sleep_window_overlap", message: "That channel already has an overlapping AI sleep window.", status: 409 };
  if (raw.includes("_failed:")) return { code: "tool_execution_failed", message: "The requested admin tool could not be completed.", status: 502 };
  return { code: "admin_agent_error", message: "The AI admin assistant could not complete that request.", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ kind: "error", code: "method_not_allowed", message: "Method not allowed." }, 405);

  try {
    const rawBody = await req.text();
    if (encoder.encode(rawBody).byteLength > 24_000) throw new Error("invalid_request_too_large");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new Error("invalid_json");
    }

    const { client, userId } = await verifyAdmin(req);
    const instruction = requiredText(body.instruction, "instruction", 1, 4000);
    const context = parseContext(body.context);

    if (body.confirmation) {
      const confirmation = asRecord(body.confirmation);
      const tool = requiredText(confirmation.tool, "confirmation_tool", 2, 80);
      if (!WRITE_TOOLS.has(tool)) throw new Error("invalid_confirmation_token");
      const token = requiredText(confirmation.token, "confirmation_token", 20, 10000);
      const payload = await verifyConfirmation(token, userId, tool);
      await rpc(client, "admin_consume_agent_confirmation", {
        p_nonce: payload.nonce,
        p_tool: tool,
        p_expires_at: new Date(payload.exp).toISOString(),
      });
      return json(await executeTool(client, tool, payload.args, context));
    }

    const model = await callModel(instruction, context);
    if (!model.toolCall) return json({ kind: "message", message: model.content });
    const args = normalizeToolArgs(model.toolCall.name, model.toolCall.args);

    if (WRITE_TOOLS.has(model.toolCall.name)) {
      const confirmationToken = await signConfirmation({
        v: 1,
        uid: userId,
        tool: model.toolCall.name,
        args,
        exp: Date.now() + 5 * 60 * 1000,
        nonce: crypto.randomUUID(),
      });
      return json({
        kind: "confirmation_required",
        message: localized(context, "Review this change before I execute it.", "راجع هذا التغيير قبل تنفيذه."),
        confirmationToken,
        tool: model.toolCall.name,
        preview: previewFor(model.toolCall.name, args),
      });
    }

    return json(await executeTool(client, model.toolCall.name, args, context));
  } catch (error) {
    const mapped = publicError(error);
    return json({ kind: "error", code: mapped.code, message: mapped.message }, mapped.status);
  }
});
