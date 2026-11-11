-- Run after visitor-counter.sql. All test writes are rolled back.
begin;
do $$
declare base bigint; stats jsonb;
begin
  delete from public.cnc_visit_sessions where session_hash in (repeat('a',64),repeat('b',64),repeat('c',64));
  select coalesce(sum(visits),0) into base from public.cnc_visit_days;
  perform public.cnc_track_visit(repeat('a',64));
  stats:=public.cnc_track_visit(repeat('a',64));
  if (stats->>'total')::bigint<>base+1 then raise exception 'Duplicate visit counted'; end if;
  update public.cnc_visit_sessions set last_counted=current_timestamp-interval '31 minutes' where session_hash=repeat('a',64);
  stats:=public.cnc_track_visit(repeat('a',64));
  if (stats->>'total')::bigint<>base+2 then raise exception 'Cooldown did not expire'; end if;
  insert into public.cnc_visit_sessions values (repeat('c',64),current_timestamp-interval '2 days');
  stats:=public.cnc_track_visit(repeat('b',64));
  if (stats->>'total')::bigint<>base+3 then raise exception 'Distinct session missing'; end if;
  if exists(select 1 from public.cnc_visit_sessions where session_hash=repeat('c',64)) then raise exception 'Expired hash retained'; end if;
  if has_table_privilege('anon','public.cnc_visit_sessions','SELECT') or has_table_privilege('authenticated','public.cnc_visit_days','UPDATE') or has_function_privilege('anon','public.cnc_track_visit(text)','EXECUTE') then raise exception 'Counter privileges exposed'; end if;
  if (stats->>'timezone')<>'America/New_York' then raise exception 'Wrong day timezone'; end if;
end $$;
select 'Visitor counter SQL checks passed' as result;
rollback;
