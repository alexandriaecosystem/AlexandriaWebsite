import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Language = "en" | "ar";

type FunctionTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const functionTool = (name: string, description: string, parameters: Record<string, unknown>): FunctionTool => ({
  type: "function",
  function: { name, description, parameters },
});

const CONFLICT_STATUSES = new Set(["OPEN", "REVIEW_REQUIRED", "RESOLVED", "DISMISSED"]);
const CANDIDATE_STATUSES = new Set(["PENDING", "PROMOTED", "REJECTED"]);
const RESOLUTION_ACTIONS = new Set(["KEEP_SOURCE_A", "KEEP_SOURCE_B", "KEEP_EXISTING", "DISMISS_FALSE_CONFLICT"]);

export const KNOWLEDGE_INTELLIGENCE_WRITE_TOOLS = new Set([
  "resolve_knowledge_conflict",
  "promote_knowledge_candidate",
  "reject_knowledge_candidate",
]);

export const knowledgeIntelligenceModelTools: FunctionTool[] = [
  functionTool("get_knowledge_intelligence_status", "Read Knowledge Intelligence health: official-source indexing, stale/failed sources, contradictions, candidates, crawl runs and latest source changes.", {
    type: "object", properties: {}, additionalProperties: false,
  }),
  functionTool("list_knowledge_conflicts", "List Alexandria knowledge contradictions with both claims, source titles, authority, severity, confidence and blocking state.", {
    type: "object",
    properties: {
      status: { type: "string", enum: [...CONFLICT_STATUSES] },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  }),
  functionTool("get_knowledge_conflict", "Get one knowledge contradiction in detail, including both claims and source authority.", {
    type: "object",
    properties: { conflict_id: { type: "string" } },
    required: ["conflict_id"],
    additionalProperties: false,
  }),
  functionTool("get_official_source_health", "Read official Alexandria source health and optionally filter by page title or canonical URL. Shows indexing, freshness and contradiction-scan state.", {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } },
    additionalProperties: false,
  }),
  functionTool("list_knowledge_candidates", "List official-source answers discovered outside approved KB that are waiting for administrator review. Candidates are never auto-approved.", {
    type: "object",
    properties: {
      status: { type: "string", enum: [...CANDIDATE_STATUSES] },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    },
    additionalProperties: false,
  }),
  functionTool("resolve_knowledge_conflict", "Propose an administrative resolution for one knowledge contradiction. Requires explicit confirmation and never bypasses the database approval gate.", {
    type: "object",
    properties: {
      conflict_id: { type: "string" },
      action: { type: "string", enum: [...RESOLUTION_ACTIONS] },
      note: { type: "string" },
    },
    required: ["conflict_id", "action"],
    additionalProperties: false,
  }),
  functionTool("promote_knowledge_candidate", "Propose promoting one pending official-source candidate into the normal knowledge processing/review path. Requires explicit confirmation; promotion does not approve it.", {
    type: "object",
    properties: { candidate_id: { type: "string" } },
    required: ["candidate_id"],
    additionalProperties: false,
  }),
  functionTool("reject_knowledge_candidate", "Propose rejecting one official-source knowledge candidate. Requires explicit confirmation.", {
    type: "object",
    properties: { candidate_id: { type: "string" }, note: { type: "string" } },
    required: ["candidate_id"],
    additionalProperties: false,
  }),
];

export const KNOWLEDGE_INTELLIGENCE_TOOLS = new Set(knowledgeIntelligenceModelTools.map((tool) => tool.function.name));

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_tool_arguments");
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, max = 500): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") throw new Error("invalid_optional_string");
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > max) throw new Error("optional_string_too_long");
  return normalized;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error("invalid_integer");
  return parsed;
}

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string") throw new Error(`invalid_${name}`);
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) throw new Error(`invalid_${name}`);
  return normalized;
}

export function normalizeKnowledgeIntelligenceToolArgs(tool: string, value: unknown): Record<string, unknown> {
  const raw = record(value);
  switch (tool) {
    case "get_knowledge_intelligence_status":
      return {};
    case "list_knowledge_conflicts": {
      const status = optionalText(raw.status, 30)?.toUpperCase() ?? null;
      if (status && !CONFLICT_STATUSES.has(status)) throw new Error("invalid_status");
      return { status, limit: integer(raw.limit, 50, 1, 100) };
    }
    case "get_knowledge_conflict":
      return { conflict_id: uuid(raw.conflict_id, "conflict_id") };
    case "get_official_source_health":
      return { query: optionalText(raw.query, 300), limit: integer(raw.limit, 50, 1, 100) };
    case "list_knowledge_candidates": {
      const status = optionalText(raw.status, 30)?.toUpperCase() ?? "PENDING";
      if (!CANDIDATE_STATUSES.has(status)) throw new Error("invalid_status");
      return { status, limit: integer(raw.limit, 50, 1, 100) };
    }
    case "resolve_knowledge_conflict": {
      const action = String(raw.action ?? "").trim().toUpperCase();
      if (!RESOLUTION_ACTIONS.has(action)) throw new Error("invalid_resolution_action");
      return { conflict_id: uuid(raw.conflict_id, "conflict_id"), action, note: optionalText(raw.note, 1000) };
    }
    case "promote_knowledge_candidate":
      return { candidate_id: uuid(raw.candidate_id, "candidate_id") };
    case "reject_knowledge_candidate":
      return { candidate_id: uuid(raw.candidate_id, "candidate_id"), note: optionalText(raw.note, 1000) };
    default:
      throw new Error("unknown_tool");
  }
}

