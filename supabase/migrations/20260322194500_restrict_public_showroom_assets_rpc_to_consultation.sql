create or replace function public.get_public_showroom_assets()
returns table (
  id uuid,
  cloudinary_url text,
  thumbnail_url text,
  site_name text,
  location text,
  business_type text,
  color_name text,
  product_name text,
  is_main boolean,
  created_at timestamptz,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    ia.id,
    ia.cloudinary_url,
    ia.thumbnail_url,
    ia.site_name,
    ia.location,
    ia.business_type,
    ia.color_name,
    ia.product_name,
    ia.is_main,
    ia.created_at,
    coalesce(ia.metadata, '{}'::jsonb) as metadata
  from public.image_assets ia
  where coalesce(ia.is_consultation, false) = true
    and coalesce(ia.category, '') not in ('purchase_order', 'floor_plan')
    and nullif(btrim(ia.cloudinary_url), '') is not null
  order by ia.created_at desc nulls last;
$$;

grant execute on function public.get_public_showroom_assets() to anon, authenticated;
