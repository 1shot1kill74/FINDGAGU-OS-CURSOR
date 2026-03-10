# 프로젝트 저널 (JOURNAL) — 압축본 (2026-03-05 기준)

> 세부 구현 결정은 BLUEPRINT.md 참조. 이 파일은 날짜별 핵심 결정·파일·세이브 포인트 요약.

---

## 2026-03-05 오후 — n8n 운영 안정화 · 시스템 구조 정리

**핵심 결정:**
- 엔드투엔드 테스트 완료. 채팅방 생성 → 상담카드 자동 생성(project_name, start_date, channel_chat_id) 정상 동작.
- **3세대 구조 확정:** 채팅방 → GAS AutoAddBot → n8n → Supabase 직접. 구글 시트는 레거시(읽지도 쓰지도 않음).
- **displayName 파싱 포기:** 직원 규칙 미준수 우려 → 그대로 project_name 저장, 직원 수동 입력.
- **채널톡 방향:** 고객응대/마케팅 자동화(첫 인사, FAQ, 상담 유도)에 집중. 구글챗 연동은 비현실적(API 제약).
- **GAS 트리거:** 5분 유지 (1분 시 일일 쿼터 초과 우려).
- **과거 데이터:** 전체 2,382건 중 2,344건 start_date null. Chat API createTime 활용 여부 미결.
- **n8n 중복 체크:** channel_chat_id=eq.{spaceName}. 기존 마이그레이션 레코드(channel_chat_id null)는 중복 체크 미작동.

**미결 작업:** 테스트 카드 삭제(수동), start_date 정상화 방법 결정, 기존 채팅방 봇 일괄 추가(2026-01-20 이후).

---

## 2026-03-05 — GAS AutoAddBot 안정화 · Make → n8n 전환

**버그 수정 목록:**
- `appsscript.json`: `chat.memberships.app` 스코프 누락 → 추가.
- createTime 필터: `!space.createTime || ...` → `space.createTime && ...` (없는 스페이스 잘못 스킵 수정).
- processed 저장 시점: detectNewSpaces_ 내부 → 봇 추가 성공 후에만 저장(실패 시 다음 사이클 재시도).
- Invalid Date 가드: `isNaN(parsedLast)` 체크 → 10분 전 기본값 폴백.
- processed 최대 100개 유지, spaceName → chatLink 변환 추가.

**n8n 워크플로우 (최종 8개 노드):**
Webhook → Set Variables(chatLink, today, displayName) → Check & Normalize(Code, Supabase 내부 조회+found 판단) → Row Found?(IF) → 기존: Sheets 업데이트 + Supabase PATCH / 신규: Sheets 추가 + Supabase INSERT.

**실 연동에서 발견·수정:** channel_chat_id 컬럼 없음(400) → ALTER TABLE 추가. 0 items 체인 중단 → Check & Normalize 단일 Code 노드로 통합. project_name NOT NULL → displayName으로 교체. status '상담중' 없음 → '접수'. GAS가 테스트 Webhook URL 사용 → 프로덕션 URL 교체.

**변경 파일:** `gas/AutoAddBot.gs`, `gas/appsscript.json`, `gas/n8n-workflow.json`(신규), `supabase/migrations/20260305000000_add_channel_chat_id_to_consultations.sql`(신규).

---

## 2026-03-02 — 구글챗 전수 마이그레이션 v5 · 1,000건 제한 해결 · Nuclear Cleanup

- `user_info.json` 기반 2,344개 스페이스를 1:1 상담카드로 이식(병합 없음, 중복명 (1)/(2) 접미사).
- start_date는 null 유지(실무 혼선 방지). metadata에 google_chat_url, space_id, original_name 저장.
- **Supabase 1,000 Limit 극복:** fetchLeads에 range(from, from+999) 재귀 루프. 삭제는 0건 될 때까지 반복(Nuclear Cleanup).
- **변경 파일:** `ConsultationManagement.tsx`(fetchLeads 재귀), `scripts/nuclear_fix.ts`(신규), `scripts/verify_all.ts`, `scripts/analyze_today.ts`.

