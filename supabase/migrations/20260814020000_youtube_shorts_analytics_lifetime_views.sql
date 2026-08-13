-- Lifetime views alongside the rolling ~90d Analytics window

alter table public.youtube_shorts_analytics
  add column if not exists lifetime_views bigint not null default 0;

comment on column public.youtube_shorts_analytics.lifetime_views is
  'Upload-to-now views (Analytics lifetime window, fallback YouTube statistics.viewCount). views column remains the rolling ~90d window.';

create index if not exists youtube_shorts_analytics_lifetime_views_idx
  on public.youtube_shorts_analytics (lifetime_views desc);
