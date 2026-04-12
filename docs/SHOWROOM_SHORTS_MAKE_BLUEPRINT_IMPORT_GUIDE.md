# 쇼룸 숏츠 Make Blueprint Import Guide

## 포함 파일
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_PUBLISH_BLUEPRINT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

## 이 블루프린트가 하는 일
이 블루프린트는 아래 흐름을 한 번에 임포트하기 위한 초안입니다.

```text
Custom Webhook
  -> Router
     -> facebook: Graph API 업로드 -> Supabase callback
     -> instagram: 컨테이너 생성 -> 게시 -> Supabase callback
     -> unsupported channel: failed callback
```

`YouTube`는 포함하지 않습니다.  
이 블루프린트는 `launch + facebook|instagram` 전용입니다.

## 먼저 알아둘 점
현재 기준으로 가장 추천하는 경로는 이 blueprint를 계속 억지로 맞추는 것이 아니라,  
이미 복사해둔 기존 `Facebook / Instagram 포스팅` 시나리오를 개조하는 것입니다.

이 JSON은 참고용 초안으로 두고, 실전 작업은 아래 문서를 우선 보세요.

- `docs/SHOWROOM_SHORTS_MAKE_EXISTING_FLOW_ADAPTATION.md`

그래도 이 파일을 계속 쓸 경우 import 후 아래 3가지는 거의 반드시 다시 확인해야 합니다.

- 첫 모듈의 `Webhook` 선택
- `HTTP` 모듈이 `Module Not Found` 없이 정상 표시되는지 확인
- 각 HTTP 모듈의 Meta 인증/계정 값

현재 블루프린트의 HTTP 단계는 `legacy HTTP(ActionSendData)` 기준으로 맞춰져 있습니다.  
즉, `완전 무수정 즉시 운영`보다는 `구조 참고용 또는 임시 import용`으로 보시면 됩니다.

## Import 순서
1. Make에서 새 시나리오 생성 화면으로 들어갑니다.
2. 하단 메뉴에서 `Import blueprint`를 선택합니다.
3. `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_PUBLISH_BLUEPRINT.json`를 업로드합니다.
4. import 직후 `Webhook`, `Router`, `HTTP` 모듈이 모두 캔버스에 보이는지 먼저 확인합니다.
5. 첫 모듈 `Custom webhook`을 열고 새 webhook을 다시 선택하거나 새로 만듭니다.
6. 시나리오 이름을 `Findgagu Showroom Shorts Meta Publish`로 저장합니다.

## n8n 또는 호출 측 payload
이 가이드 아래 payload 예시는 이전 초안 기준입니다.  
현재 권장 운영 방식은 `Meta 인증을 payload로 넘기지 않고 Make Credentials 안에서 처리`하는 것입니다.

즉, 실전에서는 아래 `meta` 블록 없이 시작하는 편이 맞습니다.

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
  "meta": {
    "facebookPageId": "YOUR_FACEBOOK_PAGE_ID",
    "facebookAccessToken": "YOUR_FACEBOOK_PAGE_ACCESS_TOKEN",
    "instagramBusinessAccountId": "YOUR_IG_BUSINESS_ACCOUNT_ID",
    "instagramAccessToken": "YOUR_INSTAGRAM_ACCESS_TOKEN"
  },
  "callback": {
    "url": "https://YOUR_PROJECT.supabase.co/functions/v1/showroom-shorts-publish-callback",
    "secretHeaderName": "x-showroom-shorts-publish-secret",
    "secret": "YOUR_SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET"
  }
}
```

## 모듈별 확인 포인트
Facebook 업로드 모듈:
- URL: `https://graph.facebook.com/v23.0/{{facebookPageId}}/video_reels`
- 토큰: `meta.facebookAccessToken`
- 본문: `video_url`, `description`

Instagram 컨테이너 생성 모듈:
- URL: `https://graph.facebook.com/v23.0/{{instagramBusinessAccountId}}/media`
- 토큰: `meta.instagramAccessToken`
- 본문: `media_type=REELS`, `video_url`, `caption`

Instagram 게시 모듈:
- URL: `https://graph.facebook.com/v23.0/{{instagramBusinessAccountId}}/media_publish`
- 본문: `creation_id`

Supabase callback 모듈:
- URL: `callback.url`
- 헤더명: `callback.secretHeaderName`
- 헤더값: `callback.secret`

## 실패 callback 권장 설정
이 블루프린트는 `unsupported channel`에 대한 실패 callback은 이미 포함합니다.  
Meta API 자체 실패까지 엄격하게 처리하려면 Make에서 아래 3개 HTTP 모듈에 각각 `Error handler`를 붙이세요.

- Facebook 업로드 모듈
- Instagram 컨테이너 생성 모듈
- Instagram 게시 모듈

각 에러 핸들러의 마지막 HTTP callback 본문은 아래 형식을 쓰면 됩니다.

```json
{
  "targetId": "{{1.targetId}}",
  "action": "launch",
  "status": "failed",
  "message": "{{error.message}}",
  "payload": {
    "channel": "{{1.channel}}",
    "provider": "make",
    "errorCode": "{{ifempty(error.type; \"META_UPLOAD_FAILED\")}}"
  }
}
```

## 첫 테스트 순서
1. `Run once`
2. `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`를 기반으로 payload를 준비하되 `meta.*`와 `callback.*`를 실제 값으로 바꿉니다.
3. Facebook payload 1건부터 webhook으로 전송합니다.
4. callback이 `showroom-shorts-publish-callback`에 반영되는지 확인합니다.
5. 관리자 화면에서 `published` 반영을 확인합니다.
6. 그 다음 Instagram payload 1건을 테스트합니다.

## 운영 원칙
- 앱은 계속 `dispatch`만 호출합니다.
- `prepare`는 계속 `n8n`이 처리합니다.
- `launch + facebook|instagram`만 Make로 넘깁니다.
- 최종 상태 저장은 항상 `showroom-shorts-publish-callback`으로 다시 모읍니다.

