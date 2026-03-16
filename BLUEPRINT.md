Blueprint: FindGagu OS (ivory-os) 1. 개요 - 목적: 가구 업계 표준 OS 구축 (상담부터 시공까지 데이터 통합) - 대상: 8년 차 가구 전문가(대표님), 상담직원, 현장 시공팀 2. 시스템 아키텍처 - Frontend: Lovable로 디자인된 React 기반 웹 앱 - Backend/DB: Supabase (RBAC 권한 제어 적용) - AI/IDE: **하이브리드 환경** — Cursor (시각적 편집·이부장 페르소나), Claude Code (터미널 기반 에이전트). 모든 개발 가이드는 이 병행 구성을 전제로 합니다. 3. 핵심 페이지 모듈 - 상담 관리: 고객 유입 경로, 등급(관리주의 등) 및 이력 관리 - 마케팅 관리: 후킹형/전문가/스토리텔러 스타일 문구 생성 - 현장 담당: 모바일 최적화 시공 리스트, 사진 업로드, 실시간 후기 수집 4. 데이터 플로우 - 상담 등록 → 마케팅 데이터 자산화 → 배차 및 시공 전송 → 현장 완료 및 후기 DB 저장

# 프로젝트 설계도 (BLUEPRINT) - 최종 통합 명세서

**개발 환경 전제:** 본 설계도 및 모든 개발 가이드는 **하이브리드 환경**을 전제로 합니다. Cursor를 통한 시각적 편집과 Claude Code를 통한 터미널 기반 에이전트 작업을 병행합니다.

## 0. AI 에이전트 역할 및 제약 사항 (Strategic Mode)

**Role: Strategic Planner & Prompt Engineer for Claude Code.** (전략 기획 및 프롬프트 엔지니어)

- **제약 사항 1 (Hard):** 직접 소스 코드를 작성하거나 파일(*.py, *.js 등)을 생성/수정하지 말 것. (Anti-gravity는 기획만 수행)
- **제약 사항 2:** 모든 분석 결과는 Claude Code가 실행할 수 있는 **'명령문(Prompt)'** 형태로만 출력할 것.
- **제약 사항 3:** 코드 구현이 필요하면 **'로직 설계도(Logic Schema)'**까지만 작성하고 구현은 클로드 코드에게 위임할 것.

## 1. 현재 임무 및 목표 (Current Mission)

### 1차 임무: GAS AutoAddBot + n8n 자동화 (완료 — 2026-03-05)
- **확정 흐름 (3세대):** 구글챗 스페이스 생성 → GAS AutoAddBot(5분 트리거) → 봇 초대 → n8n 웹훅 → 수파베이스 상담카드 직접 생성.
- **구글 시트 레거시:** GAS는 구글 시트에 붙어있지만 AutoAddBot은 시트를 읽거나 쓰지 않음. 구글 시트는 더 이상 데이터 흐름에 포함되지 않는 레거시.
- **Make → n8n 전환:** Make 무료 플랜(1,000 ops/월) 한계 → n8n으로 이전. `gas/n8n-workflow.json` 임포트 파일 완성.
- **GAS 버그 수정 완료:** OAuth 스코프(`chat.memberships.app`), createTime 필터, processed 저장 시점, Invalid Date 가드 전부 해결.
- **저장 필드:** project_name(displayName), start_date(오늘 날짜), channel_chat_id(spaceName), status('접수').
- **중복 체크:** channel_chat_id=eq.{spaceName}으로 기존 레코드 확인 후 INSERT/PATCH 분기.

### 2차 임무: 채널톡 기반 상담카드 자동 생성 (대기)
- **흐름:** 채널톡 웹훅 수신 -> 수파베이스 상담카드 자동 생성.
- **현재:** 1차 임무 완료 후 로직 설계 진행 예정.

### 2차 임무 재정의: 이미지 자산 허브 -> 쇼룸 안정화 -> 채널톡 폼 선도입 (2026-03-15)
- **최우선 순위:** 현재 1순위는 `이미지 자산관리 마이그레이션 완료`이다. 이 모듈은 단순 이미지 보관이 아니라 **쇼룸, 블로그 자동화, 유튜브 자동화, 카카오/채널톡 상담 자료 전송**의 공통 소스가 되기 때문이다.
- **이미지 자산 완료 기준:** 이미지 누락 없이 이전되고, 업종/현장/제품 기준으로 검색 가능하며, 쇼룸에서 정상 노출되고, 직원이 PC 카카오톡 응대 중 바로 찾아 복사/전송할 수 있어야 한다.
- **쇼룸 선행 조건:** 채널톡 세팅 전에 `/showroom`이 안정적으로 동작해야 한다. 쇼룸은 새로 두 개 만들기보다 **같은 쇼룸을 유지하되 진입 문맥만 다르게** 쓴다. 홈페이지 유입은 일반 탐색 모드, 채널톡 유입은 접수 후 대기/설득 모드로 본다.
- **채널톡 1차 도입 원칙:** 초기 버전은 AI 대화형보다 **폼 기반 질문 수집**을 우선한다. 질문은 `도움 유형 -> 업종 -> 면적 -> 지역 -> 전화번호` 순으로 받고, **전화번호를 입력해야 상담 접수가 완료**되도록 한다.
- **채널톡 폼 1차 확정 질문:**
  - `어떤 도움이 필요하신가요?` -> 비용 문의 / 제품 추천 / 상세 상담 / 기타
  - `업종은 무엇인가요?` -> 관리형 / 학원 / 스터디카페 / 아파트 / 학교 / 기타
  - `면적은 어느 정도인가요?` -> 30평 이하 / 30~40평 / 40~50평 / 50~60평 / 60평 이상 / 기타
  - `지역은 어디신가요?` -> 서울/경기 / 충북/충남 / 경북/경남 / 전북/전남 / 기타
  - `연락처를 남겨주세요.` -> 입력 완료 시 접수 종료
- **채널톡 인트로/보상 문구 원칙:** 폼 시작 전에는 "자세히 남길수록 더 빠른 상담과 유사 사례 안내가 가능하다"는 보상형 문구를 둔다. 쇼룸 링크는 **전화번호 입력 후** `기다리시는 동안 쇼룸 보기` 형태로 제안한다.
- **상담 추적 구조:** 채널톡 인입은 기존 `consultations`에 바로 섞기보다, 향후 **별도 채널톡 인입 대시보드/임시상담카드**로 관리하는 방향을 기본안으로 둔다. 정식 상담카드(구글챗 스페이스/실제 진행 카드)는 이후 전환된 건만 생성한다.
- **퍼블리시 전략:** Vercel 퍼블리시는 전체 백오피스 완성 전에도 가능하다. 단, **공개 페이지(쇼룸/문의)** 와 **내부 운영 페이지(상담관리/자산관리 등)** 는 로그인으로 분리되어야 하며, Supabase RLS 정리가 병행되어야 한다.

### 3차 임무: Google Chat 견적서 자동 처리 (보류 / 안전 롤백 완료 — 2026-03-12)
- **원래 목표:** 구글챗 스페이스에서 `견적서` 문구 + 이미지 첨부 메시지가 들어오면, 기존 수동 업로드 플로우 없이 자동으로 견적서 분석·저장까지 연결한다.
- **실험했던 흐름:** Google Chat 앱 멘션/메시지 -> n8n 웹훅 -> GAS 첨부파일 다운로드 -> Supabase Edge Function `process-chat-estimate` -> Gemini 분석 -> `estimates/products/consultation_estimate_files` 저장.
- **남겨진 구현 자산:** `supabase/functions/process-chat-estimate` 신규 생성 및 배포, `gas/Code.gs`의 `download_attachment` 분기, `gas/n8n-workflow.json`의 견적서 분기 로직은 코드 자산으로 유지한다.
- **서버측 수정 완료:** `consultations.company_name` 오조회 버그를 `project_name` 기준으로 수정했고, `analyze-quote` 내부 호출의 `401 Invalid JWT` 문제를 피하기 위해 `process-chat-estimate` 내부에서 Gemini를 직접 호출하는 구조로 전환했다.
- **운영 판단:** Google Chat 앱 즉시 응답 포맷과 실무 사용성 이슈 때문에, 라이브 운영에서는 견적서 자동 응답 실험을 더 진행하지 않고 **안전 롤백**을 선택했다.
- **현재 운영 상태:** 라이브 `n8n`과 로컬 `gas/n8n-workflow.json` 모두 `Webhook.responseMode = onReceived` 기준으로 되돌렸고, `Prepare Chat Response` / `Respond to Google Chat` 노드는 제거했다. 현재 프로덕션 웹훅 응답은 다시 `{"message":"Workflow was started"}` 이다.
- **현재 원칙:** 상담카드/견적 관리와 Takeout 기반 수동 보조 흐름을 우선 운영 기준으로 삼고, Google Chat 실시간 견적 자동화는 필요 시 **복제 워크플로우에서만 재실험**한다.

