# Alexandria operational audit — implementation plan

Approved scope: the user's September 9 production-audit request. Preserve the existing Router → Answer Engine and KB/official-source architecture. No workflow execution, webhook, platform message, quiz, announcement, or production test record is authorized.

Baseline: main e4ce8401ee67630a312f81b426abe2f6e6b59a28. Existing 109 frontend tests pass locally using a private CI source/dependency artifact. Work is isolated on fix/alexandria-operational-ux-audit. Draft PR #40 is not a merge candidate for this work.

1. Reproduce navigation, unknown-data, readiness, and takeover-status defects with regression tests.
2. Make Knowledge Base, Knowledge Gaps, and Announcements direct top navigation destinations.
3. Restore the missing production seven-day activity field without changing account-status semantics. Unknown measurements stay unknown. Display partial dashboard failures rather than an all-clear assertion.
4. Add an administrator-only platform-account composition projection. Telegram premium/regular/unknown are disjoint, explicitly observed classifications; WhatsApp is not split. The denominator is platform accounts, not unique people. Use an SVG donut with directly labelled values, accessible text, an empty/error state, and compact mobile/RTL layout. One instance per page, no new chart dependency.
5. Make KB readiness include current-version conflict scan, indexed content, and approval. Block single/bulk approval locally when known unsafe; the database remains authoritative. Poll pending scans, not just extraction.
6. Expose gap answer processing/approval states and clarify that saving does not automatically approve knowledge. Keep existing database lifecycle and pipeline.
7. Fix misleading takeover/quiz status while reads fail; add useful compact process visuals and keyboard-safe modal behavior.
8. Inspect backend authorization, quiz concurrency/scoring, announcement idempotency, and canonical n8n call paths. Change only confirmed defects. Unit-test pure policy logic offline, validate node configurations, publish safe patches without executing them.
9. Run lint, complete tests, build, and isolated desktop/tablet/mobile/RTL browser checks with synthetic local fixtures and all external requests blocked. Deno-check any changed Edge Functions.
10. Review diff, create PR, merge only after CI is green; verify resulting main. Record what was not exercised end-to-end and exact manual tests.
