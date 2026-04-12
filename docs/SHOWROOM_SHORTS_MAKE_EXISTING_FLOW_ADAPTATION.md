# 쇼룸 숏츠 Make 기존 프로세스 개조 가이드

## 목적
이미 복사해둔 `블로그 -> Facebook / Instagram 포스팅` Make 시나리오를 버리지 않고,  
`쇼룸 숏츠 launch 전용 Meta 게시 시나리오`로 개조하는 것이 목적입니다.

이 문서는 `처음부터 새 시나리오를 조립하는 방법`보다,  
`이미 검증된 Router + Sleep 패턴을 최대한 유지하면서 개조하는 방법`에 초점을 둡니다.

## 왜 이 방식이 맞나
- 이미 `facebook / instagram` 채널 분기 패턴이 검증돼 있습니다.
- 예전에 실제로 문제였던 `게시 완료 전에 다음 액션이 들어가는 타이밍 오류`를 `Sleep`으로 완화한 경험이 이미 반영돼 있습니다.
- 지금 우선순위는 `예쁜 구조`보다 `성공률`이므로, 성공했던 패턴을 재활용하는 편이 더 안전합니다.

## 기존 프로세스에서 그대로 살릴 것
- `Router`
- `facebook` 분기
- `instagram` 분기
- 각 분기 안의 `Sleep`
- 게시 후 후속 처리라는 전체 흐름

즉, 구조는 유지하고 시작점과 종료점, 그리고 게시 payload만 바꾸는 방식으로 갑니다.

## 기존 프로세스에서 제거할 것
- `Google Sheets > Search Rows`
- `Iterator`
- `Google Sheets > Update a Row`
- 블로그 포스팅 전용 후처리

이 항목들은 지금 구조에서는 필요하지 않습니다.  
이제 데이터는 시트가 아니라 `n8n -> Make Custom Webhook`으로 들어오기 때문입니다.

## 시작점 교체
기존 시작:

```text
Google Sheets -> Iterator -> Router
```

새 시작:

```text
Custom Webhook -> Router
```

즉, 시트 조회와 반복을 지우고 `Webhooks > Custom webhook`을 첫 모듈로 둡니다.

## 인증 방식
이번 구조에서는 `Meta 토큰을 payload로 넘기지 않습니다`.

이유:
- Meta 자격 정보는 이미 `Make Credentials` 안에 있습니다.
- 그러므로 Facebook/Instagram 게시 모듈은 `Make 내부 credential`을 사용해야 합니다.
- `n8n`은 게시 데이터만 넘기고, 인증은 Make 안에서 끝내는 것이 맞습니다.

따라서 webhook payload에는 아래 정도만 있으면 충분합니다.

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
    "url": "https://YOUR_PROJECT.supabase.co/functions/v1/showroom-shorts-publish-callback",
    "secretHeaderName": "x-showroom-shorts-publish-secret",
    "secret": "YOUR_SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET"
  }
}
```

## 분기별 개조 방향
### Facebook 분기
기존:
- `Facebook Pages > Create a Post`
- `Sleep`
- `Facebook Pages > Create a Comment`
- `Google Sheets` 후처리

새 구조:
- `Facebook 게시 모듈` 또는 `Facebook 관련 기존 모듈`
- `Sleep`
- 선택: 상태 확인 또는 `firstComment`
- `HTTP > Make a request`로 `Supabase callback`

핵심:
- `Sleep`은 유지합니다.
- `Google Sheets`는 제거합니다.
- 마지막은 반드시 `showroom-shorts-publish-callback`으로 바꿉니다.

### Instagram 분기
기존:
- `Instagram for Business > Create a photo post`
- `Sleep`
- `Instagram for Business > Create a comment`
- `Google Sheets` 후처리

새 구조:
- `Instagram 게시 1단계`
- `Sleep`
- `Instagram 게시 2단계` 또는 후속 완료 단계
- 필요 시 다시 `Sleep`
- 선택: 상태 확인 또는 `firstComment`
- `HTTP > Make a request`로 `Supabase callback`

핵심:
- Instagram은 Facebook보다 타이밍 이슈가 더 많으므로 `Sleep`을 더 보수적으로 둡니다.
- 예전 문제를 재발시키지 않으려면, 게시 직후 바로 callback 하지 말고 짧은 대기 후 마무리합니다.

## 권장 최종 구조
```text
Custom Webhook
  -> Router
     -> facebook
        -> Facebook 게시
        -> Sleep
        -> optional: first comment or status check
        -> Supabase callback
     -> instagram
        -> Instagram 게시 1단계
        -> Sleep
        -> Instagram 게시 2단계
        -> Sleep
        -> optional: first comment or status check
        -> Supabase callback
     -> fallback
        -> failed callback
```

## fallback 분기
세 번째 분기는 `channel` 값이 잘못 들어왔을 때를 위한 예외 처리입니다.

예:
- `youtube`
- 오타가 있는 값
- 빈 값

이 경우 조용히 멈추지 말고 바로 실패 callback을 보내야 운영이 편합니다.

## callback 모듈 설정
마지막 `HTTP > Make a request` 모듈은 아래 기준으로 통일합니다.

- Method: `POST`
- URL: `{{callback.url}}`
- Header:
  - `Content-Type: application/json`
  - `x-showroom-shorts-publish-secret: {{callback.secret}}`
- Body type: Raw / JSON

성공 예시:

```json
{
  "targetId": "TARGET_UUID",
  "action": "launch",
  "status": "published",
  "message": "published",
  "completedAt": "2026-04-11T12:00:00.000Z",
  "externalPostId": "POST_ID",
  "externalPostUrl": "https://example.com/post",
  "payload": {
    "channel": "instagram",
    "provider": "make",
    "finalVideoUrl": "https://example.com/final.mp4"
  }
}
```

실패 예시:

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

## 실전 작업 순서
1. 복사한 기존 시나리오를 엽니다.
2. `Google Sheets` 시작 모듈과 `Iterator`를 제거합니다.
3. 첫 모듈을 `Custom Webhook`으로 교체합니다.
4. 기존 `Router`는 그대로 둡니다.
5. Facebook 분기에서 `Google Sheets` 후처리를 제거하고 `callback HTTP`로 교체합니다.
6. Instagram 분기에서도 `Google Sheets` 후처리를 제거하고 `callback HTTP`로 교체합니다.
7. 기존 `Sleep`은 유지합니다.
8. Meta 게시 모듈은 이미 연결된 `Make Credentials`를 그대로 사용합니다.
9. `Run once` 후 샘플 payload 1건을 보내 구조를 학습시킵니다.
10. Facebook 1건부터 테스트합니다.
11. 성공 후 Instagram 1건을 테스트합니다.

## 가장 중요한 운영 규칙
- 앱은 `Make`를 직접 모릅니다.
- `n8n`은 계속 게이트 역할만 합니다.
- `prepare`는 `n8n` 유지입니다.
- `launch + facebook|instagram`만 Make로 넘깁니다.
- Meta 인증은 `Make Credentials` 안에서 끝냅니다.
- 타이밍 이슈 방지를 위해 `Sleep`을 없애지 않습니다.
- 최종 상태는 항상 `Supabase callback`으로 다시 모읍니다.

