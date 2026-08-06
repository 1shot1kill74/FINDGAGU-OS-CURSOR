-- Cache YouTube Shorts upload/publish time on analytics rows

alter table public.youtube_shorts_analytics
  add column if not exists published_at timestamptz null;

create index if not exists youtube_shorts_analytics_published_at_idx
  on public.youtube_shorts_analytics (published_at desc nulls last);

comment on column public.youtube_shorts_analytics.published_at is
  'YouTube video upload/publish time (from targets or videos.list snippet.publishedAt).';
