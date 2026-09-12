export const NAVIGATION_PATHS: Record<string, string> = {
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
  operations: "/operations",
  settings: "/settings",
};

export const WRITE_TOOLS = new Set([
  "create_knowledge_record",
  "update_knowledge_record",
  "patch_knowledge_document_text",
  "approve_document",
  "send_announcement",
  "schedule_ai_sleep",
  "cancel_ai_sleep",
]);

const KNOWLEDGE_CATEGORIES = new Set([
  "PROJECT_OFFICIAL",
  "TECHNICAL_REVIEW",
  "INTERNAL_QA",
  "DEFENSIVE_PLAYBOOK",
  "ADVERSARIAL_TESTING",
]);
const SLEEP_STATUSES = new Set(["ACTIVE", "UPCOMING", "ENDED", "CANCELLED"]);
const PATCH_OPERATIONS = new Set(["APPEND", "PREPEND", "INSERT_AFTER", "INSERT_BEFORE", "REPLACE"]);
const MAX_SLEEP_MS = 30 * 24 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_tool_arguments");
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, min = 1, max = 200): string {
  if (typeof value !== "string") throw new Error(`invalid_${name}`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`invalid_${name}`);
  return normalized;
}

function optionalText(value: unknown, max = 200): string | null {
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
  const id = text(value, name, 36, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error(`invalid_${name}`);
  return id;
}

function language(value: unknown, fallback = "en"): string {
  const raw = String(value ?? fallback).trim().toLowerCase();
  const aliases: Record<string, string> = {
    english: "en",
    arabic: "ar",
    german: "de",
    french: "fr",
    spanish: "es",
    italian: "it",
  };
  const normalized = aliases[raw] ?? raw;
  if (!["en", "ar", "de", "fr", "es", "it"].includes(normalized)) throw new Error("invalid_language");
  return normalized;
}

function platform(value: unknown, isOptional = false): string | null {
  if (value == null || value === "") {
    if (isOptional) return null;
    throw new Error("invalid_platform");
  }
  const normalized = String(value).trim().toUpperCase();
  if (!["TELEGRAM", "DISCORD", "WHATSAPP"].includes(normalized)) throw new Error("invalid_platform");
  return normalized;
}

function tier(value: unknown, isOptional = false): string | null {
  if (value == null || value === "") {
    if (isOptional) return null;
    throw new Error("invalid_tier");
  }
  const normalized = String(value).trim().toUpperCase();
  if (!["GENERAL", "VIP"].includes(normalized)) throw new Error("invalid_tier");
  return normalized;
}

function category(value: unknown): string {
  const normalized = String(value ?? "INTERNAL_QA").trim().toUpperCase();
  if (!KNOWLEDGE_CATEGORIES.has(normalized)) throw new Error("invalid_category");
  return normalized;
}

function patchOperation(value: unknown): string {
  const normalized = String(value ?? "APPEND").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    AFTER: "INSERT_AFTER",
    BEFORE: "INSERT_BEFORE",
    INSERTAFTER: "INSERT_AFTER",
    INSERTBEFORE: "INSERT_BEFORE",
  };
  const operation = aliases[normalized] ?? normalized;
  if (!PATCH_OPERATIONS.has(operation)) throw new Error("invalid_patch_operation");
  return operation;
}

