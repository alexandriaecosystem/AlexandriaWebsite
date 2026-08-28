# Global AI Admin Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a global voice-first AI admin assistant plus verified General/VIP platform membership pie charts and Telegram VIP tracking support.

**Architecture:** Mount the assistant once in `AppShell`, parse deterministic voice navigation locally, and send all other instructions to an authenticated `admin-agent` Supabase Edge Function. The function re-validates the admin session and executes only allowlisted tools through existing/new admin RPCs. Community membership is represented separately from approval state and exposed through read-only admin RPCs used by the dashboard and agent.

**Tech Stack:** React 19, TypeScript 5.9, React Router 7, Supabase JS 2, Supabase Edge Functions/Deno, PostgreSQL migrations, Vitest, CSS.

**Spec:** `docs/superpowers/specs/2026-08-28-global-ai-admin-agent-design.md`

## Global Constraints

- Voice commands are a first-class feature, not optional decoration.
- The community dashboard uses pie/donut charts and exact numeric labels.
- Never expose service-role keys, model keys, bot tokens, n8n credentials, or webhook secrets in `VITE_*` or browser code.
- No arbitrary SQL, table name, RPC name, URL, or code execution may be supplied by the model.
- All writes require explicit confirmation after a normalized preview.
- Preserve English/Arabic and RTL behavior.
- Preserve the current Alexandria visual design and unrelated pages.
- Do not deploy migrations/functions into a Supabase project whose URL does not match the frontend project configuration.

---

### Task 1: Voice command and page-context core

**Files:**
- Create: `src/agent/voice-commands.ts`
- Create: `src/agent/page-context.ts`
- Create: `tests/admin-agent-core.test.ts`

**Interfaces:**
- Produces: `resolveVoiceNavigation(transcript: string): string | null`
- Produces: `buildAdminPageContext(pathname: string, language: 'en' | 'ar'): AdminPageContext`

- [ ] Write failing tests for English navigation aliases, Arabic navigation aliases, non-navigation passthrough, and route context extraction.
- [ ] Run `npm test -- tests/admin-agent-core.test.ts` and verify failures are caused by missing production modules.
- [ ] Implement normalized phrase matching with an explicit route allowlist and page-context extraction for dashboard, users/user detail, reviews/review detail, knowledge, announcements, analytics, messages, community, token activity and account.
- [ ] Run `npm test -- tests/admin-agent-core.test.ts` and verify green.

### Task 2: Global assistant UI and microphone behavior

**Files:**
- Create: `src/agent/agent-client.ts`
- Create: `src/components/AdminAgentPanel.tsx`
- Create: `src/admin-agent.css`
- Modify: `src/app/AppShell.tsx`
- Create: `tests/admin-agent-ui.test.tsx`

**Interfaces:**
- Consumes: `resolveVoiceNavigation`, `buildAdminPageContext`
- Produces: `sendAdminAgentRequest(client, request): Promise<AdminAgentResponse>`
- Produces: globally mounted `AdminAgentPanel`

- [ ] Write failing UI tests that verify the assistant mounts globally, navigation transcripts navigate locally, non-navigation transcripts call the agent client, and a `confirmation_required` response renders a confirmation dialog.
- [ ] Run `npm test -- tests/admin-agent-ui.test.tsx` and verify red.
- [ ] Implement the typed client using `client.functions.invoke('admin-agent', { body })` with no privileged browser configuration.
- [ ] Implement `AdminAgentPanel` with text input, microphone control, `SpeechRecognition` feature detection, `en-US` / `ar-LB`, listening/transcription/thinking/tool states, confirmation UI, and recoverable errors.
- [ ] Mount the panel in `AppShell` after the main outlet and add responsive + RTL CSS.
- [ ] Run the UI tests and verify green.

### Task 3: Verified community membership schema and RPCs

**Files:**
- Create: `supabase/migrations/20260828090000_admin_agent_community_memberships.sql`

