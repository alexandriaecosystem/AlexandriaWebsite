# Global AI Admin Agent and Community Membership Dashboard Design

## Goal

Add a global, voice-first AI admin assistant to the Alexandria admin frontend and add verified General/VIP community membership analytics, including Telegram VIP verification. Preserve the current visual language, authentication model, Supabase security boundary, English/Arabic support, and Netlify deployment model.

## Existing architecture

The app is a React 19 + TypeScript + Vite admin frontend. Authenticated admin routes are nested under `AdminGuard` and `AppShell`. Supabase browser access uses only the public URL + publishable key. Existing privileged operations are exposed as authenticated `SECURITY DEFINER` RPCs that verify `admin_get_session()` / `is_community_admin(auth.uid())`. The frontend already supports English and Arabic/RTL.

## 1. Global assistant placement

Mount one `AdminAgentPanel` inside `AppShell` alongside the routed `<Outlet />`, so the assistant is available on every authenticated admin page and never appears on login/reset-password pages.

The assistant receives route context from `useLocation()` and sends a normalized context object to the backend:

- current pathname
- a human page label
- optional route entity id (`userId`, `applicationId`)
- current UI language (`en` or `ar`)

The assistant panel has:

- floating launcher button
- expanded conversation panel
- text input
- microphone button
- listening / transcribing state
- agent thinking state
- tool execution state
- confirmation dialog for write actions
- inline success/error messages
- graceful unsupported-browser and denied-microphone errors
- responsive desktop/tablet/mobile layout
- RTL mirroring when Arabic is active

## 2. Voice commands

Voice is a first-class input path, implemented with the browser Web Speech API where available.

Deterministic navigation commands are resolved locally before contacting the model. Supported English and Arabic aliases include:

- dashboard
- analytics
- knowledge base
- users
- messages
- member reviews
- approved/VIP community
- announcements
- token activity
- account/security

Examples:

- “Go to analytics”
- “Open knowledge base”
- “Show users”
- “Go back to dashboard”
- Arabic equivalents such as “افتح التحليلات” and “افتح قاعدة المعرفة”

If the transcript is not a navigation command, it is submitted unchanged to the AI agent as a spoken instruction. The recognition language follows the UI language (`en-US` / `ar-LB`).

## 3. Agent security boundary

The browser never receives a Supabase service-role key, provider API key, n8n credential, bot token, or webhook secret.

The call path is:

`Admin frontend -> authenticated Supabase Edge Function admin-agent -> allowlisted admin RPC/tool handler -> Supabase and/or existing server workflow`

The `admin-agent` Edge Function:

1. requires a valid JWT;
2. creates a user-scoped Supabase client using the request Authorization header;
3. calls `admin_get_session()` and rejects inactive/non-admin sessions;
4. accepts only a validated request shape;
5. invokes an OpenAI-compatible server-side model endpoint configured only through Edge Function secrets;
6. exposes only explicit named tools;
7. never accepts arbitrary SQL, table names, RPC names, URLs, or code from the model;
8. validates every tool argument again before execution.

Server-only model configuration:

- `ADMIN_AGENT_MODEL_URL` — OpenAI-compatible chat-completions endpoint
- `ADMIN_AGENT_MODEL_API_KEY` — server secret
- `ADMIN_AGENT_MODEL` — model id

No `VITE_*` agent secret is introduced.

## 4. Allowlisted tools

Initial tool registry:

### Read / navigation tools

- `navigate_to_page`
- `search_users`
- `get_user_details`
- `search_knowledge_base`
- `get_analytics`
- `get_community_platform_stats`
- `list_community_members`

### Write tools

- `create_knowledge_record`
- `update_knowledge_record`
- `approve_document`
- `send_announcement`

The model returns either a normal answer, a navigation command, a read result, or a proposed write action.

Write actions are two-phase:

1. The first request validates arguments and returns `confirmation_required` with a normalized preview and one-time confirmation token.
2. The frontend renders a confirmation dialog.
3. The confirmation request returns the exact token and action.
4. The Edge Function validates that the token is recent, matches the current admin user, tool and normalized arguments, then executes once.

A confirmation token is HMAC-signed with `ADMIN_AGENT_CONFIRMATION_SECRET` and expires after five minutes. Announcement sending and approval/knowledge writes always require confirmation.

## 5. Knowledge-base agent actions

The existing document upload flow remains unchanged.

Add an RPC specifically for agent-created text records, because the current upload RPC assumes a binary file. `admin_create_knowledge_text_record(title, category, language, content)` creates a pending, unapproved record with canonical text and editor HTML, no arbitrary storage path, and no chunks/embeddings until the existing processing path runs.

