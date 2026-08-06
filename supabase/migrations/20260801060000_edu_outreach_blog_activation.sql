-- 네이버 블로그 액티베이팅 타겟 소스 추가

alter table public.edu_outreach_sources
  drop constraint if exists edu_outreach_sources_source_type_check;

alter table public.edu_outreach_sources
  add constraint edu_outreach_sources_source_type_check
  check (source_type in (
    'google_news_rss',
    'naver_news_search',
    'naver_local_search',
    'naver_blog_search',
    'g2b_notice',
    'school_notice',
    'manual_import',
    'other_public'
  ));

insert into public.edu_outreach_sources (slug, name, source_type, config, is_active)
values
  (
    'naver_blog_edu_activation',
    '네이버 블로그 — 학원/스터디 액티베이팅',
    'naver_blog_search',
    '{
      "provider": "naver_blog",
      "note": "블로거 단위로 묶어 최근 포스팅 신선도(활성) + 공간의도 키워드로 점수화. 자동 DM 금지."
    }'::jsonb,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

-- 뉴스 수집은 트렌드 보조로 기본 비활성 권장 (블로그/지역이 주력)
update public.edu_outreach_sources
set is_active = false, updated_at = now()
where slug in ('naver_news_edu_furniture', 'google_news_edu_furniture');
