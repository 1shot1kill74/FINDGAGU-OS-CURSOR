# 쇼룸 숏츠 n8n -> Make 인수인계

## 목적
- 다음 에이전트가 `YouTube는 기존 n8n 유지`, `Facebook / Instagram은 Make로 위임`하는 구조를 바로 이어서 구현할 수 있도록 현재 상태와 다음 액션을 정리한다.

## 핵심 결론
- 앱과 Supabase 쪽은 이미 `prepare / launch / callback` 구조가 준비되어 있다.
- 따라서 새 에이전트의 핵심 작업은 앱을 크게 고치는 것이 아니라, `n8n launch -> Make webhook -> Supabase callback` 흐름을 완성하는 것이다.
- 1차 범위는 `launch + facebook|instagram`만 Make로 넘기고, `prepare`는 계속 n8n이 담당하게 두는 것이 맞다.

## 왜 이 방향으로 정리했는가
- 현재 `YouTube` 업로드는 이미 `n8n` 중심으로 동작 중이다.
- 앱은 채널별 타깃과 상태를 이미 관리하고 있다.
- `Facebook / Instagram`만 Make로 분리하면 앱 수정이 최소화된다.
- `prepare`까지 Make로 넘기면 복잡도만 올라가므로, 첫 단계에서는 `launch`만 Make로 넘기는 것이 합리적이다.

## 현재 코드 / 데이터 상태

### 앱 / 데이터 모델
- `src/lib/showroomShorts.ts`
  - 채널 목록: `youtube`, `facebook`, `instagram`
  - 채널별 `publish_status` 관리
  - `requestShowroomShortsPublishPrepare()`
  - `requestShowroomShortsPublishLaunch()`
- `src/pages/admin/ShowroomShortsPage.tsx`
  - 채널별 `업로드 준비 요청`
  - 채널별 `론칭 승인`
  - 준비 패키지 확인 UI
  - 수동 게시 완료 / 실패 처리 UI
- `showroom_shorts_targets`
  - `channel`
  - `publish_status`
  - `external_post_id`
  - `external_post_url`
  - `published_at`
  - `preparation_payload`
  - `preparation_error`

### Supabase 함수
- `supabase/functions/showroom-shorts-publish-dispatch/index.ts`
  - 프론트에서 `prepare` / `launch` 요청 수신
  - 외부 webhook으로 payload 전달
  - webhook 즉시 응답이나 callback 결과를 DB에 반영
- `supabase/functions/showroom-shorts-publish-callback/index.ts`
  - 외부 시스템의 게시 성공/실패 결과를 최종 저장

### 기존 n8n 자료
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
  - 현재는 `n8n`이 Meta Graph API를 직접 치는 구조
  - `youtube / facebook / instagram` 분기 포함
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`
  - dispatch <-> callback 계약 문서
- `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`
  - 전체 퍼블리싱 설정 가이드
- `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`
  - n8n import 빠른 시작 문서

## 이번 대화에서 추가된 문서
- `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md`
  - `n8n -> Make -> callback` 권장 구조 정리
- `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md`
  - Make에서 직접 시나리오를 빠르게 조립하는 가이드
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
  - Make webhook 테스트용 샘플 입력
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
  - Facebook 성공 callback 예시
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
  - Instagram 성공 callback 예시
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`
  - 실패 callback 예시

## Make 관련 실제 진행 상황
- 사용자는 Cursor 내부 브라우저에서 Make 로그인까지 완료했다.
- Make 조직 대시보드와 새 시나리오 편집기 진입까지 확인했다.
- 그러나 `Make`의 모듈 선택 UI가 현재 브라우저 자동화와 잘 맞지 않아, `Custom Webhook` 모듈을 안정적으로 자동 선택하는 데 실패했다.
- 중간에 잘못 들어간 모듈은 `Make - List webhooks`였다.
- 결론:
  - `Make` 시나리오 생성 자체가 막힌 것은 아니다.
  - 다만 이 세션에서는 완전 자동 조작보다, 사용자가 직접 webhook 시나리오를 만들 수 있도록 문서/JSON 자료를 넘기는 편이 더 효율적이라고 판단했다.

## 추천 목표 구조
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
     -> showroom-shorts-publish-callback 호출
