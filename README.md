# Alexandria community admin

Production Vite/React admin interface for the existing Supabase backend.

## Included

- Supabase email/password login and active-admin authorization guard
- English / Arabic language switch with persistent preference and RTL layout
- Live dashboard for users, messages, review queue, dead-letter operations, AI cost, tokens, and cache activity
- AI usage analytics by time, purpose, platform, and model
- Private evaluation detail, category signals, evidence, concerns, and access state
- Explicit human approve/reject decisions with an audited rationale
- Knowledge-base upload and management through protected Supabase Storage and admin RPCs
- Announcement draft creation and explicit approval/queueing
- Responsive Netlify-ready layout and SPA redirects

The browser uses only authenticated, allowlisted `SECURITY DEFINER` RPCs. Never
place a service-role key, n8n credential, bot token, webhook secret, or provider
token in a `VITE_*` variable.

AI token/cost cards depend on n8n recording provider usage through the server-only
`log_ai_usage_event` RPC. Knowledge processing remains server-side; the browser does
not call the privileged n8n KB-processing webhook directly.

## Netlify

Set these build environment variables:

```text
VITE_SUPABASE_URL=https://txghkgwowpsdjjdduecs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable or legacy anon key>
```

Build command: `npm run build`

Publish directory: `dist`
