# 쇼룸 숏츠 n8n Import Quickstart

## 1. Import 할 파일
- 최소 게이트 검증용: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE.json`
- YouTube 실제 업로드용: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V2_YOUTUBE.json`
- YouTube + Facebook + Instagram용: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- YouTube + Make Meta 위임용: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V4_MAKE.json`

## 2. n8n에서 바로 할 일
1. `Create workflow` 또는 새 워크플로우 화면으로 이동
2. 우측 상단 `More actions`
3. `Import from file...`
4. 사용할 파일을 선택
5. 워크플로우 이름을 확인하고 저장
6. 워크플로우를 `Publish`

## 3. Import 후 확인할 값
- 워크플로우 이름: `Findgagu Showroom Shorts Publish Gate`
- Webhook path: `findgagu-showroom-shorts-publish`
- 예상 webhook URL:
  `https://findgagu.app.n8n.cloud/webhook/findgagu-showroom-shorts-publish`

## 4. n8n 환경 변수
공통:

- `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`

Meta를 n8n이 직접 처리하는 `V3 Meta` 사용 시 추가:

- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`
- `META_IG_USER_ID`
- `META_IG_ACCESS_TOKEN`

Meta를 `Make`로 위임하는 `V4 Make` 사용 시 추가:

- `MAKE_META_WEBHOOK_URL`
- `MAKE_META_WEBHOOK_SECRET`

`SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`는 Supabase의 `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET`와 같아야 합니다.

## 5. Supabase live secrets
실제 연결 시 아래 값들이 필요합니다.

```bash
npx supabase secrets set \
  SHOWROOM_SHORTS_PUBLISH_WEBHOOK_URL="https://findgagu.app.n8n.cloud/webhook/findgagu-showroom-shorts-publish" \
  SHOWROOM_SHORTS_PUBLISH_WEBHOOK_SECRET="YOUR_N8N_SHARED_SECRET" \
  SHOWROOM_SHORTS_PUBLISH_MODE="live" \
  SHOWROOM_SHORTS_PUBLISH_CALLBACK_URL="https://sxxnshvidfwuemgbyuqz.supabase.co/functions/v1/showroom-shorts-publish-callback" \
  SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET="YOUR_CALLBACK_SECRET"
```

## 6. 템플릿별 동작 범위
- `Gate`: `prepare`/`launch` 모두 mock 게시 결과만 반환
- `V2 YouTube`: YouTube 실제 업로드 + callback
- `V3 Meta`: YouTube / Facebook / Instagram 채널 분기 + callback
- `V4 Make`: YouTube는 n8n 직접 업로드, Facebook / Instagram은 Make webhook 위임 + callback

운영 권장:
- `YouTube`는 `V2` 또는 `V3`의 YouTube 경로 유지
- `Facebook / Instagram`은 `V4 Make` 사용 권장
- 구조 설명과 payload 예시는 `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md` 참고

공통으로 `prepare`에서는 제목/설명/체크리스트를 만들고 `launch_ready` callback을 전송합니다.

## 7. 템플릿별 바로 확인할 값
### V3 Meta 사용 시
- `입력 정규화` 노드의 `callbackSecret` 자리를 실제 시크릿 값으로 치환
- YouTube credential 연결
- Facebook/Instagram용 Meta 토큰 환경 변수 입력
- Instagram은 `media` -> `media_publish` 흐름이라 토큰 권한과 비즈니스 계정 연결 상태를 먼저 확인

### V4 Make 사용 시
- `MAKE_META_WEBHOOK_URL`에 Make Custom Webhook 주소 입력
- `MAKE_META_WEBHOOK_SECRET`에 Make용 공유 시크릿 입력
- YouTube credential 연결
- `SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET` 설정 확인
- Make 쪽 Facebook / Instagram / callback 시나리오가 이미 동작 가능한 상태인지 확인

## 8. 첫 실전 테스트 순서
1. n8n import + publish
2. n8n 환경 변수 설정
3. Supabase secrets를 `live`로 전환
4. 관리자 화면에서 대상 1건에 `업로드 준비 요청`
5. 상태가 `launch_ready`로 바뀌는지 확인
6. 채널별로 `업로드 준비 패키지 보기` 확인
7. `론칭 승인`
8. 상태가 `published`로 바뀌는지 확인

`Make`를 같이 쓸 때 권장 순서:
1. `facebook` 1건 먼저 연결
2. callback 반영 확인
3. 이후 `instagram` 연결
