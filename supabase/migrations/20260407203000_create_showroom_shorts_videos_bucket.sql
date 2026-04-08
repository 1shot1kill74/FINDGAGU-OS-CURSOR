insert into storage.buckets (id, name, public)
values ('showroom-shorts-videos', 'showroom-shorts-videos', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'showroom shorts videos public read'
  ) then
    create policy "showroom shorts videos public read"
      on storage.objects for select
      to public
      using (bucket_id = 'showroom-shorts-videos');
  end if;
end $$;
