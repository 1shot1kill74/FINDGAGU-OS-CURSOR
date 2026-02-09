Journal: Project Ivory-OS Development 2024-02-05 (Day 1) - 진행 상황: 프로젝트 킥오프 및 프론트엔드 도면 완성. - 주요 결정: - '주문' 대신 '상담'으로 용어 전면 개편. - 마케팅 관리 페이지 문구 스타일(후킹/전문가/스토리텔러) 확정. - 현장 담당 페이지에 시공 직후 실시간 후기(별점/QR) 수집 기능 통합. - 기술 이슈: - Lovable 크레딧 한도 임박에 따른 신속한 GitHub 이관 처리. - M4 맥북 터미널을 통한 로컬 개발 환경 셋업. - 내일의 할 일: - 전체 프론트엔드 화면 전수 조사. - 화면 기반 Supabase DB 스키마(Table) 역설계. - Lovable 배지 등 불필요한 코드 제거. 이부장 코멘트: 대표님의 빠른 결단력 덕분에 오늘 이사까지 무사히 마쳤습니다. 푹 쉬십시오!

# 프로젝트 저널 (JOURNAL) - 2026-02-06 상세 기록

## 1. 오늘의 활동 요약
- 가구 비즈니스 전 과정(영업-견적-시공-마케팅)을 관통하는 데이터 모델링 및 UX 설계 완료.
- 비개발자 대표와 시니어 아키텍트가 협업하여 M4 MacBook Air 환경에 최적화된 개발 전략 수립.

## 2. 상세 결정 사항 (Decisions)

### [영업 및 고객 관리 파트]
- **30일 골든타임 로직:** 가망 고객 유입 후 30일 이내 계약 성사율이 가장 높음을 반영하여, 시스템이 자동으로 '골든타임'을 관리하고 종료 5일 전 알림을 줌.
- **Wake-up 자동화:** "검토 후 연락할게요"라고 답한 고객을 위해 3일/7일 단위로 자동 안부(관심 표명) 메시지 발송 프로세스 설계.
- **통합 타임라인 UI:** 고객 클릭 시 우측에서 슬라이드되는 팝업창 구현. 페이스북 스타일의 타임라인을 통해 자동 문자 발송 이력과 직원 상담 메모를 동기화하여 인수인계 누락 방지.

### [현장 및 운영 파트]
- **이원화 권한 시스템:** 현장 기사님은 로그인 시 영업/마케팅 데이터를 배제하고 오직 [일정]과 [현장 상세]만 볼 수 있게 하여 업무 집중도 향상 및 보안 강화.
- **현장 실무 최적화:** 주소 텍스트 복사 필요 없이 버튼 클릭 한 번으로 카카오내비/T맵이 연동되는 딥링크 구조 확정. 엘리베이터 유무 등 현장 주의사항은 핑크색 강조 UI로 시각화.

### [AI 마케팅 및 분석 파트]
- **OSMU 콘텐츠 공장:** 현장 기사님이 업로드한 사진 한 장을 OpenCLO AI가 분석하여 블로그, 카드뉴스, 숏폼 스크립트로 자동 변환 후 8개 채널에 배포하는 구조 설계.
- **콘텐츠 허브 재활용:** OpenCLO에서 생성된 결과물 URL을 상담 상세창에 노출하여, 상담원이 고객의 페인포인트에 맞는 콘텐츠를 즉시 전송할 수 있게 함.
- **마케팅 분석 대시보드:** 광고비 잔액 경고 알림 및 콘텐츠 반응도(조회/공유) 기반의 ROI 분석 지표 확정.

## 3. 상담 UI 최적화 및 AS 관리 (2026-02-06 반영)

### 상담 단계 표시 UI 최적화
- **배지 제거:** 1행 우측 끝의 [상담접수] 배지를 삭제. 단계는 프로그레스 바(점)로만 표시하면 중복 정보가 되어 가독성이 떨어지므로, 배지 대신 **텍스트 전용 영역**으로 전환.
- **텍스트 고정:** 4단계 프로그레스 바 옆에 고정 너비 텍스트 영역을 두어, 상담접수·견적중·계약완료·시공완료 네 단계를 **항상 노출**. 현재 단계만 진하고 선명하게, 나머지는 연한 회색으로 표시해 '지나온 길'과 '가야 할 길'을 구분. 이 영역 너비를 고정하여 업체명 길이에 따라 우측 요소 위치가 흔들리지 않도록 함.
- **버튼 정리:** 기능 없던 연필 버튼 제거. 그 자리에 **[AS 관리]** 버튼 배치. 전화번호 복사 버튼은 유지. AS 요청 시 업체명 옆 빨간 [AS 요청] 배지 노출, [AS 관리] 클릭으로 요청/완료 토글. 모달 사용 시 AS 사유 한 줄만 입력 후 즉시 저장하도록 제약.

### 실측 단계 삭제 결정
- **결정:** 상담 워크플로우에서 '현장실측' 단계를 **삭제**하고, 4단계(상담접수 → 견적중 → 계약완료 → 시공완료)로 통일.
- **사유:** 단계 수를 줄여 리스트 카드와 상세 화면에서 인지 부담을 낮추고, 실측은 '견적중' 내부 활동으로 보는 것이 실무와 맞음. 기존 데이터에 `workflow_stage === '현장실측'`이 있으면 표시 시 '견적중'으로 매핑하여 호환 유지.

## 4. 기술적 특이사항 (Technical Notes)
- **DB 하이브리드 구조:** OpenCLO DB와 메인 DB를 분리하여 시스템 부하를 최소화하되, 콘텐츠 결과값(URL/메타데이터)만 API로 연동함.
- **AG 에이전트 운용:** DB, UI, 로직 에이전트로 역할을 나누어 M4 16GB RAM 환경에서 효율적으로 작업 진행 예정.

## 5. 내일의 목표 (Next Steps)
- [ ] Supabase 초기 테이블 스키마 SQL 실행 및 RLS 설정.
- [ ] '가망 고객 관리' 리스트 페이지와 우측 슬라이드 팝업 UI 컴포넌트 개발.
- [ ] 실제 데이터 입력 테스트 및 30일 골든타임 계산 로직 검증.

---

# 2026-02-07 기록 (프로젝트 설계 문서 최신화 및 구조 확정)

## 1. 오늘의 활동 요약
- BLUEPRINT.md 및 JOURNAL.md에 지금까지 논의된 비즈니스 로직 변경 사항을 반영하여 시스템 골조를 확정함.
- 1단계 골조(상담 카드 UI 및 필터링) 확정, AS/오픈마켓/실측 모듈 관련 설계 원칙을 문서에 명시함.

## 2. 상세 결정 사항 (Decisions)

### [1단계 골조 확정]
- **상담 카드 UI 및 필터링:** 1행(마켓·실측·고객분류·업체명·AS·골든타임), 2행(지역|업종|전화|인입|필요|대표금액, 우측 고정 구글챗), 3행(요청사항), 4행(히스토리 요약). 탭 필터(전체/미처리/진행중/AS대기/종료) 및 검색·기간 필터 동작 확정.

### [AS 신청 시 'AS 대기' 탭 강제 이동]
- AS 신청(또는 [AS 관리] 클릭 후 요청) 시 해당 카드의 `status`를 즉시 **`AS_WAITING`**으로 변경.
- [AS 대기] 탭 필터: `status === 'AS_WAITING'`. [종료] 탭에는 `AS_WAITING` 건 노출하지 않음. AS 처리 완료 후 다시 시공완료(휴식기)로 복귀할 때까지 종료 탭에 나타나지 않도록 처리.
- 시각적 피드백: AS 신청 성공 시 "AS 대기 목록으로 이동되었습니다" 알림, 카드 우측 [AS 관리] 배지 빨간색 활성화.

