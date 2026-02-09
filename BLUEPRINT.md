Blueprint: FindGagu OS (ivory-os) 1. 개요 - 목적: 가구 업계 표준 OS 구축 (상담부터 시공까지 데이터 통합) - 대상: 8년 차 가구 전문가(대표님), 상담직원, 현장 시공팀 2. 시스템 아키텍처 - Frontend: Lovable로 디자인된 React 기반 웹 앱 - Backend/DB: Supabase (RBAC 권한 제어 적용) - AI/IDE: Cursor (이부장 페르소나 적용) 3. 핵심 페이지 모듈 - 상담 관리: 고객 유입 경로, 등급(관리주의 등) 및 이력 관리 - 마케팅 관리: 후킹형/전문가/스토리텔러 스타일 문구 생성 - 현장 담당: 모바일 최적화 시공 리스트, 사진 업로드, 실시간 후기 수집 4. 데이터 플로우 - 상담 등록 → 마케팅 데이터 자산화 → 배차 및 시공 전송 → 현장 완료 및 후기 DB 저장

# 프로젝트 설계도 (BLUEPRINT) - 최종 통합 명세서

## 1. 데이터베이스 스키마 (Supabase / PostgreSQL)

### [Set 1] 사용자 및 권한 (Users & RBAC)
- `id`: UUID (PK)
- `email`: String (Unique)
- `role`: Enum (admin, sales, technician)
- `profile_img`: URL
- `team`: String (영업1팀, 시공2팀 등)

### [Set 2] 가망 고객 및 상담 관리 (Leads & CRM)
- `id`: UUID (PK)
- `company_name`: String (업체/학교/학원명)
- `manager_name`: String (담당자명)
- `contact`: String (연락처 - 중복체크 로직 대상)
- `industry_type`: Enum (초등학교, 중학교, 고등학교, 어학원, 입시학원, 오피스, 카페)
- `expected_revenue`: Number (예상 매출액 - 리스트 정렬 기준)
- `interest_level`: Enum (High, Medium, Low)
- `marketing_status`: Boolean (마케팅 활용 동의 여부)
- `marketing_agreed_at`: DateTime (동의 일시 기록)
- `status`: Enum (상담중, 견적발송, 계약완료, 휴식기, 거절)
- `is_golden_time`: Generated Column (created_at 기준 30일 이내 여부)
- **상담 단계(워크플로우):** 4단계로 고정 — `metadata.workflow_stage`: **상담접수 → 견적중 → 계약완료 → 시공완료**. (기존 '현장실측' 단계는 제거됨.)
- **AS 요청:** `metadata.as_requested` (Boolean), `metadata.as_reason` (선택). **상태 강제:** AS 신청 시 `status`를 즉시 **`AS_WAITING`**으로 변경. [AS 대기] 탭은 `status === 'AS_WAITING'` 기준 필터. [종료] 탭에는 AS 대기 건 노출하지 않음. 리스트 카드에서 별도 배지 및 [AS 관리] 버튼으로 토글.
- **고객 등급 동기화:** `metadata.customer_tier` (Enum: 신규, 단골, 파트너, 조심, 미지정). **동일 연락처 기반 등급 상향 평준화** — 동일 연락처를 가진 모든 상담 카드에 대해, 한 건이라도 상위 등급(예: 단골)이 있으면 해당 연락처의 모든 카드에서 그 등급을 유지. "한 번 단골은 모든 카드에서 단골". 등급 수정 시 동일 연락처 다른 상담 건에 일괄 반영.
- **다중 견적 관리:** 한 프로젝트(상담)당 여러 버전의 견적서를 보관. `metadata.estimate_history`: 배열. 각 항목은 `{ version, issued_at, amount, summary?, is_final }`. **대표 금액 우선순위:** (1) `is_final === true`인 견적 금액, (2) 없으면 최신(가장 최근 발행) 견적 금액, (3) 없으면 `expected_revenue`. [확정하기] 클릭 시 해당 견적만 `is_final: true`, 나머지 `false`, `expected_revenue` 컬럼도 확정 금액으로 동기화.
- **오픈마켓 인입:** `metadata.source`에 네이버 스토어, 쿠팡, 오늘의집, 자사몰 등. 오픈마켓 선택 시 `metadata.order_number`, `metadata.is_market_order: true` 저장. 카드 1행 좌측에 마켓별 배지(네이버 연두, 쿠팡 붉은색 등) 표시.
- **상담 식별자(display_name) [확정 데이터 표준]:** `[YYMM] [상호] [전화번호 뒷4자리]` 형식으로 자동 생성. 예: `2602 목동학원 1234`. 업체명(company_name)·연락처(contact) 뒷 4자리를 조합하여 DB 트리거 또는 애플리케이션 로직으로 저장. 상담 리스트·히스토리 타이틀·검색(뒷4자리 검색)에서 사용. **데이터 표준으로 고정.**
- **consultation_messages.is_visible:** boolean, default true. false면 일반 사용자 타임라인에서 해당 메시지 숨김. 관리자(admin)는 숨겨진 메시지도 연하게 보고 [다시 보이기]로 복구 가능. 수동 메모·시스템 메시지(견적 발행 등) 동일 적용.
- **consultations.is_visible (상담 카드 숨기기 / Soft Delete):** boolean, default true. false면 **메인 상담 리스트·탭 카운트·이번 달 실적·골든타임 카운트·제품별 시공·시공 뱅크 매칭** 등 모든 통계/목록에서 제외. 관리자 전용 아카이브(`/admin/archive`)에서만 노출. 상담 상세 슬라이드(히스토리 탭)에서 관리자만 [이 상담 숨기기] 버튼 → **앱 내 확인 Dialog**(취소/숨기기) 후 is_visible = false 저장. **데이터 무결성:** 모든 상담 목록/통계용 select에는 `.eq('is_visible', true)` 필터 강제.

