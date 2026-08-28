import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

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
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const NAVIGATION_PATHS: Record<string, string> = {
  dashboard: "/",
  analytics: "/analytics",
  knowledge_base: "/knowledge",
  knowledge_gaps: "/knowledge-gaps",
  users: "/users",
  messages: "/messages",
  member_reviews: "/reviews",
  approved_community: "/community",
  announcements: "/announcements",
  token_activity: "/token-monitor",
  account_security: "/account",
};

const READ_TOOLS = new Set([
  "navigate_to_page",
  "search_users",
  "get_user_details",
  "search_knowledge_base",
  "get_analytics",
  "get_community_platform_stats",
  "list_community_members",
]);
const WRITE_TOOLS = new Set([
  "create_knowledge_record",
  "update_knowledge_record",
  "approve_document",
  "send_announcement",
]);
const ALL_TOOLS = new Set([...READ_TOOLS, ...WRITE_TOOLS]);

type Language = "en" | "ar";
type PageContext = {
  pathname: string;
  page: string;
  pageLabel: string;
  language: Language;
  entity?: { type: "user" | "application"; id: string };
};
type RequestBody = {
  instruction?: unknown;
  context?: unknown;
  confirmation?: { token?: unknown; tool?: unknown };
};
type ConfirmationPayload = {
  v: 1;
  uid: string;
  tool: string;
  args: Record<string, unknown>;
  exp: number;
  nonce: string;
};