### [오픈마켓 인입 채널 공식화 및 배지]
- 인입 채널(Lead Source)에 **네이버 스토어, 쿠팡, 오늘의집, 자사몰** 추가. 오픈마켓 선택 시 주문번호 입력 필드 활성화.
- 마켓별 고유 배지: 상담 카드 1행 좌측에 네이버(연두), 쿠팡(붉은색), 오늘의집(청록), 자사몰(보라) 시각적 구분.
- 오픈마켓 건은 `is_market_order: true`로 저장하여 마켓 수수료 제외 정산 등 마케팅 자동화 기반 마련.

### [실측 데이터 분리 및 전문성 강화]
- **실측 데이터를 상담 히스토리 타임라인에서 분리**하여 가독성 확보 및 실측 전용 워크플로우 구축 결정.
- 상담 상세 내에서는 실측 PDF/메모를 직접 렌더링하지 않고, 우측 상단 **[실측 자료(PDF)]** 버튼만 배치. 클릭 시 모달 → "실측 정보 입력 페이지로 이동"으로 전용 라우트(`/measurement/upload`) 연결.
- 실측 전용 모듈: **실측 관리** 메뉴(`/measurement`)에서 프로젝트별 실측 도면 통합 검색·열람. 실측 정보 입력(`/measurement/upload`)에서 PDF·텍스트 메모 업로드 시 Supabase Storage `measurement-drawings` 버킷에 저장. 내부 기술 자산으로 시공사례 뱅크(Cloudinary)와 완전 격리.

## 3. 문서 반영 사항
- **BLUEPRINT.md:** 고객 등급 동기화(동일 연락처 등급 상향 평준화), 구글챗 버튼 2행 우측 고정 및 연결 상태(초록/회색) 분기, 다중 견적 관리(estimate_history·대표 금액 우선순위), 실측 모듈 독립화(measurement-drawings·Signed URL), 오픈마켓 인입·배지 명시.
- **JOURNAL.md:** 본일(2026-02-07) 결정 사항 및 설계 원칙 추가. 향후 생성되는 모든 컴포넌트는 위 BLUEPRINT·JOURNAL에 확정된 원칙을 따름.

## 4. 다음 단계
- 확정된 설계 원칙에 따라 신규 컴포넌트·라우트 개발 시 BLUEPRINT 섹션 2(UI/UX 인터랙션 표준) 및 3(비즈니스 로직) 참조.
- 실측 완료 시 구글챗 Webhook 전송, 오픈마켓 신규 주문 시 공지방 알림 등 자동화 연동은 env Webhook URL 설정 후 동작 검증.

---

# 2026-02-07 기록 (상담 엔진 고도화 — 식별자 도입 / UI 롤백)

## 1. 오늘의 활동 요약
- **업체명 자동 식별자(display_name) 도입 성공.** 상담 리스트·히스토리에서 `[YYMM] [상호] [전화번호 뒷4자리]` 형식 적용 및 검색(뒷4자리) 지원.
- 채팅 UI 고도화(인라인 테마·드래그 앤 드롭) 시도 중 **화이트아웃 현상 발견** → 즉각 **롤백 조치** 완료. 채팅은 Tailwind 기본 스타일·파일 선택 버튼 방식만 유지.

