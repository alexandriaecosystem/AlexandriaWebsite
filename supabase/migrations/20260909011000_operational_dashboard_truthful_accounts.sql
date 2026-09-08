-- Applied through the production audit; preserve other live metrics.
DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.admin_get_dashboard_metrics()'::regprocedure) INTO v_definition;
  IF position('''active_users_7_days''' IN v_definition) = 0 THEN
    IF position('return jsonb_build_object(' IN v_definition) = 0 THEN
      RAISE EXCEPTION 'Dashboard definition changed; review required';
    END IF;
    v_definition := replace(v_definition, 'return jsonb_build_object(', 'return jsonb_build_object(''active_users_7_days'', (select count(distinct pm.user_id) from public.processed_messages pm join public.users u on u.id=pm.user_id where pm.processed_at >= now() - interval ''7 days'' and pm.processed_at <= now()),');
    EXECUTE v_definition;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.admin_get_member_composition()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.community_admins WHERE user_id=auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  WITH classified AS (
    SELECT user_id, CASE
      WHEN lower(platform)='telegram' AND is_premium IS TRUE AND premium_checked_at IS NOT NULL THEN 'telegram_premium'
      WHEN lower(platform)='telegram' AND is_premium IS FALSE AND premium_checked_at IS NOT NULL THEN 'telegram_regular'
      WHEN lower(platform)='telegram' THEN 'telegram_unknown'
      WHEN lower(platform)='whatsapp' THEN 'whatsapp'
      WHEN lower(platform)='discord' THEN 'discord'
      ELSE 'other' END AS category
    FROM public.platform_accounts
  ), segments AS (
    SELECT category, count(*) AS count FROM classified GROUP BY category
  )
  SELECT jsonb_build_object(
    'total_accounts', (SELECT count(*) FROM classified),
    'linked_members', (SELECT count(DISTINCT user_id) FROM classified),
    'segments', coalesce((SELECT jsonb_agg(jsonb_build_object('category',category,'count',count) ORDER BY category) FROM segments),'[]'::jsonb),
    'basis', 'recorded_platform_accounts',
    'whatsapp_subscription_tracked', false
  ) INTO v_result;
  RETURN v_result;
END
$function$;
REVOKE ALL ON FUNCTION public.admin_get_member_composition() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_member_composition() TO authenticated;
COMMENT ON FUNCTION public.admin_get_member_composition() IS 'Admin-only aggregate of disjoint platform accounts, not additive distinct people. Nullable or unobserved Telegram premium status remains unknown. No WhatsApp subscription inference.';