function isoDate(value: unknown, name: string): string {
  const raw = text(value, name, 10, 80);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid_${name}`);
  return parsed.toISOString();
}

function sleepStatus(value: unknown): string | null {
  const raw = optionalText(value, 30);
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  if (!SLEEP_STATUSES.has(normalized)) throw new Error("invalid_status");
  return normalized;
}

export function normalizeToolArgs(tool: string, value: unknown): Record<string, unknown> {
  const raw = record(value);
  switch (tool) {
    case "navigate_to_page": {
      const page = text(raw.page, "page", 2, 40).toLowerCase().replaceAll(" ", "_");
      if (!NAVIGATION_PATHS[page]) throw new Error("unsupported_admin_page");
      return { page };
    }
    case "search_users":
      return { query: optionalText(raw.query, 120) ?? "", limit: integer(raw.limit, 20, 1, 50) };
    case "get_user_details":
      return { user_id: uuid(raw.user_id, "user_id") };
    case "search_knowledge_base": {
      const status = optionalText(raw.status, 30)?.toUpperCase() ?? null;
      if (status && !["PENDING", "PROCESSING", "READY", "FAILED"].includes(status)) throw new Error("invalid_status");
      return { query: optionalText(raw.query, 120) ?? "", status, limit: integer(raw.limit, 20, 1, 50) };
    }
    case "get_analytics":
      return { days: integer(raw.days, 30, 1, 365) };
    case "get_community_platform_stats":
      return {};
    case "list_community_members":
      return {
        platform: platform(raw.platform, true),
        tier: tier(raw.tier, true),
        search: optionalText(raw.search, 120),
        limit: integer(raw.limit, 50, 1, 200),
      };
    case "list_ai_sleep_windows":
      return {
        platform: platform(raw.platform, true),
        status: sleepStatus(raw.status),
        limit: integer(raw.limit, 50, 1, 200),
      };
    case "get_ai_sleep_status":
      return {
        platform: platform(raw.platform),
        external_channel_id: text(raw.external_channel_id, "external_channel_id", 1, 255),
      };
    case "schedule_ai_sleep": {
      const startsAt = isoDate(raw.starts_at, "starts_at");
      const endsAt = isoDate(raw.ends_at, "ends_at");
      const startMs = new Date(startsAt).getTime();
      const endMs = new Date(endsAt).getTime();
      if (endMs <= startMs) throw new Error("invalid_sleep_window");
      if (endMs - startMs > MAX_SLEEP_MS) throw new Error("sleep_window_too_long");
      return {
        platform: platform(raw.platform),
        external_channel_id: text(raw.external_channel_id, "external_channel_id", 1, 255),
        external_channel_name: optionalText(raw.external_channel_name, 160),
        starts_at: startsAt,
        ends_at: endsAt,
        reason: optionalText(raw.reason, 500),
      };
    }
    case "cancel_ai_sleep":
      return { window_id: uuid(raw.window_id, "window_id") };
    case "create_knowledge_record":
      return {
        title: text(raw.title, "title", 2, 180),
        category: category(raw.category),
        language: language(raw.language, "en"),
        content: optionalText(raw.content, 200000) ?? "",
      };
    case "update_knowledge_record": {
      const content = text(raw.content, "content", 1, 200000);
      const title = text(raw.title, "title", 2, 180);
      const editorHtml = optionalText(raw.editor_html, 250000)
        ?? `<p>${content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\n", "<br>")}</p>`;
      return {
        document_id: uuid(raw.document_id, "document_id"),
        title,
        content,
        editor_html: editorHtml,
        expected_version: integer(raw.expected_version, 0, 0, 1000000),
      };
    }
    case "patch_knowledge_document_text": {
      const operation = patchOperation(raw.operation);
      const anchor = optionalText(raw.anchor, 4000);
      if (["INSERT_AFTER", "INSERT_BEFORE", "REPLACE"].includes(operation) && !anchor) throw new Error("invalid_anchor");
      return {
        document_query: text(raw.document_query, "document_query", 2, 180),
        operation,
        anchor,
        text: text(raw.text, "patch_text", 1, 20000),
        occurrence: integer(raw.occurrence, 1, 1, 20),
      };
    }
    case "approve_document":
      return { document_id: uuid(raw.document_id, "document_id") };
    case "send_announcement": {
      const destination = String(raw.destination ?? "GENERAL").trim().toUpperCase();
      if (!["GENERAL", "APPROVED", "BOTH"].includes(destination)) throw new Error("invalid_destination");
      if (!Array.isArray(raw.platforms) || raw.platforms.length < 1 || raw.platforms.length > 3) throw new Error("invalid_platforms");
      const platforms = [...new Set(raw.platforms.map((item) => platform(item) as string))];
      return {
        content: text(raw.content, "announcement_content", 1, 4000),
        destination,
        platforms,
      };
    }
    default:
      throw new Error("unknown_tool");
  }
}

export function previewFor(tool: string, args: Record<string, unknown>): Record<string, unknown> {
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
    case "patch_knowledge_document_text":
      return {
        document: args.document_query,
        operation: args.operation,
        anchor: args.anchor,
        text: args.text,
        occurrence: args.occurrence,
        status_after_save: "PENDING",
        approved_after_save: false,
      };
    case "approve_document":
      return { document_id: args.document_id, approved: true };
    case "send_announcement":
      return {
        content: args.content,
        destination: args.destination,
        platforms: args.platforms,
        action: "Create, approve and queue announcement",
      };
    case "schedule_ai_sleep":
      return {
        platform: args.platform,
        channel: args.external_channel_name || args.external_channel_id,
        external_channel_id: args.external_channel_id,
        starts_at: args.starts_at,
        ends_at: args.ends_at,
        reason: args.reason,
        action: "Pause automated AI replies for this channel during the scheduled window",
      };
    case "cancel_ai_sleep":
      return {
        sleep_window_id: args.window_id,
        action: "Wake AI for this scheduled sleep window now",
      };
    default:
      return args;
  }
}

const functionTool = (name: string, description: string, parameters: Record<string, unknown>) => ({
  type: "function",
  function: { name, description, parameters },
});

const platformSchema = { type: "string", enum: ["TELEGRAM", "DISCORD", "WHATSAPP"] };