## 2. 상세 작업 내용
- **상담 식별자(display_name):** 리스트 및 히스토리 내 표시·검색에 사용. 데이터 표준으로 확정.
- **UI 롤백:** 채팅창 인라인 테마 강제(#f1f5f9/#000000)·ThemeLock·드래그 앤 드롭 이벤트 제거. 화면 정상 출력을 위해 안정 버전으로 복구.
- **향후:** 드래그 앤 드롭·테마 강제는 안정성 검증 후 별도 모듈로 재구현 예정.

---

# 2026-02-07 기록 (견적·예산 기획안 실무 전면 리팩토링)

## 1. 오늘의 활동 요약
- 견적 관리 탭의 **예산 기획안(PROPOSAL)** 및 **확정 견적서(FINAL)** 를 실무 방식에 맞춰 전면 개편함.
- 예산 기획안 **발행승인 3단계**(미리보기 → 최종 발행 → 공유/PDF) 구현 및 **final_proposal_data** 도입으로 발행 시점 데이터 독립 보존.

## 2. 상세 결정·구현 사항

### [예산 기획안(PROPOSAL) 개편]
- **공급자 정보 고정:** 사업자번호 374-81-02631, 상호 주식회사 파인드가구, 대표이사 김지윤, 주소·연락처 고정 표시(수정 불가). 직인 영역 삭제(법적 책임 방지).
- **범위형 단가·금액:** 단가(최소)/단가(최대) 두 입력 필드, 금액(공급가)은 수량×단가(최소)~수량×단가(최대) 자동 계산·표시. 합계도 최소~최대 범위 표시.
- **면책문구:** 하단 노란 박스에 "이 자료는 예산 수립의 참고용이며, 협의 완료 후 확정된 최종 견적서는 별도 발급이 되며, 이때 단가는 변경이 될 수 있습니다."
- **비고 컬럼:** 예산 기획서에서는 삭제 유지. 품명·금액(공급가) 각 50px 확장(150px). 숫자 입력 시 천 단위 콤마 자동.

### [확정 견적서(FINAL) 분리]
- **비고(Remarks) 복구:** 확정 견적에서는 특이사항 기록 필수로 비고 컬럼 복구.
- **컬럼 비율:** 가로폭 A4 유지, 품명·비고가 공간을 나누고 단가 120px·금액(공급가) 200px 등으로 조정.
- **양식 분리 로직:** 선택 탭(예산 기획 / 확정 견적)에 따라 테이블 헤더·셀을 **조건부 렌더링(if/else)** 으로 완전 분리.

### [공통·기타]
- **행 삭제 버튼:** 각 행 끝에 삭제(X) 버튼 추가. 행 1개일 때 비활성화, 인쇄 시 숨김.
- **공간별/패키지별 섹션 삭제:** 단일 품목 리스트 기반으로만 동작. 패키지 추가 버튼 제거.
- **고객 정보 간소화:** '상호(업체명)'만 입력 필드로 두고, 상담 리스트에서 불러온 업체명 자동 입력. 성함·연락처 입력란 제거(연락처는 데이터로만 유지).
- **A4 인쇄:** 출력 시 가로폭 210mm 고정(@media print 및 print: 클래스).

### [발행승인 3단계 및 데이터 보존]
- **1단계(관리자 미리보기):** 발행승인 클릭 시 즉시 승인하지 않고, 고객에게 보여질 화면(PDF 디자인)을 팝업으로 표시. 공급자 고정·면책문구 포함. '취소'/'최종 발행' 버튼.
- **2단계(최종 발행):** 팝업 내 '최종 발행' 클릭 시 문서 상태 APPROVED, **final_proposal_data**에 해당 시점 데이터(행·단가·수량·상호 등) 스냅샷 저장. 원본 상담·임시저장 변경과 무관하게 발행본만 독립 보존.
- **3단계(공유·PDF):** 승인 후 견적 관리 탭에 '링크 복사'(`/p/estimate/:id`), 'PDF 다운로드'(인쇄 대화상자) 노출. 채팅에 시스템 메시지 "기획안이 발행되었습니다." 자동 생성.
- **DB:** `estimates` 테이블에 `final_proposal_data`(jsonb) 컬럼 추가(마이그레이션 `20260207130000_estimates_final_proposal_data.sql`). 표시/PDF/공유 시 `approved_at` 존재하면 `final_proposal_data` 사용.

### [확정 견적 컬럼 폭]
- 단가·금액(공급가) 항목 폭을 실무에 맞게 여러 차례 조정. 최종: 단가 min-w-[120px], 금액(공급가) min-w-[200px].

## 3. 변경·추가된 파일 요약
- **EstimateForm.tsx:** PROPOSAL/FINAL 모드별 테이블·헤더·셀 분리, 비고(FINAL만), 행 삭제, 공급자 고정, computeProposalTotals·ProposalPreviewContent(패키지 제거 반영).
- **ConsultationManagement.tsx:** 관리자 미리보기 팝업, handleProposalFinalPublish, final_proposal_data 저장/조회, 링크 복사·PDF 다운로드, 상호(업체명) 자동 입력.
- **PublicProposalView.tsx:** `/p/estimate/:id` 공개 페이지, final_proposal_data 우선 표시.
- **App.tsx:** 라우트 `/p/estimate/:id` 추가.
- **database.ts:** estimates.final_proposal_data 타입 추가.
- **App.css:** A4 인쇄용 @media print.
- **supabase/migrations:** estimates_final_proposal_data 마이그레이션 추가.

## 4. 다음 단계
- 공유 링크(`/p/estimate/:id`) 익명 접근 시 Supabase RLS 정책 검토(필요 시 estimates 읽기 허용).
- 확정 견적서 PDF 저장·전송 플로우는 기존 handleEstimateApproved 유지.

---

# 2026-02-07 기록 (AI 견적 도우미 & 코드 단순화)

## 1. 오늘의 활동 요약
- 견적 입력 시 자연어 처리 로직을 **LLM API 전환 가능 구조**로 단순화함. 정규식·if-else 파싱 제거, Mock 서비스로 결과값만 리턴하도록 정리.
- `estimateAiService`와 `estimateUtils` 분리, EstimateForm에서 복잡한 파싱 제거.

## 2. 상세 결정·구현 사항

### [역할 분리]
- **estimateAiService.ts:** `parseQuickCommand(text, context?)` → `QuickCommandResult` JSON. 타입: `add_row`, `past_price`, `target_total`, `needs_unit_price`, `needs_spec`, `spec_reply`, `unknown`. PDF/JPG 파싱은 Gemini API 사용.
- **estimateUtils.ts:** `parseAmountToWon`(금액 문자열 → 원화), `scaleFactorToTarget`(총액 맞춤 배율). 복잡한 케이스는 코드로 방어하지 않음.
- **EstimateForm.tsx:** `aiParse()` 호출 후 `switch (res.type)`로 분기. `addRowFromQuickCommand`, `applyTargetPricing`, `searchPastPrice` 등 핸들러만 사용.

### [UI]
- 견적 테이블 위 "AI 퀵 커맨드" 입력창. 빈 행 우선 채우기, Enter 처리.
- 규격 되묻기: 품명+수량만 입력 시 `needs_spec` → 규격 입력 유도.
- 과거 단가 조회: "이전 [품명] 단가 알려줘". 총액 맞춤: "총액 [금액]에 맞춰줘".
- 조정됨 표시: 총액 맞춤 후 `row.adjusted`로 "조정됨" 뱃지 표시.

### [파일 경로]
- `src/lib/estimateAiService.ts` — Mock AI 파싱 (LLM 교체 예정)
- `src/lib/estimateUtils.ts` — 금액 파싱, 총액 맞춤 유틸
- `src/components/estimate/EstimateForm.tsx` — 견적 폼, AI 퀵 커맨드 UI

## 3. 다음 단계
- LLM 연동: `estimateAiService.ts`에서 `fetch('/api/estimate-parse', { body: JSON.stringify({ text, context }) })`로 교체. 응답 JSON이 `QuickCommandResult` 형태가 되도록 스키마 정의.

---

# 2026-02-08 기록 (PPT/PDF 발주서 중심·이미지 이원화·역산 전역)

## 1. 오늘의 활동 요약
- PPT/PDF 발주서를 시스템의 중심에 두고, 현장별 갤러리·제품별 시공 현장 리스트·라이트박스 퀵뷰를 구현함.
- 가구 데이터에 색상·역산 태그를 반영하고, 원가-단가-마진율 양방향 역산 및 반올림·신호등 로직을 전역 적용함.
- BLUEPRINT 원칙에 따라 이미지 이원화(Cloudinary 고화질 + Supabase 썸네일) 강제 및 데이터 매칭 엔진을 구축함.

## 2. 상세 결정·구현 사항

### [발주서·상담 카드 통합]
- **order_documents 테이블:** consultation_id, storage_path, file_name, file_type(pdf/ppt/pptx), thumbnail_path, product_tags(jsonb). Storage 버킷 `order-documents`(RLS·anon 정책).
- **실측·발주서 탭:** 단순 파일 리스트가 아닌 **Supabase Storage 기반 비주얼 갤러리**로 동작. OrderDocumentsGallery: 썸네일 또는 타입 아이콘 그리드, 발주서 추가 업로드, 제품·규격 태그 편집.
- **라이트박스(Quick View):** DocumentLightbox — PDF는 iframe 즉시 보기, PPT는 다운로드 안내. 실측 PDF 동일 방식.
- **제품별 시공 현장:** `/products-sites` 페이지. order_documents.product_tags 기준으로 태그별 현장(상담) 목록 자동 구성, 상담 보기 링크( state.focusConsultationId )로 연동.

### [데이터 매칭 엔진]
- **productDataMatching.ts:** `getDataByProductTag(productTag)` — 해당 태그가 포함된 order_documents, consultations, project_images(Cloudinary URL 포함)를 한 번에 반환. 견적/발주서 product_name 태그 기반으로 Supabase·Cloudinary 데이터 정확 호출 인터페이스.

### [이미지 이원화 강제]
- **원칙:** 모든 시공 사진 업로드는 Cloudinary(고화질)와 Supabase(썸네일)로 분기. 벗어난 코드 미허용.
- **uploadConstructionImageDual(file, publicId):** 1) Cloudinary Upload API로 고화질 업로드, 2) Supabase Storage construction-assets에 썸네일 경로 업로드. ImageAssetViewer 업로드 폼에서 해당 함수 사용. env: VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET 필수.

### [견적·원가·마진 역산 전역]
- **품명 표준:** [품명] ([사이즈] / [색상]). EstimateRow에 color, costEstimated. AI 입력 "스마트A 1200 600 모번" → 품명(사이즈/색상) 자동 변환.
- **역산 수식 고정:** 마진율 = (판매가 − 원가) / 판매가 × 100; 판매가 = 원가 / (1 − 마진율/100). estimateUtils에 주석 명시.
- **roundToPriceUnit:** 10만원 미만 100원 단위, 이상 1,000원 단위. 역산 단가·원가·adjustUnitPricesToTargetMargin 전역 적용.
- **신호등 전역:** getMarginSignalClass(marginPercent) — ≥30% 초록, 25~30% 주황, <25% 빨강. 행 마진율 셀 및 수익 분석기 패널 마진율에 동일 적용.
- **원가 이력:** 단가만 있는 과거 건은 역산 원가로 이력 표시 시 '(추정)' 표기. 이력 선택 시 costEstimated 플래그 반영.

## 3. 변경·추가된 파일 요약
- **BLUEPRINT.md:** 이미지 이원화 강제, 발주서 중심(3-0), 역산 로직 전역·품명 표준·유틸 보강.
- **src/types/orderDocument.ts,** **src/components/order/DocumentLightbox.tsx,** **src/components/order/OrderDocumentsGallery.tsx,** **src/pages/ProductSitesPage.tsx,** **src/lib/productDataMatching.ts.**
- **src/lib/imageAssetService.ts:** uploadConstructionImageDual 추가. **src/pages/ImageAssetViewer.tsx:** 업로드 시 이원화 분기.
- **src/lib/estimateUtils.ts:** roundToPriceUnit, getMarginSignalClass, MARGIN_SIGNAL_THRESHOLDS, 역산 수식 주석. **EstimateForm.tsx:** getMarginSignalClass 사용, 품명/색상/역산됨/이력(추정) 반영.
- **DB:** order_documents 테이블, order-documents 버킷 마이그레이션. **database.ts:** order_documents, project_images 타입 추가.

