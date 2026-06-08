-- 경쟁사 채널·키워드 모니터링 (완내스 등)

create extension if not exists pgcrypto;

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  website_url text,
  notes text,
  profile jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.competitor_channels (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  channel_type text not null check (channel_type in ('youtube', 'instagram', 'blog', 'website')),
  label text not null,
  external_id text,
  external_url text,
  rss_url text,
  poll_enabled boolean not null default true,
  last_polled_at timestamptz,
  last_poll_status text,
  last_poll_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (competitor_id, channel_type, label)
);

create table if not exists public.competitor_keywords (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.competitors(id) on delete cascade,
  keyword text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (competitor_id, keyword)
);

create unique index if not exists competitor_keywords_global_keyword_idx
  on public.competitor_keywords (keyword)
  where competitor_id is null;

create table if not exists public.competitor_content_items (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors(id) on delete cascade,
  channel_id uuid references public.competitor_channels(id) on delete set null,
  channel_type text not null,
  external_id text not null,
  title text,
  description text,
  url text,
  published_at timestamptz,
  thumbnail_url text,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (competitor_id, channel_type, external_id)
);

create index if not exists competitor_content_items_competitor_published_idx
  on public.competitor_content_items (competitor_id, published_at desc nulls last);

create table if not exists public.competitor_keyword_hits (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.competitor_content_items(id) on delete cascade,
  keyword_id uuid not null references public.competitor_keywords(id) on delete cascade,
  matched_field text not null default 'title',
  matched_snippet text,
  detected_at timestamptz not null default now(),
  unique (content_item_id, keyword_id, matched_field)
);

create table if not exists public.competitor_poll_runs (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.competitors(id) on delete set null,
  status text not null default 'running',
  channels_polled int not null default 0,
  items_new int not null default 0,
  items_updated int not null default 0,
  keyword_hits_new int not null default 0,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists competitor_poll_runs_started_idx
  on public.competitor_poll_runs (started_at desc);

alter table public.competitors enable row level security;
alter table public.competitor_channels enable row level security;
alter table public.competitor_keywords enable row level security;
alter table public.competitor_content_items enable row level security;
alter table public.competitor_keyword_hits enable row level security;
alter table public.competitor_poll_runs enable row level security;

-- policies (재실행 안전)
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitors') then
    create policy "authenticated_all_competitors" on public.competitors for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitor_channels') then
    create policy "authenticated_all_competitor_channels" on public.competitor_channels for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitor_keywords') then
    create policy "authenticated_all_competitor_keywords" on public.competitor_keywords for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitor_content_items') then
    create policy "authenticated_all_competitor_content_items" on public.competitor_content_items for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitor_keyword_hits') then
    create policy "authenticated_all_competitor_keyword_hits" on public.competitor_keyword_hits for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'authenticated_all_competitor_poll_runs') then
    create policy "authenticated_all_competitor_poll_runs" on public.competitor_poll_runs for all to authenticated using (true) with check (true);
  end if;
end $$;

-- 시드: 완내스가구
insert into public.competitors (slug, name, website_url, notes, profile)
values (
  'wannaeus',
  '완내스가구',
  'https://mindfurniture.co.kr/',
  '자체 공장·러셀형·네이버 SEO·유튜브 PD 채용 중',
  jsonb_build_object(
    'threats', jsonb_build_array('공장 원가', '스마트스토어 저가', '블로그 SEO', '유튜브 PD'),
    'sales_kit_doc', 'docs/COMPETITOR_WANNAEUS_SALES_KIT.md'
  )
)
on conflict (slug) do nothing;

insert into public.competitor_channels (competitor_id, channel_type, label, external_id, external_url, rss_url, metadata)
select c.id, v.channel_type, v.label, v.external_id, v.external_url, v.rss_url, v.metadata::jsonb
from public.competitors c
cross join (
  values
    ('youtube', '완내스가구 (@jooneeyayo33)', 'jooneeyayo33', 'https://www.youtube.com/@jooneeyayo33', null, '{"expected_channel_title":"완내스가구","search_query":"완내스가구"}'),
    ('instagram', '인스타 @furnijuni', 'furnijuni', 'https://www.instagram.com/furnijuni/', 'https://rsshub.app/instagram/user/furnijuni', '{"monitor_mode":"apify","results_limit":15,"apify_actor":"apify~instagram-scraper"}'),
    ('blog', '네이버 블로그', 'gagukingman', 'https://blog.naver.com/gagukingman', 'https://rss.blog.naver.com/gagukingman.xml', '{}'),
    ('website', '자사몰', null, 'https://mindfurniture.co.kr/', null, '{}')
) as v(channel_type, label, external_id, external_url, rss_url, metadata)
where c.slug = 'wannaeus'
on conflict (competitor_id, channel_type, label) do nothing;

insert into public.competitor_keywords (competitor_id, keyword)
select c.id, k.keyword
from public.competitors c
cross join (
  values
    ('러셀책상'),
    ('러셀형'),
    ('관리형 스터디카페'),
    ('관리형독서실'),
    ('스터디카페 책상'),
    ('독서실 책상'),
    ('오픈형 책상'),
    ('1인실 책상'),
    ('완내스'),
    ('mindfurniture'),
    ('퍼니주니'),
    ('furnijuni'),
    ('스마트스토어'),
    ('유튜브 PD')
) as k(keyword)
where c.slug = 'wannaeus'
on conflict (competitor_id, keyword) do nothing;

-- 업종 공통 키워드 (경쟁사 null)
insert into public.competitor_keywords (competitor_id, keyword)
select null, k.keyword
from (
  values
    ('올데이'),
    ('프라이버시'),
    ('관리형 학원'),
    ('스터디카페 인테리어'),
    ('창업'),
    ('명지프라자')
) as k(keyword)
where not exists (
  select 1
  from public.competitor_keywords ck
  where ck.competitor_id is null and ck.keyword = k.keyword
);
