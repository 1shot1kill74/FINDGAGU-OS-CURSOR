# 쇼룸 숏츠 Meta 퍼블리싱 인수인계

## 목적
- 다른 에이전트가 현재 진행 중인 `Facebook / Instagram Reels` 연동 작업을 바로 이어받을 수 있도록, 현재 상태와 다음 액션을 정리한다.

## 현재 전체 상태
- YouTube 업로드 플로우는 실제 업로드까지 한 차례 검증됨.
- YouTube 업로드 메타데이터는 최근 수정으로 `preparation_payload` 우선 로직이 반영되도록 보정됨.
- Facebook / Instagram은 코드/문서/워크플로 템플릿까지 준비되었고, 실제 Meta 자격 정보 확보 및 테스트만 남은 상태.
- 사용자는 지금 이 작업을 다른 에이전트에게 넘기려는 상황이다.

## 최근에 반영된 코드 / 문서

### 1. 실제 업로드 메타데이터 우선순위 보정
- 파일: `src/lib/showroomShorts.ts`
- 파일: `supabase/functions/showroom-shorts-publish-dispatch/index.ts`
- 변경 요지:
  - `preparation_payload`에 수정된 제목/설명/해시태그가 있으면 실제 launch 시 그 값을 우선 사용하도록 수정.
  - 준비 패키지 수동 수정 시 `description`, `hashtagsText`도 함께 저장되도록 보강.
- 상태:
  - `showroom-shorts-publish-dispatch`는 재배포 완료.

### 2. 설명란 문구 개선
- 파일: `src/lib/showroomShorts.ts`
- 변경 요지:
  - 쇼룸 숏츠 설명란을 단순 문구에서 B2B/브랜드형 문구로 개선.

### 3. n8n Meta 통합용 템플릿 추가
- 파일: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- 요지:
  - `channel` 값으로 `youtube / facebook / instagram` 분기.
  - `facebook`은 Graph API `/{PAGE_ID}/videos`
  - `instagram`은 `/{IG_USER_ID}/media -> media_publish`
  - 공통 callback은 기존 `showroom-shorts-publish-callback`으로 연결.

### 4. 문서 업데이트
- 파일: `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`
- 파일: `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`
- 요지:
  - `V3 Meta` 템플릿 추가 사실과 Meta용 환경 변수/진행 순서 반영.

## 현재 데이터 모델 상태
- 게시 결과는 채널별로 저장됨.
- 테이블: `showroom_shorts_targets`
- 채널별 저장 필드:
  - `channel`
  - `publish_status`
  - `external_post_id`
  - `external_post_url`
  - `published_at`
  - `preparation_payload`
  - `preparation_error`
- 즉, 대시보드에서 "어디에 뭐가 올라갔는지"는 현재 구조로 확인 가능.
- 아직 채널별 조회수/도달/CTR 같은 성과 지표 저장은 설계되지 않음.

## Meta 자격 정보 관련 현재 파악 내용

### 사용자/자산 구조
- 개인 Facebook 계정: `박정희`
- 해당 계정의 로그인 식별 메일로 보이는 값: `findgagu@gmail.com`
- Facebook 페이지: `파인드가구`
- Instagram 비즈니스 계정: `파인드가구`
- 모바일 Meta Business Suite에서 페이지와 인스타 연결은 확인됨.
- 결론:
  - 실제 페이지/인스타 자산 관리자 계정은 `박정희`로 보는 것이 맞다.
  - 다른 Facebook 계정은 해당 페이지 관리자 권한이 없다고 사용자 확인 완료.

### Meta 연락처 정보
- 사용자가 모바일 계정 센터에서 확인한 연락처 정보 목록:
  - `admin@findgagu.com`
  - `findgagu@gmail.com`
  - `+821034693602`
  - `+821096657981`
  - `findgagu2@naver.com`
- 단, 어떤 연락처가 개발자 등록 검증에 실제 사용되는지는 아직 확정되지 않음.

### Meta Developer / Explorer 상태
- 브라우저로 `https://developers.facebook.com/apps/` 진입 시:
  - 앱 목록 화면에서 기존 앱 확인됨.
  - 앱 이름: `Findgagu SNS Auto`
  - 즉, Meta 앱 자체는 이미 존재함.
- 브라우저로 `https://developers.facebook.com/tools/explorer/` 진입 시:
  - `Register as a Facebook Developer to get started` 팝업이 뜸.
- 해석:
  - 앱은 보이지만, 현재 세션/계정 기준으로 Graph API Explorer 사용을 위한 개발자 등록/확인 절차가 완전히 끝나지 않았을 수 있음.
  - 이 상태를 실제로 뚫어야 `PAGE_ID`, `PAGE_ACCESS_TOKEN`, `IG_USER_ID` 확보 가능.

### 비즈니스 인증 상태
- 스크린샷상 `비즈니스 인증 안 됨` 상태.
- 하지만 현재 판단:
  - 지금 막힌 핵심은 비즈니스 인증보다는 `Graph API Explorer` 사용 가능 상태 확보.
  - 비즈니스 인증은 나중에 App Review/Advanced Access/운영 안정화 단계에서 중요해질 가능성이 높음.

## 중요 의사결정 / 운영 원칙

### 1. Meta 작업 주체 계정
- 다른 계정은 페이지 권한이 없으므로 사용하지 않는다.
- 개발자 등록 / 토큰 발급 / Explorer 확인은 `박정희` 계정 기준으로 끝내야 한다.

