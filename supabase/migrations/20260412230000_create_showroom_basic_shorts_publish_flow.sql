create table if not exists public.showroom_basic_shorts_targets (
  id uuid primary key default gen_random_uuid(),
  basic_shorts_draft_id uuid not null references public.showroom_basic_shorts_drafts(id) on delete cascade,
  channel text not null check (channel in ('youtube', 'facebook', 'instagram')),
  title text not null,
  description text not null default '',
  hashtags text[] not null default '{}'::text[],
  first_comment text not null default '',
  publish_status text not null default 'draft' check (
    publish_status in (
      'draft',
      'ready',
      'preparing',
      'launch_ready',
      'approved',
      'publishing',
      'published',
      'failed'
    )
  ),
  external_post_id text null,
  external_post_url text null,
  preparation_payload jsonb not null default '{}'::jsonb,
  preparation_error text null,
  approved_at timestamptz null,
  prepared_at timestamptz null,
  launch_ready_at timestamptz null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists showroom_basic_shorts_targets_draft_channel_idx
  on public.showroom_basic_shorts_targets (basic_shorts_draft_id, channel);

create index if not exists showroom_basic_shorts_targets_status_idx
  on public.showroom_basic_shorts_targets (publish_status, updated_at desc);

create table if not exists public.showroom_basic_shorts_logs (
  id uuid primary key default gen_random_uuid(),
  basic_shorts_draft_id uuid not null references public.showroom_basic_shorts_drafts(id) on delete cascade,
  target_id uuid null references public.showroom_basic_shorts_targets(id) on delete cascade,
  stage text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists showroom_basic_shorts_logs_draft_idx
  on public.showroom_basic_shorts_logs (basic_shorts_draft_id, created_at desc);

alter table public.showroom_basic_shorts_targets enable row level security;
alter table public.showroom_basic_shorts_logs enable row level security;

drop policy if exists showroom_basic_shorts_targets_authenticated_all on public.showroom_basic_shorts_targets;
create policy showroom_basic_shorts_targets_authenticated_all
  on public.showroom_basic_shorts_targets
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists showroom_basic_shorts_logs_authenticated_all on public.showroom_basic_shorts_logs;
create policy showroom_basic_shorts_logs_authenticated_all
  on public.showroom_basic_shorts_logs
  for all
  to authenticated
  using (true)
  with check (true);