## 2. 데이터베이스 스키마 (Supabase / PostgreSQL)

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
- `status`: Enum (**접수, 견적, 진행, 완료, AS, 무효, 거절** — 7종 확정, 2026-03-09). **무효 vs 거절:** 단순 이탈(무효)은 통계에서 완전 제외, 영업 실패(거절)는 `metadata.cancel_reason`으로 사유 보존. KPI: `total_valid_leads = count(*) where status != '무효'`, `success_rate = (status 완료·비거절·비무효) / total_valid_leads`. 무효는 분모에서 제외해 성공률 왜곡 방지. **원칙:** 상태값은 직원의 수동 판단이 기본이다. **예외:** 업무 재개를 강하게 증명하는 이벤트는 자동 상태 변경을 허용한다. 현재 허용 예외는 **완료 상태에서 견적서 저장/확정 시 `견적` 복귀**이다. 반면 채팅방 활동(`update_date` 갱신)만으로는 상태를 자동 변경하지 않는다. **레거시 DB 매핑(마이그레이션 완료):** 상담중→접수, 견적발송→견적, 계약완료→진행, 휴식기/시공완료→완료, AS_WAITING→AS, 신규→접수, 캔슬→거절. 마케팅 자동화 시 휴식기 별도 구분은 추후 `metadata.marketing_pause` 플래그로 처리 예정.
- `is_golden_time`: Generated Column (created_at 기준 30일 이내 여부)
- **상담 리스트 탭 (업무 단계별):** 전체 | 미처리 | 견적중 | 진행중 | 종료 | 거절 | 무효. 전체=활성(미처리+견적중+진행중+AS 등), 미처리=상담접수, 견적중=견적중, 진행중=계약완료(워크플로우), 종료=시공완료(실적), 거절/무효 각각 별도 탭. 영업 사원이 단계별 우선순위 파악용. 거절 카드는 사유 강조, 무효 카드는 연하게 표시. 상세 패널 [무효 처리] 즉시 저장, [거절 처리]는 거절 사유 입력 모달 필수.
- **상담 단계(워크플로우):** 4단계로 고정 — `metadata.workflow_stage`: **상담접수 → 견적중 → 계약완료 → 시공완료**. (기존 '현장실측' 단계는 제거됨.)
- **AS 요청:** `metadata.as_requested` (Boolean), `metadata.as_reason` (선택). **상태 강제:** AS 신청 시 `status`를 즉시 **`AS`**로 변경. [AS 대기] 탭은 `status === 'AS'` 기준 필터. [종료] 탭에는 AS 대기 건 노출하지 않음. 리스트 카드에서 별도 배지 및 [AS 관리] 버튼으로 토글.
- **고객 등급 동기화:** `metadata.customer_tier` (Enum: 신규, 단골, 파트너, 조심, 미지정). **동일 연락처 기반 등급 상향 평준화** — 동일 연락처를 가진 모든 상담 카드에 대해, 한 건이라도 상위 등급(예: 단골)이 있으면 해당 연락처의 모든 카드에서 그 등급을 유지. "한 번 단골은 모든 카드에서 단골". 등급 수정 시 동일 연락처 다른 상담 건에 일괄 반영.
- **다중 견적 관리:** 한 프로젝트(상담)당 여러 버전의 견적서를 보관. `metadata.estimate_history`: 배열. 각 항목은 `{ version, issued_at, amount, summary?, is_final }`. **대표 금액 우선순위:** (1) `is_final === true`인 견적 금액, (2) 없으면 최신(가장 최근 발행) 견적 금액, (3) 없으면 `expected_revenue`. [확정하기] 클릭 시 해당 견적만 `is_final: true`, 나머지 `false`, `expected_revenue` 컬럼도 확정 금액으로 동기화.
- **오픈마켓 인입:** `metadata.source`에 네이버 스토어, 쿠팡, 오늘의집, 자사몰 등. 오픈마켓 선택 시 `metadata.order_number`, `metadata.is_market_order: true` 저장. 카드 1행 좌측에 마켓별 배지(네이버 연두, 쿠팡 붉은색 등) 표시.
- **상담 식별자(display_name) [확정 데이터 표준]:** `[YYMM] [상호] [전화번호 뒷4자리]` 형식으로 자동 생성. 예: `2602 목동학원 1234`. 업체명(company_name)·연락처(contact) 뒷 4자리를 조합하여 DB 트리거 또는 애플리케이션 로직으로 저장. 상담 리스트·히스토리 타이틀·검색(뒷4자리 검색)에서 사용. **데이터 표준으로 고정.** **식별자 정체성·안정 우선:** 채널톡 웹훅에서 최초 생성된 display_name은 후속 메시지로 자동 변경하지 않음. AI가 추출한 상호·평수·업종은 `metadata.ai_suggestions`에만 저장하며, 상담 상세 패널에서 직원이 [적용] 클릭 시에만 company_name·display_name·metadata.space_size·metadata.industry에 반영(수동 수정 우선).
- **consultation_messages.is_visible:** boolean, default true. false면 일반 사용자 타임라인에서 해당 메시지 숨김. 관리자(admin)는 숨겨진 메시지도 연하게 보고 [다시 보이기]로 복구 가능. 수동 메모·시스템 메시지(견적 발행 등) 동일 적용.
- **consultations.is_visible (상담 카드 숨기기 / Soft Delete):** boolean, default true. false면 **메인 상담 리스트·탭 카운트·이번 달 실적·골든타임 카운트·제품별 시공·시공 뱅크 매칭** 등 모든 통계/목록에서 제외. 관리자 전용 아카이브(`/admin/archive`)에서만 노출. 상담 상세 슬라이드(히스토리 탭)에서 관리자만 [이 상담 숨기기] 버튼 → **앱 내 확인 Dialog**(취소/숨기기) 후 is_visible = false 저장. **데이터 무결성:** 모든 상담 목록/통계용 select에는 `.eq('is_visible', true)` 필터 강제.
- **상담 카드 영구 삭제:** 리스트 카드 우측 [휴지통] 버튼 → "이 상담 내역을 영구 삭제할까요?" 확인 후 consultations 테이블 DELETE. 삭제 성공 시 새로고침 없이 해당 카드만 목록에서 제거, 선택 중이었으면 다음 카드로 포커스.
- **구글챗 마이그레이션 (2026-03-02):** `user_info.json` 기반 2,344개 스페이스를 개별 상담 카드로 1:1 매핑. `metadata`에 `google_chat_url`, `space_id`, `original_name`, `source: 'google_chat_v5_final'` 저장. 신규 마이그레이션 건은 `start_date: null` 유지하여 데이터 혼선 방지.
- **채널톡 인입 데이터 분리 원칙 (2026-03-15):** 채널톡 초기 유입은 기존 `consultations`와 생명주기가 다르다. 향후에는 `channel_talk_intakes`(가칭) 같은 **별도 인입 테이블/대시보드** 에 `문의유형, 업종, 면적, 지역, 전화번호, 상태, 담당자, 정식상담전환ID(converted_consultation_id)`를 저장하고, 실제 진행 확정 시에만 `consultations`로 전환하는 구조를 기본 원칙으로 본다.

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
- **데이터 통합 관리(마이그레이션):** `consultations`·`estimates`에 `is_test`(boolean, default false) 컬럼. `/admin/migration` 페이지에서 멀티 파일 업로드 → AI 파싱(Mock 또는 VITE_MIGRATION_PARSE_API) → 검수 테이블 편집 → Consultations/Estimates 생성 시 `is_test: true`, `metadata.migration_tag: '과거데이터'`. **날짜 소급:** 저장 시 `consultations.created_at`은 AI 파싱한 **인입일(quoteDate)**로 설정(골든타임 배지 정확 반영). **인입일 수동 수정:** 검수 테이블에 인입일(날짜) Date Picker 컬럼으로 AI 오인 시 사용자 직접 수정 가능. 테스트 모드 시 업체명 앞 [TEST] 접두사. [저장] 완료 시 토스트 "테스트 데이터가 생성되었습니다" 후 상담 관리(`/consultation`)로 이동. [모든 테스트 데이터 삭제]로 is_test 건 일괄 삭제. **파일명 인코딩(Mac 호환):** 업로드 시 원본 파일명 대신 `toSafeStoragePath(originalName, prefix)`로 `{prefix}_{timestamp}_{random}.{safeExt}` 형식 저장. pdf/jpg/png만 허용, 한글/특수문자로 인한 MIME 오류 방지. **저장 = 확정:** 견적 저장 시 `approved_at`에 현재 시간 자동 설정(별도 승인 절차 없음). **섹션 분리(탭 제거):** 판매 견적서 등록(상단)과 거래처 원가 등록(하단)을 탭 대신 **상·하 별도 섹션**으로 분리 — 같은 창 공유로 인한 실수 방지. **거래처 원가 AI 분석:** 현장명(site_name), 품명, 색상, 단가(손글씨 포함), 외경 사이즈(가로×세로×높이), 메모(상판 모번 23T 등 상세 사양) 추출. **업로드 완료 목록:** 거래처 원가도 판매 견적서와 동일한 테이블(No·파일명·금액·견적일·업로드시간·상태·원본보기·삭제) + localStorage 저장. **메모 필드:** vendor_price_book에 memo(text) 컬럼 — "상판 모번 23T, 그외 18T 라이트그레이" 등 상세 사양 별도 저장. 수량 필드 제거(원가 이상 표시 이슈). **상담별 견적서 업로드(EstimateFilesGallery):** 견적 관리 탭에서 PDF/이미지 업로드 → AI 분석 → 미리보기. **[판매 단가표 반영]** 시 products + estimates 모두 저장. **[견적서로 저장]** 시 estimates + products 모두 저장. products 저장 전 `productFilter.shouldExcludeFromProducts`로 배송·설치·시공 등 제외. **products.supply_price = 판매단가:** 원가표는 원가→마진 30% 역산 판매단가로 저장. 견적서는 unitPrice(판매단가) 그대로 저장. AI 퀵 가이드에서 불러올 때 판매단가로 인식, 원가는 역산(수익률 판단용).