### [Set 3/4] 견적 및 시공 사례 (Quotation & Portfolio)
- `quotation_id`: UUID (PK)
- `items`: JSONB (품목명, 규격, 수량, 단가 리스트)
- `total_amount`: Number
- `official_seal_url`: URL (투명 PNG 직인 이미지)
- `share_token`: String (시공 사례 외부 공유용 고유 키)
- `portfolio_images`: Array[URL] (시공 전/후 사진)
- **프로젝트당 다중 견적:** 상담(프로젝트) 단위로 `metadata.estimate_history[]`에 버전별 견적(V1, V2, 최종 확정) 저장. 버전번호·발행일·금액·주요내용·확정여부(is_final) 포함. 카드/상세 대표 금액은 확정 견적 → 최신 견적 → expected_revenue 순.
- **예산 기획안 vs 확정 견적서 양식 분리:** (1) **예산 기획(PROPOSAL):** 비고 컬럼 없음, 단가(최소)/단가(최대) 분리, 금액·합계 범위(최소~최대) 표시, 품명·금액(공급가) 각 150px, A4(210mm) 인쇄. 공급자 정보 고정(주식회사 파인드가구, 대표이사 김지윤 등), 직인 미표시, 면책문구 노란 박스. (2) **확정 견적(FINAL):** 비고(Remarks) 컬럼 필수, 단가·금액(공급가) 컬럼 비율 조정(단가 120px, 금액 200px), A4 동일. (3) 테이블 헤더·셀은 모드별 조건부 렌더링(if/else)으로 분리.
- **견적서 20행 고정:** 테이블 행은 **최대 20행**으로 통일. 부족분은 `createEmptyRow(index)`로 빈 행 패딩. PDF 인쇄·미리보기·이미지 저장 시 동일 20행 기준 렌더링(A4 일관성). `FIXED_ESTIMATE_ROWS = 20`.
- **PDF/이미지 저장 파일명 규격:** 이미지(PNG) — `buildEstimateImageFilename(quoteDate?, recipientName?)` → `견적서_YYYY-MM-DD_업체명.png`. PDF — `buildEstimatePdfFilename(recipientName?)` → `견적서_업체명.pdf`. `estimatePdfExport.ts`에 정의.
- **예산 기획안 발행승인 3단계:** (1) 발행승인 클릭 시 즉시 승인하지 않고 고객 화면 그대로의 **관리자 미리보기 팝업** 노출. (2) 팝업 내 '최종 발행' 시 문서 APPROVED, **final_proposal_data**에 해당 시점 스냅샷 저장(원본 상담/임시저장과 독립 보존). (3) 승인 후 견적 관리 탭에 '링크 복사'·'PDF 다운로드' 노출, 채팅에 "기획안이 발행되었습니다" 시스템 메시지 자동 생성. 공유 페이지 `/p/estimate/:id`(PublicProposalView).
- **estimates 테이블:** `payload`(임시저장/편집용), `final_proposal_data`(jsonb, 발행 시점 고정 스냅샷), `approved_at` 등. 발행된 기획안 표시/PDF/공유는 `final_proposal_data` 사용. **저장 = 확정:** 견적 임시저장(ConsultationManagement handleEstimateSaveDraft) 시에도 `approved_at` 자동 설정. **확정 견적 연동:** consultations에 `metadata.final_amount`(VAT 포함 총액), `metadata.final_estimate_id`(확정 견적 id) 저장. PDF 모달 [최종 확정] 시 위 메타·status=계약완료 반영. FINAL 견적 삭제 시 해당 메타·확정견적 금액 초기화. **6개월 견적 통계(ConsultationManagement):** 최근 6개월 내 is_visible=true 견적 기준으로 최대·최소·**실제 중간값**(max/min 평균이 아닌, 정렬 후 중앙에 가까운 견적 금액) 및 각 estimate_id 매핑. **원가 연동:** 최근 견적 품목 기준 vendor_price_book/products 조회 후 합산 원가 표시. **견적 이력 섹션 UI:** [최대: N원 | 중간: N원 | 최소: N원 | 원가: N원] 4가지 지표. 최대/중간/최소는 클릭 시 해당 견적서 상세 팝업(setPrintEstimateId), 툴팁 "해당 견적서 보기", cursor-pointer.
- **데이터 통합 관리(마이그레이션):** `consultations`·`estimates`에 `is_test`(boolean, default false) 컬럼. `/admin/migration` 페이지에서 멀티 파일 업로드 → AI 파싱(Mock 또는 VITE_MIGRATION_PARSE_API) → 검수 테이블 편집 → Consultations/Estimates 생성 시 `is_test: true`, `metadata.migration_tag: '과거데이터'`. **날짜 소급:** 저장 시 `consultations.created_at`은 AI 파싱한 **인입일(quoteDate)**로 설정(골든타임 배지 정확 반영). **인입일 수동 수정:** 검수 테이블에 인입일(날짜) Date Picker 컬럼으로 AI 오인 시 사용자 직접 수정 가능. 테스트 모드 시 업체명 앞 [TEST] 접두사. [저장] 완료 시 토스트 "테스트 데이터가 생성되었습니다" 후 상담 관리(`/consultation`)로 이동. [모든 테스트 데이터 삭제]로 is_test 건 일괄 삭제. **파일명 인코딩(Mac 호환):** 업로드 시 원본 파일명 대신 `toSafeStoragePath(originalName, prefix)`로 `{prefix}_{timestamp}_{random}.{safeExt}` 형식 저장. pdf/jpg/png만 허용, 한글/특수문자로 인한 MIME 오류 방지. **저장 = 확정:** 견적 저장 시 `approved_at`에 현재 시간 자동 설정(별도 승인 절차 없음).

