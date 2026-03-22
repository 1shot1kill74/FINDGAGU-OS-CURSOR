alter table public.image_assets enable row level security;

drop policy if exists image_assets_authenticated_all on public.image_assets;
create policy image_assets_authenticated_all
  on public.image_assets
  for all
  to authenticated
  using (true)
  with check (true);
