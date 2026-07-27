-- 광고 대기실 현장 카드: 사진 묶음·쇼룸 승격의 기준 단위
create table if not exists public.ad_inbox_sites (
  id uuid primary key default gen_random_uuid(),
  short_name text not null,
  photo_date date null,
  status text not null default 'open'
    check (status in ('open', 'promoted', 'archived')),
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_inbox_sites_status_updated_idx
  on public.ad_inbox_sites (status, updated_at desc);

create index if not exists ad_inbox_sites_short_name_idx
  on public.ad_inbox_sites (lower(short_name));

comment on table public.ad_inbox_sites is
  '광고 대기실 현장 카드. 사진 입고·BA·쇼룸 승격의 기준 단위.';

alter table public.ad_inbox_sites enable row level security;

drop policy if exists ad_inbox_sites_authenticated_all on public.ad_inbox_sites;
create policy ad_inbox_sites_authenticated_all
  on public.ad_inbox_sites
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