### AI 견적 도우미 (estimateAiService / estimateUtils)
- **역할 분리:** 자연어 파싱은 `estimateAiService.parseQuickCommand`, 금액·계산은 `estimateUtils`만.
- **LLM 연동 준비:** 현재 Mock으로 결과값만 리턴. 추후 `fetch('/api/estimate-parse', { body: JSON.stringify({ text, context }) })`로 교체 가능. 프롬프트 → JSON 응답 구조로 단순화.
- **QuickCommandResult 타입:** `add_row`, `past_price`, `target_total`, `needs_unit_price`, `needs_spec`, `spec_reply`, `unknown`. EstimateForm에서 `switch (res.type)`로 분기.
- **유틸:** `parseAmountToWon`("25만" → 원화), `scaleFactorToTarget`(총액 맞춤 배율), `roundToPriceUnit`(가구 단가·원가 100/1,000원 단위 반올림), `getMarginSignalClass`(마진율 신호등). 복잡한 케이스는 코드로 방어하지 않고 LLM에 위임.
- **역산 로직 전역 고정:** 마진율 = (판매가 − 원가) / 판매가 × 100; 판매가 = 원가 / (1 − 마진율/100). 모든 역산·반올림은 `roundToPriceUnit` 적용. 단가 수정 → 마진율 표시만 갱신, 마진율 수정 → 단가 역산만 수행(상호 무한루프 방지). 신호등: ≥30% 초록, 25~30% 주황, <25% 빨강 — 행·수익 분석기 패널 전역 적용.
- **품명 표준:** [품명] ([사이즈] / [색상]). 견적 행에 `color`, `costEstimated`(역산 원가 여부) 필드. 원가 없을 때 기본 마진 30% 역산 가상 원가 + '역산됨' 태그. 원가 이력에 단가만 있는 과거 건은 '(추정)' 표시.
- **UI:** 견적 테이블 위 "AI 퀵 커맨드" 입력창. 빈 행 우선 채우기, 되묻기(규격), 과거 단가 조회, 총액 맞춤 지원. AI 입력 예: "스마트A 1200 600 모번" → 품명(사이즈/색상) 포맷으로 자동 변환.