### 자동 견적 엔진 (autoEstimate / AutoEstimateDialog)
- **목적:** 과거 견적서 데이터를 집계한 표준 가격표를 기반으로, 품목+규격+수량 입력만으로 즉시 견적 합계(배송·설치·VAT 포함)를 산출.
- **브라우저 엔진 (`src/lib/autoEstimate.ts`):** `loadPriceTable(url)` — `public/data/standardPriceTable.v*.json` fetch. `calculateAutoEstimate(items, priceTable)` — 행별 단가 조회 + 구간별 요율 + VAT.
- **매칭 계층:** matchType `spec`(규격 정확) > `base`(`__BASE__` 품명 중앙값 폴백) > `none`(0원, 빨간 하이라이트).
- **요율 구간:** 공급가 500만 이하→배송 3%·설치 7%, 500~1000만→2%·6%, 1000만 초과→1.4%·4.3%. VAT 10%.
- **AutoEstimateDialog (`src/components/Consultation/AutoEstimateDialog.tsx`):** 제품명·규격 Combobox(자동완성), 수량 입력, 실시간 합계 패널(공급가·배송비·설치비·VAT·합계). 기존 estimates 이력과 나란히 비교.
- **가격표 파이프라인 (scripts/):** `collectAllTakeouts` → `parseCollectedQuotes`(AI 파싱) → `buildPriceTable` → `standardPriceTable.v*.json`. 품명별 규격별 중앙값 집계, SKIP_KEYWORDS(배송·설치 등) 제외. 이상치(IQR) 제거 후 저장.
- **정규화:** `normalizeName`(슬래시 앞·괄호 제거), `normalizeSpec`(괄호 제거·대문자·`__BASE__` 키) — 브라우저·스크립트 동일 로직.
- **데이터 위치:** 개발용 분석 결과 → `scripts/standardPriceTable.v1.json`. 앱 번들용 → `public/data/standardPriceTable.v*.json`. 버전 메타 → `public/data/priceTable.meta.json`.

### AI 견적 도우미 (estimateAiService / estimateUtils)
**AI 파싱 엔진 (parseFileWithAI.ts) — 실제 운영:**
- 메인: Gemini 3.1 Flash Lite (`gemini-3.1-flash-lite-preview`, VITE_GOOGLE_GEMINI_API_KEY) — 2026-03-07 전환. gemini-2.0-flash deprecated.
- 폴백: OpenAI GPT-4o (VITE_OPENAI_API_KEY) — Gemini 429/500/503 시 자동 전환, 사용자 토스트 안내
- 대상: EstimateFilesGallery PDF/이미지 업로드 → 견적서(Estimates) / 원가표(VendorPrice) 분류 후 추출
- Mock 영역: estimateAiService.parseQuickCommand (AI 퀵 커맨드) — 추후 /api/estimate-parse 교체 예정

**Edge Function analyze-quote (2026-02-22 확장):**
- **모드:** estimates(전체 분석), vendor_price, detect(파인드가구·김지윤), unit_price, **exists**(견적서 YES/NO 경량 판별)
- **Pre-check(estimates):** ① 문서 상단 "견 적 서" 타이틀 → 없으면 skipped ② "주식회사 파인드가구" 확인 → 없으면 skipped ③ [사업자번호, 공급가액, VAT, 합계, 품명] 5개 중 3개 이상 → 미달 시 skipped
- **캡처 이미지 가이드:** File-image.png 등 파일명일 때 "이 문서는 캡처된 견적서 이미지야. '견 적 서' 타이틀과 품목 리스트를 집중적으로 찾아줘" 프롬프트 상단 추가
- **exists 모드:** maxOutputTokens 64, YES/NO만 반환. 503 최소화용 경량 호출

**마이그레이션 파이프라인 (scripts/migrate-data.ts):**
- **루트:** ~/findgagu-os-data/staging/
- **재귀 탐색:** findFilesRecursive()로 하위 전체 .png/.jpg/.jpeg/.pdf 수집. attachments.csv export_name 매칭(없으면 전체 후보)
- **2단계 플로우:** ① exists(sharp 상단 40% 크롭·1000px·jpeg70) → NO면 [SKIP] ② YES면 full analysis(sharp max 1200px·jpeg80)
- **503 대응:** 최대 3회 재시도(2초·4초·6초), 동시성 2
- **주소 파싱 강화:** isValidAddress() — 시/도/구/동/번지/아파트 등 실제 주소 키워드 필수. "상권분석 후 미팅" 등 오탐 방지

**로컬 견적서 판별 (scripts/detectQuoteLocal.ts):**
- `npm run detect:quote -- --folder "경로"` 또는 `--file "이미지.png"`
- sharp 전처리 → Edge Function exists 모드 → YES/NO/ERROR 출력

**업로드 경로 정리 (2026-02-22):**
- **견적서:** EstimateFilesGallery → supabase.storage.from('estimate-files') 직접. uploadEngine·Cloudinary 미사용
- **발주서·평면도:** MeasurementSection → uploadEngine → Supabase documents 버킷 → image_assets
- **image_assets.category:** purchase_order, floor_plan, 책상, 의자, 책장, 사물함, 상담/실측, 기타
- **견적서 OCR 결과 저장:** estimates.payload (파일 단위). consultations.metadata는 estimate_history 요약만

**이미지 자산 관리 필터:** fetchAllProjectAssets()의 image_assets 조회에 `.eq('is_consultation', false)` 적용 — 상담용 사진 제외

