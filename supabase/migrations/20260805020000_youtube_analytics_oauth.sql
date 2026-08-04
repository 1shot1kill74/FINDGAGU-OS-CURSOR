-- YouTube Analytics OAuth + Shorts metrics snapshot (FINDGAGU channel)

create table if not exists public.youtube_analytics_oauth (
  id text primary key default 'findgagu',
  channel_id text not null,
  channel_title text null,
  refresh_token_enc text not null,
  access_token_enc text null,
  access_token_expires_at timestamptz null,
  connected_by uuid null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'connected'
    check (status in ('connected', 'needs_reconnect')),
  last_sync_at timestamptz null,
  last_sync_error text null
);

comment on table public.youtube_analytics_oauth is
  'FINDGAGU YouTube Analytics OAuth tokens (encrypted). Service role only.';

create table if not exists public.youtube_shorts_analytics (
  video_id text primary key,
  title text null,
  views bigint not null default 0,
  engaged_views bigint not null default 0,
  avg_view_percentage numeric null,
  avg_view_duration_sec numeric null,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  period_start date not null,
  period_end date not null,
  synced_at timestamptz not null default now()
);

create index if not exists youtube_shorts_analytics_synced_idx
  on public.youtube_shorts_analytics (synced_at desc);

comment on table public.youtube_shorts_analytics is
  'Cached YouTube Analytics metrics per Shorts video_id. engaged_views/views ≈ swipe proxy.';

alter table public.youtube_analytics_oauth enable row level security;
alter table public.youtube_shorts_analytics enable row level security;

drop policy if exists "internal_read_youtube_shorts_analytics" on public.youtube_shorts_analytics;
drop policy if exists "authenticated_read_youtube_shorts_analytics" on public.youtube_shorts_analytics;

create policy "internal_read_youtube_shorts_analytics"
  on public.youtube_shorts_analytics
  for select to authenticated
  using (public.is_findgagu_internal_user());

grant select on public.youtube_shorts_analytics to authenticated;
revoke all on public.youtube_analytics_oauth from authenticated, anon;
grant all on public.youtube_analytics_oauth to service_role;
grant all on public.youtube_shorts_analytics to service_role;
