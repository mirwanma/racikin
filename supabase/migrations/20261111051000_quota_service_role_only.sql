-- Fungsi kuota hanya untuk server (Edge Function dengan service role), bukan klien.
drop function if exists public.consume_ai_quota(text, int, int);

create or replace function public.consume_ai_quota(p_user uuid, p_task text, p_per_minute int, p_per_day int)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
begin
  -- Kunci per user supaya request paralel tidak lolos bareng.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select count(*) into n_minute from public.ai_usage
    where user_id = p_user and created_at > now() - interval '1 minute';
  select count(*) into n_day from public.ai_usage
    where user_id = p_user and created_at > now() - interval '1 day';

  if n_minute >= p_per_minute then
    return json_build_object('ok', false, 'reason', 'per_minute', 'limit', p_per_minute);
  end if;
  if n_day >= p_per_day then
    return json_build_object('ok', false, 'reason', 'per_day', 'limit', p_per_day);
  end if;

  insert into public.ai_usage (user_id, task) values (p_user, left(p_task, 64));
  return json_build_object('ok', true, 'used_today', n_day + 1, 'limit_day', p_per_day);
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, int, int) to service_role;
