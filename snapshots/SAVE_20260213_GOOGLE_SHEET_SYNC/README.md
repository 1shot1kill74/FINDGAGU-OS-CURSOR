# 세이브 포인트 2026-02-13 (구글 시트 ↔ 수파베이스 양방향 동기화)

**이 시점까지 반영된 작업을 롤백할 때 참고용입니다.**

## 포함된 작업 요약

### 구글 시트 → 수파베이스 (시트 onEdit)
- **시트 이름:** `상담리스트` (gas/Code.gs `SHEET_NAME`)
- **열 매핑:** A=project_name, B=link, C=start_date, D=update_date, E=status(시트만 표시·DB 미연동), F=estimate_amount(시트만 표시·DB 미연동)
- **onEdit(e):** 시트 편집 시 해당 행만 `update_single_consultation_from_sheet` RPC로 전송. project_name, link, start_date, update_date, created_at만 반영. **status·estimate_amount는 앱/수파베이스 전용**으로 시트에서 보내지 않음.
- **예외 처리:** 헤더 행·project_name 빈 값·행 삭제 시 스킵, try-catch로 로그만.

### 수파베이스 RPC
- **update_single_consultation_from_sheet(project_name, link, start_date, update_date, created_at):** 인자명을 컬럼명과 동일하게 사용. update_date 전달 시 기존 행의 update_date 덮어씀. status·estimate_amount 파라미터 없음(시트 미연동).
- **consultations.updated_at:** 컬럼 추가, UPDATE 시 트리거로 자동 갱신.
- **REPLICA IDENTITY FULL:** Realtime payload에 전체 행 포함.

### 수파베이스 → 앱 (Realtime·캐시 무효화)
- **Realtime 구독:** consultations INSERT/UPDATE 수신 시 **전체 상담 리스트 재조회(fetch)** 로 캐시 무효화.
- **visibilitychange:** 탭이 다시 보일 때(visible) fetchLeads() 호출로 시트 수정 후 앱 탭 전환 시 최신 반영.
- **update_date 파싱:** mapConsultationRowToLead에서 update_date 문자열·Date 객체 모두 YYYY-MM-DD 처리.

### 앱 → 구글 시트 (최종 확정)
- **syncAppToSheet(projectName, status, estimateAmount):** Code.gs. project_name 해당 행에 상태·견적가·업데이트일 갱신.
- **doPost(e):** 웹앱 배포 URL로 POST. body: project_name, status, estimate_amount, token(선택). SYNC_WEBAPP_TOKEN 검사.
- **앱:** Lead.projectName 추가. [최종 확정] 성공 후 VITE_GOOGLE_SHEET_SYNC_URL로 POST(fetch). 실패해도 토스트/확정에는 영향 없음.

### 확정 견적서 UI (이전 세션 유지)
- 비고 컬럼 삭제, 품목 및 규격 확장, 품목 하단에 note(상세) 표시. 견적 작성 시 상세 입력란 품목 셀 하단에 배치.
- PNG/PDF 저장·최종 확정 버튼 동작, estimate_history is_final 반영, 상담 카드 최종 견적가 표시.

## 롤백 시 (Git 사용 시)

```bash
git add -A
git commit -m "checkpoint: 구글 시트↔수파베이스 양방향 동기화, status/estimate_amount 시트 미연동, Realtime·캐시 무효화"
git tag save-20260213-google-sheet-sync

# 이후 이 시점으로 복귀
git checkout save-20260213-google-sheet-sync
```

## 변경된 주요 파일

- `gas/Code.gs` — SHEET_NAME·COL, onEdit, syncAppToSheet, doPost, payload 컬럼명·status/estimate_amount 제외
- `src/pages/ConsultationManagement.tsx` — fetchLeadsRef, visibilitychange, Realtime 시 전체 fetch, Lead.projectName, 최종 확정 후 시트 sync URL 호출, update_date 파싱
- `supabase/migrations` — update_single_consultation_from_sheet(컬럼명 인자·status/estimate_amount 제거), consultations_updated_at_and_realtime, consultations REPLICA IDENTITY FULL
- `.env.example` — VITE_GOOGLE_SHEET_SYNC_URL, VITE_GOOGLE_SHEET_SYNC_TOKEN
- `BLUEPRINT.md`, `CONTEXT.md`, `JOURNAL.md`, `soul.md` — 본 세이브 포인트 반영