## 4. 다음 단계
- LLM API 연동 시 estimateAiService Mock 교체. 필요 시 발주서에서 제품 태그 자동 추출(API) 확장.

---

# 2026-02-08 기록 (세이브 포인트 — 이부장 시스템 로직 최종 점검 및 문서 최신화)

## 1. 핵심 로직 박제 (Lock-in)
- **통합 검색:** `filterByUnifiedSearch(assets, query)` — 제품명(product_tags)·색상(color)·현장명(project_title)을 공백 기준 토큰으로 나누어 **모든 토큰이 포함된** 자산만 노출(AND 조건). ImageAssetViewer 상단 검색바와 연동. 확정.
- **역방향 견적:** 시공 뱅크 라이트박스에서 product_tags 클릭 → `navigate('/consultation', { state: { focusConsultationId?, addEstimateProductName } })` → ConsultationManagement의 useEffect에서 state 수신 후 견적 모달 오픈 및 `estimateModalInitialData.rows`에 해당 품명 단일 행 삽입. 흐름 고정.
- **이미지 이원화:** `useDualSourceGallery(productTag)` 훅 — `getDataByProductTag` 기반으로 Supabase(썸네일/mobileUrl)·Cloudinary(고화질/marketingUrl) 분기 반환. 견적서 시공 버튼·EstimateRowGalleryDialog에서 사용. 안정성 최종 확인.

## 2. 에러 징후 선제 대응 (Safety Check)
- **상태 관리:** (1) ImageAssetViewer `goToEstimateWithProduct`: `productName` trim·빈 문자열 시 navigate 스킵. `lightboxAsset?.consultationId` Optional Chaining, state에 `focusConsultationId`는 consultationId가 있을 때만 포함. (2) ConsultationManagement: `state?.focusConsultationId`, `state?.addEstimateProductName` 접근 시 Optional Chaining 및 `String(…).trim()` 적용. `focusId`는 null/빈 문자열 검사 후에만 setSelectedLead 등 호출.
- **무한 루프 방지:** `?focus=` 및 역방향 견적 처리 useEffect 의존성 배열은 `[location.state, location.search]`만 사용. `lastLocationKeyRef`로 동일 location key(또는 search+addProduct 조합)에 대해 모달 오픈·초기 데이터 설정을 **한 번만** 수행하도록 제한.
- **타입 무결성:** 역방향 견적 시 설정하는 `estimateModalInitialData.rows[0]`는 EstimateRow 필수 필드(no, name, spec, qty, unit, unitPrice, costPrice, color) 포함. `Partial<EstimateFormData>` 타입으로 저장되며, EstimateForm에서 initialData 병합 시 selectedLeadData와 merge하여 recipientName·recipientContact 보강.

## 3. 문서 업데이트
- **BLUEPRINT.md:** 섹션 2에 "6) 시공 사례 뱅크 (검색 엔진형) — Lock-in" 추가. 통합 검색(filterByUnifiedSearch)·색상 퀵필터·공유 최적화·역방향 견적(location.state)·useDualSourceGallery·tag_mappings 1:N 명시.
- **CONTEXT.md:** 섹션 9 현재 진행 상황을 시공 뱅크 Lock-in·Safety 요약·이미지 이원화·매칭·역산·AI 견적·채팅·빌드 상태로 최신화.
- **JOURNAL.md:** 본 세이브 포인트 기록 및 잠재적 에러 가능성(아래) 반영.

## 4. 잠재적 에러 가능성 (발견·대응)
- **React Router location.key:** 환경에 따라 `location.key`가 없을 수 있음. 대응: `(location as { key?: string }).key ?? \`${location.search}-${addProduct}\`` 로 폴백하여 중복 처리 방지 키 생성.
- **브라우저 뒤로가기:** 사용자가 역방향 견적로 진입 후 뒤로가기 시 `location.state`가 이전 값으로 복원될 수 있음. lastLocationKeyRef로 동일 키 재진입 시 모달 재오픈은 차단됨.
- **상담 미선택 역방향 견적:** addEstimateProductName만 있고 focusConsultationId 없이 진입 시 견적 모달은 열리나, 임시저장·승인 시 selectedLeadData가 null이면 handleEstimateApproved 등에서 consultationId 필요. 대응: onApproved·pastEstimates를 selectedLeadData 존재 시에만 유효하도록 이미 분기 처리함.
- **EstimateForm initialData 병합:** estimateModalInitialData에 rows만 있고 recipientName이 없을 때 selectedLeadData가 있으면 병합 로직에서 recipientName·recipientContact 보강. selectedLeadData가 없으면 수신자 필드 빈 값으로 표시되며, 추후 상담 선택 후 저장 가능.

---

# 2026-02-08 기록 (실전 테스트 전 세이브 포인트 — 공유·검수·명칭 통일)

## 1. 오늘의 활동 요약
- [이부장] 공유 기능 최종 반영 및 문서화. 검수 프로세스(중복 방지·status·검수 대기 뷰) 확정. 이미지 자산 vs 시공 사례 뱅크 명칭·경로 통일.

## 2. 상세 결정 사항 (Decisions)

### [명칭·경로 통일]
- **이미지 자산 관리** (`/image-assets`): 관리자 전용 창고. 개별 사진 태그 수정·삭제·Cloudinary 원본 관리에 집중.
- **시공 사례 뱅크** (`/portfolio`, `/assets`): 영업용 전시관. 현장별 카드 뷰·지능형 필터(제품군·색상별)·공유에 집중. 상단 [+ 사진 등록]으로 업로드 모달 연결.

### [검수 프로세스 및 중복 방지]
- **중복 감지:** 업로드 시 파일 SHA-256 해시(`content_hash`) 계산 후 DB 조회, 동일 해시 존재 시 해당 파일 업로드 차단(토스트 안내).
- **검수 상태:** `project_images.status` (default `pending`). 현장 직원 업로드 = pending, 관리자 승인 후 `approved`. 시공 사례 뱅크·제품별 매칭·공유 갤러리는 **approved만** 노출.
- **관리자 검수 뷰:** 이미지 자산 관리 페이지에 [검수 대기 사진] 필터. 선택 다중 건에 대해 태그·색상 일괄 수정 및 [선택 항목 승인] 버튼으로 일괄 approved 전환.

### [공유 시스템 — Share Logic]
- **공유 전용 페이지:** `/public/share?ids=uuid1,uuid2,...`. **PublicGalleryView** 구현. 로그인 없이 접근, 모바일 최적화(2열 그리드·라이트박스).
- **보안:** 외부 공유 페이지에서는 **사진·제품명(product_tags)·색상(color)** 만 노출. 원가·마진·consultation_id 등 민감 정보 배제.
- **성능:** 리스트는 썸네일 우선 로딩, 클릭 시 고화질(marketing) URL로 전환.
- **공유 모드 UI:** 시공 사례 뱅크에서 사진 체크박스(ShareCart) → 상단 [N장 공유 링크 복사]·카톡 공유. 복사 URL은 `/public/share?ids=...` 고정.
- **견적서 연동:** 견적서 모달 [이 품목 사진들 공유하기] → 품목명으로 `getDataByProductTags` 호출 → 매칭 시공 사진 ID로 공유 링크 생성·복사.
- **경로 호환:** `/share/gallery?ids=...` → `/public/share?ids=...` 리다이렉트.
- **카카오 공유:** `VITE_KAKAO_JS_KEY` 설정 시 SDK 로드·카톡 피드 카드 공유. 미설정 시 링크 복사만.

