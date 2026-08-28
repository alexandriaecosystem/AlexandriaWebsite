# Alexandria community admin

Production Vite/React admin interface for the existing Supabase backend.

## Included

- Supabase email/password login and active-admin authorization guard
- English / Arabic language switch across the admin interface, with persistent preference and full RTL layout
- Live dashboard for users, messages, review queue, dead-letter operations, AI cost, tokens, cache activity, and verified General/VIP community membership
- General/VIP pie charts for Telegram, Discord and WhatsApp, with known platform users kept separate from verified external-group membership
- Global AI admin assistant on every authenticated page
- Browser voice commands for direct navigation plus spoken AI/admin instructions
- Controlled AI tools for users, knowledge, analytics, community membership and announcements
- Explicit confirmation before AI-triggered write actions, with short-lived signed tokens and one-time nonce consumption
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

The function also uses Supabase-provided `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The membership event RPC is server-only and should be called from n8n/another trusted backend using its existing privileged Supabase credential.

Apply all new migrations to that same project in timestamp order before enabling the membership dashboard/agent write tools:

```text
supabase/migrations/20260828090000_admin_agent_community_memberships.sql
supabase/migrations/20260828090100_community_membership_event_upsert_fix.sql
supabase/migrations/20260828090200_agent_confirmation_and_external_members.sql
```
