do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'showroom shorts videos authenticated insert'
  ) then
    create policy "showroom shorts videos authenticated insert"
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'showroom-shorts-videos');
  end if;
end $$;
