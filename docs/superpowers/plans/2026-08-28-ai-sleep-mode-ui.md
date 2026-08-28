# AI Sleep Mode and UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-authoritative AI sleep windows for exact Telegram/Discord/WhatsApp channels, expose safe admin scheduling and agent tools, and improve the Messages, AI assistant, and community-chart UI without redesigning unrelated Alexandria pages.

**Architecture:** Store auditable sleep windows in Supabase and expose separate admin-management RPCs plus a service-role-only reply-policy RPC. The existing inbound messaging workflows remain responsible for logging messages first and then checking `get_ai_reply_policy` immediately before AI/RAG generation. The React Messages page manages windows through authenticated RPCs; the global admin agent gets explicit sleep read/write tools, with schedule/cancel writes using the existing preview + one-time confirmation flow.

**Tech Stack:** React 19, TypeScript 5.9, Supabase JS 2, PostgreSQL migrations/RPCs, Supabase Edge Functions/Deno, Vitest/Testing Library, CSS, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-28-ai-sleep-mode-design.md`

## Global Constraints

- Sleep rules target exactly one normalized platform plus one exact external channel/group/conversation ID.
- Inbound messages continue to be logged while sleeping; only automated AI replies are skipped.
- Messages received during sleep are never replayed automatically after wake-up.
- The end timestamp is exclusive; AI resumes only for new inbound messages at/after the effective end/cancellation time.
- A policy lookup failure must fail safe in the messaging workflow: no AI reply until policy is known.
- Frontend scheduling must not claim that a platform workflow is enforcing sleep until that external workflow is actually wired to `get_ai_reply_policy`.
- Do not infer a per-user sleeping state from a group/channel window unless there is an exact channel mapping.
- Do not expose service-role keys, n8n credentials, platform bot tokens, webhook secrets, or provider secrets in browser code.
- Preserve English/Arabic, RTL, accessibility, responsive behavior, and the current light Alexandria visual language.
- Do not deploy any migration or function into the currently connected non-Alexandria Supabase project.

---

### Task 1: Sleep-window service, time semantics, and UI behavior tests

**Files:**
- Create: `src/services/ai-sleep.ts`
- Create: `tests/ai-sleep-mode.test.tsx`

**Interfaces:**
- `AiSleepPlatform = 'TELEGRAM' | 'DISCORD' | 'WHATSAPP'`
- `AiSleepWindowStatus = 'ACTIVE' | 'UPCOMING' | 'ENDED' | 'CANCELLED'`
- `listAiSleepWindows(client, filters)`
- `createAiSleepWindow(client, input)`
- `cancelAiSleepWindow(client, windowId)`
- `classifyAiSleepWindow(window, now)`
- `localDateTimeToIso(value)`
- `validateSleepRange(startLocal, endLocal)`
- `formatSleepDuration(startsAt, endsAt)`
- `formatWakeCountdown(endsAt, now)`

- [ ] Write failing tests for RPC normalization, start-inclusive/end-exclusive classification, cancelled precedence, invalid local datetimes, end-before-start, >30-day duration rejection, and local datetime ISO serialization.
- [ ] Add component-level tests for the future sleep panel contract: active takeover card, upcoming/history view, schedule action, and Wake now cancellation.
- [ ] Push the tests and verify CI fails specifically because the service/component implementation is missing or incomplete.
- [ ] Implement only enough service/time behavior to make the core tests green.
- [ ] Re-run the focused tests before continuing.

### Task 2: Database sleep policy and audited admin RPCs

**Files:**
- Create: `supabase/migrations/20260828090300_ai_sleep_windows.sql`
- Extend: `tests/ai-sleep-mode.test.tsx` with static SQL contract assertions where practical.

**Interfaces:**
- Table: `public.ai_sleep_windows`
- Admin RPC: `admin_list_ai_sleep_windows(p_platform text, p_status text, p_limit integer, p_offset integer)`
- Admin RPC: `admin_create_ai_sleep_window(p_platform text, p_external_channel_id text, p_external_channel_name text, p_starts_at timestamptz, p_ends_at timestamptz, p_reason text)`
- Admin RPC: `admin_cancel_ai_sleep_window(p_window_id uuid)`
- Server-only RPC: `get_ai_reply_policy(p_platform text, p_external_channel_id text, p_checked_at timestamptz default now())`

- [ ] Add RLS-enabled `ai_sleep_windows` with direct anon/authenticated table privileges revoked.
- [ ] Validate platform, channel id/name/reason lengths, end > start, end in the future for new schedules, and maximum 30-day window duration.
- [ ] Reject overlapping non-cancelled windows for the same platform/channel using `starts_at < new_end AND ends_at > new_start`.
- [ ] Compute list status as ACTIVE/UPCOMING/ENDED/CANCELLED using the documented boundary semantics.
- [ ] Make create/list/cancel admin-only through `is_community_admin(auth.uid())` and explicit grants.
- [ ] Make `get_ai_reply_policy` service-role-only; return `SLEEPING` with matching window metadata or `AI_ENABLED`.
- [ ] Extend `admin_agent_confirmation_nonces` and `admin_consume_agent_confirmation` to accept `schedule_ai_sleep` and `cancel_ai_sleep` while preserving one-time replay protection for existing writes.
- [ ] Add explicit revoke/grant statements for every new/replaced function.

### Task 3: Messages sleep-mode operator UI

**Files:**
- Create: `src/components/AiSleepPanel.tsx`
- Create: `src/ai-sleep.css`
- Modify: `src/pages/MessagesPage.tsx`
- Modify: `tests/ai-sleep-mode.test.tsx`

**Interfaces:**
- `AiSleepPanel` loads/schedules/cancels windows through the service; test dependencies may be injected.
- Optional `onActiveCountChange(count)` allows the Messages header to show the current human-takeover count without pretending individual user rows map to group/channel IDs.

- [ ] Build a prominent status hero showing `AI Active` when no active windows exist and `AI Sleeping / Human takeover` when one or more active windows exist.
- [ ] Add platform selector, exact channel/group ID, optional display name, local start/end datetime inputs, optional reason, local timezone label, and live duration preview.
- [ ] Use Active / Upcoming / History segmented views; History includes Ended and Cancelled.
- [ ] Active cards show platform, channel name/id, local start/end, reason, creator, and `Wakes in ...`; active/upcoming cards expose `Wake AI now`.
- [ ] Show a clear workflow-enforcement note so a scheduled database row is not presented as guaranteed production suppression until n8n/platform workflows are wired.
- [ ] Surface active takeover count in the Messages header and keep unread/conversation indicators intact.
- [ ] Make loading, backend-not-deployed, overlap/validation errors, schedule success, and cancel success clear and recoverable.
- [ ] Preserve RTL and mobile behavior; on narrow screens stack form controls/cards without horizontal overflow.
- [ ] Run focused sleep-mode tests and fix only feature-related regressions.

### Task 4: Global admin-agent sleep tools

**Files:**
- Modify: `supabase/functions/admin-agent/tools.ts`
- Modify: `supabase/functions/admin-agent/index.ts`
- Modify: `tests/admin-agent-tool-contracts.test.ts`
- Modify: `tests/admin-agent-core.test.ts` only if confirmation-static checks need extension.

**Interfaces:**
- Read tool: `list_ai_sleep_windows`
- Read tool: `get_ai_sleep_status`
- Write tool: `schedule_ai_sleep`
- Write tool: `cancel_ai_sleep`

- [ ] Update allowlist tests first so CI expects exactly the four new tool names and marks schedule/cancel as writes.
- [ ] Add strict normalization for platform, exact channel ID, optional display name/reason, ISO start/end timestamps, list status, limit, and UUID cancellation id.
- [ ] Reject invalid timestamp order and >30-day schedule duration before returning a write preview.
- [ ] Add model tool schemas that require an exact channel ID for schedule/status; display name alone is insufficient.
- [ ] Add normalized schedule/cancel previews with platform, channel, start/end, reason and action semantics.
- [ ] Execute read tools only through the explicit sleep RPCs.
- [ ] Execute schedule/cancel only after the existing signed confirmation token has been consumed server-side.
- [ ] Update the system prompt to explain human takeover semantics and never imply sleep messages will be replayed later.
- [ ] Run Vitest plus the Deno check for the Edge Function.

### Task 5: UI polish for the global assistant and community donuts

**Files:**
- Modify: `src/components/AdminAgentPanel.tsx`
- Modify: `src/admin-agent.css`
- Modify: `src/components/CommunityPieChart.tsx`
- Modify: `src/dashboard-chart.css`
- Modify: `tests/admin-agent-ui.test.tsx`
- Modify: `tests/community-dashboard.test.tsx`

**Interfaces:**
- Keep the existing request protocol unchanged.
- Community chart keeps exact accessible General/VIP counts while visibly exposing percentages.

- [ ] Enhance the assistant launcher with a compact text/status treatment without obscuring page content.
- [ ] Make page context and Ready/Listening/Thinking/Running action states visually distinct; add a reduced-motion-safe listening pulse.
- [ ] Improve message bubble hierarchy and confirmation preview styling while preserving current accessible labels/tests.
- [ ] Make the mobile assistant behave as a bottom sheet with safe viewport height and comfortable composer controls.
- [ ] Improve donut center content, General/VIP legend hierarchy, percentages, card spacing, verification state and responsive layout without adding a chart dependency.
- [ ] Keep exact text/ARIA equivalents so color is never the only way to read chart data.
- [ ] Update focused UI tests for visible percentage/status output and run them green.

### Task 6: Documentation, full verification, and PR handoff

**Files:**
- Modify: `README.md`
- Modify: PR #9 body.

**Interfaces:**
- Documents the exact external workflow contract: log inbound -> call `get_ai_reply_policy` -> stop on SLEEPING -> otherwise continue AI.

- [ ] Document sleep-mode UI, native-platform human reply behavior, UTC/local-time conversion, 30-day maximum, and no automatic replay after wake.
- [ ] Document that all Telegram/Discord/WhatsApp inbound workflows must call the service-role-only policy RPC before model/RAG generation and must fail safe if policy lookup fails.
- [ ] Add `20260828090300_ai_sleep_windows.sql` to migration order.
- [ ] Confirm the browser still contains no privileged integration secrets.
- [ ] Run full GitHub Actions CI on the current PR head: lint, all Vitest tests, Deno Edge Function check, production build.
- [ ] Confirm Netlify deploy-preview succeeds on the final head.
- [ ] Do not deploy database/function changes to the connected project because it does not match Alexandria's configured Supabase URL.
- [ ] Update PR #9 summary/validation/deployment dependency after fresh verification evidence.
