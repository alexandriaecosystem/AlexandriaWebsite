# AI Sleep Mode and Human Takeover Design

## Goal

Add scheduled AI sleep windows so an administrator can temporarily stop automated AI replies for a specific messaging platform and exact channel/group between a start datetime and end datetime. During an active sleep window, inbound messages continue to be received, stored, and surfaced to admins, but the AI reply path is skipped so a human can answer instead. When the window expires or an admin wakes the channel early, AI replies resume only for new inbound messages received after the effective wake time.

This extends the existing global AI admin agent/community platform work on PR #9. It does not introduce a second routing subsystem or expose platform credentials to the browser.

## 1. Scope and takeover model

The first implementation uses native-platform human takeover:

- Admin schedules sleep from the Alexandria admin frontend or through the global AI admin assistant.
- The rule targets one platform and one exact external conversation/channel/group identifier.
- During sleep, the server-side inbound workflow still logs the inbound message and updates unread/admin inbox state.
- Before any LLM/RAG/qualification reply is generated, the inbound workflow checks the central reply policy.
- If the policy is `SLEEPING`, the workflow exits the automated reply branch without calling the model and without sending a bot reply.
- A human administrator answers from Telegram, Discord, or WhatsApp directly during the takeover window.
- When the sleep window ends, AI becomes eligible for new inbound messages again.
- Messages received while sleeping are never replayed to the AI automatically after wake-up.

A full outbound operator console inside the Alexandria frontend is explicitly out of scope for this iteration because the current Messages UI is a read/history inbox, not a secure platform-send console.

## 2. Data model

Add `public.ai_sleep_windows` with:

- `id uuid primary key default gen_random_uuid()`
- `platform text not null` constrained to `TELEGRAM`, `DISCORD`, `WHATSAPP`
- `external_channel_id text not null`
- `external_channel_name text null` for admin readability only
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `reason text null`
- `created_by uuid not null references auth.users(id)`
- `created_at timestamptz not null default now()`
- `cancelled_at timestamptz null`
- `cancelled_by uuid null references auth.users(id)`

Constraints:

- `ends_at > starts_at`
- platform/channel identifier lengths are bounded
- no direct browser table access; RLS enabled and table privileges revoked from `anon` and `authenticated`

Multiple historical windows may exist for the same channel. Active policy resolution is time-based and ignores cancelled rows.

Overlapping active windows for the same `(platform, external_channel_id)` are rejected by the admin scheduling RPC so administrators cannot accidentally create ambiguous takeover state.

## 3. Time semantics

All persisted times are `timestamptz` in UTC.

The browser datetime controls are displayed in the administrator's local timezone and converted to ISO timestamps before calling the RPC. The UI always shows the local timezone next to the schedule form and renders stored timestamps back in local time.

A window is active when:

`starts_at <= checked_at AND checked_at < ends_at AND cancelled_at IS NULL`

The end is exclusive so an AI reply arriving exactly at `ends_at` is eligible.

## 4. Server-side policy contract

Add a server-only function:

`get_ai_reply_policy(p_platform text, p_external_channel_id text, p_checked_at timestamptz default now())`

It returns a small normalized object such as:

```json
{
  "policy": "AI_ENABLED",
  "sleep_window_id": null,
  "starts_at": null,
  "ends_at": null
}
```

or, during takeover:

```json
{
  "policy": "SLEEPING",
  "sleep_window_id": "...",
  "starts_at": "...",
  "ends_at": "..."
}
```

The messaging workflow must call this policy check immediately before the first AI/model/RAG/qualification-generation step. Logging and inbox persistence happen before this decision so messages are not lost.

This function is callable only by the trusted server workflow identity/service role, not by ordinary authenticated users. The browser uses separate admin RPCs to read/manage sleep windows.

## 5. Admin RPCs

Add explicit `SECURITY DEFINER` admin RPCs with `is_community_admin(auth.uid())` checks:

- `admin_list_ai_sleep_windows(p_platform?, p_status?, p_limit?, p_offset?)`
- `admin_create_ai_sleep_window(p_platform, p_external_channel_id, p_external_channel_name, p_starts_at, p_ends_at, p_reason)`
- `admin_cancel_ai_sleep_window(p_window_id)`

`admin_create_ai_sleep_window` validates platform, timestamps, identifier lengths, maximum allowed future duration, and overlap.

Recommended maximum single sleep duration: 30 days. Longer operator handovers should be created intentionally as a new window rather than one effectively permanent rule.

Cancellation does not delete history. `cancelled_at`/`cancelled_by` preserve the audit trail.