## 3. 문서 반영
- **BLUEPRINT.md:** 섹션 2에 "7) 공유 시스템 (Share Logic) — Lock-in" 추가. 공유 전용 페이지·공유 모드 UI·보안·성능·견적서 연동·카카오 공유 명시.
- **CONTEXT.md:** 섹션 9에 2026-02-08 반영(명칭 통일·검수 프로세스·공유 시스템) 요약 추가.
- **JOURNAL.md:** 본일(2026-02-08) 세이브 포인트 기록.

## 4. 다음 단계
- 실전 테스트: 공유 링크 복사 → `/public/share` 접근·썸네일→고화질 전환·보안(민감 정보 미노출) 검증.
- 카카오 공유 실제 동작은 `VITE_KAKAO_JS_KEY` 및 도메인 등록 후 확인.

---

# 2026-02-08 기록 (이미지 자산 vs 시공 사례 뱅크 — 페이지·컴포넌트 완전 분리)

## 1. 오늘의 활동 요약
- **캡틴 지시:** ImageAssetViewer는 수정하지 않고, 시공 사례 뱅크 전용 페이지를 별도 컴포넌트로 분리함.
- **PortfolioBank.tsx** 신규 생성. `/portfolio`, `/assets` 라우트는 모두 PortfolioBank로 연결. ImageAssetViewer는 `/image-assets`만 담당(관리자 창고).

## 2. 상세 결정·구현 사항

### [역할 분리 확정]
- **이미지 자산 관리** (`/image-assets`, **ImageAssetViewer**): 관리자 전용. 업로드·태그·삭제·검수·Cloudinary 원본 관리. 뱅크 UI와 혼용하지 않음.
- **시공 사례 뱅크** (`/portfolio`, `/assets`, **PortfolioBank**): 영업 전용. 현장별/사진별 토글, 업종 필터, 통합 검색, 사진 선택(ShareCart), 카톡 공유 바(공유 링크 복사 + 카톡 공유). 라이트박스에서 이전/다음, 「이 현장 앨범 보기」로 현장별 모드 전환·스크롤.

### [데이터·서비스]
- **imageAssetService:** `rowToProjectAsset(row)`, `fetchApprovedProjectAssets()` 추가. 뱅크는 approved 행만 조회하여 ProjectImageAsset 형태로 사용.
- **App.tsx:** `/portfolio`, `/assets` → PortfolioBank 컴포넌트로 라우팅 변경.

### [이미지 자산 쪽 보강 (이전 세션 반영)]
- **인라인 태그 편집·태그 드래그:** 카드에서 태그 영역 클릭 시 수정 모드, `saveInlineTag`로 DB 반영. 위 카드 태그를 아래 카드에 드롭 시 `pasteTagsToAsset`로 복사.
- **라이트박스 → 관리 연동:** 라이트박스에 「관리 페이지에서 수정하기 →」 링크, `focusAssetId`로 해당 카드 포커스·편집 모드.
- **목업 업로드:** `import.meta.env.DEV` 시 Cloudinary 스킵, 3초 대기 후 Supabase만 저장, `mock_` public_id. API 키 없을 때 콘솔/업로드 창 안내.
- **UUID:** mock 자산 id를 `crypto.randomUUID()`로 통일. `src/lib/uuid.ts`에 `isValidUUID`·`ensureUUIDOrNull` 추가. `project_images` insert/update 및 consultation_id 사용처에 UUID 검사 적용.
- **배열 태그:** `toProductTagsArray`(utils), insert/update 시 `product_tags` 배열 보장. `productDataMatching`에서 `product_tags` contains 검색 유지.
- **시드 데이터:** project_images 시드 5건(seed_1~seed_5), `getSeedImageUrl`로 picsum.photos URL 적용.
- **견적서 이미지:** 아이콘/썸네일 클릭 시 highResUrl console.log, 라이트박스 fixed+z-[100], 로드 실패 시 「이미지를 불러올 수 없습니다」+ 플레이스홀더.

## 3. 변경·추가된 파일 요약
- **신규:** `src/pages/PortfolioBank.tsx` (시공 사례 뱅크 전용).
- **수정:** `src/App.tsx` (라우팅), `src/lib/imageAssetService.ts` (fetchApprovedProjectAssets, rowToProjectAsset).
- **유지:** ImageAssetViewer.tsx는 뱅크 분리 후에도 관리 전용으로만 사용.

## 4. 다음 단계
- 뱅크 실사용 테스트(현장별/사진별 전환, 공유 링크·카톡 공유). 필요 시 업종 필터·검색과 approved 데이터 연동 재검증.

---

# 2026-02-08 기록 (완료된 작업 — 20행·PDF 파일명·상담 카드 금액·3단계 뱃지·데이터 이사 기초)

## 1. 완료된 작업 요약
- 견적서 **20행 고정** 규격 적용, **PDF/이미지 저장 파일명** 규격화, **상담 카드 금액 동기화**(삭제·확정 연동), **3단계(4단계) 뱃지** 텍스트 고정 영역 확정.
- PDF 미리보기 모달 스크롤·최종 확정 버튼·확정견적 필드 통합, 상담 히스토리 타임라인 왼쪽 정렬·수직 가이드라인, **데이터 통합 관리** 페이지(`/admin/migration`) 기초 구현.

## 2. 상세 완료 사항 (Decisions & Implementation)

### [20행 고정 규격]
- **규격:** 견적서 테이블은 **최대 20행**으로 고정. 부족분은 `createEmptyRow(index)`로 빈 행 패딩. PDF 인쇄·미리보기·이미지 저장 시 동일 20행 기준으로 렌더링하여 A4 레이아웃 일관성 확보.
- **적용 위치:** EstimateForm 초기/병합 시 `FIXED_ESTIMATE_ROWS(20)`, ConsultationManagement PDF 모달·관리자 미리보기에서 `rawRows.length >= 20 ? slice(0,20) : [...rawRows, ...Array(20 - length)]` 로 패딩 후 ProposalPreviewContent/FinalEstimatePreviewContent에 전달.

### [PDF/이미지 파일명 규격]
- **이미지(PNG):** `buildEstimateImageFilename(quoteDate?, recipientName?)` — `견적서_YYYY-MM-DD_업체명.png` 형식. 날짜·업체명 없으면 플레이스홀더 적용.
- **PDF:** `buildEstimatePdfFilename(recipientName?)` — `견적서_업체명.pdf` 형식. `estimatePdfExport.ts`에 규격 정의 및 exportEstimateToPdf/exportEstimateToImage 호출 시 동일 함수 사용.

### [상담 카드 금액 동기화 및 무결성]
- **삭제 연동:** `handleDeleteSelectedEstimates`에서 견적 삭제 후 해당 `consultation_id`로 남은 견적 재조회 → `metadata.estimate_history`·`expected_revenue` 재계산. 남은 견적 0건이면 `status = '상담중'`, 금액 0으로 초기화. FINAL(확정) 견적 삭제 시 `metadata.final_amount`·`final_estimate_id` 제거, 카드 `finalAmount: null` 반영.
- **확정 연동:** PDF 모달 [최종 확정] 클릭 시 `metadata.final_amount`·`final_estimate_id` 저장, `status = '계약완료'`, 카드에 `finalAmount` 즉시 반영.
- **표시 단일화:** 카드 3행에는 **확정견적: [금액]원** 만 표시. `final_amount` 값이 있을 때만 라벨·금액 노출, 없으면 해당 블록 비표시. 금액은 ReadOnly(견적 확정으로만 변경). 상세 패널 금액은 `validatedDisplayAmount`(실제 유효 견적 기반)로 검증 후 렌더링.

### [3단계(4단계) 뱃지 로직 — 텍스트 고정 영역]
- **표시:** 카드 1행 우측에 **4단계 프로그레스(점) + 고정 너비 텍스트 영역**. 상담접수·견적중·계약완료·시공완료 네 단계 **항상 노출**, 현재 단계만 진하게·나머지 연한 회색. 업체명 길이와 무관하게 우측 요소 위치 고정.
- **매핑:** `metadata.workflow_stage` 또는 `STATUS_TO_STAGE[status]`로 4단계 중 현재 단계 결정. 배지 제거·텍스트 전용으로 가독성 확보(기존 JOURNAL 2026-02-06 결정 유지).

