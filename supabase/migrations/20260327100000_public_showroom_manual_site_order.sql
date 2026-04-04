-- 공개 쇼룸(토큰) 현장 정렬: 내부 쇼룸과 동일하게 showroom_site_overrides 수동 노출 순위 우선,
-- 그다음 현장명 내 yyMM 힌트, 마지막 현장명 가나다순

create or replace function public.primary_showroom_industry_label(business_types text[])
returns text
language plpgsql
immutable
as $f$
declare
  preferred text[] := array['관리형', '학원', '스터디카페', '학교', '아파트', '기타'];
  p text;
  t text;
begin
  if business_types is null or coalesce(array_length(business_types, 1), 0) = 0 then
    return '기타';
  end if;
  foreach p in array preferred
  loop
    foreach t in array business_types
    loop
      if t is not null and trim(t) != '' and (trim(t) = p or position(p in trim(t)) > 0) then
        return p;
      end if;
    end loop;
  end loop;
  return trim(business_types[1]);
end;
$f$;

comment on function public.primary_showroom_industry_label(text[]) is
'쇼룸 업종 섹션 기준 선호 라벨(내부 ShowroomPage.getPrimaryIndustryLabel와 동일 순서).';

create or replace function public.showroom_site_year_sort_value(p_site_name text)
returns integer
language sql
immutable
as $f$
  select coalesce(
    (
      select (m[1])::int
      from regexp_matches(coalesce(p_site_name, ''), '\d{4}', 'g') as m
      where (substring(m[1] from 3 for 2))::int between 1 and 12
      limit 1
    ),
    0
  );
$f$;

comment on function public.showroom_site_year_sort_value(text) is
'현장명에서 첫 유효 yyMM(월 01–12) 토큰을 정수로 반환. 없으면 0.';

grant execute on function public.primary_showroom_industry_label(text[]) to anon, authenticated;
grant execute on function public.showroom_site_year_sort_value(text) to anon, authenticated;

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
      ) as grp_key
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
      b.grp_key,
      coalesce(
        (
          select coalesce(
            nullif(trim(b2.metadata ->> 'canonical_site_name'), ''),
            nullif(trim(b2.site_name), '')
          )
          from base b2
          where b2.grp_key = b.grp_key
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
    group by b.grp_key
  ),
  site_ranked as (
    select
      ss.grp_key,
      ss.rep_site_name,
      case
        when nullif(btrim(ctx.industry_scope), '') is not null
          then btrim(ctx.industry_scope)
        else public.primary_showroom_industry_label(ss.biz_types)
      end as ind_for_override,
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
  site_order as (
    select
      sr.grp_key,
      row_number() over (
        order by
          case when sr.manual_priority is null then 1 else 0 end,
          sr.manual_priority asc nulls last,
          sr.ym_sort desc,
          sr.rep_site_name asc
      ) as site_ord
    from site_ranked sr
  ),
  picked_keys as (
    select so.grp_key
    from site_order so
    order by so.site_ord
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
  join site_order so on so.grp_key = b.grp_key
  where include_all
    or b.grp_key in (select pk.grp_key from picked_keys pk)
  order by so.site_ord, b.created_at desc nulls last;
$fn$;

grant execute on function public.get_public_showroom_assets_by_share_token(text, boolean) to anon, authenticated;
