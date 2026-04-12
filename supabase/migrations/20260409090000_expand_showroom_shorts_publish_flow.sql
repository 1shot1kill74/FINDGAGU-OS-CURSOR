alter table public.showroom_shorts_targets
  add column if not exists external_post_url text null,
  add column if not exists preparation_payload jsonb not null default '{}'::jsonb,
  add column if not exists preparation_error text null,
  add column if not exists prepared_at timestamptz null,
  add column if not exists launch_ready_at timestamptz null;

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
      'publishing',
      'published',
      'failed'
    )
  );
