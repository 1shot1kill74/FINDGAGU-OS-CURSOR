-- 네이버 검색(뉴스/지역) 소스를 교육가구 아웃리치에 추가

alter table public.edu_outreach_sources
  drop constraint if exists edu_outreach_sources_source_type_check;

alter table public.edu_outreach_sources
  add constraint edu_outreach_sources_source_type_check
  check (source_type in (
    'google_news_rss',
    'naver_news_search',
    'naver_local_search',
    'g2b_notice',
    'school_notice',
    'manual_import',
    'other_public'
  ));

insert into public.edu_outreach_sources (slug, name, source_type, config, is_active)
values
  (
    'naver_news_edu_furniture',
    '네이버 뉴스 검색 — 교육공간 시그널',
    'naver_news_search',
    '{
      "provider": "naver_news",
      "queries": [
        "학원 개원",
        "학원 이전",
        "학원 리모델링",
        "스터디카페 오픈",
        "관리형 독서실 오픈",
        "아파트 커뮤니티 독서실",
        "학교 특별실 가구"
      ]
    }'::jsonb,
    true
  ),
  (
    'naver_local_edu_places',
    '네이버 지역 검색 — 학원/스터디/독서실 풀',
    'naver_local_search',
    '{
      "provider": "naver_local",
      "note": "BefoAftr NAVER_CLIENT_ID 재사용. 전화번호 자동 발송 금지."
    }'::jsonb,
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  config = excluded.config,
  is_active = excluded.is_active,
  updated_at = now();

-- Google News는 보조로 유지하되 기본 비활성 권장
update public.edu_outreach_sources
set is_active = false, updated_at = now()
where slug = 'google_news_edu_furniture';