### [Set 5] 일정 및 현장 관리 (Operations)
- `id`: UUID (PK)
- `site_address`: String (현장 주소)
- `site_details`: JSONB (층수, 엘리베이터 유무, 사다리차 가능여부, 주차환경)
- `navi_deeplink`: String (카카오/T맵 딥링크 주소)
- `technician_id`: UUID (FK to Users)
- `special_notes`: Text (현장 주의사항 - 핑크색 강조 UI 데이터)

### [Set 6/7/8] 마케팅 자동화 및 분석 (Marketing & Analytics)
- `openclo_content_id`: String (외부 OpenCLO 연동 ID)
- `content_links`: JSONB (블로그, 숏폼, 롱폼 배포 URL 저장)
- `wake_up_trigger_days`: Integer (Default: 3, 견적 후 재연락 알림 기준)
- `ad_budget_remain`: Number (광고비 잔액 - 부족 시 경고 알림 트리거)
- `channel_roi`: Float (채널별 유입 대비 계약 전환율)

---

## 2. UI/UX 인터랙션 표준

### 1) 상담 리스트 카드 레이아웃 (고정 규격) — 2026-02-08 최신
- **1행:** 좌측 — [고객등급 배지] 업체명 [AS 요청 배지(요청 시만)] [확정견적 N원]. **우측 고정** — 6단계 텍스트(접수|견적|계약|완료|AS|캔슬) 고정 너비, 현재 단계만 색상·진하게, 나머지 연한 회색 + transition-colors | 편집 | 전화번호 복사.
- **2행:** [골든/상태 배지] · 인입채널 · 지역 · 업종 · 전화번호 · (주문번호) · 인입날짜 · 요청날짜. **골든 배지:** 2행 최좌측. D+0~7 ⚡골든타임(주황), D+8~20 🌿집중상담(초록), D+21~30 🔔이탈경고(노랑), 계약완료 시 🏗️진행중(파랑). 31일 초과 시 배지 제거·카드 opacity 낮춤(장기 미체결). 완료·캔슬·AS 단계에서는 골든 배지 미노출. **인입채널:** metadata.source, 9종(채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타), 기본값 채널톡. **2행 우측 끝 고정:** [구글챗 입장] 버튼(연결 상태별 초록/회색 분기).
- **3행:** 요청사항(페인포인트) — 연한 배경. **4행:** 구글챗 버튼 등.
- **상단 탭:** 전체 | 미처리 | 진행중 | AS대기 | 종료 | **캔슬**. 캔슬 탭 = status '거절'만 필터. 종료 = 시공완료만.
- **조회 기간:** 전체 기간 | **이번달**(기본값) | 최근 1개월 | 3개월 | 6개월 | 1년. 이번달 = 당월 1일 00:00 ~ 현재(startOfMonth 활용).

### 2) 고객 상세 보기 (Slide-over Drawer)
- **방식:** 리스트 클릭 시 우측에서 슬라이드 팝업 노출.
- **좌측 섹션:** 기본 정보 및 상담 데이터 수정.
- **우측 섹션 (통합 타임라인):** `action_type`: 자동문자(Wake-up), 수동상담, 시스템알림, 상태변경. 페이스북 타임라인 스타일로 최신순 정렬 및 아이콘 구분.
- **상담 숨기기:** 히스토리 탭 상단에 관리자(isAdmin)일 때만 [이 상담 숨기기] 버튼. 클릭 시 **앱 내 확인 Dialog**(네이티브 confirm 대신) — "이 상담을 숨깁니다. 리스트와 통계에서 제외되며, 관리자 아카이브에서만 볼 수 있습니다. 계속할까요?" [취소] / [숨기기]. [숨기기] 시 is_visible = false, 리스트에서 제거·패널 닫힘.
- **실측 데이터 분리:** 상담 타임라인 내에서 실측 PDF/텍스트 메모를 **직접 렌더링하지 않음**. 우측 상단에 **[실측 자료(PDF)]** 아이콘 버튼만 배치. 클릭 시 전용 모듈로 이동하거나 모달을 띄우며, 모달에서 "실측 정보 입력 페이지로 이동" 링크로 `/measurement/upload?consultationId=xxx` 연결. 타임라인 가독성 확보 및 실측 전용 워크플로우 분리.