## 6. Admin frontend

Add an `AI sleep mode` section to the existing Messages page rather than creating another top-level navigation item.

The section contains:

- platform selector: Telegram / Discord / WhatsApp
- exact channel/group ID input
- optional channel/group display name
- start local datetime
- end local datetime
- optional reason
- `Schedule sleep` action

Below the form, show sleep windows grouped/statused as:

- `Active`
- `Upcoming`
- `Ended`
- `Cancelled`

Each row/card shows:

- platform
- channel/group name plus exact external ID
- local start/end time
- current status
- reason when present
- creator
- `Wake now` for active/upcoming windows

The page also shows a concise explanation: inbound messages continue to appear in the inbox; only automated AI replies are paused.

English/Arabic labels and RTL behavior follow the existing `LanguageContext`/CSS patterns.

## 7. Global admin-agent tools

Extend the allowlisted agent registry with:

Read:

- `list_ai_sleep_windows`
- `get_ai_sleep_status`

Write:

- `schedule_ai_sleep`
- `cancel_ai_sleep`

Write tools use the same preview + explicit human confirmation + signed one-time confirmation flow already used by the agent.

Examples:

- “Put Telegram VIP to sleep from 6 PM today until 9 AM tomorrow.”
- “Pause the AI in Discord channel 12345 from Friday 8 PM to Saturday noon.”
- “Is WhatsApp group X currently sleeping?”
- “Wake the Telegram VIP group now.”

The model must supply or resolve an exact external channel/group ID before scheduling. A display name alone is insufficient because names are not guaranteed unique.

## 8. Messaging workflow integration

The repository can define the database/RPC contract and admin UI, but the actual Telegram/Discord/WhatsApp inbound workflows must enforce it.

Required workflow sequence:

1. Receive inbound event.
2. Normalize `platform` and exact external channel/group/conversation ID.
3. Resolve/store user/platform identity as currently implemented.
4. Persist inbound message / unread state.
5. Call `get_ai_reply_policy(platform, external_channel_id, now())`.
6. If `SLEEPING`: stop before model/RAG/qualification reply generation and record a routing outcome such as `HUMAN_TAKEOVER` if the current event log supports it.
7. If `AI_ENABLED`: continue the existing AI path unchanged.

The sleep rule must be checked in every inbound platform workflow at the same logical boundary. A frontend-only flag is insufficient and unsafe.

## 9. Race and failure behavior

The routing check happens as close as possible to model invocation. If a window is scheduled after an inbound workflow has already passed the policy check, that in-flight reply may still complete; the UI should not promise cancellation of already-running responses.

If the policy check fails because the database/RPC is unavailable, use fail-safe behavior for automated replies: do not generate/send an AI response until policy can be determined. The inbound message remains stored for admin review.

If an admin schedules a sleep window with a start time in the past, it becomes active immediately if the end time is still in the future.

## 10. Security and audit

- No platform bot token or n8n credential enters the browser.
- Only admins can create/cancel windows.
- Trusted server workflows can read the reply policy.
- All sleep-window history is retained for audit.
- Agent write actions require the existing explicit confirmation mechanism.
- Exact platform/channel identifiers are validated; arbitrary URLs, SQL, or workflow names are never accepted as agent tool parameters.

## 11. Tests

Add frontend/unit coverage for:

- local datetime serialization and invalid end-before-start validation
- active/upcoming/ended/cancelled status classification
- sleep-window service normalization
- Messages-page schedule/wake interactions
- English/Arabic UI labels where applicable
- agent tool contract validation
- agent confirmation required for schedule/cancel writes

Add SQL contract tests/static assertions where practical for:

- admin-only create/list/cancel RPCs
- server-only reply-policy execution
- overlap rejection
- cancelled windows not matching active policy
- exact boundary behavior: start inclusive, end exclusive

CI continues to run lint, Vitest, Deno Edge Function check, and the production TypeScript/Vite build.

## 12. Deployment

Keep the implementation on `feature/global-ai-admin-agent` / PR #9.

Do not deploy the new migration or Edge Function changes to the currently connected non-Alexandria Supabase project. The correct production target remains the Supabase project configured by the Alexandria frontend environment.

After the database changes are deployed to the correct project, each existing n8n/platform inbound workflow must be updated to call `get_ai_reply_policy` before AI generation. Until that workflow integration is done, the frontend scheduling UI must clearly indicate that enforcement depends on the server workflow being updated; it must not claim a channel is protected merely because a row exists in the database.
