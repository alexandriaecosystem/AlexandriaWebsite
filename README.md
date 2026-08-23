# Alexandria community admin

Production Vite/React admin interface for the existing Supabase backend.

## Included

- Supabase email/password login and active-admin authorization guard
- Community dashboard with users, messages, reviews, AI usage, AI cost, cache rate, and failed operations
- AI usage analytics by day, purpose, platform, and model
- Pending-review dashboard and operational dead-letter handling
- Private evaluation detail, category signals, evidence, concerns, and access state
- Explicit human approve/reject decisions with an audited rationale
- Knowledge-base upload, processing-status monitoring, approval, reprocessing, and deletion
- Announcement draft creation and explicit approval/queueing
- Responsive Netlify-ready layout and SPA redirects

The browser uses only authenticated, allowlisted Supabase RPCs and protected Storage policies. Never place a service-role key, n8n credential, bot token, webhook secret, or provider token in a `VITE_*` variable.

AI cost/token cards depend on n8n calling the service-role-only `log_ai_usage_event` RPC after OpenRouter requests. Until that telemetry is wired, cost and token metrics can legitimately remain zero.

Knowledge-base uploads go directly from the authenticated admin browser to the protected `knowledge-base` Storage bucket. The privileged n8n `crypto-kb-process` webhook must remain server-side and must never be called from the browser with its header-auth secret.

## Netlify

Set these build environment variables:

```text
VITE_SUPABASE_URL=https://txghkgwowpsdjjdduecs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable or legacy anon key>
```

Build command: `npm run build`

Publish directory: `dist`

The included `netlify.toml` already configures the build and SPA redirect.