### [PDF 미리보기 모달 강화]
- **스크롤:** 컨텐츠 영역 `max-h-[80vh]`·`overflow-y-auto`, 하단 `pb-10`으로 면책 문구까지 스크롤 가능. 상단 버튼 바 `sticky top-0 z-10 bg-card` 고정.
- **최종 확정:** [PNG 저장]·[PDF 저장] 옆에 [최종 확정] 버튼(강조 색). 클릭 시 해당 견적을 FINAL로 저장(미승인 시 `final_proposal_data`·`approved_at` 설정), consultations `status=계약완료`·`expected_revenue`·`metadata.final_amount`·`final_estimate_id` 반영, 카드 상태 즉시 갱신.

### [상담 히스토리 타임라인 레이아웃]
- **정렬:** 시스템 메시지(날짜·발행 안내)를 **왼쪽 정렬**(`items-start`, `text-left`). 스크롤 영역 `pl-6 pr-2`, 시스템 메시지에 아이콘(MessageCircle)·텍스트 `gap-2` 유지.
- **수직 가이드라인:** 타임라인 좌측에 `left-4 top-0 bottom-0 w-0.5 bg-slate-300/80` 수직선 추가. 직원 아바타·시스템 아이콘 흐름을 따라 가독성 향상.

### [데이터 통합 관리 페이지 — 데이터 이사 기초]
- **경로:** `/admin/migration`. 홈에서 "데이터 통합 관리" 링크 노출.
- **기능:** (1) 상단 [테스트 모드 활성화] 토글 — 켜면 파싱 업체명 앞에 `[TEST]` 접두사. (2) 멀티 파일 업로드(드래그·파일 선택), 파일별 상태 **대기 → 분석중(AI 인식) → 검수대기 → 완료**. (3) AI 파싱 Mock: 이미지/PDF/PPT → 견적 스키마(품목·규격·수량·단가) JSON 변환. (4) **최종 검수** 단계: 테이블 형태 미리보기·업체명·연락처·행 편집·행 추가/삭제 후 DB 저장. (5) DB 저장 시 Consultations·Estimates 생성, `is_test: true`, `metadata.migration_tag: '과거데이터'`. (6) [모든 테스트 데이터 삭제]로 `is_test: true` 건 일괄 삭제.
- **DB:** `consultations`·`estimates`에 `is_test`(boolean, default false) 컬럼 추가 마이그레이션 적용. TypeScript 타입(database.ts) 동기화.

## 3. BLUEPRINT 동기화 사항
- 20행 고정·PDF/이미지 파일명 규격·상담 카드 확정견적·4단계 텍스트 고정·타임라인 왼쪽 정렬·데이터 통합 관리(is_test·과거데이터)를 BLUEPRINT.md 본문에 반영함.

## 4. 코드 안정화 점검
- **충돌 없음:** 견적 삭제 ↔ 확정견적 초기화, 최종 확정 ↔ 카드 finalAmount 반영, validatedDisplayAmount ↔ 상세 패널 금액 표시 간 데이터 흐름 일치 확인. 마이그레이션 페이지는 `is_test` 전용으로 상담 리스트·견적 관리와 분리되어 동작.
- **다음 단계 대비:** 데이터 이사 화면은 `/admin/migration`에서 확장. 실제 OCR/LLM 연동 시 `mockParseEstimateFromFile`을 API 호출로 교체하면 됨. 기존 상담·견적 CRUD와 is_test 플래그로 필터 분리 유지.

## 5. 커밋 준비
- JOURNAL.md·BLUEPRINT.md·CONTEXT.md 최신화 완료. 위 완료 사항 기준으로 커밋 메시지 예시: `feat: 20행 고정, PDF/이미지 파일명 규격, 상담 카드 금액 동기화·확정견적, PDF 최종 확정, 타임라인 왼쪽 정렬, 데이터 통합 관리(/admin/migration) 기초`

---

# 2026-02-09 기록 (채널톡 FAQ 객체 키 문법 수정·AS 매칭)

## 1. 오늘의 활동 요약
- `channelTalkService.ts`의 **FAQ_DATA** 객체에서 **A/S** 키로 인한 문법 에러(Expected "}" but found "/")를 해결하고, 특수문자·일반 키 모두 따옴표로 감싸 안정성을 높임. "AS 문의드려요"처럼 슬래시 없이 입력해도 A/S 답변이 나오도록 **'AS'** 키를 추가함.

## 2. 상세 결정·구현 사항

### [FAQ_DATA 키 문법]
- **A/S:** `A/S`(식별자 불가) → **`'A/S'`**(문자열 리터럴)로 변경하여 파싱 에러 제거.
- **전체 키 따옴표 적용:** 가격, 비용, 사이즈, 규격, 배송, 설치, 견적, 상담, 기간, A/S를 모두 `'...'` 형태로 통일.
- **A/S 답변 공통화:** `FAQ_ANSWER_AS` 상수로 A/S 관련 답변 한 번만 정의. `'A/S'`, `'AS'` 두 키가 동일 답변을 참조.

### [AS 매칭]
- **'AS' 키 추가:** 문의 텍스트에 "AS"(슬래시 없음)만 포함되어도 `matchFaqKeyword`가 매칭하도록 `FAQ_DATA['AS']` 추가. "AS 문의드려요" 입력 시 A/S 표준 답변·3단계 자동 응답이 정상 파싱·타임라인 기록됨.

### [관련 파일]
- **src/lib/channelTalkService.ts:** FAQ_ANSWER_AS, FAQ_DATA 키 따옴표·'AS' 추가. TestConsole(`/admin/test-console`)에서 문의 내용에 "AS 문의드려요" 입력 후 시뮬레이션 전송 시 해당 답변 검증 가능.

## 3. 세이브 포인트와의 관계
- 본일 작업은 기존 채널톡 시뮬레이터·FAQ 엔진 위에 문법 수정·AS 매칭만 반영. BLUEPRINT·CONTEXT·JOURNAL·soul.md에 오늘 내용 반영 후 **세이브 포인트 2026-02-09 (FAQ·채널톡)** 로 롤백 참고용 기록.

---

# 2026-02-08 기록 (상담 UI·타임라인 개편 — 선수교체용)

## 1. 오늘의 활동 요약
- 상담 관리 페이지(ConsultationManagement.tsx)에서 상태 바·탭·인입채널·카드 레이아웃·골든타임 3단계·6단계 프로그레스·조회 기간(이번달) 반영 완료.
- 타임라인(ConsultationChat.tsx)에서 consultation_messages.is_visible 도입, 관리자 시스템 메시지 영구 삭제·메시지 숨기기/다시 보이기 구현 완료.

## 2. 상세 결정·구현 사항

### [상태 바·탭 연동]
- **상태 바:** 6개 텍스트 버튼(상담접수·견적중·계약완료·시공완료·AS·캔슬). 비활성 `text-gray-400`, 활성만 단계별 색상, `transition-colors`.
- **탭 연동:** 상태 변경 성공 시 `setListTab` 호출 — 상담접수→미처리, 견적중→진행중, 계약/시공완료→종료, AS→AS대기, 캔슬 제출→캔슬.
- **캔슬 탭:** ListTab에 '캔슬' 추가, `status === '거절'`만 필터. 종료 탭은 시공완료만, 캔슬 탭은 거절만.

### [인입채널]
- **CONSULT_SOURCES** 9종 고정: 채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타. 기본값 **채널톡**. 저장은 `consultations.metadata.source` (inflow_channel 컬럼 없음).

