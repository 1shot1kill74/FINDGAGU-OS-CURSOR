with showroom_groups as (
  select
    cs.content_item_id,
    cs.showroom_group_key,
    ci.site_name
  from public.content_sources cs
  join public.content_items ci on ci.id = cs.content_item_id
  where cs.source_kind = 'showroom_group'
),
matched_assets as (
  select distinct
    sg.content_item_id,
    ia.id as image_asset_id,
    sg.showroom_group_key,
    ia.is_main,
    ia.site_name,
    ia.business_type,
    ia.product_name,
    ia.color_name,
    ia.created_at,
    ia.metadata ->> 'space_id' as space_id
  from showroom_groups sg
  join public.image_assets ia
    on (
      (ia.metadata ->> 'space_id') = sg.showroom_group_key
      or ia.site_name = sg.site_name
      or (ia.metadata ->> 'canonical_site_name') = sg.site_name
    )
),
rows_to_insert as (
  select
    ma.content_item_id,
    ma.image_asset_id,
    false as is_primary,
    jsonb_build_object(
      'siteName', ma.site_name,
      'businessType', ma.business_type,
      'productName', ma.product_name,
      'colorName', ma.color_name,
      'spaceId', ma.space_id,
      'createdAt', ma.created_at
    ) as snapshot
  from matched_assets ma
  where not exists (
    select 1
    from public.content_sources existing
    where existing.content_item_id = ma.content_item_id
      and existing.source_kind = 'image_asset'
      and existing.image_asset_id = ma.image_asset_id
  )
)
insert into public.content_sources (
  content_item_id,
  source_kind,
  image_asset_id,
  is_primary,
  snapshot
)
select
  content_item_id,
  'image_asset',
  image_asset_id,
  is_primary,
  snapshot
from rows_to_insert;