---

## 2026-03-01 — Phase 1 구조적 정리 · 자동 견적 엔진 · 가격 분석 스크립트

- **환경변수 중앙화:** `src/lib/config.ts` 신규. import.meta.env 직접 참조 금지.
- **상수 중앙화:** `src/lib/constants.ts` 신규. CLOUDINARY_UPLOAD_FOLDER, ESTIMATES_SELECT_COLUMNS 등.
- **탭 분리:** ConsultationManagement.tsx → `src/components/Consultation/` 하위 EstimateTab, HistoryTab, MeasurementTab, AutoEstimateDialog 분리.
- **dateUtils 이동:** `src/utils/dateUtils.ts` → `src/lib/utils/dateUtils.ts` 삭제 후 재생성.
- **자동 견적 엔진 (`src/lib/autoEstimate.ts`):** loadPriceTable + calculateAutoEstimate. 매칭: spec > base > none. 구간별 배송·설치 요율 + VAT 10%.
- **AutoEstimateDialog:** Combobox 자동완성, 실시간 합계, 기존 이력 비교.
- **가격 분석 스크립트 파이프라인 (scripts/):** collectAllTakeouts → parseCollectedQuotes → buildPriceTable → public/data/standardPriceTable.v*.json.

---

## 2026-02-22 — 마이그레이션 파이프라인 · 503 대응 · analyze-quote 강화

- **migrate-data.ts:** 재귀 탐색, 2단계(exists→full), sharp 경량화, 503 재시도(2/4/6초, 동시성 2), 주소 파싱 오탐 방지.
- **analyze-quote Edge Function:** exists 모드(64 token, YES/NO만), Pre-check(파인드가구 견적서 3/5 항목 필터), 캡처 이미지 가이드.
- **detectQuoteLocal.ts:** `npm run detect:quote -- --folder "경로"` 신규.
- **업로드 경로:** 견적서→estimate-files 직접, 발주서·평면도→uploadEngine→documents. OCR 결과→estimates.payload.
- **세이브 포인트:** `git tag save-20260222-analyze-quote-edge`

---

## 세이브 포인트 2026-02-21 — 발주 자산 · uploadEngine · Dialog 접근성

- uploadEngine: jpg/png/webp→Cloudinary, pdf/ppt/pptx·floor_plan·purchase_order→Supabase documents 버킷.
- documentThumbnail.ts: PDF/PPTX 썸네일 생성. image_assets에 storage_type, storage_path 컬럼.
- OrderAssets.tsx(`/order-assets`): 발주서·배치도 통합 관리. MeasurementSection 분리 업로드.
- Radix Dialog: aria-describedby={undefined}, DialogTitle 필수(sr-only).
- `git tag save-20260221-order-assets-dialog-a11y`

---

## 2026-02-22 긴급 — 시스템 안정화

- Realtime 구독 주석 처리(CHANNEL_ERROR 방지). last_viewed_at 갱신 주석(컬럼 미존재). order_documents fetch 주석(빈 배열 반환).
- ConsultationListItem 바깥 `<button>` → `<div role="button">` 변경(button-in-button 위반).

---

## 2026-02-21 — 실측 탭 분리 업로드

- 통합 업로드 영역 → [발주서 업로드] / [배치도 업로드] 두 독립 섹션. category 자동 지정 → image_assets 저장.
- OrderAssets.tsx 신규(`/order-assets`). [발주 자산 관리] 버튼으로 진입.

---

## 2026-02-20 — 이미지 업로드 단일 엔진 · 상담 히스토리 통합

- `src/lib/uploadEngine.ts` 신규. 이미지 자산관리(입구 A)·상담 히스토리(입구 B) 모두 동일 엔진 사용.
- 상담 히스토리에 점선 업로드 영역 추가, 항목별 휴지통 삭제(consultation_messages + image_assets + Storage).
- 데이터 흐름: image_assets + consultation_messages만 반영. 구글 시트 행 추가 없음.