**Interfaces:**
- Produces RPC: `admin_get_community_platform_stats()`
- Produces RPC: `admin_list_community_members(p_platform text, p_tier text, p_search text, p_limit integer)`
- Produces RPC: `admin_create_knowledge_text_record(p_title text, p_category text, p_language text, p_content text)`
- Produces RPC: `record_community_membership_event(...)`

- [ ] Add the `community_memberships` table with strict platform/tier/status/source constraints, unique membership identity, RLS enabled, and no direct anon/authenticated table privileges.
- [ ] Add admin-only stats/list RPCs that use `admin_get_session()` / `is_community_admin(auth.uid())` and clearly separate known platform users from verified membership counts.
- [ ] Add the admin-only text knowledge record RPC with trimmed/validated title/category/language/content, `PENDING`, unapproved state and no arbitrary storage path.
- [ ] Add the trusted-server membership event RPC with explicit platform/tier/group/user parameters and upsert semantics; do not expose it to ordinary authenticated users.
- [ ] Add explicit revoke/grant statements for every function.

### Task 4: Community pie-chart dashboard

**Files:**
- Create: `src/services/community-dashboard.ts`
- Create: `src/components/CommunityPieChart.tsx`
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/dashboard-chart.css`
- Create: `tests/community-dashboard.test.tsx`

**Interfaces:**
- Produces: `getCommunityPlatformStats(client): Promise<CommunityPlatformStats>`
- Produces: accessible `CommunityPieChart` using CSS conic-gradient and exact General/VIP labels.

- [ ] Write failing tests for RPC normalization and accessible chart labels.
- [ ] Run `npm test -- tests/community-dashboard.test.tsx` and verify red.
- [ ] Implement the service and pie component without adding a chart dependency.
- [ ] Enhance the existing dashboard with an overall General/VIP pie plus Telegram, Discord and WhatsApp pie cards, known-user counts, verified-member counts, last verification and “Verification not connected” state.
- [ ] Run the dashboard tests and verify green.

### Task 5: Secure admin-agent Edge Function and allowlisted tools

**Files:**
- Create: `supabase/functions/admin-agent/index.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes authenticated JWT and Edge secrets `ADMIN_AGENT_MODEL_URL`, `ADMIN_AGENT_MODEL_API_KEY`, `ADMIN_AGENT_MODEL`, `ADMIN_AGENT_CONFIRMATION_SECRET`.
- Produces response kinds: `message`, `navigate`, `tool_result`, `confirmation_required`, `error`.

- [ ] Implement strict request parsing, size limits, allowed languages, and active-admin verification through user-scoped Supabase RPC.
- [ ] Define a closed tool registry for navigation, user search/detail, KB search/create/update/approve, analytics, community stats/member list and announcements.
- [ ] Implement read tool execution only through explicit RPC calls with normalized parameters.
- [ ] Implement two-phase write execution with HMAC-signed five-minute confirmation tokens bound to admin id + tool + normalized arguments.
- [ ] Call the configured OpenAI-compatible chat-completions endpoint with server-only credentials and tool definitions; reject unknown tool calls instead of forwarding them.
- [ ] Update docs to explain server-only Edge secrets and deployment, while `.env.example` continues to contain browser-public variables only.

### Task 6: Integration, security regression checks and CI

**Files:**
- Modify as required by lint/typecheck findings only within feature scope.

**Interfaces:**
- Produces: CI-clean feature branch and pull request.

- [ ] Run/trigger `npm run lint`.
- [ ] Run/trigger `npm test`.
- [ ] Run/trigger `npm run build`.
- [ ] Run/trigger `npm run format` (check mode).
- [ ] Confirm `readPublicFrontendConfig` still rejects privileged `VITE_*` names and no new privileged browser env names were introduced.
- [ ] Open a pull request from `feature/global-ai-admin-agent` to `main` to trigger the existing GitHub Actions workflow.
- [ ] Review CI failures, fix only issues introduced by this feature, and re-run until green.
- [ ] Do not deploy the migration/Edge Function to the currently connected Supabase project unless its project URL matches the repo’s configured Alexandria Supabase URL.