```

## 1차 구현 범위
- `prepare`는 전 채널 공통으로 n8n 유지
- `launch + youtube`는 기존 n8n 유지
- `launch + facebook`
  - n8n이 Make webhook 호출
  - Make가 Facebook 업로드
  - Make가 callback 호출
- `launch + instagram`
  - n8n이 Make webhook 호출
  - Make가 Instagram 업로드
  - Make가 callback 호출

## n8n -> Make 최소 payload
다음 에이전트는 아래 payload 기준으로 n8n 노드를 만들면 된다.

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
- `action`은 반드시 `launch`
- `channel`은 `facebook` 또는 `instagram`
- `caption`은 `publishPackage.caption` 우선
- `targetId`는 callback에 그대로 재사용

## Make -> Supabase callback 형식

### 성공
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

### 실패
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

## 다음 에이전트가 바로 해야 할 일

### 우선순위 1
- `Make`에서 `Custom Webhook` 시나리오 생성
- 이름 예시:
  - `Findgagu Showroom Shorts Meta Publish`
- webhook URL 확보

### 우선순위 2
- n8n에 다음 환경 변수 추가
  - `MAKE_META_WEBHOOK_URL`
  - `MAKE_META_WEBHOOK_SECRET`
  - `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

### 우선순위 3
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`를 수정하거나 복제
- 아래 노드들을 Make 호출 노드로 교체
  - `Facebook Page 영상`
  - `Instagram 릴스 컨테이너`
  - `Instagram 릴스 게시`

### 우선순위 4
- Make 시나리오에서 Router 구성
  - `channel = facebook`
  - `channel = instagram`
- 각 분기에서 업로드 후 callback 호출

### 우선순위 5
- Facebook 1건 먼저 테스트
- callback 반영 확인
- 그 다음 Instagram 1건 테스트

## 추천 테스트 순서
1. Make webhook 생성
2. `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`으로 webhook 테스트
3. callback이 `showroom-shorts-publish-callback`에 정상 반영되는지 확인
4. Facebook 분기 실제 업로드
5. 관리자 화면에서 `published` 반영 확인
6. Instagram 분기 실제 업로드

## 막힌 지점 / 주의사항
- 이 인수인계는 `Meta Developer / Graph API Explorer` 자격 문제를 해결한 문서가 아니다.
- 기존 `Meta Explorer` 관련 막힘은 별도 문서 `docs/AGENT_HANDOFF__SHOWROOM_SHORTS_META_PUBLISHING.md`에 정리되어 있다.
- 즉, 다음 에이전트는 아래 두 가지를 분리해서 봐야 한다.
  - `Make 핸드오프 / n8n 구조 작업`
  - `Meta 토큰 / 권한 / 자격 정보 확보 작업`
- `Make blueprint JSON`은 임의 생성 시 깨질 위험이 높아서, 이번에는 완성 blueprint 대신 `직접 조립용 가이드 + 테스트 JSON` 묶음으로 남겼다.

## 꼭 먼저 읽을 파일
- `docs/AGENT_HANDOFF__SHOWROOM_SHORTS_META_PUBLISHING.md`
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`
- `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md`
- `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`

## 인수인계 한 줄 요약
- 앱과 Supabase는 이미 준비되어 있고, 다음 에이전트의 핵심 임무는 `n8n launch를 Make webhook으로 넘기고, Make가 Meta 게시 후 Supabase callback을 치는 구조`를 완성하는 것이다.
# 쇼룸 숏츠 n8n -> Make 인수인계

## 목적
- 다른 에이전트가 현재 진행 중인 `YouTube는 n8n 유지 / Facebook·Instagram은 Make로 위임` 작업을 바로 이어받을 수 있도록 현재 상태, 의사결정, 다음 액션을 정리한다.

## 인수인계 한 줄 요약
- 앱과 Supabase는 이미 `채널별 prepare / launch / callback` 구조를 갖추고 있다.
- 지금 필요한 일은 `n8n이 Meta launch를 Make webhook으로 넘기고`, `Make가 Meta 업로드 후 Supabase callback을 호출`하게 만드는 것이다.
- `Make` UI 자동화로 끝까지 밀기는 불안정했으므로, 사용자가 직접 `Custom Webhook` 시나리오를 만들 수 있도록 실전용 자료를 새로 정리해두었다.

## 현재 전체 상태
- `YouTube`는 기존 `앱 -> Supabase dispatch -> n8n -> YouTube API` 흐름이 존재한다.
- 앱/DB/Supabase 함수는 이미 `facebook`, `instagram`, `youtube` 채널별 타깃을 관리할 수 있다.
- `prepare`와 `launch`는 `showroom-shorts-publish-dispatch` / `showroom-shorts-publish-callback`으로 분리되어 있다.
- 기존 `n8n V3 Meta` 템플릿은 `n8n`이 직접 Meta Graph API를 호출하도록 작성돼 있다.
- 사용자와 논의 끝에 구조를 바꿔 `n8n은 준비와 라우팅`, `Make는 Meta 업로드 실행` 역할로 나누기로 정리했다.

