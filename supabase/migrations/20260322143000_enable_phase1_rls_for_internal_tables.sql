alter table public._prisma_migrations enable row level security;

alter table public.leads enable row level security;
drop policy if exists leads_authenticated_all on public.leads;
create policy leads_authenticated_all
  on public.leads
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.marketing_contents enable row level security;
drop policy if exists marketing_contents_authenticated_all on public.marketing_contents;
create policy marketing_contents_authenticated_all
  on public.marketing_contents
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.construction_images enable row level security;
drop policy if exists construction_images_authenticated_all on public.construction_images;
create policy construction_images_authenticated_all
  on public.construction_images
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.project_images enable row level security;
drop policy if exists project_images_authenticated_all on public.project_images;
drop policy if exists project_images_public_approved_read on public.project_images;
create policy project_images_authenticated_all
  on public.project_images
  for all
  to authenticated
  using (true)
  with check (true);
create policy project_images_public_approved_read
  on public.project_images
  for select
  to anon
  using (status = 'approved');

alter table public.estimates enable row level security;
drop policy if exists estimates_authenticated_all on public.estimates;
drop policy if exists estimates_public_visible_read on public.estimates;
create policy estimates_authenticated_all
  on public.estimates
  for all
  to authenticated
  using (true)
  with check (true);
create policy estimates_public_visible_read
  on public.estimates
  for select
  to anon
  using (is_visible = true and approved_at is not null);

alter table public.consultation_messages enable row level security;
drop policy if exists consultation_messages_authenticated_all on public.consultation_messages;
create policy consultation_messages_authenticated_all
  on public.consultation_messages
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.consultations enable row level security;
drop policy if exists consultations_authenticated_all on public.consultations;
drop policy if exists consultations_public_insert on public.consultations;
create policy consultations_authenticated_all
  on public.consultations
  for all
  to authenticated
  using (true)
  with check (true);
create policy consultations_public_insert
  on public.consultations
  for insert
  to anon
  with check (true);

alter table public.consultation_estimate_files enable row level security;
drop policy if exists consultation_estimate_files_authenticated_all on public.consultation_estimate_files;
create policy consultation_estimate_files_authenticated_all
  on public.consultation_estimate_files
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.color_chips enable row level security;
drop policy if exists color_chips_authenticated_all on public.color_chips;
create policy color_chips_authenticated_all
  on public.color_chips
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.order_assets enable row level security;
drop policy if exists order_assets_authenticated_all on public.order_assets;
create policy order_assets_authenticated_all
  on public.order_assets
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.order_documents enable row level security;
drop policy if exists order_documents_authenticated_all on public.order_documents;
create policy order_documents_authenticated_all
  on public.order_documents
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.products enable row level security;
drop policy if exists products_authenticated_all on public.products;
create policy products_authenticated_all
  on public.products
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.showroom_site_overrides enable row level security;
drop policy if exists showroom_site_overrides_authenticated_all on public.showroom_site_overrides;
create policy showroom_site_overrides_authenticated_all
  on public.showroom_site_overrides
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.tag_mappings enable row level security;
drop policy if exists tag_mappings_authenticated_all on public.tag_mappings;
create policy tag_mappings_authenticated_all
  on public.tag_mappings
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.vendor_price_book enable row level security;
drop policy if exists vendor_price_book_authenticated_all on public.vendor_price_book;
create policy vendor_price_book_authenticated_all
  on public.vendor_price_book
  for all
  to authenticated
  using (true)
  with check (true);
