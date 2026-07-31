-- 광고대기실 발행예정: 채널 타깃별 예약 시각
alter table public.showroom_shorts_targets
  add column if not exists scheduled_at timestamptz null;

alter table public.showroom_shorts_targets
  drop constraint if exists showroom_shorts_targets_publish_status_check;

alter table public.showroom_shorts_targets
  add constraint showroom_shorts_targets_publish_status_check
  check (
    publish_status in (
      'draft',
      'ready',
      'preparing',
      'launch_ready',
      'approved',
      'scheduled',
      'publishing',
      'published',
      'failed'
    )
  );

create index if not exists showroom_shorts_targets_scheduled_due_idx
  on public.showroom_shorts_targets (scheduled_at)
  where publish_status = 'scheduled' and scheduled_at is not null;
