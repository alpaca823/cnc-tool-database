-- Run once in the Supabase SQL Editor. All app access goes through cnc-api.
create table if not exists public.cnc_state (
  id text primary key check (id = 'main'),
  revision bigint not null default 0,
  data jsonb
);
insert into public.cnc_state (id) values ('main') on conflict do nothing;
create table if not exists public.cnc_sessions (
  token_hash text primary key,
  data jsonb not null,
  expires_at timestamptz not null
);
alter table public.cnc_state enable row level security;
alter table public.cnc_sessions enable row level security;
revoke all on public.cnc_state, public.cnc_sessions from anon, authenticated;
grant all on public.cnc_state, public.cnc_sessions to service_role;
-- No browser SELECT policies: credential hashes and sessions remain server-only.
