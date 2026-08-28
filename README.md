# Alexandria community admin

Production Vite/React admin interface for the existing Supabase backend.

## Included

- Supabase email/password login and active-admin authorization guard
- English / Arabic language switch across the admin interface, with persistent preference and full RTL layout
- Live dashboard for users, messages, review queue, dead-letter operations, AI cost, tokens, cache activity, and verified General/VIP community membership
- General/VIP donut charts for Telegram, Discord and WhatsApp, with visible percentages and known platform users kept separate from verified external-group membership
- Global AI admin assistant on every authenticated page
- Browser voice commands for direct navigation plus spoken AI/admin instructions
- Controlled AI tools for users, knowledge, analytics, community membership, announcements, and AI sleep/human takeover
- Explicit confirmation before AI-triggered write actions, with short-lived signed tokens and one-time nonce consumption
- Scheduled AI sleep windows for one exact Telegram/Discord/WhatsApp channel or group
- Human-takeover UI in Messages with Active / Upcoming / History views, local-time scheduling, duration, wake countdown, and `Wake AI now`
- AI usage analytics by time, purpose, platform, and model
- Private evaluation detail, category signals, evidence, concerns, and access state
- Explicit human approve/reject decisions with an audited rationale
- Knowledge-base upload and management through protected Supabase Storage and admin RPCs
- Announcement draft creation and explicit approval/queueing
- Responsive Netlify-ready layout and SPA redirects

The browser uses only authenticated, allowlisted `SECURITY DEFINER` RPCs and the authenticated `admin-agent` Edge Function. Never place a service-role key, n8n credential, Telegram/Discord/WhatsApp bot token, webhook secret, or AI-provider token in a `VITE_*` variable.

The AI admin request path is:

```text
Admin frontend -> authenticated admin-agent Edge Function -> explicit allowlisted RPC/tool -> Supabase / existing server workflow
```

The agent has no arbitrary SQL/RPC/table access. Write tools use a signed, short-lived confirmation token. Confirmation nonces are consumed server-side before execution so a confirmed write cannot be replayed with the same token. The exact normalized arguments shown for confirmation are the arguments that are executed.

AI token/cost cards depend on n8n recording provider usage through the server-only `log_ai_usage_event` RPC. Knowledge processing remains server-side; the browser does not call the privileged n8n KB-processing webhook directly.

## AI sleep mode / human takeover

`ai_sleep_windows` stores auditable scheduled pauses for automated AI replies. A rule is scoped to one normalized platform (`TELEGRAM`, `DISCORD`, or `WHATSAPP`) and one exact external channel/group/conversation ID. Display names are optional and are never used as the routing key.

The Messages page displays current, upcoming, ended, and cancelled windows. Browser `datetime-local` values are interpreted in the administrator's local timezone and converted to ISO/UTC timestamps before they reach Supabase. A single window may be at most 30 days. Overlapping non-cancelled windows for the same platform/channel are rejected.

During an active sleep window:

- incoming messages must still be persisted and shown as unread/admin inbox activity;
- automated AI/RAG/qualification replies must be skipped;
- a human admin answers through the native Telegram/Discord/WhatsApp app in this iteration;
- messages received while sleeping are **not** automatically replayed to the AI when the channel wakes;
- once the window ends or is cancelled, AI is eligible only for new inbound messages from that effective wake time onward.

Every inbound messaging workflow must enforce the policy in this order:

```text
Receive inbound event
-> normalize platform + exact external channel id
-> resolve/store identity
-> persist inbound message / unread state
-> call get_ai_reply_policy(platform, external_channel_id, now())
-> if SLEEPING: stop automated reply path / hand over to human
-> if AI_ENABLED: continue existing AI/RAG reply path
```

`get_ai_reply_policy` is service-role-only. If that policy lookup fails, the messaging workflow must fail safe and **not** generate/send an automated AI reply until the policy is known. The frontend intentionally shows a server-enforcement note because creating a database sleep row alone cannot suppress a platform workflow that has not yet been updated to call this RPC.

The global admin assistant also has explicit sleep tools:

- `list_ai_sleep_windows`
- `get_ai_sleep_status`
- `schedule_ai_sleep` — confirmation required
- `cancel_ai_sleep` — confirmation required

For scheduling, the agent must have an exact external channel/group ID. A command such as “Put Telegram VIP to sleep until 9 AM tomorrow” needs the exact Telegram chat ID before the write can be proposed safely.

## Community membership verification

`platform_accounts` represents known messaging identities. `community_access` represents approval/access workflow state. Verified presence in an external General or VIP group is tracked separately in `community_memberships`.

For Telegram VIP, configure the Alexandria bot as an administrator of the VIP supergroup and have the existing server/n8n Telegram workflow record `chat_member` changes through the server-only `record_community_membership_event` RPC. Existing known Telegram users can also be reconciled server-side with Telegram `getChatMember`; the bot token must never be sent to the frontend. Until verification events/reconciliation are connected, the dashboard intentionally displays **Verification not connected** rather than treating approved users as verified VIP members.

The membership event RPC accepts external Telegram/Discord/WhatsApp identities even when they are not yet linked to an Alexandria user, so verified group counts do not silently omit real group members. If that external identity is known in `platform_accounts`, the record is linked to the Alexandria user automatically.

## Netlify

Set these browser-public build environment variables:

```text
VITE_SUPABASE_URL=https://txghkgwowpsdjjdduecs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable or legacy anon key>
```

Build command: `npm run build`

Publish directory: `dist`

## AI admin Edge Function

Deploy `supabase/functions/admin-agent` to the same Alexandria Supabase project used by `VITE_SUPABASE_URL`, with JWT verification enabled. Configure the following as **Edge Function secrets/server environment only**, never Netlify `VITE_*` variables:

```text
ADMIN_AGENT_MODEL_URL=<full OpenAI-compatible chat-completions endpoint>
ADMIN_AGENT_MODEL_API_KEY=<server-only model API key>
ADMIN_AGENT_MODEL=<model id>
ADMIN_AGENT_CONFIRMATION_SECRET=<random high-entropy secret, at least 24 characters>
```

The function also uses Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Membership events and the AI reply-policy lookup are server-only and should be called from n8n/another trusted backend using its existing privileged Supabase credential.

Apply all new migrations to that same project in timestamp order before enabling the membership dashboard, agent write tools, and sleep mode:

```text
supabase/migrations/20260828090000_admin_agent_community_memberships.sql
supabase/migrations/20260828090100_community_membership_event_upsert_fix.sql
supabase/migrations/20260828090200_agent_confirmation_and_external_members.sql
supabase/migrations/20260828090300_ai_sleep_windows.sql
```
