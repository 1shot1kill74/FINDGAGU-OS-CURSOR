# 데이터 불일치 수정 체크리스트 (2026-02-20 기준)

## ✅ P0 — 구글 시트 탭 이름 불일치 (2026-02-20 수정 완료)

**증상:** syncAllDataBatch, syncAppToSheet, onEdit 등 SHEET_NAME 기반 함수가 시트를 찾지 못해 전체 동기화 불가.

**원인:** gas/Code.gs SHEET_NAME = '상담리스트', 실제 구글 시트 탭 이름 = '시트1'

**수정 방법 (둘 중 하나):**
- [x] 옵션 A: gas/Code.gs `const SHEET_NAME = '시트1'` 로 수정 ← **적용됨**
- [ ] 옵션 B: 구글 시트 탭 이름을 '상담리스트'로 변경

---

## ✅ P1 — onEdit + RPC에 sheet_update_date 미전달 (2026-02-20 수정 완료)

**증상:** 시트 D열을 직접 편집해도 앱의 '오늘 갱신' 표시가 갱신되지 않음.
sheetUpdateDate ?? updateDate 우선순위로 인해 stale한 sheetUpdateDate가 계속 표시됨.

**원인:**
1. gas/Code.gs onEdit payload(342-348행)에 sheet_update_date 없음
2. update_single_consultation_from_sheet RPC에 sheet_update_date 파라미터 없고 metadata 갱신 안 함

**수정 방법:**
- [x] gas/Code.gs onEdit payload에 `sheet_update_date: updateDateStr` 추가 ← **적용됨**
- [x] supabase/migrations/20260220000000_update_single_consultation_sheet_update_date.sql 생성: sheet_update_date 파라미터 추가 + metadata 병합 ← **적용됨**

---

## 🔴 P2 — initialSyncAll이 존재하지 않는 RPC 호출 (수정 필요)

**증상:** gas/Code.gs initialSyncAll 실행 시 Supabase 404 또는 RPC not found 오류.

**원인:** sync_consultations_from_sheet RPC는 마이그레이션에 없음. update_multiple_consultations_from_sheet가 대체.

**수정 방법:**
- [ ] gas/Code.gs initialSyncAll 함수 상단에 `@deprecated` 주석 추가 + 경고 로그
- [ ] 또는 내부 API URL을 update_multiple_consultations_from_sheet로 교체

---

## 🟡 P3 — 앱→시트 확정 후 sheet_update_date 역방향 반영 지연 (개선)

**증상:** 앱 [최종 확정] → 시트 D열 오늘로 갱신되나, DB metadata.sheet_update_date 즉시 미반영.
다음 배치 sync 전까지 앱 카드 '오늘 갱신' 표시 부정확.

**수정 방법 (선택):**
- [ ] 옵션 A: 앱 [최종 확정] 성공 직후 supabase.from('consultations').update({ metadata 병합 sheet_update_date: 오늘 }) 호출
- [ ] 옵션 B: 현재 구조 유지, 내부 운영 가이드 "확정 후 배치 sync 실행" 명시

---

## 🟢 P4 — 채널톡 웹훅 X-Channel-Signature 검증 미복구 (운영 전 필수)

**증상:** CHANNELTALK_WEBHOOK_SECRET 서명 검증 bypass 중 (테스트 모드).

**수정 방법:**
- [ ] supabase/functions/channel-talk-webhook/index.ts 서명 검증 로직 복구
- [ ] 정식 운영 배포 전 반드시 적용 (BLUEPRINT 명시 사항)
