# Alexandria community admin

Production Vite/React admin interface for the existing Supabase backend.

## Included

- Supabase email/password login and active-admin authorization guard
- Pending-review dashboard and operational dead-letter count
- Private evaluation detail, category signals, evidence, concerns, and access state
- Explicit human approve/reject decisions with an audited rationale
- Announcement draft creation and explicit approval/queueing
- Responsive Netlify-ready layout and SPA redirects

The browser uses only authenticated, allowlisted `SECURITY DEFINER` RPCs. Never
place a service-role key, n8n credential, bot token, webhook secret, or provider
token in a `VITE_*` variable.

## Netlify

Set these build environment variables:

```text
VITE_SUPABASE_URL=https://txghkgwowpsdjjdduecs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<Supabase publishable or legacy anon key>
```

Build command: `npm run build`

Publish directory: `dist`

The included `netlify.toml` already configures the build and SPA redirect.
"# mawqe3electrone" 
