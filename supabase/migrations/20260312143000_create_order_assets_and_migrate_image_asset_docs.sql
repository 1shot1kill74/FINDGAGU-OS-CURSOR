create table if not exists public.order_assets (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid,
  asset_type text not null check (asset_type in ('purchase_order', 'floor_plan')),
  storage_type text not null default 'supabase' check (storage_type in ('cloudinary', 'supabase')),
  file_url text not null,
  thumbnail_url text,
  storage_path text,
  public_id text,
  file_name text,
  file_type text,
  site_name text,
  business_type text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_assets_consultation_id on public.order_assets (consultation_id);
create index if not exists idx_order_assets_asset_type on public.order_assets (asset_type);
create index if not exists idx_order_assets_created_at on public.order_assets (created_at desc);

comment on table public.order_assets is '발주서·배치도 전용 자산. image_assets와 분리된 도면/문서 자산 관리 테이블';
comment on column public.order_assets.asset_type is 'purchase_order | floor_plan';
comment on column public.order_assets.storage_type is 'cloudinary | supabase';
comment on column public.order_assets.file_url is '원본 파일 접근 URL. Cloudinary 또는 Supabase public URL';
comment on column public.order_assets.public_id is 'Cloudinary public_id. storage_type=cloudinary일 때 사용';

insert into public.order_assets (
  consultation_id,
  asset_type,
  storage_type,
  file_url,
  thumbnail_url,
  storage_path,
  public_id,
  file_name,
  file_type,
  site_name,
  business_type,
  metadata,
  created_at
)
select
  (ia.metadata ->> 'project_id')::uuid as consultation_id,
  ia.category as asset_type,
  coalesce(ia.storage_type, 'supabase') as storage_type,
  ia.cloudinary_url as file_url,
  ia.thumbnail_url,
  ia.storage_path,
  nullif(ia.metadata ->> 'public_id', '') as public_id,
  coalesce(
    nullif(ia.metadata ->> 'file_name', ''),
    nullif(regexp_replace(coalesce(ia.storage_path, ''), '^.*/', ''), ''),
    ia.category || '_' || ia.id::text
  ) as file_name,
  coalesce(
    nullif(ia.metadata ->> 'file_type', ''),
    case
      when coalesce(ia.storage_path, '') ilike '%.pdf' then 'pdf'
      when coalesce(ia.storage_path, '') ilike '%.pptx' then 'pptx'
      when coalesce(ia.storage_path, '') ilike '%.ppt' then 'ppt'
      when coalesce(ia.storage_path, '') ilike '%.png'
        or coalesce(ia.storage_path, '') ilike '%.jpg'
        or coalesce(ia.storage_path, '') ilike '%.jpeg'
        or coalesce(ia.storage_path, '') ilike '%.webp'
      then 'image'
      else null
    end
  ) as file_type,
  ia.site_name,
  ia.business_type,
  coalesce(ia.metadata, '{}'::jsonb) || jsonb_build_object('migrated_from_image_asset_id', ia.id) as metadata,
  coalesce(ia.created_at, now()) as created_at
from public.image_assets ia
where ia.category in ('purchase_order', 'floor_plan')
  and ia.metadata ? 'project_id'
  and nullif(ia.metadata ->> 'project_id', '') is not null;

delete from public.image_assets
where category in ('purchase_order', 'floor_plan');