### 2-1) 관리자 아카이브 (숨긴 상담 전용)
- **경로:** `/admin/archive`. **ArchivePage.tsx** (src/pages/admin/ArchivePage.tsx).
- **데이터:** `useConsultations(false)` → is_visible = false인 상담만 조회.
- **복구:** [복구] 클릭 시 is_visible = true → 상담 리스트·통계 재포함.
- **영구 삭제:** [영구 삭제] 클릭 시 해당 상담의 estimates 삭제 후 consultations 행 삭제.
- **필터:** "[TEST] 데이터만 보기" 체크 시 company_name 앞 [TEST] 접두사만 표시.
- **훅:** `src/hooks/useConsultations.ts` — useConsultations(visibleOnly: true) 리스트/대시보드용, useConsultations(false) 아카이브용.

### 3) 이미지 자산 이원화 (Cloudinary + Supabase) — 강제 원칙
- **이원화 강제:** 모든 시공 사진 업로드 로직은 반드시 **Cloudinary(고화질)** 와 **Supabase(썸네일)** 로 분기한다. 이 원칙에서 벗어난 코드는 허용하지 않음.
- **구현:** `imageAssetService.uploadConstructionImageDual(file, publicId)` — 1) Cloudinary Upload API로 고화질 업로드 → `public_id` 확보, 2) Supabase Storage `construction-assets`에 썸네일 경로 업로드. 환경변수 `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`(unsigned) 필수.
- **Cloudinary:** 업로드 시 `public_id`에 파일명 규칙 적용. 블로그/마케팅용 고화질 URL 생성의 주 데이터 소스.
- **Supabase:** `project_images` 테이블에 `cloudinary_public_id`(Primary Reference), `display_name`, `storage_path`, `thumbnail_path` 등 메타 저장. Storage는 모바일/저용량 경로 보조 사용.
- **매칭 원칙:** 동일 이미지는 Cloudinary `public_id`와 Supabase `cloudinary_public_id`로 1:1 매칭하여 동기화. 삭제/동기화 시 Public ID 기준으로 처리.

### 3-0) 발주서(PPT/PDF) 시스템 중심 및 상담 카드 통합
- **발주서 중심:** PPT/PDF 발주서를 데이터의 핵심으로 두고, 현장별 갤러리·제품별 시공 현장 리스트·라이트박스 퀵뷰를 제공한다.
- **order_documents 테이블:** `consultation_id`, `storage_path`, `file_name`, `file_type`(pdf/ppt/pptx), `thumbnail_path`, `product_tags`(jsonb 배열). Storage 버킷 `order-documents`(비공개, RLS).
- **상담 카드 통합:** 상담 관리 내 **실측·발주서** 탭은 단순 파일 리스트가 아닌, **Supabase Storage 기반 비주얼 갤러리 뷰**로 동작한다. 썸네일(또는 타입 아이콘) 표시, 클릭 시 라이트박스(Quick View)로 PDF 즉시 보기 또는 PPT 다운로드.
- **제품-현장 매칭:** 발주서에 기재된 제품명·규격을 `product_tags`로 추출하여 **제품별 시공 현장 리스트**를 자동 구성. `productDataMatching.getDataByProductTag(productTag)`로 Supabase·Cloudinary 데이터를 정확히 호출하는 인터페이스 사용.

### 3-1) 실측 모듈 독립화 (Measurement — 내부 기술 자산)
- **분리 원칙:** 실측 PDF·치수 메모·시공 유의사항은 상담 히스토리 타임라인과 **완전 분리**. 시공사례 뱅크(Cloudinary)와도 격리된 **내부용 기술 자산**으로만 취급.
- **저장소:** Supabase Storage 버킷 **`measurement-drawings`** (비공개, RLS 적용). 파일 경로 규칙: `{consultation_id}/{timestamp}_실측도면.pdf`. 상담 메타는 `metadata.measurement_drawing_path`에 경로만 저장.
- **접근 방식:** 상담 상세에서는 [실측 자료(PDF)] 버튼 → 모달 → "실측 정보 입력 페이지로 이동". **실측 정보 입력** 전용 라우트 `/measurement/upload`에서 PDF 업로드·텍스트 메모 입력 후 자동으로 `measurement-drawings`에 저장 및 metadata 반영.
- **미리보기:** 내부 뷰어는 **Signed URL**만 사용. 일시적(예: 5분) 유효, 외부 공유 불가 구조로 설계.

