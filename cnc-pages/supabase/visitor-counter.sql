-- Additive upgrade for existing installations. Inventory/auth data is untouched.
create table if not exists public.cnc_visit_days (
  day date primary key,
  visits bigint not null default 0 check (visits >= 0)
);
create table if not exists public.cnc_visit_sessions (
  session_hash text primary key check (session_hash ~ '^[0-9a-f]{64}$'),
  last_counted timestamptz not null
);
create index if not exists cnc_visit_sessions_last_counted_idx
  on public.cnc_visit_sessions (last_counted);
alter table public.cnc_visit_days enable row level security;
alter table public.cnc_visit_sessions enable row level security;
revoke all on public.cnc_visit_days, public.cnc_visit_sessions from public, anon, authenticated;
grant all on public.cnc_visit_days, public.cnc_visit_sessions to service_role;

create or replace function public.cnc_get_visitor_stats()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'today', coalesce(sum(visits) filter (where day = (current_timestamp at time zone 'America/New_York')::date), 0),
    'total', coalesce(sum(visits), 0),
    'timezone', 'America/New_York'
  ) from public.cnc_visit_days;
$$;

create or replace function public.cnc_track_visit(p_session_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  counted boolean := false;
  visit_time timestamptz := current_timestamp;
begin
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visit session';
  end if;
  -- The conditional UPSERT serializes concurrent requests for the same session.
  insert into public.cnc_visit_sessions as sessions (session_hash, last_counted)
    values (p_session_hash, visit_time)
    on conflict (session_hash) do update set last_counted = excluded.last_counted
    where sessions.last_counted <= visit_time - interval '30 minutes'
    returning true into counted;
  if counted then
    insert into public.cnc_visit_days as days (day, visits)
      values ((visit_time at time zone 'America/New_York')::date, 1)
      on conflict (day) do update set visits = days.visits + 1;
  end if;
  -- Only anonymous, short-lived hashes are retained; totals contain no identities.
  delete from public.cnc_visit_sessions where last_counted < visit_time - interval '1 day';
  return public.cnc_get_visitor_stats();
end;
$$;
revoke execute on function public.cnc_get_visitor_stats() from public, anon, authenticated;
revoke execute on function public.cnc_track_visit(text) from public, anon, authenticated;
grant execute on function public.cnc_get_visitor_stats() to service_role;
grant execute on function public.cnc_track_visit(text) to service_role;
