# 쇼룸 숏츠 승인형 퍼블리싱 설정 가이드

현재 반영 상태:
- `showroom-shorts-publish-dispatch` 배포 완료
- `showroom-shorts-publish-callback` 배포 완료
- 프론트/관리자 UI 구현 완료
- 로컬 빌드 통과
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json` 추가 완료

운영 권장:
- `YouTube`는 기존처럼 `n8n`이 직접 업로드
- `Facebook / Instagram`은 `n8n`이 준비 후 `Make` webhook으로 넘기고, `Make`가 실제 Meta 업로드를 수행
- 자세한 구조는 `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md` 참고

남은 작업:
- DB 마이그레이션 적용
- Supabase secrets 설정
- n8n 워크플로우 연결

## 1. DB 마이그레이션
적용할 파일:
- `supabase/migrations/20260409090000_expand_showroom_shorts_publish_flow.sql`

현재 `supabase db push`는 원격 migration history 불일치로 막혀 있습니다.

오류 요약:
- `Remote migration versions not found in local migrations directory`

권장 순서:
1. 원격 상태 백업
2. `supabase db pull` 또는 `supabase migration repair`로 원격/로컬 이력 정렬
3. 그 다음 `npx supabase db push`

## 2. 필요한 Supabase Secrets

```bash
npx supabase secrets set \
  SHOWROOM_SHORTS_PUBLISH_WEBHOOK_URL="https://your-n8n-host/webhook/showroom-shorts-publish" \
  SHOWROOM_SHORTS_PUBLISH_WEBHOOK_SECRET="your-showroom-shorts-n8n-secret" \
  SHOWROOM_SHORTS_PUBLISH_MODE="live" \
  SHOWROOM_SHORTS_PUBLISH_CALLBACK_URL="https://sxxnshvidfwuemgbyuqz.supabase.co/functions/v1/showroom-shorts-publish-callback" \
  SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET="your-showroom-shorts-callback-secret"
```

테스트만 먼저 할 때:

```bash
npx supabase secrets set \
  SHOWROOM_SHORTS_PUBLISH_MODE="mock" \
  SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET="your-showroom-shorts-callback-secret"
```

## 3. n8n 워크플로우 최소 구조

1. Webhook 수신
2. `action` 값 분기
3. `prepare`
   - 채널별 제목/설명/해시태그 정리
   - 검수용 preview URL 또는 checklist 생성
   - callback 호출
4. `launch`
   - 실제 채널 API 호출
   - 성공 시 `externalPostId`, `externalPostUrl` 포함 callback 호출
   - 실패 시 `status=failed` callback 호출

## 3-1. Meta 연동 시 필요한 값

Facebook / Instagram Reels까지 실제 연결하려면 n8n에서 아래 값을 준비합니다.

- `META_PAGE_ID`
- `META_PAGE_ACCESS_TOKEN`
- `META_IG_USER_ID`
- `META_IG_ACCESS_TOKEN`

권장:
- Facebook은 페이지 기준 업로드
- Instagram은 비즈니스 계정 + Facebook 페이지 연결 상태에서 Reels 게시
- 토큰 권한은 `instagram_basic`, `instagram_content_publish`, `pages_manage_posts` 계열을 우선 점검

참고:
- 템플릿 파일: `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- 이 파일은 `channel` 값에 따라 `youtube` / `facebook` / `instagram`를 분기합니다.

## 4. callback 예시

prepare 완료:

```bash
curl -X POST "https://sxxnshvidfwuemgbyuqz.supabase.co/functions/v1/showroom-shorts-publish-callback" \
  -H "Content-Type: application/json" \
  -H "x-showroom-shorts-publish-secret: your-showroom-shorts-callback-secret" \
  -d '{
    "targetId": "TARGET_UUID",
    "action": "prepare",
    "status": "launch_ready",
    "message": "upload ready",
    "payload": {
      "title": "최종 제목",
      "descriptionWithHashtags": "설명\n\n#태그",
      "firstComment": "첫 댓글",
      "previewUrl": "https://example.com/preview",
      "checklist": ["제목 확인", "설명 확인"]
    }
  }'
```

launch 완료:

```bash
curl -X POST "https://sxxnshvidfwuemgbyuqz.supabase.co/functions/v1/showroom-shorts-publish-callback" \
  -H "Content-Type: application/json" \
  -H "x-showroom-shorts-publish-secret: your-showroom-shorts-callback-secret" \
  -d '{
    "targetId": "TARGET_UUID",
    "action": "launch",
    "status": "published",
    "message": "published",
    "externalPostId": "abc123",
    "externalPostUrl": "https://example.com/post/abc123"
  }'
```

## 5. 배포 후 관리자 화면에서 기대 동작
- `ready` 상태에서 `업로드 준비 요청`
- n8n 또는 mock 처리 후 `launch_ready`
- 준비 결과 패키지 확인
- `론칭 승인`
- callback 이후 `published`
- 채널별 `external_post_url` 저장

## 6. 참고 문서
- `docs/SHOWROOM_SHORTS_PUBLISH_WEBHOOK_CONTRACT.md`
- `docs/SHOWROOM_SHORTS_N8N_IMPORT_QUICKSTART.md`
- `docs/IMPORT_THIS__N8N__SHOWROOM_SHORTS_PUBLISH_GATE_V3_META.json`
- `docs/SHOWROOM_SHORTS_MAKE_HANDOFF_SETUP.md`
