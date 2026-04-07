create extension if not exists pgcrypto;

create table if not exists public.showroom_shorts_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'requested', 'generating', 'generated', 'composited', 'ready_for_review', 'failed')),
  prompt_text text not null,
  before_asset_id text not null,
  after_asset_id text not null,
  before_asset_url text null,
  after_asset_url text null,
  before_after_group_key text null,
  source_video_url text null,
  final_video_url text null,
  requested_channels text[] not null default '{}'::text[],
  kling_job_id text null,
  kling_status text null,
  source_aspect_ratio text not null default '16:9',
  final_aspect_ratio text not null default '9:16',
  duration_seconds integer not null default 10,
  is_muted boolean not null default true,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists showroom_shorts_jobs_status_idx
  on public.showroom_shorts_jobs (status, created_at desc);

create table if not exists public.showroom_shorts_targets (
  id uuid primary key default gen_random_uuid(),
  shorts_job_id uuid not null references public.showroom_shorts_jobs(id) on delete cascade,
  channel text not null check (channel in ('youtube', 'facebook', 'instagram')),
  title text not null,
  description text not null default '',
  hashtags text[] not null default '{}'::text[],
  first_comment text not null default '',
  publish_status text not null default 'draft' check (publish_status in ('draft', 'ready', 'approved', 'publishing', 'published', 'failed')),
  external_post_id text null,
  approved_at timestamptz null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists showroom_shorts_targets_job_idx
  on public.showroom_shorts_targets (shorts_job_id, channel);

create table if not exists public.showroom_shorts_logs (
  id uuid primary key default gen_random_uuid(),
  shorts_job_id uuid not null references public.showroom_shorts_jobs(id) on delete cascade,
  target_id uuid null references public.showroom_shorts_targets(id) on delete cascade,
  stage text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.showroom_shorts_jobs enable row level security;
alter table public.showroom_shorts_targets enable row level security;
alter table public.showroom_shorts_logs enable row level security;

create policy if not exists "authenticated users can manage showroom shorts jobs"
  on public.showroom_shorts_jobs
  for all
  to authenticated
  using (true)
  with check (true);

create policy if not exists "authenticated users can manage showroom shorts targets"
  on public.showroom_shorts_targets
  for all
  to authenticated
  using (true)
  with check (true);

create policy if not exists "authenticated users can manage showroom shorts logs"
  on public.showroom_shorts_logs
  for all
  to authenticated
  using (true)
  with check (true);
