# 쇼룸 숏츠 퍼블리싱 웹훅 계약

`showroom-shorts-publish-dispatch`와 `showroom-shorts-publish-callback` 사이에서 `n8n`이 따라야 하는 최소 계약입니다.

## 1. 목적
- `prepare`: 채널별 업로드 준비를 끝내고 `launch_ready` 상태로 돌려보냅니다.
- `launch`: 관리자 승인 후 실제 게시를 실행하고 `published` 또는 `failed`로 돌려보냅니다.

## 2. 디스패치 함수
- 함수명: `showroom-shorts-publish-dispatch`
- 호출 방식: 프론트에서 `supabase.functions.invoke()`
- 입력 body:

```json
{
  "targetId": "uuid",
  "action": "prepare"
}
```

또는

```json
{
  "targetId": "uuid",
  "action": "launch"
}
```

## 3. Edge -> n8n 요청 body

```json
{
  "source": "showroom-shorts",
  "action": "prepare",
  "dispatchedAt": "2026-04-09T09:00:00.000Z",
  "callback": {
    "url": "https://<project-ref>.supabase.co/functions/v1/showroom-shorts-publish-callback",
    "secretHeaderName": "x-showroom-shorts-publish-secret"
  },
  "job": {
    "id": "job-uuid",
    "status": "ready_for_review",
    "finalVideoUrl": "https://...",
    "sourceVideoUrl": "https://...",
    "durationSeconds": 10
  },
  "target": {
    "id": "target-uuid",
    "channel": "youtube",
    "publishStatus": "preparing",
    "title": "title",
    "description": "description",
    "hashtags": ["#BeforeAfter"],
    "firstComment": "comment"
  },
  "publishPackage": {
    "title": "title",
    "description": "description",
    "hashtagsText": "#BeforeAfter #쇼츠",
    "firstComment": "comment",
    "descriptionWithHashtags": "description\\n\\n#BeforeAfter #쇼츠",
    "caption": "description\\n\\n#BeforeAfter #쇼츠"
  }
}
```

요청 헤더:
- `X-Showroom-Shorts-Source: showroom-shorts`
- `X-Showroom-Shorts-Action: prepare|launch`
- `X-Showroom-Shorts-Secret: SHOWROOM_SHORTS_PUBLISH_WEBHOOK_SECRET`

## 4. n8n 즉시 응답 권장 형식

비동기 접수:

```json
{
  "message": "accepted",
  "status": "processing"
}
```

준비 즉시 완료:

```json
{
  "message": "launch ready",
  "status": "launch_ready",
  "previewUrl": "https://...",
  "checklist": ["제목 검수 완료", "설명 검수 완료"]
}
```

게시 즉시 완료:

```json
{
  "message": "published",
  "status": "published",
  "externalPostId": "abc123",
  "externalPostUrl": "https://..."
}
```

## 5. n8n -> callback 요청
- 함수명: `showroom-shorts-publish-callback`
- 헤더:
  - `x-showroom-shorts-publish-secret: SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

### prepare 완료

```json
{
  "targetId": "target-uuid",
  "action": "prepare",
  "status": "launch_ready",
  "message": "upload ready",
  "completedAt": "2026-04-09T09:05:00.000Z",
  "payload": {
    "title": "최종 제목",
    "descriptionWithHashtags": "설명\\n\\n#태그",
    "firstComment": "첫 댓글",
    "previewUrl": "https://...",
    "checklist": ["제목 확인", "설명 확인"]
  }
}
```

### launch 완료

```json
{
  "targetId": "target-uuid",
  "action": "launch",
  "status": "published",
  "message": "published",
  "completedAt": "2026-04-09T09:10:00.000Z",
  "externalPostId": "abc123",
  "externalPostUrl": "https://..."
}
```

### 실패

```json
{
  "targetId": "target-uuid",
  "action": "launch",
  "status": "failed",
  "errorMessage": "Instagram publish failed"
}
```

## 6. 앱 반영 규칙
- `prepare + launch_ready` -> `publish_status = launch_ready`
- `launch + published` -> `publish_status = published`
- `processing` -> `preparing` 또는 `publishing`
- `failed` -> `publish_status = failed`
- 준비 결과 payload는 `showroom_shorts_targets.preparation_payload`에 저장됩니다.