- **역할 분리:** 자연어 파싱은 `estimateAiService.parseQuickCommand`, 금액·계산은 `estimateUtils`만.
- **LLM 연동 준비:** 현재 Mock으로 결과값만 리턴. 추후 `fetch('/api/estimate-parse', { body: JSON.stringify({ text, context }) })`로 교체 가능. 프롬프트 → JSON 응답 구조로 단순화.
- **QuickCommandResult 타입:** `add_row`, `past_price`, `target_total`, `needs_unit_price`, `needs_spec`, `spec_reply`, `unknown`. EstimateForm에서 `switch (res.type)`로 분기.
- **유틸:** `parseAmountToWon`("25만" → 원화), `scaleFactorToTarget`(총액 맞춤 배율), `roundToPriceUnit`(가구 단가·원가 100/1,000원 단위 반올림), `getMarginSignalClass`(마진율 신호등). 복잡한 케이스는 코드로 방어하지 않고 LLM에 위임.
- **역산 로직 전역 고정:** 마진율 = (판매가 − 원가) / 판매가 × 100; 판매가 = 원가 / (1 − 마진율/100). 모든 역산·반올림은 `roundToPriceUnit` 적용. 단가 수정 → 마진율 표시만 갱신, 마진율 수정 → 단가 역산만 수행(상호 무한루프 방지). 신호등: ≥30% 초록, 25~30% 주황, <25% 빨강 — 행·수익 분석기 패널 전역 적용.
- **품명 표준:** [품명] ([사이즈] / [색상]). 견적 행에 `color`, `costEstimated`(역산 원가 여부) 필드. 원가 없을 때 기본 마진 30% 역산 가상 원가 + '역산됨' 태그. 원가 이력에 단가만 있는 과거 건은 '(추정)' 표시.
- **UI:** 견적 테이블 위 "AI 퀵 커맨드" 입력창. 빈 행 우선 채우기, 되묻기(규격), 과거 단가 조회, 총액 맞춤 지원. AI 입력 예: "스마트A 1200 600 모번" → 품명(사이즈/색상) 포맷으로 자동 변환. **비교대상 출처·원본보기:** 외주업체 원가(vendor_price_book/products) 표시 시 하단에 출처(원가표/제품DB), 원가표일 때 [원본보기] 버튼(image_url 라이트박스) 추가 — 견적서 판매단가와 동일한 UX. **원가표 카드:** 원가표 출처일 때는 원가만 표시(종전 단가 미표시). 출처 줄에 "· 외경 {spec}"·"· 현장명 {site_name}" 표시. **원본보기 이미지:** vendor-assets URL은 Signed URL로 변환 후 표시(비공개 버킷 대응). **참고 견적서(PDF) 모달:** z-[200], 캡처로 클릭이 견적 작성 모달로 전달되지 않음. 닫기 버튼 없음(바깥 클릭·Escape). 미리보기 닫을 때 견적 작성창이 닫히지 않도록 onOpenChange에서 printEstimateId·justClosedPreviewRef(300ms) 방어.
- **products(vendor_price_book fallback) 저장·로드 원칙:** products.supply_price는 **판매단가**로 저장. vendor_price_book은 원가(cost) 저장 → 마진 30% 역산 판매단가. products에서 불러올 때는 supply_price를 판매단가로 직접 사용, 원가는 역산(수익률 판단용). EstimateForm `applySellingToRow`로 품목 blur/퀵 커맨드 시 products 조회 후 판매단가 적용·원가 역산. 견적 모달 열릴 때 `modalOpen` prop으로 productsList 새로고침 → AI 퀵 가이드 검색 최신 반영.
- **products 테이블 역할 (고정):** 우리 회사 **공식 표준 단가표**. 퀵 가이드에서 행 추가 시 빈 단가를 채우는 용도로만 참조하며, **비교 카드에는 노출하지 않음** (searchPastCaseRecommendations 호출 시 products: []). 저장 시 `supply_price`는 항상 **공급단가(판매가)**. 원가표에서 등록 시 마진 30% 역산 판매가로 변환하여 저장.
- **데이터 수집 경로 (전환):** 과거 견적서(PDF/이미지) 및 거래처 원가표는 **각 상담의 견적 관리 탭 내 [EstimateFilesGallery]** 를 통해서만 업로드. `/admin/migration` 페이지에 의존하지 않음. 업로드·AI 분석 후 담당자가 [판매 단가표 반영] 또는 [견적서로 저장] 또는 **[표준단가 고정]**(행 단위)으로 제품 마스터 등록 여부를 결정.
- **AI 퀵 가이드 데이터 매핑 (강제):** 비교 카드 [선택] 시 출처에 따라 엄격 적용. **출처 과거 견적(estimates):** 불러온 unitPrice를 견적서 행의 **공급단가(판매가)** 로 직접 반영. **출처 원가표(vendor_price_book):** 불러온 cost를 행의 **원가**에 넣고, 판매가는 원가/0.7(마진 30% 역산)으로 자동 계산 반영. addRowFromQuickCommand에 `source: 'vendor_price_book' | 'estimates'` 전달하여 두 출처 값이 섞이지 않도록 함.
- **[표준단가 고정] 버튼:** EstimateFilesGallery AI 분석 결과 리스트(원가표/견적서) 및 EstimateForm 견적서 작성 화면 각 행에 배치. 클릭 시 해당 데이터를 `products` 테이블에 업로드/업데이트. **동일 품명이 이미 존재할 경우** "마스터 데이터(표준단가)가 이미 존재합니다. 새로운 값으로 수정하시겠습니까?" 컨펌 다이얼로그 필수 후 사용자 결정에 따라 수정.

### [Set 5] 일정 및 현장 관리 (Operations)
- `id`: UUID (PK)
- `site_address`: String (현장 주소)
- `site_details`: JSONB (층수, 엘리베이터 유무, 사다리차 가능여부, 주차환경)
- `navi_deeplink`: String (카카오/T맵 딥링크 주소)
- `technician_id`: UUID (FK to Users)
- `special_notes`: Text (현장 주의사항 - 핑크색 강조 UI 데이터)

### [Set 6/7/8] 마케팅 자동화 및 분석 (Marketing & Analytics)
- `openclaw_content_id`: String (외부 OpenClaw 연동 ID)
- `content_links`: JSONB (블로그, 숏폼, 롱폼 배포 URL 저장)
- `wake_up_trigger_days`: Integer (Default: 3, 견적 후 재연락 알림 기준)
- `ad_budget_remain`: Number (광고비 잔액 - 부족 시 경고 알림 트리거)
- `channel_roi`: Float (채널별 유입 대비 계약 전환율)

---

## 2. UI/UX 인터랙션 표준

