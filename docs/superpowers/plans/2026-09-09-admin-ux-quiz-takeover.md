# Alexandria admin UX + WhatsApp quiz controls implementation plan

**Goal:** simplify the nontechnical admin experience, make Human Takeover obvious, and connect a secure WhatsApp Quiz scheduling UI without changing Alexandria's canonical answer, quiz scoring, or approval architecture.

## Constraints

- No n8n executions or webhook tests during implementation.
- Reuse the existing Human Takeover RPCs and the existing n8n quiz scheduler/10-question scoring path.
- Never expose platform target IDs, `CRYPTO_INTERNAL_WEBHOOK_SECRET`, n8n URLs, cron expressions, or internal workflow IDs in browser code.
- Preserve legacy routes where useful, but remove secondary/technical destinations from the main navigation.

## Tasks

1. **Acceptance tests first**
   - Dashboard: four key stats, Active/Inactive 7-day donut, attention-only alerts, no platform/technical comparison.
   - Navigation: exactly the nine high-level admin destinations requested.
   - Human Takeover: explicit AI status, Take Over Now / Schedule Takeover / Return to AI, Until tomorrow preset, separate active/upcoming sections.
   - WhatsApp Quiz: Daily/Weekly/Custom, fixed 10 questions, pause/resume/send-now, friendly community names, no raw target IDs/secrets.

2. **Secure quiz adapter**
   - Add authenticated Supabase Edge Function `whatsapp-quiz-admin`.
   - Verify the signed-in user is an active community admin.
   - Resolve selected `community_id` to its WhatsApp `external_target_id` server-side.
   - Forward admin/status calls to the existing protected n8n quiz scheduler using server-only configuration.
   - Strip `external_target_id` and internal scheduler identifiers from browser responses.

3. **Frontend implementation**
   - Add `/whatsapp-quiz`, service layer, responsive styling, and sidebar item.
   - Simplify sidebar to Dashboard, Members, Communities, Messages, Knowledge, Announcements, WhatsApp Quiz, AI & Costs, Settings.
   - Keep hidden secondary routes reachable from contextual links/settings.
   - Put Human Takeover prominently at the top of Messages and Communities.
   - Simplify Dashboard to the requested three-row operations view.

4. **Cleanup**
   - Remove obsolete `AiSleepPanel` UI/test so there is only one Human Takeover surface; retain the shared `ai-sleep` service used by the real takeover control.
   - Keep existing Knowledge Gap answer flow and Knowledge conflict protection unchanged.

5. **Validation**
   - Lint/typecheck/tests/build through safe frontend CI/static checks only.
   - Search browser-facing files for `CRYPTO_INTERNAL_WEBHOOK_SECRET`, raw group IDs, n8n webhook URLs, and obsolete AI Sleep UI.
   - Do not trigger the quiz, platform messages, or any n8n execution.
