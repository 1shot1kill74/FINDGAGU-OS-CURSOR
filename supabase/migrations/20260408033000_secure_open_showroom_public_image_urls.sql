drop function if exists public.get_public_showroom_assets();

create function public.get_public_showroom_assets()
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
  public_group_key text,
  before_after_role text,
  industry_site_order integer,
  before_after_site_order integer
)
language sql
security definer
set search_path = public
as $fn$
  with base as (
    select
      ia.id,
      coalesce(
        regexp_replace(ia.cloudinary_url, '/upload/', '/upload/f_auto,q_auto,c_limit,w_1600/', 1, 1),
        ia.thumbnail_url,
        ia.cloudinary_url
      ) as cloudinary_url,
      coalesce(
        ia.thumbnail_url,
        regexp_replace(ia.cloudinary_url, '/upload/', '/upload/f_auto,q_auto,c_limit,w_800/', 1, 1),
        ia.cloudinary_url
      ) as thumbnail_url,
      public.open_showroom_display_name(coalesce(ia.metadata, '{}'::jsonb), ia.location, ia.business_type, ia.created_at) as public_site_name,
      ia.location,
      ia.business_type,
      ia.color_name,
      ia.product_name,
      ia.is_main,
      ia.created_at,
      public.open_showroom_group_key(coalesce(ia.metadata, '{}'::jsonb), ia.site_name, ia.id) as public_group_key,
      case
        when ia.metadata ->> 'before_after_role' in ('before', 'after')
          then ia.metadata ->> 'before_after_role'
        else null
      end as before_after_role,
      coalesce(
        case when nullif(trim(ia.metadata ->> 'space_id'), '') is not null
          then 'space:' || trim(ia.metadata ->> 'space_id') end,
        case when nullif(trim(ia.metadata ->> 'before_after_group_id'), '') is not null
          then 'before-after:' || trim(ia.metadata ->> 'before_after_group_id') end,
        case when nullif(trim(ia.metadata ->> 'canonical_site_name'), '') is not null
          then 'site:' || trim(ia.metadata ->> 'canonical_site_name') end,
        case when nullif(trim(ia.site_name), '') is not null
          then 'site:' || trim(ia.site_name) end,
        'site:' || ia.id::text
      ) as internal_group_key,
      coalesce(ia.metadata, '{}'::jsonb) as metadata,
      ia.site_name
    from public.image_assets ia
    where coalesce(ia.is_consultation, false) = true
      and coalesce(ia.category, '') not in ('purchase_order', 'floor_plan')
      and nullif(btrim(ia.cloudinary_url), '') is not null
  ),
  site_stats as (
    select
      b.internal_group_key,
      coalesce(
        (
          select coalesce(
            nullif(trim(b2.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b2.site_name), '')
          )
          from base b2
          where b2.internal_group_key = b.internal_group_key
            and coalesce(
              nullif(trim(b2.metadata ->> 'canonical_site_name'), ''),
              nullif(trim(b2.site_name), ''),
              ''
            ) != ''
          order by b2.created_at desc nulls last
          limit 1
        ),
        '미지정'
      ) as rep_site_name,
      coalesce(
        array_agg(
          distinct coalesce(
            nullif(trim(b.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b.site_name), '')
          )
        ) filter (
          where coalesce(
            nullif(trim(b.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b.site_name), ''),
            ''
          ) != ''
        ),
        array[]::text[]
      ) as name_candidates,
      coalesce(
        array_remove(
          array_agg(distinct b.business_type::text) filter (
            where nullif(trim(b.business_type::text), '') is not null
          ),
          null
        ),
        array[]::text[]
      ) as biz_types
    from base b
    group by b.internal_group_key
  ),
  industry_site_ranked as (
    select
      ss.internal_group_key,
      ss.rep_site_name,
      ov.manual_priority,
      public.showroom_site_year_sort_value(ss.rep_site_name) as ym_sort
    from site_stats ss
    left join lateral (
      select o.manual_priority
      from public.showroom_site_overrides o
      where o.section_key = 'industry'
        and o.industry_label = public.primary_showroom_industry_label(ss.biz_types)
        and (
          o.site_name = ss.rep_site_name
          or o.site_name = any(coalesce(ss.name_candidates, array[]::text[]) || array[ss.rep_site_name])
        )
      order by o.manual_priority asc nulls last
      limit 1
    ) ov on true
  ),
  industry_site_order as (
    select
      sr.internal_group_key,
      row_number() over (
        order by
          case when sr.manual_priority is null then 1 else 0 end,
          sr.manual_priority asc nulls last,
          sr.ym_sort desc,
          sr.rep_site_name asc
      ) as site_ord
    from industry_site_ranked sr
  ),
  before_after_site_ranked as (
    select
      ss.internal_group_key,
      ss.rep_site_name,
      ov.manual_priority,
      public.showroom_site_year_sort_value(ss.rep_site_name) as ym_sort
    from site_stats ss
    left join lateral (
      select o.manual_priority
      from public.showroom_site_overrides o
      where o.section_key = 'before_after'
        and o.industry_label = public.primary_showroom_industry_label(ss.biz_types)
        and (
          o.site_name = ss.rep_site_name
          or o.site_name = any(coalesce(ss.name_candidates, array[]::text[]) || array[ss.rep_site_name])
        )
      order by o.manual_priority asc nulls last
      limit 1
    ) ov on true
  ),
  before_after_site_order as (
    select
      sr.internal_group_key,
      row_number() over (
        order by
          case when sr.manual_priority is null then 1 else 0 end,
          sr.manual_priority asc nulls last,
          sr.ym_sort desc,
          sr.rep_site_name asc
      ) as site_ord
    from before_after_site_ranked sr
  )
  select
    b.id,
    b.cloudinary_url,
    b.thumbnail_url,
    b.public_site_name as site_name,
    b.location,
    b.business_type,
    b.color_name,
    b.product_name,
    b.is_main,
    b.created_at,
    b.public_group_key,
    b.before_after_role,
    iso.site_ord as industry_site_order,
    baso.site_ord as before_after_site_order
  from base b
  join industry_site_order iso on iso.internal_group_key = b.internal_group_key
  join before_after_site_order baso on baso.internal_group_key = b.internal_group_key
  order by iso.site_ord, b.created_at desc nulls last;