### 1) 상담 리스트 카드 레이아웃 (고정 규격) — 2026-02-08 최신
- **1행:** 좌측 — [고객등급 배지] 업체명 [AS 요청 배지(요청 시만)] [확정견적 N원]. **우측 고정** — 7단계 텍스트(접수|견적|계약|완료|AS|무효|거절) 고정 너비, 현재 단계만 색상·진하게, 나머지 연한 회색 + transition-colors | 편집 | 전화번호 복사.
- **2행:** [골든/상태 배지] · 인입채널 · 지역 · 업종 · 전화번호 · (주문번호) · **2행 맨 오른쪽(최종 견적가)** · 인입날짜 · 요청날짜. **골든 배지:** 2행 최좌측. D+0~7 ⚡골든타임(주황), D+8~20 🌿집중상담(초록), D+21~30 🔔이탈경고(노랑), 계약완료 시 🏗️진행중(파랑). 31일 초과 시 배지 제거·카드 opacity 낮춤(장기 미체결). 완료·캔슬·AS 단계에서는 골든 배지 미노출. **인입채널:** metadata.source, 9종(채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타), 기본값 채널톡. **2행 맨 오른쪽(최종 견적가):** "견적 미정" 자리에 consultations.estimate_amount(DB)·견적서로 저장 직후 낙관적 업데이트·pending ref 반영. 표시 우선순위: pending(견적서로 저장 직후) → finalAmount → displayAmount → expectedRevenue. 금액 있으면 "N원", 없으면 "견적 미정". ConsultationListItem에 getPendingEstimateAmount(consultationId) 전달, fetchLeads 병합 시 pending 보존. **2행 우측 끝 고정:** [구글챗 입장] 버튼(연결 상태별 초록/회색 분기).
- **완료 카드 재활동 신호:** `status='완료'`이면서 `update_date`가 최근 7일 이내면 카드에 **`종료 후 활동`** 또는 **`오늘 재활동`** 표시를 노출한다. 표시 위치는 (1) 카드의 `마지막 업데이트` 구역 강조, (2) 상단 `완료` 상태 쪽 점 인디케이터, (3) `종료` 탭의 활동 카운트 배지. 목적은 직원이 변화를 인지하고 상태를 유지할지 `견적/진행`으로 되돌릴지 판단하게 돕는 것이다. 이 신호만으로는 상태를 자동 변경하지 않는다.
- **3행:** 요청사항(페인포인트) — 연한 배경. **4행:** 구글챗 버튼 등.
- **상담 관리 대시보드 고정 규칙 (2026-03-11):** `ConsultationManagement`는 **작업형 대시보드**로 취급한다. 데스크톱에서는 **우측 상세 패널을 기준 화면처럼 유지**하고, 좌측 목록 탐색 중에도 우측이 갑자기 밀려 올라가지 않게 한다. 이 규칙은 `상담 관리` 페이지에만 적용하며, 다른 창의 공통 레이아웃·전역 스크롤 정책은 건드리지 않는다.
- **선택 카드 유지 원칙 (2026-03-11):** 상담 직원이 직접 다른 카드를 클릭하지 않았다면, 현재 선택 카드는 **필터 결과에 남아 있는 한 계속 유지**한다. 탭 변경·정렬 변경·상태 저장 후에도 같은 카드가 결과 집합 안에 있으면 첫 카드로 강제 이동하지 않는다.
- **상태 변경 후 페이지 추적 (2026-03-11):** 완료/견적/진행 등 **단계 변경으로 탭이 바뀌는 경우**, 시스템은 해당 카드가 포함된 페이지로 자동 이동해 직원이 "카드가 사라졌다"고 느끼지 않게 한다. 선택 유지 + `scrollToLeadId` + 페이지 보정이 한 세트로 동작해야 한다.
- **목록 페이지 크기 (2026-03-11):** 상담 관리 좌측 리스트는 페이지당 **40개 카드**를 기본값으로 사용한다. 우측 상세 패널 고정 이후에는 20개보다 40개가 작업 탐색에 더 적합하다는 운영 판단을 반영한다.
- **상단 필터 3종 (2026-03-11):** 상담 관리 상단 제어는 `인입일 기준 기간 필터`, `업데이트일 기준 기간 필터`, `최근업데이트순/인입일순 정렬 토글`의 **3개 컨트롤**을 기본으로 한다. 두 기간 필터는 동시에 적용되며, 정렬 토글은 필터와 별개로 동작한다.
- **조회/삭제 제한 해결 (Server-side 1,000 Limit):** Supabase/PostgREST의 기본 1,000건 제한을 우회하기 위해, 1,000건 단위로 `range(from, from + 999)`를 반복하는 **재귀적 배치 페칭(Recursive Batch Fetching)** 및 **Nuclear Cleanup(반복 삭제)** 로직을 표준으로 채택. (`ConsultationManagement.tsx` fetchLeads 및 마이그레이션 스크립트에 적용)
- **상단 탭:** 전체 | 미처리 | 견적중 | 진행중 | 종료 | 거절 | 무효. 업무 단계별 우선순위 파악용. 종료 = 시공완료(실적), 거절/무효 각각 별도 탭. 카드 2행: 거절 건은 거절 사유 강조, 무효 건은 연하게(opacity-60).
- **조회 기간:** 전체 기간 | **이번달**(기본값) | 최근 1개월 | 3개월 | 6개월 | 1년. 이번달 = 당월 1일 00:00 ~ 현재(startOfMonth 활용).
- **선택된 카드 강조 효과 (Floating & Scale):** 선택 시 scale(1.02), translateY(-4px), 깊은 부드러운 그림자, 진한 골드/오렌지 테두리(border-amber-600 2px). 미선택 카드는 얕은 그림자(shadow-sm). transition: all 0.2s ease-in-out으로 상태 변화 부드럽게. 0.1초 만에 직관적 인지 목적.

### 2) 고객 상세 보기 (Slide-over Drawer)
- **방식:** 리스트 클릭 시 우측에서 슬라이드 팝업 노출.
- **좌측 섹션:** 기본 정보 및 상담 데이터 수정.
- **우측 섹션 (통합 타임라인):** `action_type`: 자동문자(Wake-up), 수동상담, 시스템알림, 상태변경. 페이스북 타임라인 스타일로 최신순 정렬 및 아이콘 구분.
- **상담 숨기기:** 히스토리 탭 상단에 관리자(isAdmin)일 때만 [이 상담 숨기기] 버튼. 클릭 시 **앱 내 확인 Dialog**(네이티브 confirm 대신) — "이 상담을 숨깁니다. 리스트와 통계에서 제외되며, 관리자 아카이브에서만 볼 수 있습니다. 계속할까요?" [취소] / [숨기기]. [숨기기] 시 is_visible = false, 리스트에서 제거·패널 닫힘.
- **실측 데이터 분리:** 상담 타임라인 내에서 실측 PDF/텍스트 메모를 **직접 렌더링하지 않음**. 우측 상단에 **[실측 자료(PDF)]** 아이콘 버튼만 배치. 클릭 시 전용 모듈로 이동하거나 모달을 띄우며, 모달에서 "실측 정보 입력 페이지로 이동" 링크로 `/measurement/upload?consultationId=xxx` 연결. 타임라인 가독성 확보 및 실측 전용 워크플로우 분리.

### 2-1) 견적 관리 탭의 Takeout 이미지 불러오기 (2026-03-10)
- **현재 데이터 소스:** Google Chat 실시간 API가 아니라 **Google Takeout 이미지**만 사용한다. 현재 구현은 **최신 1개 Takeout 기준 인덱스 생성** 구조이며, 대표님 PC에 있는 전체 10개 Takeout 통합은 아직 미구현이다.
- **진입 흐름:** 상담카드 → `견적 관리` 탭 → `테이크아웃 이미지 가져오기`. 기본은 **현재 상담카드와 연결된 스페이스 이미지 우선 표시**, 필요 시 `전체 스페이스 보기`로 다른 스페이스까지 펼쳐서 본다.
- **판단 방식:** OCR 자동 선별이 아니라 **사람이 썸네일을 훑고 수동 선택**하는 것이 원칙이다. 썸네일 클릭 시 앱 안에서 크게 보는 미리보기 Dialog가 열리고, 거기서 `견적 검토로 가져오기`를 눌러 기존 AI 검토 흐름으로 넘긴다.
- **스페이스 탐색 보조:** 연결된 스페이스는 `스페이스 ID + displayName`을 함께 표시한다. 현재 운영상 가장 안정적인 동작은 **스페이스 제목 클릭 시 메인 검색창에 해당 displayName을 자동 입력**하는 방식이다. 강제 카드 이동은 불안정하여 현재 기본 동작으로 채택하지 않는다.
- **저장 위치 원칙:** 원본 이미지는 대표님 PC의 **Takeout 원본 폴더**에 남겨두고, 앱 표시는 `public/assets/takeout-quote-inbox/` 복사본과 `public/data/takeout-quote-inbox.json` 인덱스를 사용한다. 이 복사본은 **캐시**로 간주하며, 필요 시 삭제 후 스크립트로 재생성한다.
- **미구현 범위:** 실시간 Google Chat 첨부파일 수집, 10개 Takeout 전체 통합 인덱스, 같은 스페이스를 여러 프로젝트 카드로 나누는 **카드 스플릿 기능**은 아직 구현하지 않았다.

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
- **image_assets.is_consultation (상담용 전용 필터):** boolean, default false. 이미지 자산 관리에서 카드별 [상담용] 토글로 DB 갱신. 상단 [상담용 사진만 보기] 스위치 시 is_consultation true만 노출. 공유 바구니(ShareCart) 시 상담용 체크된 사진 ID를 URL·갤러리 상단에 우선 배치. PublicGalleryView에서 상담용 카드 뱃지·테두리 강조. 카드 우측 상단 배지는 **상담용일 때만** "상담용" 표시(스코어링·영업용 배지 제거).

