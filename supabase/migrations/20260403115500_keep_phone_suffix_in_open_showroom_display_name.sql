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
  )
  select coalesce(
    case
      when public_display_name is null then null
      when phone_suffix is null or public_display_name ~ ('(^|\\s)' || phone_suffix || '$') then public_display_name
      else trim(public_display_name || ' ' || phone_suffix)
    end,
    external_display_name,
    nullif(trim(concat_ws(' ', month_label, location_label, coalesce(business_label, '기타'), phone_suffix)), ''),
    '시공 사례'
  )
  from (
    select
      public_display_name,
      external_display_name,
      location_label,
      business_label,
      month_label,
      coalesce(phone_suffix_from_external, phone_suffix_from_phone) as phone_suffix
    from normalized
  ) prepared;
$$;
