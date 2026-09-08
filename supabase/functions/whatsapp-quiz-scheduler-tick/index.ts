import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const N8N_BASE_URL = (
  Deno.env.get("CRYPTO_N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_WEBHOOK_BASE_URL")
  ?? Deno.env.get("N8N_BASE_URL")
  ?? ""
).replace(/\/$/, "");
const INTERNAL_SECRET = Deno.env.get("CRYPTO_INTERNAL_WEBHOOK_SECRET") ?? "";
const SCHEDULE_KEY = "general_whatsapp_quiz";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json({ code: "server_config_missing" }, 503);

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const providedToken = req.headers.get("x-quiz-scheduler-token") ?? "";
  const { data: expectedToken, error: tokenError } = await serviceClient.rpc("service_get_whatsapp_quiz_scheduler_token");
  if (tokenError || typeof expectedToken !== "string" || !expectedToken || providedToken !== expectedToken) {
    return json({ code: "unauthorized" }, 401);
  }

  const { data: claimData, error: claimError } = await serviceClient.rpc("service_claim_due_whatsapp_quiz_schedule", {
    p_schedule_key: SCHEDULE_KEY,
  });
  if (claimError) return json({ code: "claim_failed" }, 500);

  const claim = Array.isArray(claimData) ? asRecord(claimData[0]) : asRecord(claimData);
  const claimedSlot = String(claim.claimed_slot ?? "").trim();
  const communityId = String(claim.community_id ?? "").trim();
  if (!claimedSlot || !communityId) return json({ status: "idle" });

  const { data: community, error: communityError } = await serviceClient
    .from("communities")
    .select("id,platform,external_target_id,is_active")
    .eq("id", communityId)
    .eq("is_active", true)
    .maybeSingle();

  if (communityError || !community || String(community.platform).toUpperCase() !== "WHATSAPP" || !String(community.external_target_id ?? "").trim()) {
    await serviceClient.rpc("service_mark_whatsapp_quiz_dispatch_result", {
      p_schedule_key: SCHEDULE_KEY,
      p_claimed_slot: claimedSlot,
      p_success: false,
      p_error: "Scheduled quiz target is unavailable.",
    });
    return json({ code: "target_unavailable" }, 409);
  }

  if (!N8N_BASE_URL || !INTERNAL_SECRET) {
    await serviceClient.rpc("service_mark_whatsapp_quiz_dispatch_result", {
      p_schedule_key: SCHEDULE_KEY,
      p_claimed_slot: claimedSlot,
      p_success: false,
      p_error: "Scheduled quiz dispatch backend is not configured.",
    });
    return json({ code: "dispatch_backend_not_configured" }, 503);
  }

  let response: Response;
  try {
    response = await fetch(`${N8N_BASE_URL}/webhook/crypto-whatsapp-quiz-schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-crypto-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        action: "RUN_NOW",
        schedule_key: SCHEDULE_KEY,
        external_target_id: String(community.external_target_id),
        question_count: 10,
        trigger_source: "supabase_scheduler",
        scheduled_for: claimedSlot,
      }),
    });
  } catch {
    await serviceClient.rpc("service_mark_whatsapp_quiz_dispatch_result", {
      p_schedule_key: SCHEDULE_KEY,
      p_claimed_slot: claimedSlot,
      p_success: false,
      p_error: "Scheduled quiz dispatch connection failed.",
    });
    return json({ code: "dispatch_unavailable" }, 502);
  }

  if (!response.ok) {
    await serviceClient.rpc("service_mark_whatsapp_quiz_dispatch_result", {
      p_schedule_key: SCHEDULE_KEY,
      p_claimed_slot: claimedSlot,
      p_success: false,
      p_error: "Scheduled quiz dispatch was not accepted.",
    });
    return json({ code: "dispatch_rejected" }, 502);
  }

  const { error: resultError } = await serviceClient.rpc("service_mark_whatsapp_quiz_dispatch_result", {
    p_schedule_key: SCHEDULE_KEY,
    p_claimed_slot: claimedSlot,
    p_success: true,
    p_error: null,
  });
  if (resultError) return json({ code: "result_update_failed" }, 500);

  return json({ status: "dispatched", scheduled_for: claimedSlot });
});