export function previewKnowledgeIntelligenceTool(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  switch (tool) {
    case "resolve_knowledge_conflict":
      return { action: args.action, note: args.note || "Administrator-reviewed resolution", safety: "Database approval/conflict gates remain enforced" };
    case "promote_knowledge_candidate":
      return { action: "Promote candidate into normal knowledge processing/review", auto_approved: false };
    case "reject_knowledge_candidate":
      return { action: "Reject pending candidate", note: args.note || null };
    default:
      return args;
  }
}

async function rpc(client: SupabaseClient, name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}_failed:${error.message}`);
  return data;
}

function localized(language: Language, en: string, ar: string) {
  return language === "ar" ? ar : en;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sourceLabel(value: Record<string, unknown>, side: "a" | "b") {
  return String(value[`source_${side}_title`] ?? (side === "a" ? "Source A" : "Source B"));
}

function authorityLabel(value: Record<string, unknown>, side: "a" | "b") {
  return String(value[`authority_${side}_label`] ?? value[`authority_${side}`] ?? value[`authority_${side}_code`] ?? "authority unavailable");
}

export async function executeSafeKnowledgeApproval(
  client: SupabaseClient,
  args: Record<string, unknown>,
  language: Language,
): Promise<Record<string, unknown>> {
  const result = await rpc(client, "admin_approve_knowledge_document", { p_document_id: args.document_id });
  const value = asRecord(Array.isArray(result) ? result[0] : result);
  const blocked = value.blocked === true;
  const code = String(value.code ?? "");

  if (blocked) {
    const conflicts = Array.isArray(value.conflicts) ? value.conflicts.map(asRecord) : [];
    const conflict = conflicts[0];
    let message: string;
    if (code === "CONFLICT_SCAN_REQUIRED") {
      message = localized(language,
        "This document cannot be approved yet because its contradiction scan is not complete for the current version.",
        "لا يمكن اعتماد هذا المستند بعد لأن فحص التعارض للإصدار الحالي لم يكتمل.");
    } else if (code === "DOCUMENT_NOT_READY") {
      message = localized(language,
        "This document cannot be approved yet because processing has not finished.",
        "لا يمكن اعتماد هذا المستند بعد لأن المعالجة لم تكتمل.");
    } else if (code === "KNOWLEDGE_CONFLICT_BLOCKING" && conflict) {
      const sourceA = sourceLabel(conflict, "a");
      const sourceB = sourceLabel(conflict, "b");
      const claimA = String(conflict.claim_a ?? "");
      const claimB = String(conflict.claim_b ?? "");
      const authorityA = authorityLabel(conflict, "a");
      const authorityB = authorityLabel(conflict, "b");
      const severity = String(conflict.severity ?? "UNKNOWN");
      const confidence = Math.round(Number(conflict.confidence ?? 0) * 100);
      message = localized(language,
        `This document cannot be approved yet because it conflicts with “${sourceB}”. Uploaded/Source A claim: “${claimA}”. Verified/Source B claim: “${claimB}”. Sources: “${sourceA}” (${authorityA}) vs “${sourceB}” (${authorityB}). Severity: ${severity}; confidence: ${confidence}%. Administrative resolution is required before approval can succeed.`,
        `لا يمكن اعتماد هذا المستند بعد لأنه يتعارض مع «${sourceB}». ادعاء المصدر أ: «${claimA}». ادعاء المصدر ب الموثق: «${claimB}». المصادر: «${sourceA}» (${authorityA}) مقابل «${sourceB}» (${authorityB}). الخطورة: ${severity}؛ الثقة: ${confidence}%. يلزم حل إداري قبل نجاح الاعتماد.`);
    } else {
      message = localized(language,
        "The database safety gate blocked approval. Review Knowledge Intelligence before trying again.",
        "منعت بوابة أمان قاعدة البيانات الاعتماد. راجع ذكاء المعرفة قبل المحاولة مجددًا.");
    }
    return { kind: "tool_result", tool: "approve_document", blocked: true, result, message };
  }

  if (value.is_approved !== true) {
    return {
      kind: "tool_result",
      tool: "approve_document",
      blocked: true,
      result,
      message: localized(language,
        "Approval was not confirmed by the database safety gate, so I did not report this document as approved.",
        "لم تؤكد بوابة أمان قاعدة البيانات الاعتماد، لذلك لم أبلغ عن المستند على أنه معتمد."),
    };
  }

  return {
    kind: "tool_result",
    tool: "approve_document",
    blocked: false,
    result,
    message: localized(language, "The knowledge document was approved.", "تم اعتماد مستند المعرفة."),
  };
}

export async function executeKnowledgeIntelligenceTool(
  client: SupabaseClient,
  tool: string,
  args: Record<string, unknown>,
  language: Language,
): Promise<Record<string, unknown>> {
  switch (tool) {
    case "get_knowledge_intelligence_status": {
      const result = await rpc(client, "admin_get_knowledge_intelligence_status");
      return { kind: "tool_result", tool, result, message: localized(language, "Loaded Knowledge Intelligence health and official-source status.", "تم تحميل صحة ذكاء المعرفة وحالة المصادر الرسمية.") };
    }
    case "list_knowledge_conflicts": {
      const result = await rpc(client, "admin_list_knowledge_conflicts", { p_document_id: null, p_status: args.status, p_limit: args.limit, p_offset: 0 });
      const value = asRecord(result);
      const count = Number(value.total ?? 0);
      return { kind: "tool_result", tool, result, message: localized(language, `Loaded ${count} knowledge conflict${count === 1 ? "" : "s"}.`, `تم تحميل ${count} تعارض معرفي.`) };
    }
    case "get_knowledge_conflict": {
      const result = await rpc(client, "admin_get_knowledge_conflict", { p_conflict_id: args.conflict_id });
      return { kind: "tool_result", tool, result, message: localized(language, "Loaded the contradiction details, including both claims and source authority.", "تم تحميل تفاصيل التعارض بما في ذلك الادعاءان ومرجعية المصدرين.") };
    }
    case "get_official_source_health": {
      const result = await rpc(client, "admin_get_knowledge_intelligence_status");
      const value = asRecord(result);
      const sources = Array.isArray(value.official_source_health) ? value.official_source_health.map(asRecord) : [];
      const query = String(args.query ?? "").trim().toLowerCase();
      const filtered = (query ? sources.filter((source) => `${source.page_title ?? ""} ${source.canonical_url ?? ""}`.toLowerCase().includes(query)) : sources)
        .slice(0, Number(args.limit ?? 50));
      return {
        kind: "tool_result",
        tool,
        result: { items: filtered, total: filtered.length },
        message: localized(language, `Loaded health for ${filtered.length} official source${filtered.length === 1 ? "" : "s"}.`, `تم تحميل صحة ${filtered.length} مصدر رسمي.`),
      };
    }
    case "list_knowledge_candidates": {
      const result = await rpc(client, "admin_list_knowledge_candidates", { p_status: args.status, p_limit: args.limit, p_offset: 0 });
      const value = asRecord(result);
      const count = Number(value.total ?? 0);
      return { kind: "tool_result", tool, result, message: localized(language, `Loaded ${count} knowledge candidate${count === 1 ? "" : "s"}. Candidates remain unapproved until the normal knowledge review path is completed.`, `تم تحميل ${count} مرشح معرفة. يبقى المرشحون غير معتمدين حتى اكتمال مسار مراجعة المعرفة العادي.`) };
    }
    case "resolve_knowledge_conflict": {
      const result = await rpc(client, "admin_resolve_knowledge_conflict", { p_conflict_id: args.conflict_id, p_action: args.action, p_note: args.note });
      return { kind: "tool_result", tool, result, message: localized(language, "The administrative conflict resolution was saved. The normal knowledge approval gates still apply.", "تم حفظ الحل الإداري للتعارض. تبقى بوابات اعتماد المعرفة العادية مطبقة.") };
    }
    case "promote_knowledge_candidate": {
      const result = await rpc(client, "admin_promote_knowledge_candidate", { p_candidate_id: args.candidate_id });
      return { kind: "tool_result", tool, result, message: localized(language, "The candidate was promoted into the normal knowledge processing/review path. It was not auto-approved.", "تمت ترقية المرشح إلى مسار معالجة ومراجعة المعرفة العادي. لم يتم اعتماده تلقائيًا.") };
    }
    case "reject_knowledge_candidate": {
      const result = await rpc(client, "admin_reject_knowledge_candidate", { p_candidate_id: args.candidate_id, p_note: args.note });
      return { kind: "tool_result", tool, result, message: localized(language, "The knowledge candidate was rejected.", "تم رفض مرشح المعرفة.") };
    }
    default:
      throw new Error("unknown_tool");
  }
}