### [상담 카드 레이아웃]
- **1행:** 등급배지·업체명·골든타임 배지·AS요청·확정견적(금액, text-[11px]).
- **2행:** 인입채널 배지 → 지역·업종·전화·(주문번호)·인입날짜·요청날짜. 인입채널 배지 스타일 통일(INFLOW_BADGE_BASE).

### [골든타임 3단계]
- **dateUtils.ts:** `getElapsedDays`, `getGoldenTimeState` (Hot 0~7, Active 8~20, Warning 21~30, Expired 31+), `GOLDEN_TIME_DEADLINE_SOON_DAYS`(27).
- **카드 2행 최좌측 배지:** Hot ⚡골든타임(주황), Active 🌿집중상담(초록), Warning 🔔이탈경고(노랑), 계약완료 시 🏗️진행중(파랑). 31일 초과 시 배지 제거, 카드 opacity-70. 완료·캔슬·AS 시 골든 배지 미노출. Lead에 `goldenTimeTier`, `goldenTimeDeadlineSoon`, `goldenTimeElapsedDays` 추가.

### [6단계 프로그레스 텍스트]
- **STAGE_BAR_OPTIONS:** 접수|견적|계약|완료|AS|캔슬. key는 기존 유지, label만 짧게. min-w-[2rem], flex-nowrap, title={key}.

### [조회 기간 필터]
- **DateRangeKey**에 `'thisMonth'` 추가. Select에 "이번달" 옵션(최근 1개월 위). `startOfMonth(new Date())` ~ 현재 시각으로 필터. **기본값** `useState('thisMonth')`. tabCounts·filteredLeads의 inRange에 thisMonth 분기.

### [타임라인 — 시스템 메시지 삭제·숨기기/다시 보이기]
- **ConsultationChat** prop `isAdmin`: 기본 false. localStorage `findgagu-role` === 'admin' 또는 URL `?admin=1`. 시스템 메시지 블록 호버 시 **Trash2** 버튼 노출. 확인 후 consultation_messages DELETE, setMessages로 목록에서 제거.
- **consultation_messages.is_visible:** boolean, default true. 마이그레이션 적용. 일반 사용자는 is_visible !== false만 표시; 관리자는 전부 표시하고 is_visible === false인 메시지는 opacity-60. 모든 타임라인 메시지에 호버 시 **EyeOff(숨기기)**. 관리자만 숨긴 메시지에 **Eye(다시 보이기)** 로 is_visible = true 복구. database.ts Row/Insert/Update에 is_visible 반영.

## 3. 참고 (파일/구조)
- ConsultationCard·ConsultationTimeline·useConsultationTimeline·ConsultationFilters·constants는 별도 파일 없음. 카드·타임라인·기간 필터는 **ConsultationManagement.tsx**와 **ConsultationChat.tsx**에서 처리. 테이블명 **consultation_messages** 사용(consultation_history 아님).

---

# 2026-02-09 기록 (마이그레이션 날짜 소급·인입일 수정·골든타임 연동)

## 1. 오늘의 활동 요약
- 데이터 통합 관리(/admin/migration)에서 **날짜 소급 적용**, **인입일 수동 수정**, **골든타임 연동** 로직 반영.

## 2. 상세 결정·구현 사항

### [날짜 소급 적용]
- 저장 시 `consultations.created_at`을 **오늘이 아닌** AI가 파싱한 **실제 견적일(인입일)**로 설정.
- `toCreatedAtISO(quoteDate)`: `YYYY-MM-DD` → 로컬 자정 ISO 문자열. 유효하지 않으면 당일 시각 사용.

### [수동 수정 지원]
- 검수 테이블 상단에 **인입일(날짜)** Date Picker 컬럼 추가. `quoteDate`와 연동되어 AI가 잘못 읽은 경우 사용자가 직접 수정 가능.

### [골든타임 연동 검증]
- 상담 리스트는 `consultations` 조회 시 `select('*')`로 **created_at** 포함. `mapConsultationRowToLead`에서 `getGoldenTimeState(created)`로 배지 계산.
- 마이그레이션 저장 시 **created_at**을 인입일로 소급하므로, 상담 관리 페이지 진입 시 **소급된 날짜 기준**으로 골든타임(주황/초록/노랑)이 실시간 정확히 표시됨.

---

# 2026-02-09 기록 (상담 카드 숨기기·관리자 아카이브·데이터 무결성)

## 1. 오늘의 활동 요약
- **Soft Delete:** consultations.is_visible (boolean, default true) 컬럼 추가. 숨기면 리스트·통계에서 제외.
- **관리자 아카이브:** /admin/archive 전용 페이지, 복구·영구 삭제·[TEST] 필터.
- **데이터 무결성:** 모든 상담 목록/통계용 select에 is_visible = true 필터 강제.

## 2. 상세 결정·구현 사항

### [상담 카드 숨기기]
- 상담 상세 슬라이드 패널(히스토리 탭)에 관리자 전용 **[이 상담 숨기기]** 버튼. 클릭 시 is_visible = false, 리스트에서 제거·패널 닫힘.
- fetchLeads: .eq('is_visible', true) 적용 → 메인 리스트·탭 카운트·이번 달 실적·골든타임 카운트에 숨긴 데이터 미포함.

### [관리자 아카이브 페이지]
- **경로:** /admin/archive. **ArchivePage.tsx** (src/pages/admin/ArchivePage.tsx).
- **데이터:** useConsultations(false) → is_visible = false만 조회.
- **복구:** [복구] 클릭 시 is_visible = true → 상담 리스트/통계 재포함.
- **영구 삭제:** [영구 삭제] 클릭 시 estimates 해당 consultation_id 삭제 후 consultations 삭제.
- **필터:** 체크박스 "[TEST] 데이터만 보기" → company_name 앞 [TEST] 접두사만 표시.

### [useConsultations 훅]
- **경로:** src/hooks/useConsultations.ts.
- useConsultations(visibleOnly: true) → 리스트/대시보드용. useConsultations(false) → 아카이브용.

### [is_visible 필터 강제]
- ConsultationManagement fetchLeads, MeasurementUpload 목록, MeasurementArchive 목록, ProductSitesPage consultations, productDataMatching getDataByProductTag, ConsultationChat 동일 연락처 조회 — 모두 **is_visible = true** 조건 추가. 숨긴 데이터는 이번 달 실적·골든타임 카운트·제품별 시공·시공 뱅크 매칭에 영향 없음.

### [숨기기 확인 Dialog]
- 네이티브 confirm() 대신 **앱 내 Dialog** 사용. [이 상담 숨기기] 클릭 시 "이 상담을 숨깁니다. … 계속할까요?" [취소]/[숨기기] 버튼으로 확인 후 처리.

---

# 세이브 포인트 2026-02-09 (상담 숨기기·아카이브·마이그레이션 완료)

**이 시점까지 반영된 작업을 롤백할 때 참고용입니다.**

## 포함된 작업 요약
- **DB:** consultations.is_visible 컬럼 (마이그레이션 `consultations_is_visible`).
- **상담 숨기기:** [이 상담 숨기기] 버튼(히스토리 탭, 관리자 전용) + 확인 Dialog → is_visible false. 메인 리스트·통계에서 제외.
- **관리자 아카이브:** `/admin/archive` (ArchivePage), useConsultations(false), [복구]/[영구 삭제], [TEST] 필터.
- **useConsultations:** src/hooks/useConsultations.ts (visibleOnly true/false).
- **데이터 무결성:** 상담 목록·통계·실측·제품별 시공·채팅 조회 전부 is_visible = true 필터.
- **마이그레이션:** created_at = 인입일(quoteDate) 소급, 인입일(날짜) Date Picker, 저장 후 상담 관리 이동. VITE_MIGRATION_PARSE_API 연동 구조.
- **문서:** BLUEPRINT.md, CONTEXT.md, soul.md, JOURNAL.md 최신화.

