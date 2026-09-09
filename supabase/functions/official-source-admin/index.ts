import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function verifyAdmin(req: Request): Promise<string> {
  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(authorization)) throw new Error("unauthorized");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("server_config_missing");

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("admin_get_session");
  if (error || !data) throw new Error("forbidden");
  const session = asRecord(Array.isArray(data) ? data[0] : data);
  if (session.is_admin !== true || session.is_active === false) throw new Error("forbidden");

  let userId = typeof session.user_id === "string" ? session.user_id : "";
  if (!userId) {
    const currentUser = await client.auth.getUser();
    userId = currentUser.data.user?.id ?? "";
  }
  if (!userId) throw new Error("unauthorized");
  return userId;
}

async function startIndexing(userId: string): Promise<void> {
  if (!N8N_BASE_URL || !INTERNAL_SECRET) throw new Error("indexer_backend_not_configured");

  let response: Response;
  try {
    response = await fetch(`${N8N_BASE_URL}/webhook/crypto-official-source-index`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crypto-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ action: "BOOTSTRAP", trigger_source: "admin", requested_by: userId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("indexer_backend_unavailable");
  }

  if (response.status === 403) throw new Error("indexer_backend_not_configured");
  if (!response.ok) throw new Error("indexer_backend_unavailable");

  try {
    const payload = asRecord(await response.json());
    if (payload.accepted !== true) throw new Error("indexer_backend_unavailable");
  } catch (error) {
    if (error instanceof Error && error.message === "indexer_backend_unavailable") throw error;
    throw new Error("indexer_backend_unavailable");
  }
}

function publicError(error: unknown) {
  const code = error instanceof Error ? error.message : "official_source_admin_error";
  if (code === "unauthorized") return { status: 401, code, message: "Authentication required." };
  if (code === "forbidden") return { status: 403, code, message: "Administrator access required." };
  if (code === "indexer_backend_not_configured" || code === "server_config_missing") {
    return { status: 503, code: "indexer_backend_not_configured", message: "Official-source indexing is not connected yet." };
  }
  return { status: 502, code: "indexer_backend_unavailable", message: "Official-source indexing is temporarily unavailable." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed", message: "Method not allowed." }, 405);

  try {
    const userId = await verifyAdmin(req);
    let body: Record<string, unknown> = {};
    try { body = asRecord(await req.json()); } catch { body = {}; }
    const action = String(body.action ?? "BOOTSTRAP").trim().toUpperCase();
    if (action !== "BOOTSTRAP" && action !== "REFRESH") {
      return json({ code: "invalid_action", message: "Unsupported official-source action." }, 400);
    }

    await startIndexing(userId);
    return json({ accepted: true, action: "BOOTSTRAP" }, 202);
  } catch (error) {
    const mapped = publicError(error);
    return json({ code: mapped.code, message: mapped.message }, mapped.status);
  }
});