## 왜 방향을 바꿨나
- 사용자는 현재 앱에서 `영상 합성 후 n8n으로 YouTube 업로드`하는 흐름을 이미 운영 중이다.
- 새 요구는 `Instagram / Facebook은 Make AI를 이용해서 업로드`하는 것이다.
- 앱이 직접 Meta를 호출하게 만들기보다, 현재 운영 중인 `n8n`을 게이트로 두고 `Meta launch만 Make로 위임`하는 편이 변경 범위가 작고 운영이 단순하다.

권장 구조:
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
     -> showroom-shorts-publish-callback 호출
```

## 이미 존재하는 핵심 구현

### 1. 앱/프론트
- `src/pages/admin/ShowroomShortsPage.tsx`
  - 채널별 `업로드 준비 요청`
  - 채널별 `론칭 승인`
  - 준비 패키지 확인
  - 수동 게시 완료 / 실패 처리

### 2. 프론트 서비스
- `src/lib/showroomShorts.ts`
  - `requestShowroomShortsPublishPrepare()`
  - `requestShowroomShortsPublishLaunch()`
  - `buildShowroomShortsPublishPackage()`
  - `facebook`, `instagram`, `youtube` 채널 타입과 상태 관리

### 3. Supabase Edge Functions
- `supabase/functions/showroom-shorts-publish-dispatch/index.ts`
  - 프론트에서 `targetId`, `action`을 받아 외부 webhook으로 디스패치
  - `prepare / launch` 구분
  - `publishPackage` 조립
  - callback URL/secret 포함
- `supabase/functions/showroom-shorts-publish-callback/index.ts`
  - 외부 시스템 결과를 받아 `published`, `failed`, `launch_ready` 등 상태 반영

### 4. 데이터모델
- `showroom_shorts_targets`
  - `channel`
  - `publish_status`
  - `external_post_id`
  - `external_post_url`
  - `published_at`
  - `preparation_payload`
  - `preparation_error`

즉, 앱/DB/콜백 기반은 이미 준비돼 있다.  
지금 필요한 것은 `외부 실행자`만 `n8n direct Meta`에서 `Make`로 바꾸는 일이다.

## 기존 n8n 자료
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
  - `youtube / facebook / instagram` 분기
  - 현재는 `facebook`과 `instagram`을 직접 Graph API로 호출
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`
  - `dispatch -> n8n -> callback` 계약
- `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`
- `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`

## 이번 대화에서 새로 정리한 문서 / 파일

### 1. Make 핸드오프 구조 문서
- `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md`
- 핵심 내용:
  - `prepare`는 n8n 유지
  - `launch + youtube`는 기존 유지
  - `launch + facebook|instagram`만 Make webhook 호출
  - Make 성공/실패는 Supabase callback으로 회수

### 2. Make 퀵스타트 문서
- `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md`
- 핵심 내용:
  - Make에서 `Custom Webhook` 시나리오를 직접 빠르게 조립하는 순서
  - Router 분기 기준
  - callback HTTP 요청 설정

### 3. Make 테스트용 JSON 샘플
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

주의:
- 이 파일들은 `Make blueprint import`용 완성 블루프린트가 아니다.
- 이유는 Make blueprint JSON은 실제 export 기반이 아니면 import가 깨질 가능성이 높기 때문이다.
- 대신 이 파일들은 `Make 시나리오를 직접 만들 때 그대로 붙여 넣어 테스트할 수 있는 payload / callback 샘플`이다.

## Make 자동화 시도 결과
- 사용자 Make 계정 로그인까지는 브라우저 자동화로 확인했다.
- `Make` 조직 대시보드와 새 시나리오 편집기 진입도 확인했다.
- 하지만 `Custom Webhook` 모듈 선택 UI는 접근성/자동화 궁합이 좋지 않아, 정확한 모듈 선택이 여러 번 빗나갔다.
- 실제로 자동화 중 `Make > List webhooks` 모듈이 잘못 선택된 사례가 있었다.
- 결론:
  - 다른 에이전트가 브라우저 자동화로 끝까지 밀려면 많은 재시도가 필요하다.
  - 더 현실적인 방법은 사용자가 Make에서 `Custom Webhook` 시나리오를 직접 1회 만들고, 이후 에이전트가 `payload`, `HTTP callback`, `n8n 연결`을 정리하는 방식이다.

## 다음 에이전트가 해야 할 일