---

## 2026-02-19 — Claude Code 추가

- 기술 스택에 Claude Code(터미널 기반 에이전트) 추가. 모든 개발 가이드는 하이브리드 환경(Cursor + Claude Code) 전제.

---

## 2026-02-14 — 구글 시트 갱신일 · 상담 카드 최종 견적가

**갱신일 기준 (save: `save-20260214-sheet-update-date`):**
- Lead.sheetUpdateDate = metadata.sheet_update_date. 오늘 갱신/D+n/정렬 모두 sheetUpdateDate ?? updateDate 기준.
- GAS syncAllDataBatch에 sheet_update_date(YYYY-MM-DD) 추가. RPC update_multiple_consultations_from_sheet에서 metadata 병합.
- 변경: `ConsultationManagement.tsx`, `supabase/migrations/20260214140000_sheet_update_date_in_metadata.sql`, `gas/Code.gs`.

**최종 견적가 표시 (save: `save-20260214-card-final-estimate`):**
- 카드 2행 맨 오른쪽: 표시 우선순위 pending → finalAmount → displayAmount → expectedRevenue.
- EstimateFilesGallery onUploadComplete({ estimateAmount }). pendingEstimateAmountRef·낙관적 업데이트·fetchLeads 병합.

---

## 2026-02-13 — 구글 시트 ↔ 수파베이스 양방향 동기화

- **시트→DB:** onEdit → update_single_consultation_from_sheet RPC(project_name, link, start_date, update_date, created_at). status·estimate_amount는 시트에서 미전송.
- **DB→시트:** 앱 [최종 확정] 후 syncAppToSheet(doPost) → 해당 행 E·F·D 갱신.
- Realtime INSERT/UPDATE 시 전체 fetch. visibilitychange → visible 시 fetch.
- `git tag save-20260213-google-sheet-sync`

---

## 2026-02-12 — 견적서 업로드 이중 저장 · products 판매단가

- [판매 단가표 반영] / [견적서로 저장] 모두 products + estimates 동시 저장.
- products.supply_price = 판매단가. 원가표→마진 30% 역산. AI 퀵 가이드에서 판매단가로 인식, 원가 역산.
- EstimateForm: applySellingToRow 추가. modalOpen prop으로 products 새로고침.
- `git tag save-20260212-estimate-upload-products-selling-price`

---

## 2026-02-10 — 무효/거절 분리 · AI 퀵 커맨드 · 채널톡 웹훅

- **무효/거절:** status enum에 '무효' 추가. 무효=즉시 저장(통계 제외), 거절=사유 모달 필수. 7탭 추가. KPI: total_valid_leads = count(status != '무효').
- **식별자 고정:** display_name은 채널톡 웹훅에서 최초 생성 후 자동 변경 안 함. AI 추출값은 metadata.ai_suggestions에만, 상세 패널 [적용]으로 수동 반영.
- **AI 퀵 커맨드:** 원가표 출처 뒤 외경·현장명 표시, 원가만 표시(종전 단가 제거). vendor-assets Signed URL로 원본보기. 참고 견적서 모달 z-[200]·캡처, justClosedPreviewRef(300ms) 방어.
- **채널톡 웹훅:** 이벤트 타입 필터 제거. entity.fields/body.fields에서 연락처 추출. 전체 try-catch·로깅 강화. 배포: `--no-verify-jwt`.
- **6개월 견적 통계:** 최대/최소/실제 중간값(정렬 후 중앙) + estimate_id. 클릭 시 견적서 팝업. 원가 연동.
- **마이그레이션:** toSafeStoragePath(한글 파일명 MIME 오류 방지). 거래처 원가 AI: site_name·색상·외경·memo 추출, 수량 제거. 섹션 분리(탭 제거).
- `git tag save-20260210-showroom-consultation-image`

