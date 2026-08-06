-- edu outreach: authenticated 전체 허용 → @findgagu.com 내부 사용자만

create or replace function public.is_findgagu_internal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 2)) = 'findgagu.com';
$$;

revoke all on function public.is_findgagu_internal_user() from public;
grant execute on function public.is_findgagu_internal_user() to authenticated;

do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'edu_outreach_sources',
        'edu_outreach_signals',
        'edu_outreach_leads',
        'edu_outreach_drafts',
        'edu_outreach_approvals',
        'edu_outreach_send_logs',
        'edu_outreach_poll_runs'
      )
      and policyname like 'authenticated_all_edu_outreach_%'
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy "internal_all_edu_outreach_sources" on public.edu_outreach_sources
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_signals" on public.edu_outreach_signals
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_leads" on public.edu_outreach_leads
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_drafts" on public.edu_outreach_drafts
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_approvals" on public.edu_outreach_approvals
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_send_logs" on public.edu_outreach_send_logs
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());

create policy "internal_all_edu_outreach_poll_runs" on public.edu_outreach_poll_runs
  for all to authenticated
  using (public.is_findgagu_internal_user())
  with check (public.is_findgagu_internal_user());
