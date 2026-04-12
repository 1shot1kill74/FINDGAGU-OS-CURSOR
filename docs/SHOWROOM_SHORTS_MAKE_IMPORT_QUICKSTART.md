# 쇼룸 숏츠 Make Import Quickstart

## 먼저 중요한 점
`Make`의 `Scenario Blueprint` JSON은 내부 구조가 민감해서, 실제 Export로 만든 파일이 아니면 Import가 깨질 수 있습니다.  
지금 기준으로 가장 성공률이 높은 방법은 아래 둘 중 하나입니다.

- 이미 복사해둔 기존 `Facebook / Instagram 포스팅` 시나리오를 개조
- `Make`에서 `Custom Webhook` 시나리오를 직접 조립

특히 이미 검증된 `Router + Sleep` 패턴이 있는 기존 시나리오를 개조하는 편이 가장 안전합니다.

## 이 패키지에 포함된 파일
- `docs/SHOWROOM_SHORTS_MAKE_EXISTING_FLOW_ADAPTATION.md`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

## 목표 구조
```text
n8n launch
  -> Make Custom Webhook
  -> Router
     -> facebook 업로드
     -> instagram 업로드
  -> Supabase callback
```

## Make에서 만드는 최소 시나리오
1. `Create a new scenario`
2. 첫 모듈: `Webhooks > Custom webhook`
3. webhook 이름:
   - `Findgagu Showroom Shorts Meta Publish`
4. `Run once`
5. `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json` 내용을 webhook 테스트 body로 전송
6. Make가 payload 구조를 학습하면 Router 추가
7. Router 분기:
   - `channel = facebook`
   - `channel = instagram`
8. 각 분기 안에 기존 운영 패턴대로 `Sleep` 추가
9. 각 분기 끝에서 `HTTP > Make a request`로 Supabase callback 호출

복사해둔 기존 블로그 포스팅 시나리오가 있다면, 처음부터 새로 만들기보다  
`docs/SHOWROOM_SHORTS_MAKE_EXISTING_FLOW_ADAPTATION.md` 기준으로 개조하는 편이 더 안전합니다.

## n8n에서 Make로 보낼 값
처음 버전은 아래 필드만 꼭 맞으면 됩니다.

- `action`
- `targetId`
- `channel`
- `finalVideoUrl`
- `caption`
- `callback.url`
- `callback.secret`

## 추천 매핑
Make webhook이 받는 값 기준:

- `action` -> 반드시 `launch`
- `channel` -> `facebook` 또는 `instagram`
- `finalVideoUrl` -> Meta 업로드 대상 MP4
- `title` -> 로그/디버깅용
- `caption` -> 실제 캡션
- `firstComment` -> 필요시 저장만 하고 1차 버전에선 미사용 가능
- `callback.url` -> `showroom-shorts-publish-callback`
- `callback.secret` -> `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

중요:
- `Meta access token`은 payload로 넘기지 않습니다.
- Meta 인증은 이미 저장된 `Make Credentials`를 사용합니다.

## Router 조건
Facebook 라우트 조건:
```text
channel = facebook
```

Instagram 라우트 조건:
```text
channel = instagram
```

## Facebook 라우트
첫 버전에서는 `이미 연결된 Make Credentials`를 사용하는 기존 Facebook 모듈 패턴을 우선 재사용하세요.

권장 순서:
1. Facebook 게시
2. `Sleep`
3. 필요 시 후속 액션 또는 상태 확인
4. callback

성공 시 callback body는 아래 파일 기준으로 전송:
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`

## Instagram 라우트
Instagram은 타이밍 이슈가 더 많으므로 `Sleep`을 반드시 유지하는 편이 좋습니다.

권장 순서:
1. Instagram 게시 1단계
2. `Sleep`
3. Instagram 게시 2단계 또는 완료 단계
4. 필요 시 다시 `Sleep`
5. callback

성공 시 callback body는 아래 파일 기준:
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`

## 실패 처리
어느 분기든 실패하면 아래 파일 기준으로 callback 호출:
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

## Supabase callback 호출 설정
마지막 `HTTP > Make a request` 모듈:

- Method: `POST`
- URL: webhook payload의 `callback.url`
- Header:
  - `Content-Type: application/json`
  - `x-showroom-shorts-publish-secret: {{callback.secret}}`
- Body type: Raw / JSON

## 첫 테스트 순서
1. Make webhook 생성
2. `Run once`
3. 샘플 input JSON으로 테스트
4. callback이 Supabase에 반영되는지 확인
5. Facebook 라우트부터 1건 연결
6. Instagram 라우트 연결

## 가장 실용적인 운영 원칙
- `YouTube`는 계속 `n8n`이 직접 처리
- `Meta`만 `Make`로 위임
- `prepare`는 `n8n`
- `launch`만 `Make`
- `Meta 인증`은 `Make Credentials` 안에서 끝냄
- `게시 직후 바로 다음 액션으로 가지 않고 Sleep 유지`
- 최종 상태 기록은 항상 `Supabase callback`

## 다음 단계
이 패키지로 Make 시나리오 첫 버전을 만든 뒤, 원하면 그 다음엔 제가 이어서 아래 자료까지 만들어드릴 수 있습니다.

- `n8n -> Make`용 정확한 payload 표현식
- `Make HTTP 모듈`별 필드 매핑표
- `Facebook 우선 / Instagram 후속` 테스트 체크리스트
