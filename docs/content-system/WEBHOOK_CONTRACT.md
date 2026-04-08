# 콘텐츠 자동화 웹훅 계약

## 1. 목적
- 이 문서는 `자동화 큐 > 웹훅 호출` 버튼이 어떤 payload를 Edge Function과 외부 자동화로 넘기는지 정의한다.
- 브라우저는 외부 webhook URL을 직접 알지 않고, `content-automation-dispatch` Edge Function만 호출한다.

## 2. 호출 흐름
1. 프론트가 `content-automation-dispatch` Edge Function을 호출한다.
2. Edge Function이 채널/작업유형 기준으로 서버사이드 secret과 webhook URL을 찾는다.
3. Edge Function이 외부 자동화 엔드포인트로 POST 요청을 보낸다.
4. 응답 결과를 프론트에 돌려주고, 프론트는 job/distribution 상태를 1차 반영한다.
5. 외부 자동화가 비동기로 끝나면 `content-automation-callback` Edge Function으로 최종 결과를 다시 보낸다.

## 3. Edge Function 시크릿 규약
- 기본값:
  - `CONTENT_AUTOMATION_DEFAULT_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_DEFAULT_WEBHOOK_SECRET`
  - `CONTENT_AUTOMATION_DEFAULT_MODE=mock|live`
  - `CONTENT_AUTOMATION_DEFAULT_LABEL`
- 채널별 override:
  - `CONTENT_AUTOMATION_GOOGLE_BLOG_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_NAVER_BLOG_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_YOUTUBE_SHORTS_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_YOUTUBE_LONGFORM_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_INSTAGRAM_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_FACEBOOK_CARDNEWS_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_TIKTOK_WEBHOOK_URL`
- 작업유형별 fallback:
  - `CONTENT_AUTOMATION_BLOG_PUBLISH_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_VIDEO_PUBLISH_WEBHOOK_URL`
  - `CONTENT_AUTOMATION_SOCIAL_PUBLISH_WEBHOOK_URL`
- `mock` 모드에서는 URL이 없어도 Edge Function이 inline mock 응답으로 `processing` 상태를 돌려줄 수 있다.

## 4. 프론트 -> Edge Function payload
```json
{
  "job": {
    "id": "job-123",
    "type": "blog_publish",
    "status": "queued",
    "requestedAt": "2026-03-29T09:00:00.000Z",
    "reflectedAt": null
  },
  "content": {
    "id": "content-123",
    "siteName": "OO학원",
    "businessType": "학원",
    "region": "서울",
    "revealLevel": "summary",
    "priorityReason": "자동화 확인",
    "blogTitle": "OO학원 사례로 보는 설계 포인트",
    "seoDescription": "실제 이미지 자산을 기준으로 정리한 초안",
    "ctaText": "유사 사례를 더 보고 싶다면...",
    "faqTopics": ["예산", "공사기간"],
    "derivativeHook": "공간이 달라 보이는 핵심 한 가지",
    "tags": ["학원", "상담실", "우드톤"]
  },
  "distribution": {
    "id": "dist-123",
    "channel": "Google Blog",
    "status": "draft_ready",
    "webhookStatus": "mock 연결",
    "publishUrl": null,
    "updatedAt": "2026-03-29T09:00:00.000Z"
  },
  "derivatives": [],
  "activityContext": [],
  "readiness": []
}
```

## 5. Edge Function -> 외부 자동화 요청 body
```json
{
  "source": "content-workspace",
  "dispatchedAt": "2026-03-29T09:05:00.000Z",
  "jobId": "job-123",
  "contentItemId": "content-123",
  "channel": "Google Blog",
  "jobType": "blog_publish",
  "payload": { "...": "프론트 payload 전체" }
}
```

## 6. 외부 자동화 응답 권장 형식
- 최소:
```json
{
  "message": "accepted",
  "status": "processing"
}
```
- 즉시 완료까지 반환하는 경우:
```json
{
  "message": "published",
  "status": "completed",
  "publishUrl": "https://blog.example.com/post/123",
  "requestId": "exec_123",
  "completedAt": "2026-03-29T09:06:00.000Z"
}
```

## 7. 외부 자동화 -> callback body
```json
{
  "jobId": "job-123",
  "status": "completed",
  "publishUrl": "https://blog.example.com/post/123",
  "completedAt": "2026-03-29T09:06:00.000Z",
  "payload": {
    "requestId": "exec_123",
    "cardNews": {
      "master": {
        "cta": "직접 보면 왜 다른지 더 분명합니다. 쇼룸 방문으로 확인해보세요.",
        "slides": [
          { "slide": 1, "role": "hook", "text": "..." },
          { "slide": 2, "role": "problem", "text": "..." },
          { "slide": 3, "role": "difference", "text": "..." },
          { "slide": 4, "role": "showroom_reason", "text": "..." },
          { "slide": 5, "role": "cta", "text": "..." }
        ]
      },
      "instagram": {
        "slides": [
          { "slide": 1, "role": "hook", "text": "..." },
          { "slide": 2, "role": "problem", "text": "..." },
          { "slide": 3, "role": "difference", "text": "..." },
          { "slide": 4, "role": "showroom_reason", "text": "..." },
          { "slide": 5, "role": "cta", "text": "..." }
        ],
        "caption": "..."
      },
      "facebook": {
        "slides": [
          { "slide": 1, "role": "hook", "text": "..." },
          { "slide": 2, "role": "problem", "text": "..." },
          { "slide": 3, "role": "difference", "text": "..." },
          { "slide": 4, "role": "showroom_reason", "text": "..." },
          { "slide": 5, "role": "cta", "text": "..." }
        ],
        "caption": "..."
      }
    }
  }
}
```

- 인증 헤더:
  - `x-content-automation-secret: CONTENT_AUTOMATION_CALLBACK_SECRET`
- callback 함수:
  - `content-automation-callback`
- callback 함수는 `content_automation_jobs`, `content_distributions`, `content_activity_logs`를 함께 갱신한다.
- `payload.cardNews.instagram|facebook`가 있으면 `content_derivatives`에 카드뉴스 초안도 함께 반영한다.

## 8. 프론트 반영 규칙
- Edge Function 성공 + `status=processing`: job을 `processing`으로 반영한다.
- Edge Function 성공 + `status=completed`: job을 `completed`로 반영하고, `publishUrl`이 있으면 배포 URL도 함께 반영한다.
- Edge Function 실패: job을 `failed`로 반영하고 오류 메시지를 남긴다.
- `mode=live`이면 채널 `webhookStatus`는 `실URL 연결`, 아니면 `mock 연결`로 유지한다.