### 3-0-1) 이미지 업로드 단일 엔진 (uploadEngine) — 이원화 저장 구조
- **공통 모듈:** `src/lib/uploadEngine.ts`. **uploadEngine(file, metadata)** — 파일 확장자·카테고리 기준으로 저장소 자동 분기.
- **저장소 분기 규칙:**
  - **Cloudinary:** `.jpg`, `.png`, `.webp` (시공사례용 이미지) → 기존 Cloudinary 업로드. 폴더 `assets/projects`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`.
  - **Supabase Storage (documents 버킷):** `.pdf`, `.ppt`, `.pptx` 또는 `category`가 `floor_plan`, `purchase_order`인 경우 → Supabase `documents` 버킷(public) 업로드.
- **image_assets.storage_type:** `'cloudinary'` | `'supabase'` — 저장소 구분. `storage_path`는 Supabase일 때 documents 버킷 내 경로.
- **floor_plan AI 준비:** `metadata.space_info` — 평수(pyeong), 구조(structure) 등 AI 모델 참조용 필드. 추후 확장.
- **입구 A (자산관리 페이지):** `ImageAssetUpload.tsx` — 기존 폼에서 **uploadEngine** 호출. meta: customer_name=현장명, category=폼값, upload_date=촬영일/오늘, source=image_asset_upload. 업로드 후 insertImageAsset 동일.
- **입구 B (상담 카드·상담 히스토리):** `ConsultationHistoryLog.tsx` — **이미지 자산관리와 동일한 점선 업로드 영역**("클릭하거나 이미지를 여기에 놓으세요", "여러 장 동시 선택 가능", 드래그 앤 드롭). **uploadEngine** 호출 시 meta: customer_name=업체명(projectName), project_id=consultationId, category='상담/실측', upload_date=오늘, source=consultation_card. **검증:** `validateMetadataForConsultation(meta)` 실패 시 업로드 중단, "상담 정보가 부족하여 업로드할 수 없습니다" 토스트.
- **데이터 흐름:** 구글 시트에 행 추가하지 않음. 업로드 후 Cloudinary URL → **image_assets** Insert + **consultation_messages** Insert(file_url=썸네일, metadata.public_id·cloud_name·image_asset_id). 상담 히스토리 목록에는 썸네일만 표시, 클릭 시 **MediaViewer**(이미지 자산관리와 동일 확장 뷰) 재사용.
- **상담 히스토리 삭제:** 각 항목 우측 휴지통 버튼. 삭제 시 consultation_messages DELETE, metadata.image_asset_id 있으면 image_assets DELETE, Storage 경로면 chat-media 객체 삭제.

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
- **업종 필터 추가:** 이미지 자산 관리 상단에 업종(Sector/Industry) Select 박스 추가. 기본 옵션: 학원, 관리형, 스터디카페, 학교, 아파트, 기타. `image_assets.business_type`·`project_images.industry` 컬럼 기준으로 필터링. 제품명·색상 필터와 동일한 스타일.
- **이미지 자산 관리 필터 구조 (2026-03-15 1차 마무리 세이브 포인트):** `/image-assets` 상단은 2줄 구조로 고정한다. 1줄은 `검색창 + 일괄 업로드 + 상담용 사진만 보기`만 둔다. 2줄은 `업종 전체 / 현장 전체 / 제품 전체 / 색상 전체` Select 4개만 둔다. 이 4개 조건은 **동시에 선택되면 AND 조건으로 범위를 계속 줄이는 방식**으로 동작한다.
- **좌측 패널 역할 재정의:** 이미지 자산 관리 좌측은 더 이상 필터 트리가 아니라 **결과 네비게이션 바**다. 현재 결과를 업종/현장/제품/색상 기준 섹션 목록으로 정리해 보여주고, 클릭 시 오른쪽 해당 섹션으로 스크롤 이동한다.
- **카드 배지 우선순위:** 이미지 카드 우상단은 `Before/After` → `상담용` → `대표지정` 순서로 세로 배치한다. `대표지정` 배지는 좌상단 체크박스와 겹치지 않도록 우상단 배지 묶음 안에만 둔다.
- **레이어 규칙:** sticky 헤더/액션 바는 카드 오버레이보다 항상 위 레이어에 있어야 한다. 카드 선택 체크박스나 상태 오버레이가 스크롤 시 상단 필터 위로 떠보이면 안 된다.
- **상담카드 견적 배지 실험 상태:** 상담 관리 카드에 `견적서 유무` 아이콘을 붙이는 실험은 UX 혼선으로 **현재 세이브 포인트에서는 롤백 완료 상태**다. 상담카드 우측 배지 영역은 다시 `사진 유무 + 구글챗` 기준만 유지한다.

### 3-3) 발주 자산 관리 모듈 (발주서·배치도)
- **경로:** `/order-assets`. **OrderAssets.tsx**. 발주서·배치도 통합 관리 페이지. 상담 관리 상단 [발주 자산 관리] 버튼으로 진입.
- **데이터:** `image_assets` 테이블에서 `category` in ('purchase_order', 'floor_plan') 조회. `storage_type`으로 Cloudinary/Supabase 구분.
- **필터:** 업종(business_type), 카테고리(발주서/배치도), 고객명(site_name) 검색. ImageAssetViewer 스타일 그리드 뷰.
- **저장소:** 시공사례 이미지(jpg/png/webp) → Cloudinary. 발주서/배치도 문서(pdf/ppt/pptx) 및 해당 카테고리 이미지 → Supabase `documents` 버킷(public).
- **PDF/PPTX 썸네일:** `documentThumbnail.ts` — PDF는 pdf.js로 첫 페이지 렌더, PPTX는 docProps/thumbnail.jpeg 추출. 업로드 시 `_thumb.jpg` 저장, `thumbnail_url` 반영.

### 3-4) Radix Dialog 접근성 (2026-02-21)
- **DialogContent:** `aria-describedby={undefined}` 기본값으로 Description 없을 때 경고 억제.
- **DialogTitle 필수:** 모든 DialogContent에 DialogTitle 포함. 숨김 필요 시 `sr-only` 클래스 사용.
- **적용:** ShowroomPage 상세 Dialog h2→DialogTitle, ConsultationManagement 견적 풀스크린 모달에 sr-only DialogTitle 추가.

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
- **쇼룸 전문가 코멘트·CTA 통일:** 고민별 카드(관리형·스터디카페·학원·고교학점제·아파트) 클릭 시 노출되는 전문가 코멘트 블록은 **고교학점제 기준**으로 통일. 카드 배경/텍스트/구분선: slate 계열(bg-slate-50, border-slate-200, text-slate-800 등). CTA 버튼: rounded-xl, bg-slate-700 hover:bg-slate-800, 흰색 텍스트. 무인창업 카드는 현재 운영 범위에서 제외한다.
- **쇼룸 검색 상태 분리:** 공감카드 선택 상태와 상단 검색어는 **반드시 분리**한다. 공감카드를 눌러도 검색창 입력값은 바뀌지 않으며, 공감카드는 전문가 코멘트·전용 섹션 노출과 업종 필터 문맥만 담당한다. 검색창은 현장명·제품명·업종 자유 검색만 담당한다.
- **쇼룸 스크롤 기준점:** 공감카드 클릭 시 스크롤 목적지는 갤러리가 아니라 **공감카드 바로 아래 전문가 코멘트 시작 앵커**로 고정한다. 동일 id를 여러 갤러리에 재사용하지 않는다. 상단 sticky 헤더에 가리지 않도록 scroll-margin-top을 충분히 확보한다.
- **쇼룸 데이터 제외 규칙:** `image_assets.category in ('purchase_order', 'floor_plan')`는 쇼룸에서 절대 노출하지 않는다. 발주서/배치도 자산은 `/order-assets` 또는 내부용 모듈에서만 본다.
- **쇼룸 Before/After 노출 규칙:** `image_assets.metadata.before_after_role`이 지정된 자산은 일반 쇼룸 리스트(현장별/제품별/업종별 보기)에서 제외한다. 대신 `스터디카페를 관리형 스타일로` 공감카드가 선택된 경우에만, 별도 섹션 **[엑시트까지 고려한 전환 사례]** 에서 전후 비교 카드로 노출한다.
- **쇼룸 문의 문맥 저장:** `/showroom`에서 `/contact`로 이동할 때는 기본 `category/site_name/image_url` 외에 `showroom_context`, `showroom_entry_label`도 함께 전달해 `consultations.metadata`에 저장한다. 담당자는 상담관리 리스트에서 단순 `쇼룸` 유입이 아니라 **어떤 공감 문맥(예: 관리형 스타일 전환·엑시트 전략)** 으로 들어왔는지 바로 식별할 수 있어야 한다.
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
- **퍼블리시 보안 전제 (2026-03-15):** Vercel 공개 전 내부 운영 라우트는 반드시 로그인 보호 대상이다. 최소 공개 범위는 `/showroom`, `/contact`, 채널톡 연결용 공개 랜딩 정도로 제한하고, `consultation`, `image-assets`, `order-assets`, `measurement`, 관리자 화면은 인증 없이 접근되면 안 된다. Supabase Advisor 기준 RLS 경고가 다수 존재하므로, 공개 전 DB 공개 범위와 정책을 별도로 정리해야 한다.

---

## 3. 핵심 비즈니스 로직 (Automation)

### 1) 30일 골든타임 관리 (created_at 기준 경과일)
- **src/lib/utils/dateUtils.ts:** `getElapsedDays`, `getGoldenTimeState(createdAt)` — tier: D+0~7 urgent(Hot), D+8~20 progress(Active), D+21~30 deadline(Warning), 31일+ null(Expired). `isDeadlineSoon` = D+27(종료 3일 전, 알림 트리거용).
- **카드 2행 최좌측 배지:** Hot ⚡골든타임(주황), Active 🌿집중상담(초록), Warning 🔔이탈경고(노랑), 계약완료 시 🏗️진행중(파랑). 31일 초과 시 배지 제거·카드 opacity-70(장기 미체결). 완료·캔슬·AS 시 골든 배지 미노출.
- 30일 종료 3일 전(D+27) 담당자 알림용 상태값 `goldenTimeDeadlineSoon` Lead에 포함.

### 2) 고객 Wake-up 시스템
- 상담 상태가 '견적'에서 멈춘 지 N일 경과 시, "검토해보셨나요?" 메시지 발송 후보 리스트 자동 생성.

### 3) 콘텐츠 허브 재활용
- OpenClaw에서 생성된 '공간 기획 팁' 등 결과물 URL을 DB에 연동.
- 상담 상세 팝업에서 고객 페인포인트에 맞는 콘텐츠 링크 자동 추천 및 즉시 전송 기능.

### 4) 구글챗 스페이스 자동 봇 추가 및 n8n 연동 (운영 중 — 2026-03-05)
- **자동화 워크플로우 (완성):** 구글챗 스페이스 생성 → GAS AutoAddBot(5분 트리거 감지) → 봇 자동 초대 → n8n 웹훅 POST → 구글 시트 추가/업데이트 + 수파베이스 상담카드 생성.
- **GAS AutoAddBot (`gas/AutoAddBot.gs`) — 확정 로직:**
  - `detectViaChatApi_`: Chat API spaces.list, `createTime` 필터로 신규만 감지. Admin check 루프 밖에서 1회.
  - `autoAddBotToNewSpaces`: 봇 추가 성공 후에만 processed에 저장(실패 시 다음 실행에 재시도).
  - processed 최대 100개 유지. Invalid Date 가드(빈 문자열 → 10분 전 기본값).
  - spaceName → chatLink: `"https://chat.google.com/room/" + spaceName.replace("spaces/", "")`.
  - n8n 웹훅으로 `{ spaceName, displayName, timestamp }` POST. `Chat.Spaces.get(spaceName)`으로 displayName 조회 후 포함.
- **GAS Script Properties:** `MAKE_SYNC_WEBHOOK_URL` = n8n 프로덕션 Webhook URL (`https://findgagu.app.n8n.cloud/webhook/chat-space-created`). 테스트 URL(`webhook-test`)과 구분 필수.
- **n8n 워크플로우 (12개 노드, `gas/n8n-workflow.json` — import 가능):**
  - **MESSAGE 이벤트 처리 (2026-03-07 추가):** Webhook → **Event Type?(Switch)** → MESSAGE 분기 → [MESSAGE] Set Vars → [MESSAGE] Supabase PATCH update_date. **전제:** Google Chat HTTP 엔드포인트 앱이 해당 n8n Webhook으로 interaction event를 전달해야 함. 공식 MESSAGE 이벤트는 **방 전체 모든 메시지**가 아니라 **@멘션, 슬래시 명령, 앱과의 DM**에서만 발생. 이 조건을 만족할 때 해당 상담카드 `update_date` 실시간 갱신.
  - **ADDED_TO_SPACE 분기(fallback):** Event Type? → Set Variables(spaceName, chatLink, today) → Check Supabase → Normalize Result → Row Found?(IF) → 기존/신규 분기.
  - **[기존] Sheets 업데이트 → [기존] Supabase PATCH** / **[신규] Sheets 추가 → [신규] Supabase INSERT**.
  - `project_name`: displayName(스페이스 표시명) 사용. status: `접수`.
