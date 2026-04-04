create table if not exists public.showroom_case_profiles (
  id uuid primary key default gen_random_uuid(),
  site_name text not null unique,
  canonical_site_name text,
  industry text,
  seat_count_band text,
  seat_count_note text,
  area_pyeong_band text,
  budget_band text,
  pain_point text,
  solution_point text,
  operator_review text,
  owner_quote text,
  recommended_for text,
  channel_followup_summary text,
  channel_followup_cta text,
  is_featured boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.showroom_case_profiles is
'쇼룸형 홈페이지, 공개 쇼룸, 채널톡 후속 정보가 함께 참조하는 사례 메타데이터.';

comment on column public.showroom_case_profiles.seat_count_band is '예: 40석 내외, 60~80석';
comment on column public.showroom_case_profiles.area_pyeong_band is '예: 25~35평';
comment on column public.showroom_case_profiles.budget_band is '예: 3000~5000만원';
comment on column public.showroom_case_profiles.channel_followup_summary is '채널톡 후속 안내에 바로 쓸 수 있는 1차 요약.';

alter table public.showroom_case_profiles enable row level security;

drop policy if exists showroom_case_profiles_read_all on public.showroom_case_profiles;
create policy showroom_case_profiles_read_all
  on public.showroom_case_profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists showroom_case_profiles_write_authenticated on public.showroom_case_profiles;
create policy showroom_case_profiles_write_authenticated
  on public.showroom_case_profiles
  for all
  to authenticated
  using (true)
  with check (true);

create table if not exists public.showroom_engagement_events (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  event_name text not null,
  source_surface text not null default 'homepage',
  site_name text,
  industry text,
  before_after boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.showroom_engagement_events is
'쇼룸형 홈페이지와 공개 쇼룸의 최소 행동 이벤트 로그.';

create index if not exists idx_showroom_engagement_events_session_key
  on public.showroom_engagement_events (session_key);

create index if not exists idx_showroom_engagement_events_event_name
  on public.showroom_engagement_events (event_name);

create index if not exists idx_showroom_engagement_events_site_name
  on public.showroom_engagement_events (site_name);

alter table public.showroom_engagement_events enable row level security;

drop policy if exists showroom_engagement_events_insert_all on public.showroom_engagement_events;
create policy showroom_engagement_events_insert_all
  on public.showroom_engagement_events
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists showroom_engagement_events_read_authenticated on public.showroom_engagement_events;
create policy showroom_engagement_events_read_authenticated
  on public.showroom_engagement_events
  for select
  to authenticated
  using (true);

alter table public.channel_talk_leads
  add column if not exists homepage_context_source text,
  add column if not exists homepage_interest_sites text[] not null default '{}'::text[],
  add column if not exists homepage_followup_summary text,
  add column if not exists homepage_seen_at timestamptz,
  add column if not exists followup_message_sent_at timestamptz,
  add column if not exists followup_message_error text;

comment on column public.channel_talk_leads.homepage_context_source is
'홈페이지/공개 쇼룸 등 어떤 공개 표면에서 고객 맥락이 넘어왔는지 기록.';

comment on column public.channel_talk_leads.homepage_interest_sites is
'홈페이지에서 관심 있게 본 사례명 목록.';

comment on column public.channel_talk_leads.homepage_followup_summary is
'관심 사례를 바탕으로 만든 채널톡 후속 설명 요약.';