type ModelToolCall = {
  function?: { name?: string; arguments?: string };
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function b64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function b64UrlDecode(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string): Promise<string> {
  if (!CONFIRMATION_SECRET || CONFIRMATION_SECRET.length < 24) throw new Error("confirmation_secret_not_configured");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CONFIRMATION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64UrlEncode(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function signConfirmation(payload: ConfirmationPayload): Promise<string> {
  const encoded = b64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(encoded)}`;
}

async function verifyConfirmation(token: string, expectedUserId: string, expectedTool: string): Promise<ConfirmationPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("invalid_confirmation_token");
  const expectedSignature = await hmac(parts[0]);
  const supplied = encoder.encode(parts[1]);
  const expected = encoder.encode(expectedSignature);
  if (supplied.length !== expected.length) throw new Error("invalid_confirmation_token");
  let mismatch = 0;
  for (let i = 0; i < supplied.length; i++) mismatch |= supplied[i] ^ expected[i];
  if (mismatch !== 0) throw new Error("invalid_confirmation_token");

  const payload = JSON.parse(decoder.decode(b64UrlDecode(parts[0]))) as ConfirmationPayload;
  if (payload.v !== 1 || payload.uid !== expectedUserId || payload.tool !== expectedTool) throw new Error("invalid_confirmation_token");
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) throw new Error("confirmation_expired");
  if (!payload.args || typeof payload.args !== "object") throw new Error("invalid_confirmation_token");
  return payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_tool_arguments");
  return value as Record<string, unknown>;
}

function stringArg(value: unknown, name: string, min = 1, max = 200): string {
  if (typeof value !== "string") throw new Error(`invalid_${name}`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`invalid_${name}`);
  return normalized;
}

function optionalString(value: unknown, max = 200): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_optional_string");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error("optional_string_too_long");
  return normalized;
}

function intArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("invalid_integer");
  return parsed;
}

function uuidLike(value: unknown, name: string): string {
  const id = stringArg(value, name, 8, 80);
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error(`invalid_${name}`);
  return id;
}

function languageCode(value: unknown, fallback = "en"): string {
  const raw = String(value ?? fallback).trim().toLowerCase();
  const aliases: Record<string, string> = {
    english: "en", arabic: "ar", german: "de", french: "fr", spanish: "es", italian: "it",
  };
  const normalized = aliases[raw] ?? raw;
  if (!["en", "ar", "de", "fr", "es", "it"].includes(normalized)) throw new Error("invalid_language");
  return normalized;
}

function platform(value: unknown, optional = false): string | null {
  if (value == null || value === "") return optional ? null : (() => { throw new Error("invalid_platform"); })();
  const normalized = String(value).trim().toUpperCase();
  if (!["TELEGRAM", "DISCORD", "WHATSAPP"].includes(normalized)) throw new Error("invalid_platform");
  return normalized;
}

function tier(value: unknown, optional = false): string | null {
  if (value == null || value === "") return optional ? null : (() => { throw new Error("invalid_tier"); })();
  const normalized = String(value).trim().toUpperCase();
  if (!["GENERAL", "VIP"].includes(normalized)) throw new Error("invalid_tier");
  return normalized;
}

function normalizeToolArgs(tool: string, rawValue: unknown): Record<string, unknown> {
  const raw = asRecord(rawValue);
  switch (tool) {
    case "navigate_to_page": {
      const page = stringArg(raw.page, "page", 2, 40).toLowerCase().replaceAll(" ", "_");
      if (!NAVIGATION_PATHS[page]) throw new Error("unsupported_admin_page");
      return { page };
    }
    case "search_users":
      return { query: optionalString(raw.query, 120) ?? "", limit: intArg(raw.limit, 20, 1, 50) };
    case "get_user_details":
      return { user_id: uuidLike(raw.user_id, "user_id") };
    case "search_knowledge_base": {
      const status = optionalString(raw.status, 30)?.toUpperCase() ?? null;
      if (status && !["PENDING", "PROCESSING", "PROCESSED", "FAILED"].includes(status)) throw new Error("invalid_status");
      return { query: optionalString(raw.query, 120) ?? "", status, limit: intArg(raw.limit, 20, 1, 50) };
    }
    case "get_analytics":
      return { days: intArg(raw.days, 30, 1, 365) };
    case "get_community_platform_stats":
      return {};
    case "list_community_members":
      return {
        platform: platform(raw.platform, true),
        tier: tier(raw.tier, true),
        search: optionalString(raw.search, 120),
        limit: intArg(raw.limit, 50, 1, 200),
      };
    case "create_knowledge_record":
      return {
        title: stringArg(raw.title, "title", 2, 180),
        category: (optionalString(raw.category, 80) ?? "GENERAL").toUpperCase(),
        language: languageCode(raw.language, "en"),
        content: optionalString(raw.content, 200000) ?? "",
      };
    case "update_knowledge_record": {
      const content = stringArg(raw.content, "content", 1, 200000);
      const title = stringArg(raw.title, "title", 2, 180);
      const editorHtml = optionalString(raw.editor_html, 250000)
        ?? `<p>${content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`;
      return {
        document_id: uuidLike(raw.document_id, "document_id"),
        title,
        content,
        editor_html: editorHtml,
        expected_version: intArg(raw.expected_version, 0, 0, 1000000),
      };
    }
    case "approve_document":
      return { document_id: uuidLike(raw.document_id, "document_id") };
    case "send_announcement": {
      const destination = String(raw.destination ?? "GENERAL").trim().toUpperCase();
      if (!["GENERAL", "APPROVED", "BOTH"].includes(destination)) throw new Error("invalid_destination");
      if (!Array.isArray(raw.platforms) || raw.platforms.length < 1 || raw.platforms.length > 3) throw new Error("invalid_platforms");
      const platforms = [...new Set(raw.platforms.map((item) => platform(item, false) as string))];
      return {
        content: stringArg(raw.content, "announcement_content", 1, 4000),
        destination,
        platforms,
      };
    }
    default:
      throw new Error("unknown_tool");
  }
}

function previewFor(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (tool) {
    case "create_knowledge_record":
      return {
        title: args.title,
        category: args.category,
        language: args.language,
        status: "PENDING",
        approved: false,
        content: args.content || "Draft content placeholder",
      };
    case "update_knowledge_record":
      return {
        document_id: args.document_id,
        title: args.title,
        expected_version: args.expected_version,
        status_after_save: "PENDING",
        approved_after_save: false,
      };
    case "approve_document":
      return { document_id: args.document_id, approved: true };
    case "send_announcement":
      return { content: args.content, destination: args.destination, platforms: args.platforms, action: "Create, approve and queue announcement" };
    default:
      return args;
  }
}

function parseContext(value: unknown): PageContext {
  const raw = asRecord(value);
  const pathname = stringArg(raw.pathname, "pathname", 1, 300);
  if (!pathname.startsWith("/")) throw new Error("invalid_pathname");
  const language: Language = raw.language === "ar" ? "ar" : "en";
  return {
    pathname,
    page: optionalString(raw.page, 80) ?? "unknown",
    pageLabel: optionalString(raw.pageLabel, 120) ?? (language === "ar" ? "صفحة الإدارة" : "Admin page"),
    language,
  };
}

async function verifyAdmin(req: Request): Promise<{ client: SupabaseClient; userId: string }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authHeader)) throw new Error("unauthorized");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("server_supabase_config_missing");

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("admin_get_session");
  if (error || !data) throw new Error("forbidden");
  const record = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  if (record?.is_admin !== true || record?.is_active === false) throw new Error("forbidden");
  const userId = typeof record.user_id === "string" ? record.user_id : null;
  if (!userId) {
    const user = await client.auth.getUser();
    if (user.error || !user.data.user?.id) throw new Error("unauthorized");
    return { client, userId: user.data.user.id };
  }
  return { client, userId };
}

const modelTools = [
  {
    type: "function",
    function: {
      name: "navigate_to_page",
      description: "Navigate the admin UI to a known page.",
      parameters: { type: "object", properties: { page: { type: "string", enum: Object.keys(NAVIGATION_PATHS) } }, required: ["page"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_users",
      description: "Search known Alexandria users by name, username, phone or platform id.",
      parameters: { type: "object", properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_details",
      description: "Get an admin user profile, platform accounts, application/access state and conversation history.",
      parameters: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description: "Search knowledge-base document metadata by title/category and optional processing status.",
      parameters: { type: "object", properties: { query: { type: "string" }, status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "create_knowledge_record",
      description: "Propose creating a pending unapproved text knowledge record. This always requires admin confirmation.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" }, category: { type: "string" }, language: { type: "string" }, content: { type: "string" },
        },
        required: ["title", "language"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_knowledge_record",
      description: "Propose updating an existing knowledge text record. Saving makes it pending/unapproved and requires confirmation.",
      parameters: {
        type: "object",
        properties: {
          document_id: { type: "string" }, title: { type: "string" }, content: { type: "string" }, editor_html: { type: "string" }, expected_version: { type: "integer" },
        },
        required: ["document_id", "title", "content", "expected_version"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_document",
      description: "Propose approval of one knowledge document. Requires confirmation.",
      parameters: { type: "object", properties: { document_id: { type: "string" } }, required: ["document_id"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Read dashboard and AI usage analytics for a time window.",
      parameters: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365 } }, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_community_platform_stats",
      description: "Read known platform-user counts and separately verified General/VIP external-group membership counts for Telegram, Discord and WhatsApp.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_community_members",
      description: "List verified external-group members. Do not confuse verified membership with approval status.",
      parameters: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["TELEGRAM", "DISCORD", "WHATSAPP"] },
          tier: { type: "string", enum: ["GENERAL", "VIP"] },
          search: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_announcement",
      description: "Propose creating, approving and queueing an announcement for selected platforms. Always requires confirmation.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          destination: { type: "string", enum: ["GENERAL", "APPROVED", "BOTH"] },
          platforms: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", enum: ["TELEGRAM", "DISCORD", "WHATSAPP"] } },
        },
        required: ["content", "destination", "platforms"],
        additionalProperties: false,
      },
    },
  },
];

async function callModel(instruction: string, context: PageContext): Promise<{ content: string; toolCall?: { name: string; args: unknown } }> {
  if (!MODEL_URL || !MODEL_API_KEY || !MODEL) throw new Error("agent_model_not_configured");
  const system = [
    "You are Alexandria's controlled admin assistant.",
    "You may answer administrative questions and choose one allowlisted tool when data/action is required.",
    "Never invent database results. Never request or output SQL, API keys, service-role keys, bot tokens, webhook secrets, or arbitrary URLs.",
    "Distinguish known platform users, approved users, and verified external-group members. They are not interchangeable.",
    "Write actions are only proposals; the server will require explicit human confirmation.",
    `Current admin page: ${context.pageLabel} (${context.pathname}). UI language: ${context.language}.`,
    context.language === "ar" ? "Reply in Arabic unless the administrator clearly asks for another language." : "Reply in English unless the administrator clearly asks for another language.",
  ].join("\n");

  const response = await fetch(MODEL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${MODEL_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: instruction },
      ],
      tools: modelTools,
      tool_choice: "auto",
    }),
  });
  if (!response.ok) throw new Error(`agent_model_request_failed_${response.status}`);
  const body = await response.json() as Record<string, unknown>;
  const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
  const message = choices[0]?.message as Record<string, unknown> | undefined;
  if (!message) throw new Error("agent_model_invalid_response");
  const content = typeof message.content === "string" ? message.content.trim() : "";
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls as ModelToolCall[] : [];
  if (!calls.length) return { content: content || "I could not determine a safe admin action for that request." };
  if (calls.length > 1) throw new Error("multiple_tool_calls_not_allowed");
  const fn = calls[0].function;
  const name = String(fn?.name ?? "");
  if (!ALL_TOOLS.has(name)) throw new Error("unknown_tool");
  let args: unknown = {};
  try { args = fn?.arguments ? JSON.parse(fn.arguments) : {}; } catch { throw new Error("invalid_tool_arguments"); }
  return { content, toolCall: { name, args } };
}

async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const response = await client.rpc(name, args);
  if (response.error) throw new Error(`${name}_failed:${response.error.message}`);
  return response.data;
}

function itemCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  if (Number.isFinite(Number(record.total))) return Number(record.total);
  return Array.isArray(record.items) ? record.items.length : 0;
}

function localized(context: PageContext, en: string, ar: string): string {
  return context.language === "ar" ? ar : en;
}

async function executeTool(
  client: SupabaseClient,
  tool: string,
  args: Record<string, unknown>,
  context: PageContext,
): Promise<{ kind: "navigate" | "tool_result"; message: string; path?: string; result?: unknown }> {
  switch (tool) {
    case "navigate_to_page": {
      const path = NAVIGATION_PATHS[String(args.page)];
      return { kind: "navigate", path, message: localized(context, "Done. I opened that admin page.", "تم. فتحت صفحة الإدارة المطلوبة.") };
    }
    case "search_users": {
      const result = await rpc(client, "admin_list_users", { p_limit: args.limit, p_offset: 0, p_search: args.query || null });
      const count = itemCount(result);
      return { kind: "tool_result", result, message: localized(context, `I found ${count} matching user${count === 1 ? "" : "s"}.`, `وجدت ${count} مستخدم مطابق.`) };
    }
    case "get_user_details": {
      const result = await rpc(client, "admin_get_user_conversation", { p_user_id: args.user_id, p_limit: 100, p_before: null });
      const name = result && typeof result === "object" ? String(((result as Record<string, unknown>).user as Record<string, unknown> | undefined)?.name ?? "") : "";
      return { kind: "tool_result", result, message: localized(context, name ? `Loaded admin details for ${name}.` : "Loaded the requested user's admin details.", name ? `تم تحميل تفاصيل الإدارة للمستخدم ${name}.` : "تم تحميل تفاصيل الإدارة للمستخدم المطلوب.") };
    }
    case "search_knowledge_base": {
      const result = await rpc(client, "admin_list_knowledge_documents", { p_limit: 100, p_offset: 0, p_status: args.status });
      const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const query = String(args.query ?? "").toLowerCase();
      const items = (Array.isArray(record.items) ? record.items as Record<string, unknown>[] : [])
        .filter((item) => !query || `${item.title ?? ""} ${item.category ?? ""}`.toLowerCase().includes(query))
        .slice(0, Number(args.limit ?? 20));
      const filtered = { items, total: items.length };
      return { kind: "tool_result", result: filtered, message: localized(context, `I found ${items.length} matching knowledge document${items.length === 1 ? "" : "s"}.`, `وجدت ${items.length} مستند معرفة مطابق.`) };
    }
    case "get_analytics": {
      const [dashboard, ai] = await Promise.all([
        rpc(client, "admin_get_dashboard_metrics"),
        rpc(client, "admin_get_ai_usage_summary", { p_days: args.days }),
      ]);
      return { kind: "tool_result", result: { dashboard, ai }, message: localized(context, `Loaded dashboard and AI analytics for the last ${args.days} days.`, `تم تحميل تحليلات لوحة التحكم والذكاء الاصطناعي لآخر ${args.days} يومًا.`) };
    }
    case "get_community_platform_stats": {
      const result = await rpc(client, "admin_get_community_platform_stats");
      const record = result && typeof result === "object" ? result as Record<string, unknown> : {};
      const platforms = Array.isArray(record.platforms) ? record.platforms as Record<string, unknown>[] : [];
      const telegram = platforms.find((item) => item.platform === "TELEGRAM");
      const telegramVip = Number(telegram?.vip_members ?? 0);
      const connected = telegram?.verification_connected === true;
      const message = connected
        ? localized(context, `Telegram currently has ${telegramVip} verified VIP membership${telegramVip === 1 ? "" : "s"}.`, `يوجد حاليًا ${telegramVip} عضوية VIP موثقة على Telegram.`)
        : localized(context, "Community stats loaded. Telegram VIP verification is not connected yet, so I will not treat approved users as verified VIP members.", "تم تحميل إحصاءات المجتمع. التحقق من عضوية Telegram VIP غير متصل بعد، لذلك لن أعتبر المستخدمين المقبولين أعضاء VIP موثقين.");
      return { kind: "tool_result", result, message };
    }
    case "list_community_members": {
      const result = await rpc(client, "admin_list_community_members", {
        p_platform: args.platform,
        p_tier: args.tier,
        p_search: args.search,
        p_limit: args.limit,
      });
      const count = itemCount(result);
      return { kind: "tool_result", result, message: localized(context, `I found ${count} verified group membership${count === 1 ? "" : "s"} matching those filters.`, `وجدت ${count} عضوية مجموعة موثقة تطابق عوامل التصفية.`) };
    }
    case "create_knowledge_record": {
      const result = await rpc(client, "admin_create_knowledge_text_record", {
        p_title: args.title,
        p_category: args.category,
        p_language: args.language,
        p_content: args.content,
      });
      return { kind: "tool_result", result, message: localized(context, `Created “${args.title}” as a pending, unapproved knowledge record.`, `تم إنشاء «${args.title}» كسجل معرفة معلّق وغير معتمد.`) };
    }
    case "update_knowledge_record": {
      const result = await rpc(client, "admin_update_knowledge_document_content", {
        p_document_id: args.document_id,
        p_title: args.title,
        p_content: args.content,
        p_editor_content_html: args.editor_html,
        p_expected_version: args.expected_version,
      });
      return { kind: "tool_result", result, message: localized(context, "Updated the knowledge record. It is pending and unapproved again until reviewed.", "تم تحديث سجل المعرفة. أصبح معلّقًا وغير معتمد مجددًا حتى تتم مراجعته.") };
    }
    case "approve_document": {
      const result = await rpc(client, "admin_approve_knowledge_document", { p_document_id: args.document_id });
      return { kind: "tool_result", result, message: localized(context, "The knowledge document was approved.", "تم اعتماد مستند المعرفة.") };
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
      const approved = await rpc(client, "admin_approve_announcement", { p_announcement_id: announcementId });
      return { kind: "tool_result", result: { announcement_id: announcementId, approval: approved }, message: localized(context, "The announcement was created, approved and queued for the selected platforms.", "تم إنشاء الإعلان واعتماده ووضعه في قائمة الإرسال للمنصات المحددة.") };
    }
    default:
      throw new Error("unknown_tool");
  }
}

function publicError(error: unknown): { code: string; message: string; status: number } {
  const raw = error instanceof Error ? error.message : "unknown_error";
  if (raw === "unauthorized") return { code: raw, message: "Authentication required.", status: 401 };
  if (raw === "forbidden") return { code: raw, message: "Administrator access required.", status: 403 };
  if (raw === "confirmation_expired") return { code: raw, message: "That confirmation expired. Please review the action again.", status: 409 };
  if (raw === "invalid_confirmation_token") return { code: raw, message: "That confirmation is invalid. Please review the action again.", status: 409 };
  if (raw === "agent_model_not_configured") return { code: raw, message: "The AI admin model is not configured on the secure backend.", status: 503 };
  if (raw === "confirmation_secret_not_configured") return { code: raw, message: "Secure write confirmation is not configured on the backend.", status: 503 };
  if (raw.startsWith("invalid_") || raw.startsWith("unsupported_") || raw === "unknown_tool" || raw === "multiple_tool_calls_not_allowed") {
    return { code: raw, message: "The requested admin action has invalid or unsupported parameters.", status: 400 };
  }
  if (raw.startsWith("agent_model_request_failed_")) return { code: "agent_model_unavailable", message: "The AI admin model is temporarily unavailable.", status: 502 };
  if (raw.includes("_failed:")) return { code: "tool_execution_failed", message: "The requested admin tool could not be completed.", status: 502 };
  return { code: "admin_agent_error", message: "The AI admin assistant could not complete that request.", status: 500 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ kind: "error", code: "method_not_allowed", message: "Method not allowed." }, 405);

  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 24_000) return json({ kind: "error", code: "request_too_large", message: "Request is too large." }, 413);

    const { client, userId } = await verifyAdmin(req);
    let body: RequestBody;
    try { body = await req.json() as RequestBody; } catch { return json({ kind: "error", code: "invalid_json", message: "Invalid JSON body." }, 400); }

    const instruction = stringArg(body.instruction, "instruction", 1, 4000);
    const context = parseContext(body.context);

    if (body.confirmation) {
      const tool = stringArg(body.confirmation.tool, "confirmation_tool", 2, 80);
      if (!WRITE_TOOLS.has(tool)) throw new Error("invalid_confirmation_token");
      const token = stringArg(body.confirmation.token, "confirmation_token", 20, 10000);
      const payload = await verifyConfirmation(token, userId, tool);
      const result = await executeTool(client, tool, payload.args, context);
      return json(result);
    }

    const model = await callModel(instruction, context);
    if (!model.toolCall) return json({ kind: "message", message: model.content });

    const { name } = model.toolCall;
    const args = normalizeToolArgs(name, model.toolCall.args);

    if (WRITE_TOOLS.has(name)) {
      const token = await signConfirmation({
        v: 1,
        uid: userId,
        tool: name,
        args,
        exp: Date.now() + 5 * 60 * 1000,
        nonce: crypto.randomUUID(),
      });
      return json({
        kind: "confirmation_required",
        message: localized(context, "Review this change before I execute it.", "راجع هذا التغيير قبل تنفيذه."),
        confirmationToken: token,
        tool: name,
        preview: previewFor(name, args),
      });
    }

    return json(await executeTool(client, name, args, context));
  } catch (error) {
    const mapped = publicError(error);
    return json({ kind: "error", code: mapped.code, message: mapped.message }, mapped.status);
  }
});
