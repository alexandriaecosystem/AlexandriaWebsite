# Alexandria operational UX and production audit — 9 September 2026

## Scope and safety

Started from frontend main `e4ce8401ee67630a312f81b426abe2f6e6b59a28`.
No workflows, nodes, webhooks, test executions, polls, platform messages, or posts were executed by this audit. Browser rendering used an entirely offline, bundled Supabase fixture. No production keys were copied into the frontend or fixtures. Draft PR #40 was not merged.

## Implemented frontend fixes

- Navigation: Dashboard → Knowledge Base → Knowledge Gaps → Announcements → Members → Communities → Messages → WhatsApp Quiz → AI & Costs → Settings.
- Failed attention checks remain unknown instead of becoming zero / “All clear.” Missing seven-day activity remains unknown, not zero.
- Four essential metrics fit one desktop row, two on normal mobile screens.
- New platform-account composition donut with labelled counts and percentages. It counts accounts, not additive distinct people. Multiple accounts can belong to a member. Unknown Telegram subscription observations are separate from regular accounts; WhatsApp subscription status is not inferred.
- Existing active/inactive visualization remains based on processed-message activity over seven days; its denominator is members, not platform accounts.
- Knowledge approval and “Ready for answers” labels require indexed content, current completed conflict scan, and no blocking conflict. A conflict blocks approval and is visible. Pending scans refresh automatically.
- Knowledge Gaps distinguishes an added answer from processing and resolution using the linked document's actual processing state. Raw backend errors are not shown.
- Announcements has a compact compose → destinations → preview → send → delivery-status explanation.
- Human Takeover shows checking/unavailable states rather than an unverified “AI Active.” Failed mutations display friendly errors. Ending one window does not promise that every overlapping window has ended.
- Quiz schedule read failures no longer masquerade as a paused schedule. Next/last times display in Asia/Beirut. The compact flow preserves ten questions and ten correct answers. Backend errors are summarized safely.
- AI cost empty state explains that missing tracking is not zero cost.
- Members mobile-card table no longer retains the desktop 1040px minimum width.

## Production data inspected

At inspection, there were 11 platform-account records linked to 11 distinct members: 6 Telegram and 5 WhatsApp. All Telegram premium statuses were unknown/unobserved. No Discord accounts were stored in this snapshot. Three members had processed messages in the preceding seven days. The quiz bank contained 100 questions, of which 96 were active and four excluded. These are a snapshot, not hard-coded UI data.

## Applied Supabase changes

1. `operational_dashboard_truthful_accounts`: restored `active_users_7_days` in the existing metrics RPC without replacing its other live fields; added admin-only `admin_get_member_composition()` with disjoint categories and explicit unknowns. An authenticated active admin is checked inside the SECURITY DEFINER function; anonymous execute permission was revoked. The result was read back and reconciled with aggregate source counts.
2. `knowledge_gap_processing_visibility`: enriched the existing admin gap-list RPC with processing and conflict-scan states from the linked document. Existing authorization, validation, status model and pagination remain in place.

SQL is tracked beside the application under `supabase/migrations/`.
No Edge Function was changed or deployed; Deno checks therefore do not apply to this patch.

## Published n8n changes

The existing Router and Answer Engine were changed in place; no new answering paths or workflows were created.

- Router published version: `5298eeb0-de6e-4d37-b623-f5d24487ec3e` (25 nodes).
- Answer Engine published version: `104ea74b-8007-4ce4-a28b-bdc90c47cec3` (38 nodes).
- Ordinary multilingual “how/where” questions no longer count as purchase requests merely because of the question word.
- The legacy-symbol URL sanitizer no longer removes the canonical Alexandria website by substring match.
- Answers altered by the final policy guard are not eligible for the verified-answer cache.
- Knowledge Gap logging uses the actual platform, not the private/group context type.
- Twenty-seven offline policy regressions cover neutral multilingual questions, purchase-policy boundaries, official links and cache eligibility. The committed policy text files are the tested node-code snapshots. In the Answer Engine, the first enforcer's input lookup is `Answer Engine Input` rather than the Router's `Apply Purchase Intent Policy`.

The official-source indexer and conflict detector are active, with published versions matching their drafts. Their full extraction/detection behavior was not executed or re-certified in this pass. The Answer Engine's existing KB-first → official fallback → freshness/conflict checks → final guard graph was statically inspected and retained.

## Important remaining scheduler blocker

The main workflow's quiz-scheduler additions were saved only as a draft, not published. Its existing active version remains `2c1f1a4f-5efe-40cc-8066-f9c089e1f963`. The schedule row inspected was paused, with no run-now request.

