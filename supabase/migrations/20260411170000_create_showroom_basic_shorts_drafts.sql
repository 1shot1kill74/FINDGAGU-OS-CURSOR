create table if not exists public.showroom_basic_shorts_drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  display_name text not null,
  industry text,
  product_summary text,
  color_summary text,
  duration_seconds integer not null default 10,
  selected_image_ids text[] not null default '{}'::text[],
  image_order text[] not null default '{}'::text[],
  script jsonb not null default '{}'::jsonb,
  package_text text not null default '',
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.showroom_basic_shorts_drafts is
'내부 쇼룸에서 만드는 기본 쇼츠 초안 저장용 테이블. 사진 순서, 스크립트, 길이를 원격 저장한다.';

create index if not exists showroom_basic_shorts_drafts_display_name_idx
  on public.showroom_basic_shorts_drafts (display_name, updated_at desc);

create index if not exists showroom_basic_shorts_drafts_created_by_idx
  on public.showroom_basic_shorts_drafts (created_by, updated_at desc);

alter table public.showroom_basic_shorts_drafts enable row level security;

drop policy if exists showroom_basic_shorts_drafts_authenticated_all on public.showroom_basic_shorts_drafts;
create policy showroom_basic_shorts_drafts_authenticated_all
  on public.showroom_basic_shorts_drafts
  for all
  to authenticated
  using (true)
  with check (true);