The agent may create a placeholder pending record when content is omitted. In that case content is a short explicit draft marker instead of empty text so the current editor contract remains valid.

Example:

“Create a knowledge-base record called Alexandria Security FAQ, language English, and leave it pending.”

Preview:

- title: Alexandria Security FAQ
- language: en
- category: INTERNAL_QA (default only if current allowed category set supports it; otherwise GENERAL)
- status: PENDING
- approved: false

The user must confirm before creation.

## 6. Community membership model

Existing `platform_accounts` represents a person’s known messaging accounts. Existing `community_access` represents approval/access workflow state but is not sufficient to prove that a user is actually present in a specific external group.

Add `community_memberships` to track external membership separately:

- `id uuid primary key`
- `user_id uuid not null`
- `platform text not null` constrained to `TELEGRAM`, `DISCORD`, `WHATSAPP`
- `tier text not null` constrained to `GENERAL`, `VIP`
- `external_group_id text not null`
- `membership_status text not null` constrained to `MEMBER`, `LEFT`, `REMOVED`, `UNKNOWN`
- `verification_source text not null` constrained to `EVENT`, `API`, `ADMIN`, `IMPORT`
- `joined_at timestamptz`
- `left_at timestamptz`
- `last_verified_at timestamptz`
- timestamps
- unique `(user_id, platform, tier, external_group_id)`

RLS is enabled and direct authenticated table access is revoked. Admin reads go through new allowlisted RPCs.

## 7. Telegram VIP verification

Telegram does not provide a reliable bot endpoint to enumerate every historical supergroup member. The correct model is event tracking plus reconciliation for known Telegram users.

The system stores Telegram VIP membership when the existing bot/workflow receives `chat_member` updates for the VIP group. A protected RPC `record_community_membership_event(...)` accepts normalized membership events only from the trusted server workflow identity.

For users already present in `platform_accounts`, the Telegram integration can reconcile a known `platform_user_id` with Telegram `getChatMember` when the bot is an admin in the VIP group. Reconciled rows use `verification_source = API`.

The frontend does not call Telegram and never receives the Telegram bot token.

If no verified VIP membership rows exist or the connector has not reported verification state, the dashboard labels Telegram VIP membership as “Verification not connected” / Arabic equivalent instead of silently treating approved users as members.

## 8. Community dashboard and pie charts

Enhance the existing Dashboard page; do not add a duplicate dashboard route.

Add a “Community by platform” panel with:

- one overall pie chart: General vs VIP verified memberships
- one compact pie/donut chart per platform: Telegram, Discord, WhatsApp
- numeric totals next to each chart
- verification status per platform
- link/button to open the corresponding filtered users/community view

Because no chart library exists in the project, use a lightweight accessible CSS conic-gradient pie component rather than adding a large dependency. Each chart exposes a text/ARIA equivalent with exact General and VIP counts.

Platform metrics are returned by `admin_get_community_platform_stats()` and include:

- known users by platform from `platform_accounts`
- verified general memberships
- verified VIP memberships
- total verified memberships
- last membership verification timestamp
- verification-connected boolean

## 9. Agent awareness of community data

The agent gets two explicit read tools:

- `get_community_platform_stats()`
- `list_community_members({ platform?, tier?, search? })`

This supports queries such as:

- “How many Telegram VIP members do we have?”
- “Show Telegram VIP users”
- “Compare General and VIP membership by platform”

The agent must distinguish:

- known platform users
- approved users
- verified external-group members

and must not present one as another.

## 10. Error handling

Frontend errors are mapped to clear user-facing states:

- microphone permission denied
- speech recognition unsupported
- speech recognition network/error state
- agent function unavailable
- expired confirmation token
- admin authorization failure
- invalid tool arguments
- tool/backend failure

The assistant conversation remains usable after a failed request.

## 11. Tests and verification

Add Vitest coverage for:

- English navigation command parsing
- Arabic navigation command parsing
- non-navigation transcript passthrough
- page-context normalization
- community stat normalization
- assistant global mounting under authenticated shell
- write confirmation UI behavior
- frontend security config still rejects privileged `VITE_*` variables

Add SQL migration code with explicit grants/revokes and admin checks.

Verification commands remain the repo-standard commands:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run format`

CI is the existing GitHub Actions workflow on pull requests.

## 12. Deployment notes

Repository changes include the Edge Function source and migration, but production deployment of them must target the Supabase project whose URL matches the frontend environment. Do not deploy the migration/function into a differently connected Supabase project simply because it is available in ChatGPT.

The feature branch will be opened as a pull request so frontend CI runs before merge.