---

## 2026-02-09 — 상담 숨기기 · 아카이브 · 채널톡 FAQ

- **Soft Delete:** consultations.is_visible (default true). 히스토리 탭 [이 상담 숨기기](관리자) → 앱 내 Dialog → false. 모든 목록/통계에 is_visible=true 필터 강제.
- **관리자 아카이브:** `/admin/archive`. [복구](is_visible true) / [영구 삭제](estimates+consultations). [TEST] 필터.
- **useConsultations 훅:** `src/hooks/useConsultations.ts`. visibleOnly true/false.
- **마이그레이션:** created_at = 인입일(quoteDate) 소급. 인입일 Date Picker 추가.
- **채널톡 FAQ:** FAQ_DATA 키 `A/S` → `'A/S'`(따옴표) 문법 에러 해결. `'AS'` 키 추가(슬래시 없이도 매칭).
- `git tag save-20260209-faq-channel`

---

## 2026-02-08 — 상담 UI · 이미지 분리 · 공유 시스템 · 견적 규격

- **상담 UI:** 골든타임 3단계(Hot/Active/Warning), 6단계 프로그레스(접수|견적|계약|완료|AS|캔슬), 조회 기간 기본값 '이번달'. consultation_messages.is_visible 도입, 관리자 숨기기/다시보이기/시스템 메시지 영구 삭제.
- **이미지 분리(Lock-in):** 이미지 자산관리(`/image-assets`, ImageAssetViewer) = 관리자 창고. 시공 사례 뱅크(`/portfolio`, PortfolioBank) = 영업 전용. fetchApprovedProjectAssets/rowToProjectAsset.
- **공유 시스템(Lock-in):** `/public/share?ids=...` (PublicGalleryView). ShareCart 선택 → 링크 복사 + 카톡 공유. 외부 페이지에서 원가·마진·consultation_id 미노출.
- **역방향 견적:** 시공 뱅크 라이트박스 product_tags 클릭 → location.state로 상담 관리 이동 → 견적 모달 자동 오픈 + 품명 삽입. lastLocationKeyRef 중복 방지.
- **견적 규격:** 20행 고정(FIXED_ESTIMATE_ROWS=20). PDF `견적서_업체명.pdf`, 이미지 `견적서_YYYY-MM-DD_업체명.png`.
- **데이터 통합 관리(/admin/migration):** is_test 컬럼. 파일 업로드 → AI 파싱 → 검수 테이블 → DB 저장.
- **이미지 이원화 강제:** uploadConstructionImageDual = Cloudinary(고화질) + Supabase(썸네일).

---

## 2026-02-07 — 견적/기획안 · AI 견적 도우미 · 식별자 · 1단계 골조

- **예산 기획안(PROPOSAL) vs 확정 견적서(FINAL):** 양식 완전 분리(컬럼 조건부 렌더링). 발행승인 3단계(미리보기 팝업 → 최종 발행 → 링크/PDF). final_proposal_data 스냅샷 저장.
- **AI 견적 도우미:** estimateAiService(Mock, LLM 교체 예정) + estimateUtils(금액 파싱·배율) 분리. QuickCommandResult 7가지 타입. AI 퀵 커맨드 입력창.
- **상담 식별자(display_name):** `[YYMM] [상호] [전화번호 뒷4자리]` 자동 생성. 데이터 표준으로 확정.
- **1단계 골조 확정:** 상담 카드 UI(1행~4행), AS 신청 시 status→AS_WAITING, 오픈마켓 배지(네이버/쿠팡/오늘의집), 실측 데이터 타임라인에서 분리(→ /measurement/upload), 고객 등급 동일 연락처 상향 평준화.
- **화이트아웃 롤백:** 채팅 인라인 테마·드래그 앤 드롭 시도 후 즉시 롤백. Tailwind 기본 스타일·파일 선택 버튼 방식 유지.

---

## 2026-02-06 — 데이터 모델링 · UX 설계 확정