### 3-2) 이미지 자산 관리 vs 시공 사례 뱅크 (역할·컴포넌트 완전 분리) — Lock-in
- **시스템 아키텍처 — 페이지·라우트 분리 (두 컴포넌트 혼동 금지):**
  - **이미지 자산 관리** (`/image-assets`) — **ImageAssetViewer.tsx**: **관리자(Admin/Back-end) 전용 창고**. 사진 업로드, Cloudinary 연결, 태그 수정, 삭제, 검수 승인이 목적. 이 쪽을 “뱅크 UI”로 쓰지 않음.
  - **시공 사례 뱅크** (`/portfolio`, `/assets`) — **PortfolioBank.tsx**: **영업(Sales/Front-end) 전용 전시관**. 업종/검색 필터, **현장별/사진별 토글**, 사진 선택(ShareCart), **카톡 공유 링크 생성**이 핵심. 영업 직원 무기.
- **데이터 계층:** 뱅크는 `imageAssetService.fetchApprovedProjectAssets()`로 approved만 조회. `rowToProjectAsset`으로 DB 행 → ProjectImageAsset 변환. ImageAssetViewer 코드를 뱅크에서 참조하지 않음.
- **뱅크 전용 UI:** 상단 [현장별]|[사진별] 토글(사진별 = 평탄 그리드, 현장별 = project_title 그룹). 업종 필터·통합 검색 동일 적용. 선택 시 카톡 공유 바([N장 공유 링크 복사], 카톡으로 공유). 라이트박스에서 앞뒤 넘기기·「이 현장 앨범 보기」로 현장별 모드 전환 및 해당 섹션 스크롤.
- **UI 흐름 정리:** 관리(ImageAssetViewer) = 태그·삭제·원본·검수. 영업(PortfolioBank) = 전시·토글·필터·공유·라이트박스. **한 컴포넌트가 두 역할을 담당하지 않음.**

### 4) 현장 담당자 전용 (Technician Mobile View)
- **권한 분리:** 'technician' 권한 로그인 시 [일정 관리], [현장 담당] 메뉴만 활성화.
- **핵심 기능:** 도착/완료 버튼, 현장 사진 업로드(마케팅 연동), 내비게이션 즉시 실행.

### 5) 상담 채팅 UI 및 파일 업로드
- **채팅 UI:** 기본 Tailwind 클래스(bg-slate-100, text-slate-900 등)로 표시. 인라인 테마 강제·다크 클래스 무력화는 안정성 검증 시까지 **보류**.
- **상담 히스토리 타임라인:** 시스템 메시지(날짜·발행 안내) 왼쪽 정렬, 수직 가이드라인 유지. **consultation_messages.is_visible:** 일반 사용자는 is_visible === true만 노출. 관리자(admin)는 숨겨진 메시지도 연하게(opacity-60) 표시, [다시 보이기](Eye 아이콘)로 복구. 모든 메시지(직원/고객/시스템)에 [숨기기](EyeOff) 노출, 호버 시 우측에 표시.
- **타임라인 관리자 기능:** isAdmin일 때 시스템 메시지에 [휴지통] 영구 삭제 버튼 노출. 확인 팝업 후 consultation_messages DELETE. admin 권한: localStorage 'findgagu-role' === 'admin' 또는 URL ?admin=1 (실권한 연동 전).
- **드래그 앤 드롭 파일 업로드:** 안정성 검증 시까지 **보류**. 현재는 파일 선택 버튼(Paperclip) 방식만 사용.