export const modelTools = [
  functionTool("navigate_to_page", "Navigate the admin UI to a known page.", {
    type: "object",
    properties: { page: { type: "string", enum: Object.keys(NAVIGATION_PATHS) } },
    required: ["page"],
    additionalProperties: false,
  }),
  functionTool("search_users", "Search known Alexandria users by name, username, phone or platform id.", {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    additionalProperties: false,
  }),
  functionTool("get_user_details", "Get one user's admin profile, platform accounts, access state and conversation history.", {
    type: "object",
    properties: { user_id: { type: "string" } },
    required: ["user_id"],
    additionalProperties: false,
  }),
  functionTool("search_knowledge_base", "Search knowledge document metadata by title/category and optional processing status.", {
    type: "object",
    properties: { query: { type: "string" }, status: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 50 } },
    additionalProperties: false,
  }),
  functionTool("create_knowledge_record", "Propose creating a pending, unapproved text knowledge record. Requires confirmation.", {
    type: "object",
    properties: {
      title: { type: "string" },
      category: { type: "string", enum: [...KNOWLEDGE_CATEGORIES] },
      language: { type: "string" },
      content: { type: "string" },
    },
    required: ["title", "language"],
    additionalProperties: false,
  }),
  functionTool("update_knowledge_record", "Propose replacing the complete content of an existing knowledge text record when its id, current version and complete replacement text are already known. Requires confirmation.", {
    type: "object",
    properties: {
      document_id: { type: "string" }, title: { type: "string" }, content: { type: "string" },
      editor_html: { type: "string" }, expected_version: { type: "integer" },
    },
    required: ["document_id", "title", "content", "expected_version"],
    additionalProperties: false,
  }),
  functionTool("patch_knowledge_document_text", "Propose a small safe edit to one existing knowledge document selected by title. Use this for voice requests such as add, append, insert, prepend or replace words without regenerating the whole document. The server requires one unambiguous document match and confirmation.", {
    type: "object",
    properties: {
      document_query: { type: "string", description: "Document title or a distinctive part of the title" },
      operation: { type: "string", enum: [...PATCH_OPERATIONS] },
      anchor: { type: "string", description: "Exact text anchor required for insert-before, insert-after and replace" },
      text: { type: "string", description: "Text to add or replacement text" },
      occurrence: { type: "integer", minimum: 1, maximum: 20, description: "Which exact anchor occurrence to edit; defaults to 1" },
    },
    required: ["document_query", "operation", "text"],
    additionalProperties: false,
  }),
  functionTool("approve_document", "Propose approval of one knowledge document. Requires confirmation.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
    additionalProperties: false,
  }),
  functionTool("get_analytics", "Read dashboard and AI usage analytics for a time window.", {
    type: "object",
    properties: { days: { type: "integer", minimum: 1, maximum: 365 } },
    additionalProperties: false,
  }),
  functionTool("get_community_platform_stats", "Read known platform-user counts and separately verified General/VIP group membership counts.", {
    type: "object", properties: {}, additionalProperties: false,
  }),
  functionTool("list_community_members", "List verified external-group members. Verified membership is distinct from approval state.", {
    type: "object",
    properties: {
      platform: platformSchema,
      tier: { type: "string", enum: ["GENERAL", "VIP"] },
      search: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  }),
  functionTool("list_ai_sleep_windows", "List scheduled AI sleep/human-takeover windows, optionally filtered by platform and status.", {
    type: "object",
    properties: {
      platform: platformSchema,
      status: { type: "string", enum: ["ACTIVE", "UPCOMING", "ENDED", "CANCELLED"] },
      limit: { type: "integer", minimum: 1, maximum: 200 },
    },
    additionalProperties: false,
  }),
  functionTool("get_ai_sleep_status", "Check whether automated AI replies are currently sleeping for one exact external channel/group id.", {
    type: "object",
    properties: { platform: platformSchema, external_channel_id: { type: "string" } },
    required: ["platform", "external_channel_id"],
    additionalProperties: false,
  }),
  functionTool("schedule_ai_sleep", "Propose a human-takeover window that pauses automated AI replies for one exact channel. Requires confirmation.", {
    type: "object",
    properties: {
      platform: platformSchema,
      external_channel_id: { type: "string" },
      external_channel_name: { type: "string" },
      starts_at: { type: "string", description: "ISO 8601 datetime with timezone" },
      ends_at: { type: "string", description: "ISO 8601 datetime with timezone" },
      reason: { type: "string" },
    },
    required: ["platform", "external_channel_id", "starts_at", "ends_at"],
    additionalProperties: false,
  }),
  functionTool("cancel_ai_sleep", "Propose waking AI immediately by cancelling one scheduled sleep window. Requires confirmation.", {
    type: "object",
    properties: { window_id: { type: "string" } },
    required: ["window_id"],
    additionalProperties: false,
  }),
  functionTool("send_announcement", "Propose creating, approving and queueing an announcement. Requires confirmation.", {
    type: "object",
    properties: {
      content: { type: "string" },
      destination: { type: "string", enum: ["GENERAL", "APPROVED", "BOTH"] },
      platforms: {
        type: "array", minItems: 1, maxItems: 3,
        items: platformSchema,
      },
    },
    required: ["content", "destination", "platforms"],
    additionalProperties: false,
  }),
];

export const ALL_TOOLS = new Set(modelTools.map((tool) => tool.function.name));
