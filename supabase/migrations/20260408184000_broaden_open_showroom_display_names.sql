create or replace function public.open_showroom_display_name(
  p_metadata jsonb,
  p_location text,
  p_business_type text,
  p_created_at timestamptz
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      nullif(btrim(coalesce(p_metadata ->> 'public_display_name', '')), '') as public_display_name,
      nullif(btrim(coalesce(p_metadata ->> 'external_display_name', '')), '') as external_display_name,
      nullif(regexp_replace(coalesce(p_location, ''), '\s+', ' ', 'g'), '') as location_label,
      nullif(regexp_replace(coalesce(p_business_type, ''), '\s+', ' ', 'g'), '') as business_label,
      case
        when p_created_at is not null then to_char(p_created_at, 'YYMM')
        else null
      end as month_label,
      nullif(right(regexp_replace(coalesce(p_metadata ->> 'customer_phone', ''), '\D', '', 'g'), 4), '') as phone_suffix_from_phone,
      (
        select match[1]
        from regexp_matches(coalesce(p_metadata ->> 'external_display_name', ''), '(\d{4})$') as match
        limit 1
      ) as phone_suffix_from_external
  ),
  prepared as (
    select
      public_display_name,
      external_display_name,
      case
        when location_label is null then null
        when location_label ~ '^서울(\s|$)' then '서울권'
        when location_label ~ '^(경기|인천)(\s|$)' then '경기권'
        when location_label ~ '^부산(\s|$)' then '부산권'
        when location_label ~ '^대구(\s|$)' then '대구권'
        when location_label ~ '^광주(\s|$)' then '광주권'
        when location_label ~ '^대전(\s|$)' then '대전권'
        when location_label ~ '^울산(\s|$)' then '울산권'
        when location_label ~ '^(세종|충북|충남)(\s|$)' then '충청권'
        when location_label ~ '^강원(\s|$)' then '강원권'
        when location_label ~ '^전북(\s|$)' then '전북권'
        when location_label ~ '^전남(\s|$)' then '전남권'
        when location_label ~ '^경북(\s|$)' then '경북권'
        when location_label ~ '^경남(\s|$)' then '경남권'
        when location_label ~ '^제주(\s|$)' then '제주권'
        else split_part(location_label, ' ', 1)
      end as broad_location_label,
      business_label,
      month_label,
      coalesce(phone_suffix_from_external, phone_suffix_from_phone) as phone_suffix
    from normalized
  )
  select coalesce(
    case
      when public_display_name is null then null
      when phone_suffix is null or public_display_name ~ ('(^|\\s)' || phone_suffix || '$') then public_display_name
      else trim(public_display_name || ' ' || phone_suffix)
    end,
    case
      when external_display_name is null then null
      else trim(
        regexp_replace(
          regexp_replace(external_display_name, '\s+\d{4}$', '', 'g'),
          '(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)\s+\S+',
          case
            when broad_location_label is null then '\1'
            else broad_location_label
          end,
          'g'
        ) ||
        case
          when phone_suffix is null then ''
          else ' ' || phone_suffix
        end
      )
    end,
    nullif(trim(concat_ws(' ', month_label, broad_location_label, coalesce(business_label, '기타'), phone_suffix)), ''),
    '시공 사례'
  )
  from prepared;
$$;
