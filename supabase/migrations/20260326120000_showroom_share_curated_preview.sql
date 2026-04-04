-- 맞춤형 공개 쇼룸: 현장(사이트) 개수 상한 + 전체 보기 옵션용 RPC 확장
alter table public.showroom_share_links
  add column if not exists preview_site_limit integer;

update public.showroom_share_links
  set preview_site_limit = 6
  where preview_site_limit is null;

alter table public.showroom_share_links
  alter column preview_site_limit set not null,
  alter column preview_site_limit set default 6;

alter table public.showroom_share_links
  drop constraint if exists showroom_share_links_preview_site_limit_check;

alter table public.showroom_share_links
  add constraint showroom_share_links_preview_site_limit_check
    check (preview_site_limit >= 1 and preview_site_limit <= 50);

comment on column public.showroom_share_links.preview_site_limit is
  '공개 맞춤 쇼룸에서 먼저 노출할 현장(사이트) 수 상한. 전체 보기 시 무시.';

create or replace function public.resolve_public_showroom_share(share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
begin
  select jsonb_build_object(
    'token', ssl.token,
    'title', coalesce(nullif(btrim(ssl.title), ''), '시공사례 쇼룸'),
    'description', coalesce(nullif(btrim(ssl.description), ''), '담당자가 전달한 외부 쇼룸 링크입니다.'),
    'industry_scope', nullif(btrim(ssl.industry_scope), ''),
    'source', nullif(btrim(ssl.source), ''),
    'preview_site_limit', ssl.preview_site_limit,
    'created_at', ssl.created_at,
    'expires_at', ssl.expires_at
  )
  into payload
  from public.showroom_share_links ssl
  where ssl.token = share_token
    and ssl.revoked_at is null
    and ssl.expires_at > now()
  limit 1;

  return payload;
end;
$$;

grant execute on function public.resolve_public_showroom_share(text) to anon, authenticated;

drop function if exists public.get_public_showroom_assets_by_share_token(text);

create or replace function public.get_public_showroom_assets_by_share_token(
  share_token text,
  include_all boolean default false
)
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
  with ssl_ctx as (
    select
      ssl.industry_scope,
      ssl.preview_site_limit
    from public.showroom_share_links ssl
    where ssl.token = share_token
      and ssl.revoked_at is null
      and ssl.expires_at > now()
    limit 1
  ),
  base as (
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
      coalesce(ia.metadata, '{}'::jsonb) as metadata,
      coalesce(nullif(trim(ia.site_name), ''), ia.id::text) as site_key
    from public.image_assets ia
    cross join ssl_ctx ctx
    where (
      nullif(btrim(ctx.industry_scope), '') is null
      or coalesce(ia.business_type, '') ilike ('%' || btrim(ctx.industry_scope) || '%')
    )
      and coalesce(ia.is_consultation, false) = true
      and coalesce(ia.category, '') not in ('purchase_order', 'floor_plan')
      and nullif(btrim(ia.cloudinary_url), '') is not null
  ),
  picked_keys as (
    select bs.site_key
    from (
      select site_key, max(created_at) as mx
      from base
      group by site_key
    ) bs
    order by bs.mx desc nulls last
    limit case
      when include_all then 2147483647
      else greatest(1, (select preview_site_limit from ssl_ctx))
    end
  )
  select
    b.id,
    b.cloudinary_url,
    b.thumbnail_url,
    b.site_name,
    b.location,
    b.business_type,
    b.color_name,
    b.product_name,
    b.is_main,
    b.created_at,
    b.metadata
  from base b
  where include_all
    or b.site_key in (select pk.site_key from picked_keys pk)
  order by b.created_at desc nulls last;
$$;

grant execute on function public.get_public_showroom_assets_by_share_token(text, boolean) to anon, authenticated;
