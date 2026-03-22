# HANDOFF: 구글챗 봇 견적서 자동 처리 기능 구현

작성일: 2026-03-11
상태: **롤백 완료 — 자동 응답/자동 처리 비활성, 기본 동기화 플로우만 유지**

---

## 목표

구글챗 스페이스에서 견적서 이미지를 첨부하고 "견적서" 텍스트를 포함한 메시지를 보내면, 기존 수동 업로드 플로우(Gemini AI 분석 → DB 저장)를 자동으로 실행.

---

## 구현한 내용

### 1. Supabase Edge Function 신규 생성
**파일:** `supabase/functions/process-chat-estimate/index.ts`

처리 순서:
1. `x-bot-secret` 헤더로 인증 검증
2. `channel_chat_id = spaceName`으로 `consultations` 조회
3. `analyze-quote` Edge Function 내부 호출 → Gemini 이미지 분석
4. `estimates` 테이블 INSERT
5. `consultations` 업데이트 (estimate_amount, status → "견적")
6. `products` UPSERT (판매단가 반영)
7. Supabase Storage(`estimate-files` 버킷) 업로드
8. `consultation_estimate_files` INSERT

배포 명령:
```bash
npx supabase functions deploy process-chat-estimate --no-verify-jwt
```

인증: `x-bot-secret: <BOT_SECRET>`

---

### 2. GAS Code.gs 수정
**파일:** `gas/Code.gs`

`doPost()` 함수에 `download_attachment` 액션 분기 추가:
- `ScriptApp.getOAuthToken()`으로 구글챗 Chat API OAuth 인증
- `https://chat.googleapis.com/v1/{resourceName}/media?alt=media` 로 이미지 다운로드
- base64 인코딩 후 반환

> **주의:** 로컬 파일만 수정됨. GAS 에디터에 수동으로 붙여넣기 후 재배포 필요.
> 현재 버전 34로 재배포 완료됨 (대표님이 직접 진행).

---

### 3. n8n 워크플로우 수정
**워크플로우 ID:** `f2SGx30pVCnFFmFG`
**워크플로우명:** Google Chat Space → Supabase Sync

한때 MESSAGE 분기를 확장해 견적서 자동 처리 실험을 붙였지만, 현재 운영/로컬 정의는 모두 안전 롤백 상태로 정리됨.

**현재 운영 구조:**
```
Webhook → Is MESSAGE?
  ├─ true  → Parse Message → [견적서] Command? → ...
  └─ false → Set Variables → Check Supabase → Normalize Result → Row Found?
```

남겨둔 자동 처리 관련 노드:
| 노드명 | 역할 |
|--------|------|
| Parse Message | 메시지에서 견적서 키워드 + 첨부파일 파싱 |
| [견적서] Command? | isEstimateCommand 조건 분기 |
| [견적서] Download Image (GAS) | GAS 웹앱 경유 이미지 base64 다운로드 |
| [견적서] Prepare Payload | 다운로드 결과 + spaceName 조합 |
| [견적서] process-chat-estimate | Supabase Edge Function 호출 |
| [견적서] Update Date | consultations.update_date 갱신 |

정리된 항목:
- `Webhook.responseMode`는 다시 `onReceived` 로 복구
- `Prepare Chat Response`, `Respond to Google Chat` 노드는 라이브/로컬 모두 제거
- 현재 프로덕션 웹훅은 다시 n8n 기본 응답 `{"message":"Workflow was started"}` 를 반환

---

## 현재 상태

### 현재 운영 상태

- 워크플로우 active: true
- 웹훅 경로: `chat-space-created`
- 프로덕션 URL: `<N8N_WEBHOOK_URL>`
- 현재 응답: `{"message":"Workflow was started"}`
- 라이브 n8n 화면과 로컬 `gas/n8n-workflow.json` 정의를 동일한 롤백 상태로 동기화 완료

의미:
- Google Chat용 즉시 응답 실험은 운영에서 제거됨
- 자동 견적 처리용 서버/스크립트 자산은 남아 있지만, Chat 응답 커스터마이징은 더 이상 연결되지 않음
- 지금 기준으로는 "기본 동기화 워크플로우 + 선택적 견적 분기 코드 보존" 상태

---

## 다음 단계 (다른 AI에게 인계 시)

### 현재 우선순위
1. 자동 처리 재개 여부를 먼저 제품/운영 관점에서 다시 결정
2. 재개하지 않으면 현재 롤백 상태 유지
3. 재개한다면 별도 브랜치/복제 워크플로우에서만 재실험

### 재개 시 권장 순서
1. 운영 워크플로우를 건드리지 말고 복제본에서 테스트
2. `Webhook.responseMode` 변경과 Chat 응답 포맷을 먼저 검증
3. 그 다음에 `Parse Message -> [견적서] Command? -> ...` 자동 처리 분기를 연결
4. Google Chat 실환경에서 멘션/첨부 응답을 재검증한 뒤 운영 반영

---

## 주요 값 참조

| 항목 | 값 |
|------|-----|
| n8n 워크플로우 ID | `f2SGx30pVCnFFmFG` |
| n8n 웹훅 URL | `<N8N_WEBHOOK_URL>` |
| BOT_SECRET | `<BOT_SECRET>` |
| GAS 웹앱 URL | `<GAS_WEBAPP_URL>` |
| Supabase Edge Function | `process-chat-estimate` (--no-verify-jwt) |
| Storage 버킷 | `estimate-files` |
