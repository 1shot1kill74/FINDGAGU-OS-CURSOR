create table if not exists public.showroom_cta_visits (
  id uuid primary key default gen_random_uuid(),
  visitor_key text not null,
  session_id text not null,
  source text,
  channel text not null,
  cta text not null,
  content_job_id text,
  target_id text,
  landing_path text not null default '/public/showroom',
  landing_query text,
  referrer_host text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.showroom_cta_visits is
'SNS CTA를 타고 공개 쇼룸으로 들어온 방문 로그. 1차 채널/CTA 진단과 2차 콘텐츠(jobId) 진단에 사용.';

comment on column public.showroom_cta_visits.visitor_key is
'브라우저 로컬 스토리지 기반 익명 방문자 식별자. 고유 방문자/재방문자 계산의 기준.';

comment on column public.showroom_cta_visits.session_id is
'동일 브라우저 내 세션 식별자. 향후 세션 기준 진단 확장 대비.';

comment on column public.showroom_cta_visits.content_job_id is
'콘텐츠 단위 진단용 jobId. 동일 CTA라도 어떤 콘텐츠가 반응을 만들었는지 2차 진단 가능.';

create index if not exists idx_showroom_cta_visits_created_at
  on public.showroom_cta_visits (created_at desc);

create index if not exists idx_showroom_cta_visits_channel_cta_created_at
  on public.showroom_cta_visits (channel, cta, created_at desc);

create index if not exists idx_showroom_cta_visits_content_job_id_created_at
  on public.showroom_cta_visits (content_job_id, created_at desc);

create index if not exists idx_showroom_cta_visits_visitor_key_created_at
  on public.showroom_cta_visits (visitor_key, created_at desc);

alter table public.showroom_cta_visits enable row level security;

drop policy if exists showroom_cta_visits_insert_all on public.showroom_cta_visits;
create policy showroom_cta_visits_insert_all
  on public.showroom_cta_visits
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists showroom_cta_visits_read_authenticated on public.showroom_cta_visits;
create policy showroom_cta_visits_read_authenticated
  on public.showroom_cta_visits
  for select
  to authenticated
  using (true);