### 6) 시공 사례 뱅크 (검색 엔진형) — Lock-in
- **페이지·명칭:** **시공 사례 뱅크** (`/portfolio`, `/assets`). 제목 **[시공 사례 뱅크]** 확정. 영업용 전시관. 온라인 상담 중심으로 뱅크를 검색 엔진처럼 활용.
- **통합 검색 (filterByUnifiedSearch):** 상단 검색바 하나에서 **제품명(product_tags)·색상(color)·현장명(project_title)** 을 동시에 검색. 검색어를 공백으로 나눈 **모든 단어가 포함된** 자산만 노출 — **AND 조건** 확정. 예: "스마트A 화이트" → 제품/태그에 "스마트A" 포함 **그리고** 색상/현장에 "화이트" 포함된 사진만 표시.
- **색상 퀵필터:** DB `project_images.color` 값을 수집하여 상단에 [화이트], [오크], [블랙] 등 퀵필터 버튼 배치. 선택 시 해당 색상만 필터.
- **공유 최적화:** 시공 사례 상세(라이트박스)에 **이미지 주소 복사**(고화질 Cloudinary URL), **현장 링크 공유**(`/consultation?focus={consultationId}`) 버튼을 눈에 띄게 배치. 상담 관리 측에서 `?focus=` 쿼리 지원으로 링크 진입 시 해당 상담 자동 선택.
- **역방향 견적 (고정 흐름):** 시공 뱅크 라이트박스에서 **product_tags** 제품을 클릭하면 **location.state**로 상담 관리(`/consultation`)로 이동하며, `addEstimateProductName`을 전달. ConsultationManagement의 useEffect에서 state를 읽어 견적 모달을 열고 해당 품명이 담긴 행을 **자동 삽입**. 동일 진입에 대한 모달 중복 오픈 방지를 위해 `lastLocationKeyRef`로 한 번만 처리.
- **이미지 이원화 훅 (useDualSourceGallery):** 견적서·시공 사례에서 품명 선택 시 **Supabase(썸네일)** 와 **Cloudinary(고화질)** 를 분기하여 호출하는 훅. `getDataByProductTag` 기반으로 썸네일 목록 노출, 클릭 시 Cloudinary 고화질 라이트박스. 안정성 확정.
- **태그 매핑 1:N:** `tag_mappings` 테이블로 제품 DB 품명과 Cloudinary 이미지 태그를 1:N 매핑. `getCloudinaryTags(productName)`로 품명에 해당하는 모든 태그 조회 후 매칭 로직에 사용.

### 7) 공유 시스템 (Share Logic) — Lock-in
- **공유 전용 페이지:** `/public/share?ids=uuid1,uuid2,...`. **PublicGalleryView** 컴포넌트. 로그인 없이 접근 가능한 공개 갤러리. 모바일 최적화 뷰(2열 그리드, 라이트박스).
- **공유 모드 UI:** 시공 사례 뱅크(`/portfolio`, `/assets`)에서 사진별 체크박스로 **ShareCart** 상태에 담기. 선택 시 상단 액션 바에 **[N장 공유 링크 복사]**·카톡 공유·선택 해제. 복사되는 URL은 `/public/share?ids=...` 고정.
- **보안:** 외부 공유 페이지에서는 **사진·제품명(product_tags)·색상(color)** 만 노출. 원가·마진·consultation_id·내부 메타 등 민감 정보는 절대 노출하지 않음. `project_images` 조회 시 `status='approved'`만 사용.
- **성능:** 리스트는 썸네일(Storage/Cloudinary mobile) 우선 로딩, 클릭 시 고화질(marketing) URL로 라이트박스 표시.
- **경로 호환:** `/share/gallery?ids=...` 접근 시 `/public/share?ids=...` 로 리다이렉트.
- **견적서 연동:** 견적서 모달에서 [이 품목 사진들 공유하기] 클릭 시 견적 품목명으로 `getDataByProductTags` 호출 → 매칭된 시공 사진 ID 수집 → `/public/share?ids=...` 링크 생성·복사.
- **카카오 공유:** `VITE_KAKAO_JS_KEY` 설정 시 카카오 JS SDK 로드, 갤러리 링크를 카톡 피드 카드로 공유. 미설정 시 링크 복사만 수행.

---

## 3. 핵심 비즈니스 로직 (Automation)

### 1) 30일 골든타임 관리 (created_at 기준 경과일)
- **src/utils/dateUtils.ts:** `getElapsedDays`, `getGoldenTimeState(createdAt)` — tier: D+0~7 urgent(Hot), D+8~20 progress(Active), D+21~30 deadline(Warning), 31일+ null(Expired). `isDeadlineSoon` = D+27(종료 3일 전, 알림 트리거용).
- **카드 2행 최좌측 배지:** Hot ⚡골든타임(주황), Active 🌿집중상담(초록), Warning 🔔이탈경고(노랑), 계약완료 시 🏗️진행중(파랑). 31일 초과 시 배지 제거·카드 opacity-70(장기 미체결). 완료·캔슬·AS 시 골든 배지 미노출.
- 30일 종료 3일 전(D+27) 담당자 알림용 상태값 `goldenTimeDeadlineSoon` Lead에 포함.

