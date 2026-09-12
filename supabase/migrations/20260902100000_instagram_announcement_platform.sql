-- Instagram is offered as an announcement platform in the admin UI and is
-- fully wired on the n8n delivery side (media container + publish), but the
-- platform_name enum never included 'instagram' and no active communities
-- row existed for it. Result: selecting Instagram in an announcement caused
-- admin_create_announcement[_with_media] to fail outright (invalid enum
-- cast), and even before that, admin_approve_announcement could never match
-- an Instagram delivery target. Applied directly to production on
-- 2026-09-02; this file brings the migration history in sync.

alter type public.platform_name add value if not exists 'instagram';
