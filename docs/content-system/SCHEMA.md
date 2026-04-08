# 콘텐츠 시스템 스키마 초안

## 1. 목적
- 이 문서는 콘텐츠 시스템의 핵심 테이블과 필드 의미를 빠르게 확인하기 위한 설계 기준안이다.

## 2. `content_items`
- `id`: 콘텐츠 기본 키
- `site_name`: 현장명
- `business_type`: 업종
- `region`: 지역
- `source_type`: 후보 생성 출처
- `status`: `idea | queued | draft | review | approved | published | archived`
- `pain_point`: 고객 문제의식
- `target_persona`: 대상 고객
- `content_angle`: 접근 각도
- `primary_keywords`: 핵심 키워드 목록
- `secondary_keywords`: 보조 키워드 목록
- `faq_topics`: FAQ 후보 목록
- `reveal_level`: `teaser | summary | detail`
- `created_at`
- `updated_at`

## 3. `content_blog_drafts`
- `id`
- `content_item_id`
- `title`
- `excerpt`
- `seo_title`
- `seo_description`
- `aeo_summary`
- `faq_body`
- `body`
- `cta_text`
- `version`
- `created_at`
- `updated_at`

## 4. `content_derivatives`
- `id`
- `content_item_id`
- `type`: `card_news | shorts | long_form | sns_caption | cta | faq`
- `channel`
- `title`
- `body`
- `hook_text`
- `outline`
- `status`
- `created_at`
- `updated_at`

## 5. `content_distributions`
- `id`
- `content_item_id`
- `channel`: `google_blog | naver_blog | youtube_shorts | youtube_long | instagram | facebook | tiktok`
- `status`: `not_generated | draft_ready | review_pending | scheduled | published | error`
- `publish_url`
- `scheduled_at`
- `published_at`
- `error_message`
- `created_at`
- `updated_at`

## 6. `content_templates`
- `id`
- `template_type`: `blog | card_news | shorts | long_form | cta | faq`
- `name`
- `description`
- `structure_summary`
- `body_template`
- `is_active`
- `usage_count`
- `created_at`
- `updated_at`

## 7. `content_activity_logs`
- `id`
- `content_item_id`
- `action_type`
- `from_status`
- `to_status`
- `channel`
- `message`
- `payload`
- `created_at`

## 8. `content_automation_jobs`
- `id`
- `content_item_id`
- `distribution_id`
- `job_type`: `blog_publish | video_publish | social_publish | distribution_sync`
- `channel`
- `status`: `queued | processing | completed | failed | cancelled`
- `payload`
- `error_message`
- `requested_at`
- `completed_at`
- `updated_at`

## 9. 관계 요약
- `content_items` 1:N `content_blog_drafts`
- `content_items` 1:N `content_derivatives`
- `content_items` 1:N `content_distributions`
- `content_items` 1:N `content_activity_logs`
- `content_items` 1:N `content_automation_jobs`
- `content_items` 1:N `content_sources`
- `content_templates`는 현재 운영 콘솔 기준으로 직접 외래키를 강제하지 않고, 템플릿 화면/로컬 상태 기준으로 연결해 사용한다.

## 10. 운영 해석
- `content_items`는 콘텐츠 허브의 중심 원본이다.
- `content_sources`는 콘텐츠가 어떤 쇼룸 그룹/이미지 자산에서 왔는지 추적하는 연결 레이어다.
- `content_sources`에서 `image_asset` 행은 `image_asset_id`만 채우고 `showroom_group_key`는 비워야 하며, `showroom_group` 행은 반대로 `showroom_group_key`만 채우는 구조다.
- `content_blog_drafts`는 메인 원문 이력이다.
- `content_derivatives`는 채널별 파생 초안이다.
- `content_distributions`는 배포 상태 보드다.
- `content_automation_jobs`는 외부 자동화 실행 이력이다.