### 2) 고객 Wake-up 시스템
- 상담 상태가 '견적발송'에서 멈춘 지 N일 경과 시, "검토해보셨나요?" 메시지 발송 후보 리스트 자동 생성.

### 3) 콘텐츠 허브 재활용
- OpenCLO에서 생성된 '공간 기획 팁' 등 결과물 URL을 DB에 연동.
- 상담 상세 팝업에서 고객 페인포인트에 맞는 콘텐츠 링크 자동 추천 및 즉시 전송 기능.

### 4) 구글챗 스페이스 자동 생성 연동 (설계)
- **자동화 워크플로우:** [신규 상담 등록] → [Backend API: Google Chat Space 생성] → [consultations.metadata.google_chat_url 업데이트].
- **버튼 배치 및 상태 분기 (확정):** 카드 **2행 우측 끝 고정** 위치에 [구글챗 입장] 버튼 배치. **(A)** `metadata.google_chat_url` 존재 시 **초록색** 스타일, 클릭 시 해당 스페이스 새 탭 오픈. **(B)** `metadata.google_chat_pending === true` 시 **회색** + "스페이스 생성 중…" 스피너. **(C)** 그 외 **회색** 비활성, 클릭 시 "연결된 스페이스가 없습니다" 안내. Real-time 구독으로 metadata 변경 시 새로고침 없이 반영.
- **Mock 검증:** Supabase 대시보드에서 해당 consultation의 `metadata`에 `google_chat_url: "https://chat.google.com/room/AAAA..."` 를 추가·저장하면, 별도 새로고침 없이 해당 카드에 [구글챗 입장] 버튼이 나타나는지로 UI 반응 시나리오 검증.

### 5) 채널톡 시뮬레이터 및 FAQ 자동 응답 (2026-02-09 반영)
- **채널톡 시뮬레이터:** `/admin/test-console` (TestConsole.tsx). 이름·연락처·문의내용·업종 입력 후 `processSimulatedIncoming` 호출 → consultations·consultation_messages 생성, is_test: true. AI 파싱 Mock·업종별 마케팅 링크·발송 예정 메시지 타임라인 기록.
- **FAQ 엔진:** `src/lib/channelTalkService.ts` — `FAQ_DATA`(키워드별 표준 답변), `matchFaqKeyword(inquiry)`로 첫 매칭 키워드 선택. 매칭 시 3단계 자동 응답(안심 → 정보(FAQ 답변) → 가치(블로그 링크)), 전부 `[AI 자동 응답]` 접두어로 타임라인 기록. 매칭 없으면 순차 안내 멘트 1건.
- **FAQ_DATA 키 문법:** 특수문자 포함 키(예: **A/S**)는 반드시 **따옴표로 감싼** 문자열 리터럴 사용(`'A/S'`). 그 외 키도 안정성을 위해 모두 따옴표 적용(가격, 비용, 사이즈, 규격, 배송, 설치, 견적, 상담, 기간, A/S, **AS**). 문의에 "AS"(슬래시 없음)만 있어도 A/S 답변이 나오도록 **'AS'** 키 추가·동일 답변 매핑.

## 4. 비즈니스 컨텍스트 (기획 의도 및 디테일)

### 1) 가구 영업의 특수성
- **골든타임:** 등록 후 30일이 넘어가면 이탈 가능성이 매우 높음 (30일 필터링의 이유).
- **시즌성:** 학원은 방학 전, 학교는 방학 중이 피크 타임. 해당 시기에 맞는 퀵 필터 버튼 필요.
- **웨이크업:** "살 거냐"고 묻는 게 아니라 "검토해보셨나요?"라는 관심을 표명하여 신뢰를 쌓는 것이 목적.

### 2) 현장 실무 디테일
- **내비 연동:** 기사님들이 주소를 복사해서 내비 앱에 붙여넣는 번거로움을 없애는 것이 핵심 UX.
- **현장 정보:** 엘리베이터 유무, 층수, 사다리차 가능 여부는 견적 시점부터 시공팀까지 끊김 없이 전달되어야 함.

### 3) 마케팅 자산화
- 현장에서 찍은 사진 한 장이 OpenCLO를 통해 8개 채널로 퍼지는 '마케팅 공장' 구조 지향.
- 상담원은 고객의 페인포인트(좁은 공간 등)에 맞는 콘텐츠를 타임라인에서 즉시 골라 전송할 수 있어야 함.