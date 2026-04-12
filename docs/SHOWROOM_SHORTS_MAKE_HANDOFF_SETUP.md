# 쇼룸 숏츠 Make 핸드오프 설정 가이드

## 목적
- 현재 유지 중인 `앱 -> Supabase dispatch -> n8n` 구조는 그대로 둡니다.
- `YouTube`는 지금처럼 `n8n`이 직접 업로드합니다.
- `Facebook / Instagram`은 `n8n`이 준비를 끝낸 뒤 `Make` webhook으로 넘기고, `Make`가 실제 Meta 업로드를 수행합니다.

## 권장 아키텍처
```text
앱 승인 버튼
  -> showroom-shorts-publish-dispatch
  -> n8n
     -> prepare: n8n이 처리
     -> launch:
        -> youtube: n8n이 직접 업로드
        -> facebook / instagram: Make webhook 호출
  -> Make
     -> Meta 업로드 실행
     -> Supabase callback 호출
```

핵심은 `앱과 Supabase는 Make를 몰라도 된다`는 점입니다.  
Make는 `Meta 업로드 실행기`로만 두고, 상태 관리는 기존 `showroom-shorts-publish-callback`에 다시 모읍니다.

## 1차 범위
처음에는 아래 범위만 구현하는 것이 가장 안전합니다.

- `prepare`는 모든 채널 공통으로 `n8n`이 처리
- `launch + youtube`는 기존 `n8n` 유지
- `launch + facebook|instagram`만 `Make`로 전달

이렇게 하면 기존 YouTube 운영을 건드리지 않으면서 Meta만 분리할 수 있습니다.

## 역할 분담
- 앱: 승인 버튼, 상태 확인
- `showroom-shorts-publish-dispatch`: 외부 퍼블리싱 webhook 호출
- `n8n`: 준비 패키지 생성, 채널 라우팅, Make 호출
- `Make`: Facebook / Instagram 실제 게시
- `showroom-shorts-publish-callback`: 최종 상태 저장

## n8n에서 Make로 넘기는 최소 payload
처음 버전은 아래 필드만 넘기면 충분합니다.

```json
{
  "source": "showroom-shorts",
  "action": "launch",
  "targetId": "TARGET_UUID",
  "channel": "instagram",
  "jobId": "JOB_UUID",
  "finalVideoUrl": "https://example.com/final.mp4",
  "title": "최종 제목",
  "caption": "설명문\n\n#해시태그",
  "firstComment": "첫 댓글",
  "callback": {
    "url": "https://<project-ref>.supabase.co/functions/v1/showroom-shorts-publish-callback",
    "secretHeaderName": "x-showroom-shorts-publish-secret",
    "secret": "SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET"
  }
}
```

권장 규칙:
- `channel`은 `facebook` 또는 `instagram`
- `caption`은 `publishPackage.caption` 우선
- `title`은 Meta에서 꼭 필요하지 않더라도 로그/디버깅용으로 포함
- `targetId`는 callback 시 반드시 그대로 되돌려보냄
- Meta 인증 토큰은 payload에 싣지 않음
- Meta 인증은 이미 저장된 `Make Credentials`에서 처리

## n8n에서 Make로 넘길 때 추천 헤더
공유 시크릿을 하나 두는 것이 좋습니다.

```http
Content-Type: application/json
X-Showroom-Shorts-Source: showroom-shorts
X-Showroom-Shorts-Action: launch
X-Make-Webhook-Secret: YOUR_MAKE_SHARED_SECRET
```

## Make 시나리오 권장 구조
Make 시나리오는 하나로 시작하는 것이 가장 단순합니다.

가장 추천하는 방법은 이미 복사해둔 `Facebook / Instagram 포스팅` 시나리오를 개조하는 것입니다.  
기존 `Router + Sleep` 패턴이 검증돼 있기 때문에 이 방식이 가장 안전합니다.

1. `Custom Webhook`
2. 필수값 검증
3. `channel` 값으로 Router 분기
4. `facebook`
   - Meta 업로드 실행
   - `Sleep`
   - 성공 시 `externalPostId`, `externalPostUrl` 구성
5. `instagram`
   - Reels 업로드 실행
   - `Sleep`
   - 성공 시 `externalPostId`, `externalPostUrl` 구성
6. Supabase callback 호출

