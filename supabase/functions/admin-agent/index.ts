import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CONFIRMATION_SECRET = Deno.env.get("ADMIN_AGENT_CONFIRMATION_SECRET") ?? "";
const N8N_BASE_URL = (
  Deno.env.get("CRYPTO_N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_BASE_URL")
  ?? ""
).replace(/\/$/, "");
const INTERNAL_SECRET = Deno.env.get("CRYPTO_INTERNAL_WEBHOOK_SECRET") ?? "";
const LEGACY_URL = `${SUPABASE_URL}/functions/v1/admin-agent-legacy`;
const DIRECT_TOOL = "create_knowledge_record";
const DIRECT_ROUTE = "n8n_dashboard_kb";

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
type ConfirmationPayload = { v: 1; uid: string; tool: string; args: Record<string, unknown>; exp: number; nonce: string };

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
function localized(context: PageContext, en: string, ar: string): string { return context.language === "ar" ? ar : en; }
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
  const key = await crypto.subtle.importKey("raw", encoder.encode(CONFIRMATION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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
  const supplied = encoder.encode(suppliedSignature), expected = encoder.encode(expectedSignature);
  if (supplied.length !== expected.length) throw new Error("invalid_confirmation_token");
  let mismatch = 0;
  for (let index = 0; index < supplied.length; index++) mismatch |= supplied[index] ^ expected[index];
  if (mismatch !== 0) throw new Error("invalid_confirmation_token");
  let payload: ConfirmationPayload;
  try { payload = JSON.parse(decoder.decode(b64UrlDecode(encoded))) as ConfirmationPayload; }
  catch { throw new Error("invalid_confirmation_token"); }
  if (payload.v !== 1 || payload.uid !== userId || payload.tool !== tool) throw new Error("invalid_confirmation_token");
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) throw new Error("confirmation_expired");
  if (!/^[0-9a-f-]{36}$/i.test(payload.nonce) || !payload.args || typeof payload.args !== "object") throw new Error("invalid_confirmation_token");
  return payload;
}
async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}_failed:${error.message}`);
  return data;
}
async function verifyAdmin(req: Request): Promise<{ client: SupabaseClient; userId: string; authorization: string }> {
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
  if (typeof session.user_id === "string") return { client, userId: session.user_id, authorization };
  const user = await client.auth.getUser();
  if (user.error || !user.data.user?.id) throw new Error("unauthorized");
  return { client, userId: user.data.user.id, authorization };
}
function parseDirectKnowledgeAdd(instruction: string): string | null {
  const patterns = [
    /(?:^|[\s,])(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|save|put|insert)\s+([\s\S]+?)\s+(?:to|into|in)\s+(?:the\s+)?(?:alexandria\s+)?(?:knowledge\s*base|kb)\s*[?.!]*$/i,
    /(?:^|[\s,])(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|save|put|insert)\s+(?:this\s+)?(?:to|into|in)\s+(?:the\s+)?(?:alexandria\s+)?(?:knowledge\s*base|kb)\s*[:\-–—]\s*([\s\S]+)$/i,
    /(?:^|[\s,])(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:add|save|put|insert)\s+(?:this\s+)?(?:to|into|in)\s+(?:the\s+)?(?:alexandria\s+)?(?:knowledge\s*base|kb)\s+([\s\S]+?)\s*[?.!]*$/i,
    /(?:أضف|اضف|احفظ|سجّل|سجل)\s+([\s\S]+?)\s+(?:إلى|الى|في)\s+(?:قاعدة\s+المعرفة|قاعدة\s+معرفة)\s*[؟?!.]*$/u,
    /(?:أضف|اضف|احفظ|سجّل|سجل)\s+(?:إلى|الى|في)\s+(?:قاعدة\s+المعرفة|قاعدة\s+معرفة)\s*[:\-–—]\s*([\s\S]+)$/u,
  ];
  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const content = match?.[1]?.trim();
    if (content && content.length <= 20000) return content;
  }
  return null;
}
function titleFor(content: string): string {
  return content.split(/\n|[.!?؟]/u).map((part) => part.trim()).find(Boolean)?.slice(0, 120) || content.slice(0, 120) || "Dashboard knowledge";
}
function isDirectPayload(payload: ConfirmationPayload): boolean { return payload.tool === DIRECT_TOOL && payload.args?.route === DIRECT_ROUTE; }
async function callDashboardKnowledgeAssistant(args: Record<string, unknown>, context: PageContext): Promise<Record<string, unknown>> {
  if (!N8N_BASE_URL || !INTERNAL_SECRET) throw new Error("knowledge_backend_not_configured");
  let response: Response;
  try {
    response = await fetch(`${N8N_BASE_URL}/webhook/crypto-dashboard-kb-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-crypto-internal-secret": INTERNAL_SECRET },
      body: JSON.stringify({ text: String(args.content ?? ""), title: String(args.title ?? ""), confirmed: true, input_mode: "text", language: String(args.language ?? context.language), source: "admin-agent" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch { throw new Error("knowledge_backend_unavailable"); }
  let result: Record<string, unknown> = {};
  try {
    const parsed = await response.json();
    result = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { result = {}; }
  if (!response.ok) throw new Error(`knowledge_backend_failed_${response.status}`);
  const conflicts = Array.isArray(result.conflicts) ? result.conflicts.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
  if (result.blocked === true || result.status === "conflict" || result.code === "KNOWLEDGE_CONFLICT") {
    const conflict = conflicts[0];
    const where = conflict?.where && typeof conflict.where === "object" ? conflict.where as Record<string, unknown> : {};
    const sourceTitle = String(where.source_title ?? conflict?.source_title ?? "existing approved knowledge");
    const proposed = String(conflict?.proposed_claim ?? args.content ?? "");
    const existing = String(conflict?.existing_claim ?? "");
    const explanation = String(conflict?.explanation ?? "");
    const message = localized(context,
      `I did not add this knowledge because it conflicts with “${sourceTitle}”. Proposed claim: “${proposed}”. Existing claim: “${existing}”.${explanation ? ` ${explanation}` : ""}`,
      `لم أضف هذه المعرفة لأنها تتعارض مع «${sourceTitle}». الادعاء المقترح: «${proposed}». الادعاء الموجود: «${existing}».${explanation ? ` ${explanation}` : ""}`);
    return { kind: "tool_result", tool: DIRECT_TOOL, blocked: true, result, message };
  }
  if (result.added === true || result.status === "added" || result.code === "KNOWLEDGE_ADDED") {
    return { kind: "tool_result", tool: DIRECT_TOOL, blocked: false, result,
      message: localized(context, "Knowledge passed the conflict checks and was added to the Alexandria knowledge base.", "اجتازت المعرفة فحوصات التعارض وتمت إضافتها إلى قاعدة معرفة Alexandria.") };
  }
  throw new Error("knowledge_backend_invalid_response");
}
async function proxyLegacy(rawBody: string, authorization: string): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("server_supabase_config_missing");
  let response: Response;
  try {
    response = await fetch(LEGACY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authorization, apikey: SUPABASE_ANON_KEY },
      body: rawBody,
      signal: AbortSignal.timeout(60_000),
    });
  } catch { throw new Error("legacy_agent_unavailable"); }
  const body = await response.text();
  return new Response(body, { status: response.status, headers: { ...corsHeaders, "Content-Type": response.headers.get("Content-Type") || "application/json" } });
}
function publicError(error: unknown): { code: string; message: string; status: number } {
  const raw = error instanceof Error ? error.message : "unknown_error";
  if (raw === "unauthorized") return { code: raw, message: "Authentication required.", status: 401 };
  if (raw === "mfa_required") return { code: raw, message: "Multi-factor authentication is required for AI admin actions.", status: 403 };
  if (raw === "forbidden") return { code: raw, message: "Administrator access required.", status: 403 };
  if (raw === "confirmation_expired") return { code: raw, message: "That confirmation expired. Please review the action again.", status: 409 };
  if (raw === "invalid_confirmation_token") return { code: raw, message: "That confirmation is invalid. Please review the action again.", status: 409 };
  if (raw.includes("CONFIRMATION_ALREADY_USED")) return { code: "confirmation_already_used", message: "That confirmed action has already been used. Please review it again before another write.", status: 409 };
  if (raw === "confirmation_secret_not_configured") return { code: raw, message: "Secure write confirmation is not configured on the backend.", status: 503 };
  if (raw === "knowledge_backend_not_configured") return { code: raw, message: "The dashboard knowledge workflow is not configured on the backend.", status: 503 };
  if (raw === "knowledge_backend_unavailable" || raw.startsWith("knowledge_backend_failed_") || raw === "knowledge_backend_invalid_response") return { code: "knowledge_backend_unavailable", message: "The knowledge workflow is temporarily unavailable.", status: 502 };
  if (raw === "legacy_agent_unavailable") return { code: raw, message: "The AI admin assistant is temporarily unavailable.", status: 502 };
  if (raw.startsWith("invalid_")) return { code: raw, message: "The requested admin action has invalid parameters.", status: 400 };
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
    try { body = JSON.parse(rawBody) as Record<string, unknown>; } catch { throw new Error("invalid_json"); }
    const { client, userId, authorization } = await verifyAdmin(req);
    const instruction = requiredText(body.instruction, "instruction", 1, 4000);
    const context = parseContext(body.context);
    if (body.confirmation) {
      const confirmation = asRecord(body.confirmation);
      const tool = requiredText(confirmation.tool, "confirmation_tool", 2, 80);
      const token = requiredText(confirmation.token, "confirmation_token", 20, 10000);
      if (tool === DIRECT_TOOL) {
        const payload = await verifyConfirmation(token, userId, tool);
        if (isDirectPayload(payload)) {
          await rpc(client, "admin_consume_agent_confirmation", { p_nonce: payload.nonce, p_tool: tool, p_expires_at: new Date(payload.exp).toISOString() });
          return json(await callDashboardKnowledgeAssistant(payload.args, context));
        }
      }
      return await proxyLegacy(rawBody, authorization);
    }
    const content = parseDirectKnowledgeAdd(instruction);
    if (content) {
      const args: Record<string, unknown> = { route: DIRECT_ROUTE, title: titleFor(content), content, language: context.language };
      const confirmationToken = await signConfirmation({ v: 1, uid: userId, tool: DIRECT_TOOL, args, exp: Date.now() + 5 * 60 * 1000, nonce: crypto.randomUUID() });
      return json({ kind: "confirmation_required", message: localized(context, "Review this knowledge addition before I execute it.", "راجع إضافة المعرفة هذه قبل تنفيذها."), confirmationToken, tool: DIRECT_TOOL,
        preview: { title: args.title, content: args.content, action: "Conflict-check and add through Alexandria Dashboard Knowledge Assistant", approved: false, safety: "Conflicting knowledge is blocked and returned with the conflicting source and claims." } });
    }
    return await proxyLegacy(rawBody, authorization);
  } catch (error) {
    const mapped = publicError(error);
    return json({ kind: "error", code: mapped.code, message: mapped.message }, mapped.status);
  }
});