- 30일 골든타임 로직, Wake-up 자동화(3/7일 단위), 통합 타임라인 UI 설계.
- 현장 기사 이원화 권한(일정·현장만), 카카오/T맵 딥링크, 핑크색 현장 주의사항 UI.
- 상담 단계 '현장실측' 삭제 → 4단계(상담접수→견적중→계약완료→시공완료)로 통일.
- AS 관리: metadata.as_requested, 카드 1행 빨간 [AS 요청] 배지, [AS 관리] 버튼.

---

## 2024-02-05 — Day 1 킥오프

- '주문' → '상담' 용어 전면 개편. 마케팅 스타일(후킹/전문가/스토리텔러) 확정.
- Lovable 크레딧 임박 → GitHub(1shot1kill74/ivory-os) 이관. M4 맥북 로컬 환경 셋업.

---

## 2026-03-07 — 견적서 AI 분석 수정 · 드래그앤드롭 · 정렬 개선 · n8n MESSAGE 이벤트 처리

**핵심 결정:**
- **bulkAddBotToAllSpaces 완료:** 2,255건 추가/스킵, 실패 0건. 전수 봇 추가 완료.
- **update_date 갱신 구조 분석:** GAS 5분 타이머는 신규 스페이스 감지 전용. MESSAGE 이벤트 처리 없어 기존 채팅방 활동이 update_date에 미반영 → n8n Switch 노드로 보완. **단, Google Chat 공식 MESSAGE 이벤트는 방 전체 모든 메시지가 아니라 @멘션·슬래시 명령·앱과의 DM interaction에서만 발생**하므로, HTTP 엔드포인트 앱 연동 전제가 필요.
- **sheetUpdateDate 제거:** ConsultationManagement 전체에서 `sheetUpdateDate` 참조 제거. D-Day·정렬 모두 Supabase `update_date` 단일 기준.
- **Gemini 모델:** gemini-2.0-flash deprecated → `gemini-3.1-flash-lite-preview` 변경.

**수정 내역:**

*analyze-quote Edge Function:*
- `.env` 빈 파일 삭제 → Supabase CLI 파싱 오류 원인 제거.
- `const text` 중복 선언 버그 → `const responseText` 수정(worker boot error 해결).
- Gemini 모델: `gemini-2.0-flash` → `gemini-3.1-flash-lite-preview`.
- Gemini API 키 갱신(외부 정책 변경).

*EstimateFilesGallery:*
- 드래그앤드롭 업로드 추가. `processFile(file, uploadType)` 공통 함수 추출.
- 빈 상태 → 드롭존 UI(`<label>` + dragOver 상태 기반 스타일).
- 두 패널(견적서/외주업체 단가표) 각각 onDragOver·onDragLeave·onDrop 적용.

*ConsultationManagement:*
- 정렬 버튼 토글: 고정 "최근업데이트순" → `sortByNeglect ? '최근업데이트순' : '인입일순'` 토글.
- null update_date 정렬: `0` 폴백 → `new Date(a.updateDate ?? a.inboundDate ?? a.createdAt).getTime()` 폴백.
- sheetUpdateDate 전면 제거 → updateDate 단일화.

*n8n 워크플로우 (`gas/n8n-workflow.json`):*
- Switch 노드(Event Type?) 추가 — MESSAGE 분기: [MESSAGE] Set Vars → [MESSAGE] Supabase PATCH update_date.
- 나머지 이벤트(ADDED_TO_SPACE 등) → 기존 Set Variables 분기 유지.
- import 가능한 완전한 JSON으로 업데이트. 노드 총 12개.

**플로우:**
```
Webhook → Event Type?(Switch)
  ├─ MESSAGE → [MESSAGE] Set Vars → [MESSAGE] Supabase PATCH update_date
  └─ fallback → Set Variables → Check Supabase → Normalize Result → Row Found?
                                                                      ├─ TRUE  → [기존] Sheets 업데이트 → [기존] Supabase PATCH
                                                                      └─ FALSE → [신규] Sheets 추가 → [신규] Supabase INSERT
```

