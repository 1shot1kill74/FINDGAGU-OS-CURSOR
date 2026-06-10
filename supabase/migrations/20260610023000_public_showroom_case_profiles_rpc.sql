create or replace function public.get_public_showroom_case_profiles(site_names text[] default null)
returns table (
  site_name text,
  canonical_site_name text,
  industry text,
  pain_point text,
  solution_point text,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.site_name,
    p.canonical_site_name,
    p.industry,
    p.pain_point,
    p.solution_point,
    jsonb_strip_nulls(jsonb_build_object(
      'content_outline', p.metadata -> 'content_outline',
      'content_generation', jsonb_build_object(
        'cardnews', p.metadata #> '{content_generation,cardnews}',
        'blog', p.metadata #> '{content_generation,blog}'
      ),
      'canonical_blog_post', p.metadata -> 'canonical_blog_post',
      'cardnews_publication', p.metadata -> 'cardnews_publication',
      'consultation_card_draft', p.metadata -> 'consultation_card_draft'
    )) as metadata
  from public.showroom_case_profiles p
  where
    (
      p.metadata #>> '{canonical_blog_post,status}' = 'approved'
      or p.metadata #>> '{content_generation,blog,response,payload,status}' = 'approved'
      or p.metadata #>> '{content_generation,blog,response,status}' = 'approved'
    )
    and (
      site_names is null
      or cardinality(site_names) = 0
      or p.site_name = any(site_names)
      or p.canonical_site_name = any(site_names)
    );
$$;

grant execute on function public.get_public_showroom_case_profiles(text[]) to anon, authenticated;
