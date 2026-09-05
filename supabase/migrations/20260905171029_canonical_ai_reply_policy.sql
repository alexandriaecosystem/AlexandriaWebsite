-- Keep a single unambiguous server-side takeover policy RPC for n8n.
-- The legacy three-argument overload returned a different response contract and
-- could make PostgREST RPC resolution ambiguous because its third argument had
-- a default value.

drop function if exists public.get_ai_reply_policy(text, text, timestamptz);

revoke all on function public.get_ai_reply_policy(text, text) from public, anon, authenticated;
grant execute on function public.get_ai_reply_policy(text, text) to service_role;

notify pgrst, 'reload schema';