## 롤백 시 (Git 사용 시)
이 상태를 태그로 남겨 두었다면 아래로 복귀할 수 있습니다.

```bash
# 현재 상태를 커밋한 뒤 태그 생성 (아직 안 했다면)
git add -A
git commit -m "checkpoint: 상담 숨기기·아카이브·마이그레이션 날짜 소급 완료"
git tag save-20260209-archive-migration

# 이후 실수 시 이 시점으로 복귀
git checkout save-20260209-archive-migration
# 또는 특정 파일만 복원 시 해당 커밋에서 파일 체크아웃
```

## 변경된 주요 파일 (롤백 시 참고)
- `src/pages/ConsultationManagement.tsx` — fetch is_visible, handleHideLead, hideConfirmLeadId Dialog.
- `src/pages/admin/ArchivePage.tsx` — 신규.
- `src/hooks/useConsultations.ts` — 신규.
- `src/types/database.ts` — consultations.is_visible.
- `src/pages/AdminMigration.tsx` — handleSave, created_at 소급, 인입일 Date Picker.
- `src/lib/migrationParseService.ts` — parseEstimateFromFile, VITE_MIGRATION_PARSE_API.
- `src/App.tsx` — /admin/archive 라우트, 숨긴 상담 아카이브 링크.
- `src/pages/MeasurementUpload.tsx`, `MeasurementArchive.tsx`, `ProductSitesPage.tsx`, `productDataMatching.ts`, `ConsultationChat.tsx` — is_visible 필터.
- `supabase/migrations` — consultations_is_visible 마이그레이션.
- `BLUEPRINT.md`, `CONTEXT.md`, `soul.md`, `JOURNAL.md`.

---

# 세이브 포인트 2026-02-09 (오늘 작업 마감 — FAQ·채널톡 문법·문서 통합)

**이 시점까지 반영된 작업을 롤백할 때 참고용입니다. (상담 숨기기·아카이브·마이그레이션 + 채널톡 FAQ 문법·AS 매칭 포함)**

## 포함된 작업 요약
- **이전 세이브:** 상담 숨기기(is_visible)·아카이브·마이그레이션 날짜 소급·인입일 수정 (위 블록 참고).
- **오늘 추가:** **channelTalkService.ts** — FAQ_DATA 객체 키 문법 수정 (`A/S` → `'A/S'`, 모든 키 따옴표), **'AS'** 키 추가로 "AS 문의드려요" 시 A/S 답변 매칭. BLUEPRINT(채널톡 시뮬레이터·FAQ 자동 응답 섹션), CONTEXT, JOURNAL, soul.md 최신화.

## 롤백 시 (Git 사용 시)
```bash
git add -A
git commit -m "checkpoint: 상담 숨기기·아카이브·마이그레이션·채널톡 FAQ 문법·AS 매칭 완료"
git tag save-20260209-faq-channel

# 이후 이 시점으로 복귀
git checkout save-20260209-faq-channel
```

## 오늘 변경된 주요 파일
- `src/lib/channelTalkService.ts` — FAQ_ANSWER_AS, FAQ_DATA 키 따옴표·'AS' 추가.
- `BLUEPRINT.md` — 섹션 3에 "5) 채널톡 시뮬레이터 및 FAQ 자동 응답" 추가.
- `CONTEXT.md`, `JOURNAL.md`, `soul.md` — 2026-02-09 FAQ·세이브 포인트 반영.

---

# 2026-02-10 기록 (MigrationPage 파일명·저장=확정·6개월 견적 통계·원가 연동)

## 1. 오늘의 활동 요약
- **MigrationPage:** Mac 환경 파일명 인코딩 문제 방지용 `toSafeStoragePath` 적용. 저장 시 `approved_at` 자동 설정(기존 적용 확인).
- **ConsultationManagement:** 임시저장 = 확정(approved_at), 6개월 견적 통계(최대/최소/실제 중간값 + estimate_id), 원가 연동, 견적 이력 UI 4가지 지표(클릭 가능·툴팁) 반영.

## 2. 상세 결정·구현 사항

### [MigrationPage — 파일명 인코딩]
- **toSafeStoragePath(originalName, prefix):** 원본 파일명 대신 `{prefix}_{timestamp}_{random}.{safeExt}` 형식. pdf/jpg/jpeg/png만 허용, jpeg→jpg 통일. Mac/한글 파일명으로 인한 MIME 오류·저장 실패 방지.
- **적용:** 견적 PDF/이미지 업로드(prefix: estimate), 원가표 업로드(prefix: vendor) 모두 적용.

### [ConsultationManagement — 저장 = 확정]
- **handleEstimateSaveDraft:** insert/update 시 `approved_at: new Date().toISOString()` 추가. 별도 승인 없이 저장 즉시 확정 데이터로 처리.

### [6개월 견적 통계]
- **estimatesLast6Months:** subMonths(now, 6) 이후 created_at, is_visible=true. approved_at 필터 없음.
- **estimateStats:** 최대(max)·최소(min)·중간(median). **중간값**은 max/min 평균이 아니라, grand_total 정렬 후 실제 발행 견적 중 **중앙에 가장 가까운 값** 선택. 각 지표에 estimate_id 매핑.

### [원가 연동]
- **costSum:** 최근 견적 1건의 rows 기준. 품명별 getVendorPriceRecommendation 호출 → vendor_price_book 또는 products에서 원가 조회 → (원가 × 수량) 합산.

### [견적 이력 UI]
- **위치:** 견적 관리 탭, "기존 견적 이력" 제목 위.
- **형식:** `[최대: 122,000원 | 중간: 110,000원 | 최소: 94,500원 | 원가: 85,000원]`
- **클릭:** 최대/중간/최소 수치 클릭 시 setPrintEstimateId(해당 estimate_id) → 견적서 상세(인쇄/PDF) 팝업.
- **UX:** title="해당 견적서 보기" 툴팁, cursor-pointer, hover:text-primary hover:underline.

## 3. 변경된 주요 파일
- `src/pages/admin/MigrationPage.tsx` — toSafeStoragePath, storagePath 변경(견적·원가).
- `src/pages/ConsultationManagement.tsx` — getVendorPriceRecommendation import, handleEstimateSaveDraft approved_at, estimatesLast6Months·estimateStats·costSum, 견적 이력 4지표 UI.

---

# 세이브 포인트 2026-02-10 (마이그레이션·통계·아카이브 완료)

**이 시점까지 반영된 작업을 롤백할 때 참고용입니다.**

## 포함된 작업 요약
- **ConsultationManagement:** 6개월→12개월 통계(최근 1년 시세), 전체 이력 리스트(기간 제한 없음), 연도별 그룹·아카이브 스타일, 조회 기간 기본값 '전체', 금액 클릭→견적 상세 팝업
- **MigrationPage:** 업로드 완료 목록 localStorage 영구 저장, DB 복원·원본 파일명(payload._migration_original_filename), 견적일 컬럼, 중복 체크, 목록 비우기·DB 미존재 항목 자동 정리, 클릭→상담 견적 상세
- **데이터:** 통계 vs 리스트 분리(12개월 시세 / 전체 아카이브), dateRange 기본 'all'

## 롤백 시 (Git 사용 시)
```bash
git checkout save-20260210-migration-stats
# 또는 특정 파일만 복원 시 해당 커밋에서 파일 체크아웃
```

## 변경된 주요 파일
- `src/pages/ConsultationManagement.tsx` — estimatesLast12Months, estimateListByYear, archiveCutoff, dateRange default 'all'
- `src/pages/admin/MigrationPage.tsx` — uploadedItems localStorage, DB 복원, _migration_original_filename, 견적일 컬럼, 목록 비우기
- `BLUEPRINT.md`, `CONTEXT.md`, `JOURNAL.md`, `soul.md`