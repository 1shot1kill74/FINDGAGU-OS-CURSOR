create table if not exists public.content_automation_jobs (
  id text primary key,
  content_item_id text not null,
  distribution_id text null,
  job_type text not null check (job_type = any (array[
    'blog_publish'::text,
    'video_publish'::text,
    'social_publish'::text,
    'distribution_sync'::text
  ])),
  channel text not null check (channel = any (array[
    'google_blog'::text,
    'naver_blog'::text,
    'youtube_shorts'::text,
    'youtube_long'::text,
    'instagram'::text,
    'facebook'::text,
    'tiktok'::text
  ])),
  status text not null default 'queued' check (status = any (array[
    'queued'::text,
    'processing'::text,
    'completed'::text,
    'failed'::text,
    'cancelled'::text
  ])),
  payload jsonb not null default '{}'::jsonb,
  error_message text null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_automation_jobs_content_item_id_idx
  on public.content_automation_jobs (content_item_id);

create index if not exists content_automation_jobs_distribution_id_idx
  on public.content_automation_jobs (distribution_id);

create index if not exists content_automation_jobs_status_idx
  on public.content_automation_jobs (status, updated_at desc);

alter table public.content_automation_jobs enable row level security;

drop policy if exists content_automation_jobs_authenticated_all on public.content_automation_jobs;
create policy content_automation_jobs_authenticated_all
  on public.content_automation_jobs
  for all
  to authenticated
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

comment on table public.content_automation_jobs is
  '콘텐츠 자동화 큐 작업 이력. 현재 내부 콘텐츠 워크스페이스가 사용하는 job 상태를 저장한다.';