**변경 파일:** `supabase/functions/analyze-quote/index.ts`, `src/components/estimate/EstimateFilesGallery.tsx`, `src/pages/ConsultationManagement.tsx`, `gas/n8n-workflow.json`

---

## 2026-03-09 — status 7종 표준화 · DB 중복 정리 · 상담카드 핀 기능

**핵심 결정:**
- **status 7종 확정:** 접수 / 견적 / 진행 / 완료 / AS / 무효 / 거절. 휴식기는 '완료'로 흡수(마케팅 일시정지 플래그는 추후 `metadata.marketing_pause`로 분리 예정).
- **상담카드 핀:** DB 마이그레이션 없이 `metadata.pinned`(boolean) 패턴. 정렬 우선순위 pinned → 날짜(업데이트순/인입일순).

**수정 내역:**

*ConsultationManagement.tsx:*
- `Lead.status` 타입: `'접수' | '견적' | '진행' | '완료' | 'AS' | '거절' | '무효'`
- `STATUS_TO_STAGE`: 7종 신규값 + 레거시 호환(상담중/견적발송/계약완료/휴식기/AS_WAITING/신규 등)
- `stageToStatus`: 4단계 → 4개 표준값 역매핑
- `statusVal` 기본값: `'접수'`
- `isEnded()`: AS는 종료 아님(false 반환)
- `getStageBarValue()`: AS 상태 직접 처리
- `handleToggleAs`: AS ↔ 완료 토글
- 신규 상담 insert: `status: '접수'`
- `replace_all`: `'상담중'` → `'접수'`, `'견적발송'` → `'견적'`
- `mapConsultationRowToLead`: `pinned: meta?.pinned === true ? true : undefined`
- 정렬 로직: pinned 카드 최상단 부상(두 정렬 모드 모두 적용)
- `handlePin`: metadata.pinned 토글 + Supabase PATCH
- `ConsultationListItem`: `onPinClick` prop 추가, Pin 버튼(Lucide) UI(Pencil 앞 위치)

*supabase/migrations/20260308000000_standardize_consultation_status.sql (신규):*
- 레거시 status 값 → 7종 표준값 일괄 UPDATE
- 범위: 상담중/신규/상담접수/접수중/신규접수→접수, 견적발송/견적중/견적발송중→견적, 계약완료/진행중/계약/계약중→진행, 휴식기/시공완료/완료됨/종료→완료, AS_WAITING→AS
- SQL 실행 완료(대표님 직접 수파베이스에서 실행)

*DB 중복 정리:*
- `channel_chat_id` 기준 중복 레코드 약 28건 확인
- DELETE SQL(ROW_NUMBER, created_at ASC 기준 최신 유지, 구버전 삭제) 제공
- 대표님 직접 실행 완료

*gas/AutoAddBot.gs:*
- `syncMissingSpacesToSupabase`: insert 시 `status: '신규'` → `status: '접수'`
- 로컬 파일 수정 완료(GAS 에디터는 수동 반영 필요)

*BLUEPRINT.md:*
- status enum 섹션: 구버전 목록 → 7종 확정 + 레거시 마이그레이션 노트로 교체
- `update_date` 소스 오브 트루스 문구 보강: 앱은 `consultations.update_date` 단일 기준, 주 경로는 GAS `lastActiveTime`, n8n `MESSAGE`는 interaction event 한정 보조 경로
- 레거시 status 매핑에 `캔슬 → 거절` 추가