- **Supabase consultations 테이블 추가 컬럼:** `channel_chat_id text` (migration: 20260305000000).
- **구글 시트 컬럼:** 프로젝트명(displayName), 구글챗링크, 시작일자, 최신업데이트, 진행상태(접수), 견적가.
- **Supabase 컬럼 매핑:** link(chatLink), channel_chat_id(spaceName), start_date, update_date, status(`접수`), project_name(displayName).
- **버튼 배치 및 상태 분기 (확정):** 카드 **2행 우측 끝 고정** 위치에 [구글챗 입장] 버튼 배치. **(A)** `metadata.google_chat_url` 존재 시 **초록색** 스타일. **(B)** `metadata.google_chat_pending === true` 시 **회색** + 스피너. **(C)** 그 외 **회색** 비활성. Real-time 구독 반영.
- **디버깅 유틸 (GAS):** `checkLastTime()`, `debugSpaces()`, `reprocessSpace()` — 일회성 함수, 사용 후 삭제.
- **연락처 파싱 (GAS — 1회성 배치):** 기존 스페이스 메시지에서 전화번호·지역을 추출해 Supabase `customer_phone`·`region` 보완.
  - `dryRunContactScan()` — 전 스페이스 순회, 파싱 결과를 `CONTACT_SCAN_SHEET_ID` 시트의 `연락처_스캔결과` 탭에 기록(탭 자동 생성). 5.5분 타임리밋·체크포인트 방식으로 반복 실행 지원.
  - `applyContactScanFromSheet()` — 시트 G열(적용여부) 체크박스 TRUE인 행만 Supabase PATCH.
  - `scanAllContactInfo()` — 드라이런 없이 즉시 Supabase 적용(1회성).
  - `parseContactFromMessages_()` — Chat API로 메시지 조회 후 `extractPhone_`·`extractRegion_` 파싱.
  - **Script Properties 필요:** `CONTACT_SCAN_SHEET_ID` (구글 시트 파일 ID). `연락처_스캔결과` 탭은 자동 생성.
  - **Admin 권한 없을 시:** 스크립트 실행자 본인이 소속된 스페이스만 스캔(봇만 있는 스페이스 제외).

### 5) 채널톡 시뮬레이터 및 FAQ 자동 응답 (2026-02-09 반영)
- **채널톡 시뮬레이터:** `/admin/test-console` (TestConsole.tsx). 이름·연락처·문의내용·업종 입력 후 `processSimulatedIncoming` 호출 → consultations·consultation_messages 생성, is_test: true. AI 파싱 Mock·업종별 마케팅 링크·발송 예정 메시지 타임라인 기록.
- **FAQ 엔진:** `src/lib/channelTalkService.ts` — `FAQ_DATA`(키워드별 표준 답변), `matchFaqKeyword(inquiry)`로 첫 매칭 키워드 선택. 매칭 시 3단계 자동 응답(안심 → 정보(FAQ 답변) → 가치(블로그 링크)), 전부 `[AI 자동 응답]` 접두어로 타임라인 기록. 매칭 없으면 순차 안내 멘트 1건.
- **FAQ_DATA 키 문법:** 특수문자 포함 키(예: **A/S**)는 반드시 **따옴표로 감싼** 문자열 리터럴 사용(`'A/S'`). 그 외 키도 안정성을 위해 모두 따옴표 적용(가격, 비용, 사이즈, 규격, 배송, 설치, 견적, 상담, 기간, A/S, **AS**). 문의에 "AS"(슬래시 없음)만 있어도 A/S 답변이 나오도록 **'AS'** 키 추가·동일 답변 매핑.
- **채널톡 웹훅 핸들러:** Supabase Edge Function `channel-talk-webhook`. **연락처 필수:** 고객이 연락처를 남기는 즉시 consultations 행 생성. 초기 display_name: `[YYMM] (채널톡) [뒷4자리]`. **식별자 고정:** 최초 생성된 display_name은 후속 메시지로 자동 변경하지 않음; 추출값은 `metadata.ai_suggestions`에만 저장, 상담 상세 패널 [적용] 시에만 반영(본문 상담 식별자 항목 참조). **대화형 보강:** 동일 채널 유저 또는 연락처 뒷4자리+채널톡+최근 7일로 기존 상담 매칭 후, 후속 메시지에서 업체명·평수·업종 추출해 ai_suggestions만 갱신. **FAQ 딜레이:** 연락처+상호(직원 적용 후 company_name)가 있을 때만 2·3단계 발송; 그 외 1단계+"상호를 알려주시면" 멘트만. **모든 이벤트 수용:** `body.type`/이벤트 타입으로 스킵하지 않음; `body.entity`에 텍스트·유저·연락처 중 하나라도 있으면 DB Insert 경로 진행. **폼·서포트봇:** 데이터 수집 폼 응답 등에서 연락처 추출 — `extractFromPayload`가 user → entity → body → **entity.fields/body.fields**(phone, 휴대폰, 연락처 등) → 메시지 본문 순으로 휴대폰 매핑, `consultations.contact`에 저장. **로깅:** 수신 이벤트 타입·`처리 중인 데이터 구조`(JSON.stringify(body))·DB Insert 시도/에러/완료·함수 실행 완료 로그. **안정성:** 전체 try-catch, 모든 DB 호출 await, SUPABASE_SERVICE_ROLE_KEY로 RLS 우회. **배포:** `npx supabase functions deploy channel-talk-webhook --no-verify-jwt`. **보안:** 정식 운영 시 X-Channel-Signature 검증 복구 필수(현재 테스트용 bypass 가능).

