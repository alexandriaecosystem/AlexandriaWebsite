-- Companion to 20260902100000_instagram_announcement_platform.sql: register
-- the Instagram announcement destination. The n8n delivery workflow reads
-- the target account entirely from $vars.INSTAGRAM_IG_USER_ID / ACCESS_TOKEN
-- (a single connected IG business account, like the 'x' platform's 'self'
-- row), so external_target_id here is a placeholder used only to satisfy
-- admin_approve_announcement's community-matching join. Applied directly to
-- production on 2026-09-02; this file brings the migration history in sync.

insert into public.communities (platform, community_level, name, external_target_id, is_active, config)
values ('instagram', 'GENERAL', 'Instagram Public Account', 'self', true, '{}'::jsonb)
on conflict do nothing;