*gas/README.md:*
- `Google Chat → n8n MESSAGE 실운영 점검` 섹션 추가
- 점검 순서: n8n 활성화 → 프로덕션 Webhook URL 확인 → Chat 앱 HTTP 엔드포인트 확인 → `@멘션`/슬래시/DM로 테스트 → n8n 실행 이력과 `body.space.name` 확인
- Google Cloud Console `Google Chat API → Configuration` 화면 기준 체크리스트 추가. `HTTP endpoint URL`, 앱 사용 가능 상태, 스페이스 멤버십, Commands 등록, DM 가능 상태, Authorization Bearer 검증 메모 포함
- `대표님용 1분 실행 절차` + `n8n 실행 이력 판독표` 추가

**미결:**
- GAS 에디터에 AutoAddBot.gs 수동 복붙
- 내부 관리 스페이스: is_visible=false + status='무효' 일괄 처리
- dryRunContactScan 이어서 실행 + applyContactScanFromSheet

**변경 파일:** `src/pages/ConsultationManagement.tsx`, `gas/AutoAddBot.gs`, `supabase/migrations/20260308000000_standardize_consultation_status.sql`(신규), `BLUEPRINT.md`, `CONTEXT.md`, `JOURNAL.md`

---

## 2026-03-08 — AutoAddBot.gs 복구 · 연락처 파싱 드라이런

**사고 및 복구:**
- `gas/AutoAddBot.gs` 실수로 내용 삭제. git 복구 시도 → 커밋에는 452줄 구버전만 존재(최신 1714줄 미커밋 상태).
- VSCode 로컬 히스토리(Local History)로 1714줄 전체 복구 완료.
- 복구된 파일에 `dryRunContactScan`, `applyContactScanFromSheet`, `scanAllContactInfo`, `parseContactFromMessages_`, `extractPhone_`, `extractRegion_` 등 연락처 파싱 함수 전부 포함 확인.

**dryRunContactScan() 실행:**
- Script Properties: `CONTACT_SCAN_SHEET_ID`(구글 시트 파일 ID) 등록 필요. `연락처_스캔결과` 탭은 자동 생성.
- Admin 권한 없음 → 스크립트 실행자 본인이 소속된 스페이스만 스캔 가능(봇만 있는 스페이스 제외).
- 5.5분 타임리밋 후 자동 중단·체크포인트 저장 → 재실행 시 이어서 진행.
- **1차 실행 결과:** total 375건 중 written 323건, skipped 7건, noData 45건.
- 구글 시트 데이터 미반영 → `CONTACT_SCAN_SHEET_ID`가 다른 파일을 가리키고 있을 가능성(확인 중).

**미결:**
- `CONTACT_SCAN_SHEET_ID` 올바른 시트 ID 여부 확인 후 재실행
- dryRun 결과 검토 후 `applyContactScanFromSheet()` 실행(G열 체크박스 TRUE인 행만 Supabase PATCH)

---

## 세이브 포인트 인덱스

| 태그 | 내용 |
|------|------|
| save-20260305 | GAS AutoAddBot + n8n 엔드투엔드 완료 |
| save-20260222-analyze-quote-edge | analyze-quote Edge Function, parseFileWithAI invoke 전환 |
| save-20260221-order-assets-dialog-a11y | 발주 자산·uploadEngine 확장·Dialog 접근성 |
| save-20260214-sheet-update-date | 구글 시트 갱신일 기준 오늘 갱신·D-Day |
| save-20260214-card-final-estimate | 상담 카드 2행 최종 견적가 표시 |
| save-20260213-google-sheet-sync | 구글 시트 ↔ 수파베이스 양방향 동기화 |
| save-20260212-estimate-upload-products-selling-price | 견적서 이중저장·products 판매단가 |
| save-20260210-ai-quick-estimate-modal | AI 퀵 원가표·참고 견적서 모달 UX |
| save-20260210-showroom-consultation-image | 쇼룸 통일·상담 삭제·이미지 상담용 |
| save-20260210-migration-stats | 마이그레이션·6개월 통계·아카이브 |
| save-20260209-faq-channel | 상담 숨기기·아카이브·마이그레이션·FAQ |
| save-20260209-archive-migration | 상담 숨기기·아카이브·마이그레이션 날짜 소급 |