### 6) 구글 시트 ↔ 수파베이스 양방향 동기화 (2026-02-13 · 2026-02-14 갱신일 기준)
- **시트:** `상담리스트`(gas/Code.gs). 열: A=project_name, B=link, C=start_date, D=update_date, E=status(시트 표시만), F=estimate_amount(시트 표시만). **시트→DB:** onEdit 시 해당 행만 `update_single_consultation_from_sheet` RPC로 전송. 인자: **project_name, link, start_date, update_date, created_at**만 사용. **status·estimate_amount는 시트에서 보내지 않음**(앱·DB 전용).
- **RPC:** `update_single_consultation_from_sheet(project_name, link, start_date, update_date, created_at)`. update_date 전달 시 기존 행 덮어씀. consultations.updated_at 컬럼·UPDATE 트리거·REPLICA IDENTITY FULL 적용(Realtime 전체 행).
- **배치 RPC·갱신일:** `update_multiple_consultations_from_sheet(rows)` 호출 시 각 row에 **sheet_update_date**(YYYY-MM-DD) 포함 권장. RPC는 해당 값을 **metadata.sheet_update_date**에 저장(INSERT/UPDATE 시 metadata 병합). 앱에서 '오늘 갱신'·미갱신 D-Day·최근업데이트순 정렬은 **sheet_update_date 우선**, 없으면 update_date 사용.
- **DB→시트:** 앱 [최종 확정] 성공 시 `syncAppToSheet(projectName, status, estimate_amount)` 호출. Code.gs `doPost(e)`로 웹앱 URL POST(body: project_name, status, estimate_amount, token). 해당 행 E·F·D 갱신.
- **앱:** Lead.projectName. '오늘 갱신'·미갱신 D-Day·정렬(최근업데이트순)은 `update_date`(Supabase) 단일 기준 — `sheetUpdateDate` 제거(2026-03-07). **소스 오브 트루스:** `consultations.update_date`. **주 갱신 경로:** GAS `patchUpdateDates_()`가 Chat `lastActiveTime` 기반으로 5분 주기 PATCH. **보조 경로:** n8n MESSAGE 이벤트 처리. 단, 이 경로는 Google Chat 앱의 interaction event 전달(@멘션/슬래시 명령/DM) 전제가 충족될 때만 동작. **해석 규칙:** `update_date`는 "최근 활동일"이지 상태값이 아니다. 따라서 완료 카드에서 `update_date`만 갱신되면 `종료 후 활동` 신호만 표시하고 상태는 유지한다. 반대로 견적서 저장/확정처럼 실제 업무 재개를 강하게 증명하는 이벤트는 `status='견적'` 자동 복귀를 허용한다. 정렬 버튼 토글: 최근업데이트순 ↔ 인입일순(sortByNeglect 상태). null update_date 정렬: `inboundDate ?? createdAt` 폴백. Realtime INSERT/UPDATE 시 **전체 상담 리스트 재조회(fetch)**. document.visibilitychange → visible 시 fetch로 탭 전환 시 최신 반영. 환경변수: VITE_GOOGLE_SHEET_SYNC_URL, VITE_GOOGLE_SHEET_SYNC_TOKEN.
- **⚠️ 시트 탭 이름 불일치(버그):** Code.gs SHEET_NAME = '상담리스트'이나 실제 탭 이름은 '시트1'. syncAllDataBatch, syncAppToSheet, onEdit 등 SHEET_NAME 기반 함수가 시트를 찾지 못함. 수정 방법: Code.gs SHEET_NAME = '시트1' 로 변경 또는 구글 시트 탭 이름을 '상담리스트'로 변경.
- **⚠️ onEdit 단건 sheet_update_date 미반영:** update_single_consultation_from_sheet RPC에 sheet_update_date 파라미터 없음. metadata.sheet_update_date는 syncAllDataBatch 실행 시에만 갱신.
- **[Deprecated]** gas/Code.gs initialSyncAll(): sync_consultations_from_sheet RPC 호출 → DB에 해당 RPC 없음. 전체 배치 동기화는 syncAllDataBatch() (update_multiple_consultations_from_sheet RPC) 사용.

## 4. 코드 아키텍처 원칙 (Phase 1 정비 기준 — 2026-03-01)

### 환경변수 및 상수 중앙화
- **`src/lib/config.ts`:** 모든 `import.meta.env.VITE_*` 접근은 이 파일의 getter 함수를 통해서만. `getCloudinaryCloudName()`, `getCloudinaryUploadPreset()`, `getSupabaseUrl()` 등. 직접 `import.meta.env` 흩뿌리기 금지.
- **`src/lib/constants.ts`:** 매직 스트링 단일 소스. `CLOUDINARY_UPLOAD_FOLDER`, `CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS`, `ESTIMATES_SELECT_COLUMNS`, `ESTIMATE_FILES_SELECT_COLUMNS`. Phase 2에서 ConsultationManagement 인라인 select 문자열 이전 예정.

### 컴포넌트 분리 원칙 (Phase 1)
- **탭 컴포넌트 독립:** `ConsultationManagement.tsx`는 탭 스위칭·전역 상태 관리만 담당. 각 탭 콘텐츠는 `src/components/Consultation/` 하위 전용 컴포넌트로 분리.
  - `ConsultationEstimateTab.tsx` — 견적 관리 탭
  - `ConsultationHistoryTab.tsx` — 상담 히스토리 탭
  - `ConsultationMeasurementTab.tsx` — 실측·발주 탭
  - `AutoEstimateDialog.tsx` — 자동 견적 다이얼로그
- **dateUtils 위치:** `src/lib/utils/dateUtils.ts`로 통일. `src/utils/dateUtils.ts` 삭제됨.

## 5. 비즈니스 컨텍스트 (기획 의도 및 디테일)

### 1) 가구 영업의 특수성
- **골든타임:** 등록 후 30일이 넘어가면 이탈 가능성이 매우 높음 (30일 필터링의 이유).
- **시즌성:** 학원은 방학 전, 학교는 방학 중이 피크 타임. 해당 시기에 맞는 퀵 필터 버튼 필요.
- **웨이크업:** "살 거냐"고 묻는 게 아니라 "검토해보셨나요?"라는 관심을 표명하여 신뢰를 쌓는 것이 목적.

### 2) 현장 실무 디테일
- **내비 연동:** 기사님들이 주소를 복사해서 내비 앱에 붙여넣는 번거로움을 없애는 것이 핵심 UX.
- **현장 정보:** 엘리베이터 유무, 층수, 사다리차 가능 여부는 견적 시점부터 시공팀까지 끊김 없이 전달되어야 함.

### 3) 마케팅 자산화
- 현장에서 찍은 사진 한 장이 OpenClaw를 통해 8개 채널로 퍼지는 '마케팅 공장' 구조 지향.
- 상담원은 고객의 페인포인트(좁은 공간 등)에 맞는 콘텐츠를 타임라인에서 즉시 골라 전송할 수 있어야 함.