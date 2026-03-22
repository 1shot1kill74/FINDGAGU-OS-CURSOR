alter table public.showroom_site_overrides
  add column if not exists section_key text not null default 'industry';

update public.showroom_site_overrides
set section_key = 'industry'
where section_key is null or btrim(section_key) = '';

alter table public.showroom_site_overrides
  drop constraint if exists showroom_site_overrides_site_industry_key;

alter table public.showroom_site_overrides
  add constraint showroom_site_overrides_site_industry_section_key
  unique (site_name, industry_label, section_key);

alter table public.showroom_site_overrides
  drop constraint if exists showroom_site_overrides_section_key_check;

alter table public.showroom_site_overrides
  add constraint showroom_site_overrides_section_key_check
  check (section_key in ('industry', 'before_after'));

create index if not exists idx_showroom_site_overrides_section_key
  on public.showroom_site_overrides (section_key);

comment on column public.showroom_site_overrides.section_key is '우선순위가 적용되는 쇼룸 섹션 구분값: industry 또는 before_after';
