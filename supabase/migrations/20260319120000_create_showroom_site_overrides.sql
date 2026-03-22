create table if not exists public.showroom_site_overrides (
  id uuid primary key default gen_random_uuid(),
  site_name text not null,
  industry_label text not null,
  manual_priority integer null,
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint showroom_site_overrides_site_industry_key unique (site_name, industry_label),
  constraint showroom_site_overrides_manual_priority_check check (manual_priority is null or manual_priority > 0)
);

create index if not exists idx_showroom_site_overrides_industry
  on public.showroom_site_overrides (industry_label);

create index if not exists idx_showroom_site_overrides_manual_priority
  on public.showroom_site_overrides (manual_priority);

comment on table public.showroom_site_overrides is '쇼룸 업종별 현장 카드의 수동 노출 순서를 저장하는 override 테이블';
comment on column public.showroom_site_overrides.site_name is '쇼룸 현장 카드의 기준이 되는 현장명';
comment on column public.showroom_site_overrides.industry_label is '관리형, 학원 등 쇼룸 섹션에 표시되는 업종 라벨';
comment on column public.showroom_site_overrides.manual_priority is '숫자가 낮을수록 앞에 노출되는 수동 우선순위';
