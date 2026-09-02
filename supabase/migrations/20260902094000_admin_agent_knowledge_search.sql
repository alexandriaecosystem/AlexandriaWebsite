create or replace function public.admin_search_knowledge_documents(
  p_query text default null,
  p_status text default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_query text := lower(trim(coalesce(p_query, '')));
  v_tokens text[];
  v_items jsonb;
  v_total integer;
begin
  if not exists (
    select 1
    from public.community_admins
    where user_id = auth.uid()
      and is_active
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_limit not between 1 and 50 then
    raise exception 'validation_error' using errcode = '22023';
  end if;

  if p_status is not null and p_status not in ('PENDING', 'PROCESSING', 'READY', 'FAILED') then
    raise exception 'validation_error' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct token), '{}'::text[])
  into v_tokens
  from regexp_split_to_table(v_query, '[[:space:][:punct:]]+') as token
  where char_length(token) >= 3
    and token not in (
      'the', 'and', 'for', 'with', 'about', 'find', 'show', 'please',
      'knowledge', 'document', 'documents', 'regarding', 'related'
    );

  with ranked as (
    select
      kd.id,
      kd.title,
      kd.category,
      kd.language,
      kd.is_approved,
      kd.processing_status,
      kd.version,
      kd.updated_at,
      case
        when cardinality(v_tokens) = 0 then 0
        else (
          select count(*)::integer
          from unnest(v_tokens) as t
          where strpos(
                  lower(concat_ws(' ', kd.title, kd.category, coalesce(kd.content, ''))),
                  t
                ) > 0
             or exists (
                  select 1
                  from public.knowledge_chunks kc_match
                  where kc_match.document_id = kd.id
                    and strpos(lower(kc_match.content), t) > 0
                )
        )
      end as match_score,
      left(
        coalesce(nullif(best_chunk.content, ''), nullif(kd.content, ''), ''),
        700
      ) as snippet
    from public.knowledge_documents kd
    left join lateral (
      select kc.content
      from public.knowledge_chunks kc
      where kc.document_id = kd.id
      order by
        case
          when cardinality(v_tokens) = 0 then 0
          else (
            select count(*)::integer
            from unnest(v_tokens) as t
            where strpos(lower(kc.content), t) > 0
          )
        end desc,
        kc.chunk_index asc
      limit 1
    ) best_chunk on true
    where p_status is null or kd.processing_status = p_status
  ),
  filtered as (
    select *
    from ranked
    where cardinality(v_tokens) = 0 or match_score > 0
  ),
  paged as (
    select *
    from filtered
    order by match_score desc, is_approved desc, updated_at desc
    limit p_limit
  )
  select
    coalesce((select jsonb_agg(to_jsonb(p)) from paged p), '[]'::jsonb),
    (select count(*) from filtered)
  into v_items, v_total;

  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'query', v_query,
    'tokens', to_jsonb(v_tokens)
  );
end
$function$;

revoke all on function public.admin_search_knowledge_documents(text, text, integer) from public;
revoke all on function public.admin_search_knowledge_documents(text, text, integer) from anon;
grant execute on function public.admin_search_knowledge_documents(text, text, integer) to authenticated;