### 2. YouTube 운영 원칙
- YouTube는 일단 여기까지 정리되었고, 지금은 Meta 연동이 우선.
- 설명란은 중요하지만 숏츠 특성상 1순위는 영상/훅/완주율.
- 그래도 브랜드형/B2B 운영을 위해 짧고 정확한 설명란 유지.

### 3. 쇼츠/콘텐츠 운영 논의 맥락
- Before/After 숏츠는 메인 유입 엔진으로 유지.
- 블로그 기반 자동 영상은 보조 포맷으로 활용 가능.
- 2D 봉캐릭터 자동화는 팁/설명형 숏츠의 일부 템플릿으로 활용하는 방향이 합리적이라는 논의가 있었음.
- 이 논의는 구현 작업으로 이어지진 않았고, 현재는 Meta 퍼블리싱이 우선.

## 다음 에이전트가 바로 해야 할 일

### 우선순위 1: Graph API Explorer 사용 가능 상태 확보
- 목표:
  - `박정희` 계정으로 `Graph API Explorer`에 들어갔을 때 더 이상 `Register as a Facebook Developer` 팝업이 뜨지 않게 만들기.
- 현재 문제:
  - 사용자가 말하기로는 전화 인증은 안 되고, 신용카드 추가를 누르면 다른 Facebook 계정으로 연결된다고 함.
  - 그러나 그 다른 계정은 페이지 권한이 없다고 확인됨.
- 따라서:
  - `박정희` 계정으로 등록/검증을 끝내는 방향만 유효함.

### 우선순위 2: Meta 자격 정보 획득
- 최종적으로 필요한 값:
  - `META_PAGE_ID`
  - `META_PAGE_ACCESS_TOKEN`
  - `META_IG_USER_ID`
  - `META_IG_ACCESS_TOKEN`
- 권장 획득 순서:
  1. `Graph API Explorer` 진입
  2. 권한 추가
     - `pages_show_list`
     - `pages_manage_posts`
     - `pages_read_engagement`
     - `instagram_basic`
     - `instagram_content_publish`
  3. `GET /me/accounts`
     - 여기서 `PAGE_ID`, `PAGE_ACCESS_TOKEN`
  4. `GET /{PAGE_ID}?fields=instagram_business_account{id,username}`
     - 여기서 `IG_USER_ID`
  5. 초기 테스트에서는 `META_IG_ACCESS_TOKEN`도 일단 페이지 토큰과 동일하게 사용해볼 수 있음.

### 우선순위 3: n8n 실제 연결
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json` 임포트
- `입력 정규화` 노드의 `callbackSecret` 문자열을 실제 시크릿으로 교체
- n8n 환경 변수 세팅:
  - `META_PAGE_ID`
  - `META_PAGE_ACCESS_TOKEN`
  - `META_IG_USER_ID`
  - `META_IG_ACCESS_TOKEN`
- Facebook 1건 테스트
- Instagram 1건 테스트

## n8n / Supabase 관련 참고

### Supabase Secrets
- 이미 프로젝트에 관련 secrets 다수가 존재함.
- `showroom-shorts-publish-dispatch` / `showroom-shorts-publish-callback`는 배포됨.
- callback secret은 이미 운영 중인 값이 있음.

### 중요 파일
- `supabase/functions/showroom-shorts-publish-dispatch/index.ts`
- `supabase/functions/showroom-shorts-publish-callback/index.ts`
- `src/lib/showroomShorts.ts`
- `src/pages/admin/ShowroomShortsPage.tsx`
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`
- `docs/SHOWROOM_SHORTS_PUBLISH_SETUP.md`
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`

## 브라우저에서 확인한 사실
- `developers.facebook.com/apps/` 에서 앱 목록 접근 가능.
- `Findgagu SNS Auto` 앱 존재 확인.
- `developers.facebook.com/tools/explorer/` 에서는 여전히 개발자 등록 팝업 발생.
- 즉, 다음 에이전트는 이 브라우저 흐름을 이어서 확인하면 됨.

## 주의사항
- 다른 Facebook 계정으로 개발자 등록/토큰 발급 우회하지 말 것.
- 그 계정은 현재 페이지 권한이 없다고 사용자 확인 완료.
- Meta 쪽은 세션이 자주 꼬일 수 있으므로, 계정 전환 상태를 항상 먼저 확인할 것.
- 비즈니스 인증은 나중 문제일 수 있으나, 지금 당장 Explorer 막힘 원인으로 단정하지 말 것.

## 사용자에게 이미 설명된 포인트
- 게시 결과(어디에 올라갔는지)는 채널별로 저장된다.
- 조회수/도달 같은 피드백 지표는 아직 설계되지 않았다.
- 첫 댓글은 직접 달아도 무방하다.
- 프로필의 오픈쇼룸 링크를 참고하라는 CTA는 가능하되, 댓글 외부링크 남발은 피하는 것이 좋다.

## 인수인계 한 줄 요약
- `박정희` 계정이 실관리자이고, Meta 앱은 이미 있으나 `Graph API Explorer`는 아직 막혀 있다.
- 다음 에이전트의 핵심 임무는 `박정희` 계정으로 Explorer를 열고 `PAGE_ID / PAGE_ACCESS_TOKEN / IG_USER_ID`를 확보한 뒤, `V3_META` 워크플로를 실제 테스트하는 것이다.
