alter table public.showroom_shorts_jobs
  drop constraint if exists showroom_shorts_jobs_status_check;

alter table public.showroom_shorts_jobs
  add constraint showroom_shorts_jobs_status_check
  check (
    status in (
      'draft',
      'requested',
      'generating',
      'generated',
      'composition_queued',
      'composition_processing',
      'composited',
      'ready_for_review',
      'failed'
    )
  );