$fn$;

grant execute on function public.get_public_showroom_assets() to anon, authenticated;

drop function if exists public.get_public_showroom_assets_by_share_token(text, boolean);

create function public.get_public_showroom_assets_by_share_token(
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
  public_group_key text,
  before_after_role text,
  industry_site_order integer,
  before_after_site_order integer
)
language sql
security definer
set search_path = public
as $fn$
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
      coalesce(
        regexp_replace(ia.cloudinary_url, '/upload/', '/upload/f_auto,q_auto,c_limit,w_1600/', 1, 1),
        ia.thumbnail_url,
        ia.cloudinary_url
      ) as cloudinary_url,
      coalesce(
        ia.thumbnail_url,
        regexp_replace(ia.cloudinary_url, '/upload/', '/upload/f_auto,q_auto,c_limit,w_800/', 1, 1),
        ia.cloudinary_url
      ) as thumbnail_url,
      public.open_showroom_display_name(coalesce(ia.metadata, '{}'::jsonb), ia.location, ia.business_type, ia.created_at) as public_site_name,
      ia.location,
      ia.business_type,
      ia.color_name,
      ia.product_name,
      ia.is_main,
      ia.created_at,
      public.open_showroom_group_key(coalesce(ia.metadata, '{}'::jsonb), ia.site_name, ia.id) as public_group_key,
      case
        when ia.metadata ->> 'before_after_role' in ('before', 'after')
          then ia.metadata ->> 'before_after_role'
        else null
      end as before_after_role,
      coalesce(
        case when nullif(trim(ia.metadata ->> 'space_id'), '') is not null
          then 'space:' || trim(ia.metadata ->> 'space_id') end,
        case when nullif(trim(ia.metadata ->> 'before_after_group_id'), '') is not null
          then 'before-after:' || trim(ia.metadata ->> 'before_after_group_id') end,
        case when nullif(trim(ia.metadata ->> 'canonical_site_name'), '') is not null
          then 'site:' || trim(ia.metadata ->> 'canonical_site_name') end,
        case when nullif(trim(ia.site_name), '') is not null
          then 'site:' || trim(ia.site_name) end,
        'site:' || ia.id::text
      ) as internal_group_key,
      coalesce(ia.metadata, '{}'::jsonb) as metadata,
      ia.site_name
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
  site_stats as (
    select
      b.internal_group_key,
      coalesce(
        (
          select coalesce(
            nullif(trim(b2.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b2.site_name), '')
          )
          from base b2
          where b2.internal_group_key = b.internal_group_key
            and coalesce(
              nullif(trim(b2.metadata ->> 'canonical_site_name'), ''),
              nullif(trim(b2.site_name), ''),
              ''
            ) != ''
          order by b2.created_at desc nulls last
          limit 1
        ),
        '미지정'
      ) as rep_site_name,
      coalesce(
        array_agg(
          distinct coalesce(
            nullif(trim(b.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b.site_name), '')
          )
        ) filter (
          where coalesce(
            nullif(trim(b.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b.site_name), ''),
            ''
          ) != ''
        ),
        array[]::text[]
      ) as name_candidates,
      coalesce(
        array_remove(
          array_agg(distinct b.business_type::text) filter (
            where nullif(trim(b.business_type::text), '') is not null
          ),
          null
        ),
        array[]::text[]
      ) as biz_types
    from base b
    group by b.internal_group_key
  ),
  industry_site_ranked as (
    select
      ss.internal_group_key,
      ss.rep_site_name,
      ov.manual_priority,
      public.showroom_site_year_sort_value(ss.rep_site_name) as ym_sort
    from site_stats ss
    cross join ssl_ctx ctx
    left join lateral (
      select o.manual_priority
      from public.showroom_site_overrides o
      where o.section_key = 'industry'
        and o.industry_label = (
          case
            when nullif(btrim(ctx.industry_scope), '') is not null
              then btrim(ctx.industry_scope)
            else public.primary_showroom_industry_label(ss.biz_types)
          end
        )
        and (
          o.site_name = ss.rep_site_name
          or o.site_name = any(coalesce(ss.name_candidates, array[]::text[]) || array[ss.rep_site_name])
        )
      order by o.manual_priority asc nulls last
      limit 1
    ) ov on true
  ),
  industry_site_order as (
    select
      sr.internal_group_key,
      row_number() over (
        order by
          case when sr.manual_priority is null then 1 else 0 end,
          sr.manual_priority asc nulls last,
          sr.ym_sort desc,
          sr.rep_site_name asc
      ) as site_ord
    from industry_site_ranked sr
  ),
  before_after_site_ranked as (
    select
      ss.internal_group_key,
      ss.rep_site_name,
      ov.manual_priority,
      public.showroom_site_year_sort_value(ss.rep_site_name) as ym_sort
    from site_stats ss
    cross join ssl_ctx ctx
    left join lateral (
      select o.manual_priority
      from public.showroom_site_overrides o
      where o.section_key = 'before_after'
        and o.industry_label = (
          case
            when nullif(btrim(ctx.industry_scope), '') is not null
              then btrim(ctx.industry_scope)
            else public.primary_showroom_industry_label(ss.biz_types)
          end
        )
        and (
          o.site_name = ss.rep_site_name
          or o.site_name = any(coalesce(ss.name_candidates, array[]::text[]) || array[ss.rep_site_name])
        )
      order by o.manual_priority asc nulls last
      limit 1
    ) ov on true
  ),
  before_after_site_order as (
    select
      sr.internal_group_key,
      row_number() over (
        order by
          case when sr.manual_priority is null then 1 else 0 end,
          sr.manual_priority asc nulls last,
          sr.ym_sort desc,
          sr.rep_site_name asc
      ) as site_ord
    from before_after_site_ranked sr
  ),
  picked_keys as (
    select iso.internal_group_key
    from industry_site_order iso
    order by iso.site_ord
    limit case
      when include_all then 2147483647
      else greatest(1, (select preview_site_limit from ssl_ctx))
    end
  )
  select
    b.id,
    b.cloudinary_url,
    b.thumbnail_url,
    b.public_site_name as site_name,
    b.location,
    b.business_type,
    b.color_name,
    b.product_name,
    b.is_main,
    b.created_at,
    b.public_group_key,
    b.before_after_role,
    iso.site_ord as industry_site_order,
    baso.site_ord as before_after_site_order
  from base b
  join industry_site_order iso on iso.internal_group_key = b.internal_group_key
  join before_after_site_order baso on baso.internal_group_key = b.internal_group_key
  where include_all
    or b.internal_group_key in (select pk.internal_group_key from picked_keys pk)
  order by iso.site_ord, b.created_at desc nulls last;
$fn$;

grant execute on function public.get_public_showroom_assets_by_share_token(text, boolean) to anon, authenticated;