권장 검증 항목:
- `action === "launch"`
- `targetId` 존재
- `channel`이 `facebook|instagram` 중 하나
- `finalVideoUrl` 존재
- `callback.url` 존재
- `callback.secret` 존재

## Make -> Supabase callback 성공 예시
Facebook / Instagram 모두 동일한 형식을 쓰는 것이 좋습니다.

```json
{
  "targetId": "TARGET_UUID",
  "action": "launch",
  "status": "published",
  "message": "published",
  "completedAt": "2026-04-11T12:00:00.000Z",
  "externalPostId": "1234567890",
  "externalPostUrl": "https://www.instagram.com/reel/ABC123/",
  "payload": {
    "channel": "instagram",
    "provider": "make",
    "finalVideoUrl": "https://example.com/final.mp4"
  }
}
```

## Make -> Supabase callback 실패 예시
```json
{
  "targetId": "TARGET_UUID",
  "action": "launch",
  "status": "failed",
  "message": "Instagram publish failed",
  "payload": {
    "channel": "instagram",
    "provider": "make",
    "errorCode": "META_UPLOAD_FAILED"
  }
}
```

## n8n 변경 포인트
현재 `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`은 `n8n`이 Meta API를 직접 호출하는 템플릿입니다.  
Make로 넘기려면 아래처럼 바꾸면 됩니다.

1. `prepare` 흐름은 유지
2. `launch`에서 `youtube`는 기존 유지
3. `launch`에서 `facebook` / `instagram` 분기 대신 `Make webhook 호출` 노드 추가
4. Make가 callback을 직접 치도록 구성

즉, `Facebook Page 영상`, `Instagram 릴스 컨테이너`, `Instagram 릴스 게시` 노드를 `Make webhook 호출` 하나로 대체하는 방식입니다.

단, Make 안에서는 완전히 새로 조립하기보다  
이미 복사해둔 기존 블로그 포스팅 시나리오를 아래 방식으로 개조하는 편이 더 안전합니다.

- `Google Sheets`, `Iterator` 제거
- 첫 모듈을 `Custom Webhook`으로 교체
- 기존 `Router` 유지
- 기존 `Sleep` 유지
- 마지막 기록 단계를 `Supabase callback` 호출로 교체

## n8n 환경 변수 권장안
`n8n`에 아래 값을 두면 운영이 편합니다.

- `MAKE_META_WEBHOOK_URL`
- `MAKE_META_WEBHOOK_SECRET`
- `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

`SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`는 Make payload 안 `callback.secret`으로 전달하는 데 재사용하면 됩니다.

## 시작 순서
1. 복사해둔 기존 `Facebook / Instagram 포스팅` Make 시나리오를 엶
2. `Google Sheets`, `Iterator`, 시트 업데이트 단계를 제거
3. 첫 모듈을 `Custom Webhook`으로 교체
4. 기존 `Router`와 각 분기 안의 `Sleep`은 유지
5. 마지막 기록 단계를 `showroom-shorts-publish-callback` 호출로 교체
6. `n8n`에 `MAKE_META_WEBHOOK_URL`, `MAKE_META_WEBHOOK_SECRET` 추가
7. `launch + facebook|instagram`일 때 Make webhook을 치도록 n8n 수정
8. 관리자 화면에서 `facebook` 1건 테스트
9. 성공 후 `instagram` 1건 테스트

바로 쓸 수 있는 자료:
- `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

## 첫 테스트 권장 순서
Instagram보다 Facebook부터 붙이는 것이 좋습니다.

1. Facebook 1건 업로드 성공
2. Facebook callback 확인
3. 관리자 화면에서 `published` 반영 확인
4. Instagram 1건 업로드 성공
5. Instagram callback 확인

## 실무 팁
- Meta는 한쪽만 성공하고 다른 쪽은 실패할 수 있으므로 채널별로 독립 처리합니다.
- `Make` 안에서 재시도하더라도 최종 결과는 반드시 callback으로 남깁니다.
- 앱은 `Make`를 직접 모르고, 기존 채널별 상태 모델만 신뢰하게 두는 것이 운영상 가장 단순합니다.
- 처음에는 `prepare`까지 Make로 보내지 마세요. 복잡도만 올라갑니다.
- 예전에 `게시 완료 전에 다음 액션이 들어가던 문제`가 있었으므로 `Sleep`을 없애지 마세요.
- Meta 인증은 payload 토큰 전달보다 이미 저장된 `Make Credentials`를 쓰는 것이 맞습니다.
