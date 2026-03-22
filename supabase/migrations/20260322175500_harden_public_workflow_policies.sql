drop policy if exists automation_jobs_public_insert on public.automation_jobs;
create policy automation_jobs_public_insert
  on public.automation_jobs
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists automation_jobs_public_update on public.automation_jobs;
create policy automation_jobs_public_update
  on public.automation_jobs
  for update
  to anon, authenticated
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists publish_jobs_public_insert on public.publish_jobs;
create policy publish_jobs_public_insert
  on public.publish_jobs
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists publish_jobs_public_update on public.publish_jobs;
create policy publish_jobs_public_update
  on public.publish_jobs
  for update
  to anon, authenticated
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists scenes_public_insert on public.scenes;
create policy scenes_public_insert
  on public.scenes
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists scenes_public_update on public.scenes;
create policy scenes_public_update
  on public.scenes
  for update
  to anon, authenticated
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists videos_public_insert on public.videos;
create policy videos_public_insert
  on public.videos
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists videos_public_update on public.videos;
create policy videos_public_update
  on public.videos
  for update
  to anon, authenticated
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists workflow_events_public_insert on public.workflow_events;
create policy workflow_events_public_insert
  on public.workflow_events
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists workflow_runs_public_insert on public.workflow_runs;
create policy workflow_runs_public_insert
  on public.workflow_runs
  for insert
  to anon, authenticated
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists workflow_runs_public_update on public.workflow_runs;
create policy workflow_runs_public_update
  on public.workflow_runs
  for update
  to anon, authenticated
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));
