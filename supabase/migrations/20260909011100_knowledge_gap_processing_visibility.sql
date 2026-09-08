CREATE OR REPLACE FUNCTION public.admin_list_knowledge_gaps(p_limit integer DEFAULT 100, p_status text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_community_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING errcode='42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'validation_error' USING errcode='22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('OPEN','RESOLVED','IGNORED') THEN
    RAISE EXCEPTION 'validation_error' USING errcode='22023';
  END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x.last_seen_at DESC),'[]'::jsonb) INTO v_items
  FROM (
    SELECT g.id,g.sample_question,g.platform,g.language,g.occurrence_count,g.first_seen_at,g.last_seen_at,
      g.status,g.resolved_document_id,g.admin_answer,g.answered_by,g.answered_at,g.created_at,g.updated_at,
      d.processing_status AS answer_processing_status,
      d.conflict_scan_status AS answer_conflict_scan_status
    FROM public.knowledge_gaps g
    LEFT JOIN public.knowledge_documents d ON d.id=g.resolved_document_id
    WHERE p_status IS NULL OR g.status=p_status
    ORDER BY g.last_seen_at DESC LIMIT p_limit
  ) x;
  RETURN jsonb_build_object('items',v_items,'total',(SELECT count(*) FROM public.knowledge_gaps WHERE p_status IS NULL OR status=p_status));
END
$function$;
