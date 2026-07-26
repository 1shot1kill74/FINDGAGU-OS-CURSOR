-- Public shorts landing: video Before (1) + site After photos
drop function if exists public.get_public_showroom_shorts_landing(uuid);

create function public.get_public_showroom_shorts_landing(p_job_id uuid)
returns table (
  job_id uuid,
  short_name text,
  display_name text,
  before_asset_url text,
  after_asset_url text,
  final_video_url text,
  gallery jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_job public.showroom_shorts_jobs%rowtype;
  v_short text;
  v_display text;
  v_site_id text;
  v_group_id text;
  v_site_name text;
  v_before_id uuid;
  v_after_id uuid;
begin
  select * into v_job
  from public.showroom_shorts_jobs j
  where j.id = p_job_id
    and j.before_asset_url is not null
    and j.after_asset_url is not null
  limit 1;

  if not found then
    return;
  end if;

  begin
    v_before_id := v_job.before_asset_id::uuid;
  exception when others then
    v_before_id := null;
  end;
  begin
    v_after_id := v_job.after_asset_id::uuid;
  exception when others then
    v_after_id := null;
  end;

  v_short := coalesce(
    nullif(substring(v_job.before_after_group_key from 'before-after:ad:\d{4}-\d{2}-\d{2}:(.+)$'), ''),
    nullif(v_job.before_after_group_key, ''),
    '시공 사례'
  );
  v_display := coalesce(
    nullif(regexp_replace(v_short, '^\d+(?:\s*[-_.]?\s*)+', ''), ''),
    '시공 사례'
  );

  select
    nullif(ia.metadata->>'ad_inbox_site_id', ''),
    nullif(ia.metadata->>'before_after_group_id', ''),
    nullif(ia.site_name, '')
  into v_site_id, v_group_id, v_site_name
  from public.image_assets ia
  where (v_after_id is not null and ia.id = v_after_id)
     or (v_before_id is not null and ia.id = v_before_id)
  order by case when v_after_id is not null and ia.id = v_after_id then 0 else 1 end
  limit 1;

  return query
  select
    v_job.id,
    v_short,
    v_display,
    v_job.before_asset_url,
    v_job.after_asset_url,
    v_job.final_video_url,
    coalesce((
      select jsonb_agg(
        jsonb_build_object('id', g.id, 'url', g.url, 'role', g.role)
        order by g.sort_rank, g.created_at desc
      )
      from (
        (
          select
            coalesce(v_before_id, gen_random_uuid()) as id,
            v_job.before_asset_url as url,
            'before'::text as role,
            coalesce((
              select ia.created_at from public.image_assets ia where v_before_id is not null and ia.id = v_before_id limit 1
            ), now()) as created_at,
            0 as sort_rank
          where v_job.before_asset_url is not null
        )
        union all
        (
          select distinct on (coalesce(nullif(ia.cloudinary_url, ''), ia.id::text))
            ia.id,
            coalesce(nullif(ia.cloudinary_url, ''), nullif(ia.thumbnail_url, '')) as url,
            'after'::text as role,
            ia.created_at,
            case
              when v_after_id is not null and ia.id = v_after_id then 1
              else 2
            end as sort_rank
          from public.image_assets ia
          where ia.category = 'ad_inbox'
            and coalesce(ia.metadata->>'before_after_role', '') = 'after'
            and coalesce(nullif(ia.cloudinary_url, ''), nullif(ia.thumbnail_url, '')) is not null
            and (
              (v_site_id is not null and ia.metadata->>'ad_inbox_site_id' = v_site_id)
              or (v_group_id is not null and ia.metadata->>'before_after_group_id' = v_group_id)
              or (v_site_name is not null and ia.site_name = v_site_name)
            )
            and not exists (
              select 1
              from public.image_assets edited
              where edited.category = 'ad_inbox'
                and edited.metadata->>'edited_from' = ia.id::text
                and edited.metadata->>'cleanup' = 'people_removed'
            )
          order by
            coalesce(nullif(ia.cloudinary_url, ''), ia.id::text),
            case when ia.metadata->>'cleanup' = 'people_removed' then 0 else 1 end,
            ia.created_at desc
          limit 12
        )
      ) g
    ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_public_showroom_shorts_landing(uuid) from public;
grant execute on function public.get_public_showroom_shorts_landing(uuid) to anon, authenticated;
