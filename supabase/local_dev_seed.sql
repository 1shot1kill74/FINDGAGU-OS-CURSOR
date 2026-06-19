-- Local development seed (Cursor Cloud / self-contained local Supabase ONLY).
--
-- Why this exists:
--   The files in supabase/migrations/ are INCREMENTAL migrations that assume a
--   pre-existing base schema (tables such as leads, products, image_assets,
--   construction_images, project_images, automation_jobs, etc. are never created
--   by any migration). They therefore CANNOT bootstrap a fresh local database via
--   `supabase db reset` / `supabase start`. The real dev workflow points the app
--   at the hosted Supabase project instead.
--
--   This file creates a minimal subset of the schema (just enough for the public
--   lead-intake "/contact" flow) so the app can be exercised end-to-end on a
--   fully local Supabase stack without any production credentials.
--
-- Apply with:
--   docker exec -i supabase_db_workspace psql -U postgres -d postgres -f /tmp/seed.sql
--   (after `docker cp supabase/local_dev_seed.sql supabase_db_workspace:/tmp/seed.sql`)

do $$ begin
  create type public.consultation_status as enum ('접수','견적','진행','완료','거절','무효','AS');
exception when duplicate_object then null; end $$;

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  manager_name text not null,
  contact text not null,
  status public.consultation_status,
  metadata jsonb,
  is_visible boolean not null default true,
  is_test boolean not null default false,
  expected_revenue bigint default 0,
  channel_chat_id text,
  last_viewed_at timestamptz,
  created_at timestamptz default now()
);

alter table public.consultations enable row level security;

drop policy if exists consultations_authenticated_all on public.consultations;
create policy consultations_authenticated_all
  on public.consultations for all to authenticated using (true) with check (true);

drop policy if exists consultations_public_insert on public.consultations;
create policy consultations_public_insert
  on public.consultations for insert to anon with check (true);

grant select, insert, update, delete on public.consultations to anon, authenticated;