### 우선순위 1: 사용자가 Make에서 Custom Webhook URL 확보
목표:
- Make에 `Findgagu Showroom Shorts Meta Publish` 시나리오 생성
- 첫 모듈: `Webhooks > Custom webhook`
- webhook URL 확보

여기까지 되면 `n8n -> Make` 연결이 바로 가능하다.

### 우선순위 2: n8n에서 launch 경로만 Make로 위임
수정 대상:
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`

변경 원칙:
1. `prepare` 흐름 유지
2. `launch`에서 `youtube`는 유지
3. `facebook`, `instagram`은 직접 Graph API 호출 대신 `Make webhook 호출` 노드로 대체
4. callback은 Make가 직접 수행

실제로 대체할 노드:
- `Facebook Page 영상`
- `Instagram 릴스 컨테이너`
- `Instagram 릴스 게시`

이 세 노드를 `Make webhook 호출`로 치환하는 방향이다.

### 우선순위 3: n8n -> Make payload 확정
초기 payload는 아래 필드만 있으면 충분하다.

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
- `action`은 1차 버전에서 `launch`만 Make로 전달
- `channel`은 `facebook` 또는 `instagram`
- `caption`은 `publishPackage.caption` 우선
- `targetId`는 callback에 그대로 되돌려보냄

### 우선순위 4: Make -> Supabase callback 연결
성공 시:
- `published`
- `externalPostId`
- `externalPostUrl`

실패 시:
- `failed`
- `message`

callback 형식은 `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`와 아래 샘플 파일을 따를 것:
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`

### 우선순위 5: Facebook 먼저, Instagram 나중
첫 실전 테스트는 아래 순서를 권장한다.

1. Facebook 1건 업로드
2. callback 반영 확인
3. 관리자 화면에서 `published` 확인
4. Instagram 1건 업로드
5. callback 반영 확인

이유:
- Instagram Reels는 보통 컨테이너 생성/게시 2단계라 Facebook보다 실패 포인트가 많다.

## 환경 변수 / 시크릿 권장안

### n8n
- `MAKE_META_WEBHOOK_URL`
- `MAKE_META_WEBHOOK_SECRET`
- `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

### Supabase
- 기존 `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET` 사용
- `SHOWROOM_SHORTS_PUBLISH_WEBHOOK_URL`은 지금 구조상 여전히 n8n 게이트를 향하도록 유지 가능

## 작업 원칙
- 앱은 `Make`를 몰라야 한다.
- 앱은 계속 `dispatch`만 호출한다.
- `n8n`은 준비와 라우팅만 담당한다.
- `Make`는 Meta 업로드 실행기 역할만 맡는다.
- 최종 상태 저장은 항상 `showroom-shorts-publish-callback`으로 다시 모은다.
- 처음부터 `prepare`까지 Make로 보내지 말 것. 복잡도만 커진다.

## 주의사항
- `YouTube` 경로는 건드리지 않는 것이 우선이다.
- Meta는 한 채널만 성공하고 다른 채널은 실패할 수 있으므로 채널별 독립 상태를 유지해야 한다.
- Make blueprint JSON을 임의 생성해서 import하려고 하지 말 것. 실제 export 기반이 아니면 깨질 가능성이 높다.
- 사용자가 이미 `Make` 계정 로그인까지는 해준 상태였고, 수동 조작도 가능한 상황이다.

## 다음 에이전트를 위한 가장 빠른 실행 순서
1. `docs/AGENT_HANDOFF__SHOWROOM_SHORTS_META_PUBLISHING.md` 읽기
2. `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md` 읽기
3. `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md` 읽기
4. 사용자가 Make에서 `Custom Webhook` URL을 확보하게 돕기
5. `n8n V3 Meta` 템플릿에서 Meta direct API 노드를 `Make webhook 호출`로 바꾸기
6. Facebook 1건 테스트
7. Instagram 1건 테스트

## 관련 파일 목록
- `src/lib/showroomShorts.ts`
- `src/pages/admin/ShowroomShortsPage.tsx`
- `supabase/functions/showroom-shorts-publish-dispatch/index.ts`
- `supabase/functions/showroom-shorts-publish-callback/index.ts`
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`
- `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`
- `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md`
- `docs/SHOWROOM_SHORTS_MAKE_IMPORT_QUICKSTART.md`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_SAMPLE_INPUT.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_FACEBOOK.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_SUCCESS_INSTAGRAM.json`
- `docs/IMPORT_THIS__MAKE__SHOWROOM_SHORTS_META_CALLBACK_FAILURE.json`
