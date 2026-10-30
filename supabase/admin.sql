-- Apply guestbook.sql FIRST. Then run this script once in Supabase SQL Editor.
begin;
create table if not exists public.site_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from public, anon, authenticated;
grant all on public.site_admins to service_role;

create or replace function public.is_site_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.site_admins where user_id = auth.uid()); $$;
revoke all on function public.is_site_admin() from public, anon;
grant execute on function public.is_site_admin() to authenticated;

alter table public.message add column if not exists hidden boolean not null default false;
drop policy if exists guestbook_public_read on public.message;
create policy guestbook_public_read on public.message for select to anon using (not hidden);
-- Restrictive policies also apply when a legacy permissive policy exists.
drop policy if exists guestbook_visible_only on public.message;
create policy guestbook_visible_only on public.message as restrictive for select to anon using (not hidden);
drop policy if exists guestbook_visible_insert on public.message;
create policy guestbook_visible_insert on public.message as restrictive for insert to anon with check (not hidden);
drop policy if exists guestbook_admin_access on public.message;
create policy guestbook_admin_access on public.message for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());
drop policy if exists guestbook_require_admin on public.message;
create policy guestbook_require_admin on public.message as restrictive for all to authenticated using (public.is_site_admin()) with check (public.is_site_admin());
grant usage on schema public to authenticated;
grant select (id, content, created_at, hidden), update (hidden), delete on public.message to authenticated;

create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  page_path text not null check (char_length(page_path) <= 200),
  referrer_host text not null default '' check (char_length(referrer_host) <= 200),
  device_type text not null check (device_type in ('mobile', 'tablet', 'desktop'))
);
create index if not exists page_views_created_idx on public.page_views (created_at desc, id desc);
create index if not exists page_views_session_time_idx on public.page_views (session_id, created_at desc);
alter table public.page_views enable row level security;
revoke all on public.page_views from public, anon, authenticated;
grant select (id, created_at, page_path, referrer_host, device_type) on public.page_views to authenticated;
grant all on public.page_views to service_role;
drop policy if exists page_views_admin_read on public.page_views;
create policy page_views_admin_read on public.page_views for select to authenticated using (public.is_site_admin());

create or replace function public.record_page_view(
  event_id uuid, session_id uuid, page_path text, referrer_host text, device_type text
) returns void language plpgsql security definer set search_path = ''
as $$
begin
  if event_id is null or session_id is null
    or page_path is null or page_path !~ '^/[^?#]*$' or char_length(page_path) > 200
    or referrer_host is null or referrer_host !~ '^[a-zA-Z0-9.-]*$' or char_length(referrer_host) > 200
    or device_type is null or device_type not in ('mobile', 'tablet', 'desktop') then
    raise exception 'Invalid visit' using errcode = '22023';
  end if;
  -- A session is an anonymous browser tab, not a person or an IP address.
  perform pg_advisory_xact_lock(hashtextextended(session_id::text, 0));
  if (select count(*) from public.page_views v
      where v.session_id = record_page_view.session_id and v.created_at > now() - interval '1 minute') >= 20 then
    return;
  end if;
  insert into public.page_views (event_id, session_id, page_path, referrer_host, device_type)
  values (record_page_view.event_id, record_page_view.session_id, record_page_view.page_path, record_page_view.referrer_host, record_page_view.device_type)
  on conflict on constraint page_views_event_id_key do nothing;
end;
$$;
revoke all on function public.record_page_view(uuid, uuid, text, text, text) from public, authenticated;
grant execute on function public.record_page_view(uuid, uuid, text, text, text) to anon;

create or replace function public.admin_visit_summary(days integer default 7)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  start_date date;
  today_date date := (now() at time zone 'Asia/Shanghai')::date;
  start_at timestamptz;
  result jsonb;
begin
  if not public.is_site_admin() then raise exception 'Forbidden' using errcode = '42501'; end if;
  if days is null or days not in (7, 30) then raise exception 'Invalid range' using errcode = '22023'; end if;
  start_date := today_date - (days - 1);
  start_at := start_date::timestamp at time zone 'Asia/Shanghai';
  select jsonb_build_object(
    'since', start_at,
    'views', count(*),
    'sessions', count(distinct v.session_id),
    'today', count(*) filter (where v.created_at >= today_date::timestamp at time zone 'Asia/Shanghai')
  ) into result from public.page_views v where v.created_at >= start_at;
  return result || jsonb_build_object(
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day::date, 'views', coalesce(c.views, 0)) order by d.day), '[]'::jsonb)
      from generate_series(start_date::timestamp, today_date::timestamp, interval '1 day') d(day)
      left join (
        select (v.created_at at time zone 'Asia/Shanghai')::date as day, count(*) as views
        from public.page_views v where v.created_at >= start_at group by 1
      ) c on c.day = d.day::date
    ),
    'sources', (
      select coalesce(jsonb_agg(jsonb_build_object('host', s.referrer_host, 'views', s.views) order by s.views desc, s.referrer_host), '[]'::jsonb)
      from (select v.referrer_host, count(*) as views from public.page_views v where v.created_at >= start_at group by 1 order by 2 desc, 1 limit 5) s
    )
  );
end;
$$;
revoke all on function public.admin_visit_summary(integer) from public, anon;
grant execute on function public.admin_visit_summary(integer) to authenticated;
commit;

-- After creating your login in Authentication > Users, enroll its exact UUID:
-- insert into public.site_admins (user_id) values ('YOUR_AUTH_USER_UUID') on conflict do nothing;
-- Do not use a user's editable profile metadata as an administrator role.