This audit hardened that draft by adding timestamp matching to a schedule claim and disabling automatic retries on non-idempotent round creation and WhatsApp poll sends. Those changes are **draft only**. They have not been advertised as live functionality. Publishing the new five-minute timer would introduce executions, so it was not activated under the zero-execution instruction.

Still requiring completion/verification before activation:
- Concurrent admin edits must not clear the lock of an in-flight dispatch.
- A round-start retry or competing manual round must not supersede a partially delivered round.
- Confirm actual compare-and-set behavior and zero-row output in the data-table node.
- Validate exactly-ten poll delivery, provider option-ID mapping, partial dispatch handling, and duplicate access on repeated qualification.
- Resolve the unpublished status/admin endpoints before claiming that website schedule saving is operational.

Static database review confirmed server-only quiz RPC grants, ten-question / ten-correct scoring, unique question selections within a round, shuffled options with server-side answer mapping, wrong-community rejection when the incoming chat ID is supplied, per-question/member vote uniqueness, and uniqueness constraints on active rounds and community access. This is not a claim that the end-to-end platform flow passed.

## Verification evidence

- `npm run lint`: passed.
- `npm test`: 151 tests passed in 27 files (109 baseline tests, 42 additional cases).
- `npm run build`: passed. Existing bundle-size warning remains (approximately 740 kB minified JS); no claim of a performance benchmark.
- Chromium rendered ten routes at desktop 1440px, tablet 820px, mobile 390px, and Arabic RTL 390px: 40 screen/viewport checks, no JavaScript errors or horizontal document overflow after the Members fix.
- The browser exercised representative populated dashboard/knowledge/gap states and empty/unavailable states on other routes. It did not certify every populated table, modal, keyboard interaction or live authenticated route. Browser URL navigation was restricted, so compiled offline content was rendered directly without network access.
- Production schema/function inspection and aggregate reads; saved/published n8n version receipts.
- CI and merge outcome are recorded on the accompanying pull request; local tests alone are not treated as proof of hosted deployment.

## Manual end-to-end acceptance tests

Run the following only in explicitly authorized test communities/accounts. These tests were not executed during the audit.

1. Navigation / responsiveness: open all ten destinations at desktop, tablet and phone sizes; repeat in Arabic; open the takeover drawer and knowledge editor, check focus, Escape, scrolling and readable labels.
2. Dashboard: compare distinct seven-day processed-message users with Active Members; compare platform-account segments with account records. Simulate a failed secondary read and confirm an unavailable state, never “All clear.”
3. Knowledge: upload a harmless factual document; observe extraction/indexing/current conflict scan; approve only after readiness. Verify an ordinary related question uses it. Upload a contradictory version and confirm visible conflict and server-side approval rejection. Edit/reprocess and verify old cache content is no longer reused.
4. Knowledge Gaps: add an answer, observe processing, inspect the created unapproved KB document, complete its scan/approval, resolve and reopen. Confirm ignored gaps remain separate and answers are not used before approval.
5. Human Takeover: in an authorized test community, take over for 30 minutes, send a real message, verify no AI reply but visible inbound message. Return to AI and send another. Repeat a scheduled window and overlapping windows; ending one must not cancel the other.
6. Quiz scheduler (after the remaining locking work and authorized activation): save daily/weekly/custom Beirut schedules, reload, verify persistence and next-run timezone. Pause and verify no dispatch. Keep exactly ten questions fixed.
7. Quiz round: send one round to the test WhatsApp community. Verify ten distinct single-choice polls and correct-answer mapping after option randomization. Nine answers or 9/10 must not qualify; 10/10 must create only one approved-access operation. Replay a vote and attempt a vote from another community; neither may duplicate or wrongly grant access. Test competing rounds and an interrupted poll send.
8. Announcements: preview and send one test text/image announcement to each authorized Telegram/WhatsApp/Discord/X destination and one single-image Instagram feed post. Verify actual delivery history and per-target errors. A retry after ambiguous delivery must not blindly duplicate a post.
9. Answer safety / fallback: ask ordinary project questions in Arabic, French, German and English, request the official website, then verify purchase requests still receive the neutral boundary. Test approved-KB miss, official-source fallback, stale source, unresolved contradiction and complete evidence miss.
10. Usage / permissions: compare an authorized answer's provider usage with the recorded purpose/model/cost; confirm missing observations are not shown as zero cost. Verify a non-admin cannot call the admin metrics/composition/knowledge/quiz controls. Verify anonymous callers cannot access them.

## Limits of this pass

This is a shipped defect-fix and UI pass, not an assertion that the whole system is production-certified. Live message sending, quiz qualification/access delivery, all announcement providers, website deployment, full crawl completeness, all contradictory-document cases, premium ingestion for new Telegram events, and takeover enforcement for every caller still require the appropriate authenticated end-to-end checks. No investment instructions or token-purchase guidance were added.
