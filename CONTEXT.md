Context: FindGagu OS Project 1. 페르소나 및 관계 - 대표님: 8년 경력의 가구 전문가. 실무 효율과 데이터 자산화 중시. - 이부장(AI): 대표님의 전담 비서이자 실무 팀장. 핵심 위주 보고와 위트 있는 소통 담당. 2. 프로젝트 배경 - 기존 '주문 관리' 방식의 파편화된 데이터를 '상담 관리' 중심의 체계적 OS로 전환 중. - M4 맥북을 도입하여 고성능 로컬 개발 환경(Cursor) 구축 완료. 3. 주요 규칙 (Constraints) - 용어 통일: 반드시 '상담 관리' 사용. - 디자인 원칙: 현장 기사님이 장갑 끼고도 조작 가능한 Mobile-First UI. - 확장성: 한샘 등 대기업이나 다수 대리점이 사용 가능한 SaaS 구조 고려. 4. 현재 상황 - Lovable 크레딧 소진 전 GitHub(1shot1kill74/ivory-os) 이관 성공. - 로컬 맥북 환경에 코드 복제(Clone) 완료.

# 프로젝트 컨텍스트 (CONTEXT) - 가구 비즈니스 통합 솔루션

## 1. 프로젝트 비전 및 목표
- **서비스 명칭:** 가구 비즈니스 전주기 통합 관리 시스템 (FMS: Furniture Management System)
- **핵심 가치:** "8년의 오프라인 영업 노하우를 디지털 자산으로 전환"
- **목표:** 가망 고객 유입부터 상담, 견적, 시공 완료, 사후 마케팅까지 파편화된 업무를 하나로 통합하여 매출 효율을 200% 이상 극대화함.

## 2. 운영 원칙 (Operating Principles)
- **[정보 계층화]**  
  상담 타임라인은 **흐름(Context)**에 집중하고, 대용량·기술적 자산은 **독립 모듈(Module)**에서 관리한다. 타임라인 화면에 실측 PDF·대량 메모·견적 이력 전체를 직접 쌓지 않고, 각각 전용 진입점(실측 관리, 견적 이력 팝업 등)으로 분리하여 가독성과 전문성을 확보한다.
- **[데이터 무결성]**  
  고객 등급 및 고객 정보는 **전역적으로 동기화**되어야 하며, 동일 연락처·동일 고객에 대한 파편화된 정보를 허용하지 않는다. 한 건에서의 등급·정보 변경은 동일 기준(예: 연락처)으로 묶인 모든 카드·이력에 일관되게 반영되어야 한다.

## 3. 비즈니스 도메인 이해 (가구업 특화)
- **B2B/B2G 타겟:** 학원(방학 전), 학교(방학 중), 사무실 등 시즌별 집중 영업이 핵심.
- **영업 사이클:** 초기 상담 후 30일 이내에 승부를 봐야 하는 '골든타임' 비즈니스.
- **현장 의존성:** 상세한 현장 정보(엘리베이터, 사다리차 등)와 정확한 내비게이션 연동이 실행력의 핵심.
- **콘텐츠 마케팅:** 실제 시공 사례(Before/After)가 가장 강력한 영업 도구이며, 이를 다양한 채널에 자동 배포하는 것이 필수.

## 4. 기술적 환경 및 스택
- **사용자 기기:** MacBook Air M4 (16GB RAM) - 로컬 개발 및 AG 멀티 에이전트 구동 환경.
- **메인 플랫폼:** Google Anti-Gravity (AG)를 통한 노코드/로우코드 기반의 고속 개발.
- **백엔드/DB:** Supabase (Auth, Database, Storage).
- **자동화 엔진:** n8n 및 Make (워크플로우 자동화).
- **AI 연동:** OpenCLO (시공 사진 기반 멀티 콘텐츠 자동 생성 및 배포).

## 5. 사용자 페르소나 및 접근 권한 (이원화 전략)
- **Master (대표/관리자):** 전체 매출 실적, 마케팅 ROI 분석, 시스템 설정 권한.
- **[상담 직원]**  
  가망 고객 발굴, 상담 상세 기록(타임라인), 견적서 발행, 고객 케어. **진입점:** 상담 관리(리스트·타임라인·견적 이력). 타임라인은 흐름만 보고, 견적·실측 등 대용량 자산은 전용 모듈로 이동.
- **[현장 실측/시공팀]**  
  실측 일정·현장 방문·실측 PDF·치수 메모 업로드, 시공 완료 보고, 현장 사진 업로드. **진입점:** 실측 관리(실측 정보 입력·실측 아카이브), 일정/현장 담당 뷰. 상담 타임라인에 실측 데이터를 쌓지 않고 독립 모듈에서만 입력·열람.
- **[협업 디자이너]**  
  프로젝트별 실측 도면·견적 버전 검색·열람, 시공 사례 이미지 자산 활용. **진입점:** 실측 관리(프로젝트별 실측 통합 검색·미리보기), 이미지 자산 뷰어, 견적 이력 팝업. 각 역할에 최적화된 **독립적 진입점(Module)**을 제공하여, 한 화면에 모든 정보를 넣지 않고 역할별로 분리된 경로를 보장한다.

## 6. 비즈니스 정책 (상담·이미지)

### AS 요청 관리
- **별도 배지 정책:** AS(After Service) 요청은 상담 단계와 독립적으로 관리한다. `metadata.as_requested`(Boolean), `metadata.as_reason`(선택) 저장.
- 리스트 카드 1행: AS 요청 시 업체명 옆에 빨간 **[AS 요청]** 배지 노출. [AS 관리] 버튼으로 요청/완료 토글. 모달 사용 시 AS 사유 한 줄만 입력 후 즉시 저장.

### 이미지 파일명 규칙
- **형식:** `[YYMMDD]_[업체명]_[공간]_[순번]` (예: `260206_목동학원_강의실_01`).
- 공백은 언더스코어로 치환, 한글 포함 가능(Cloudinary `public_id` UTF-8 지원). 시공 사진 업로드·Supabase `display_name`·Cloudinary `public_id` 동기화에 동일 규칙 적용.

### 알트 텍스트·외부 AI 연동 (base_alt_text)
- **Metadata 우선순위:** 이미지 자산 추출 시 시스템 확정 데이터를 최우선으로 한다. `base_alt_text`는 `{date}_{company}_{space}` 포맷으로 고정(순번 제거)하며, `display_name`에서 도출한다.
- **싱글 소스:** 파일명(display_name)과 알트 텍스트는 한 곳(display_name)에서만 수정하면 양쪽이 동기화되도록 유지한다. 외부 자동화(n8n, Python)는 JSON 응답의 `base_alt_text`를 그대로 사용한다.
- **AI 프로세스 가이드:** 사후에 AI가 알트 텍스트를 보강할 경우, 반드시 시스템이 제공한 `base_alt_text`를 접두어로 사용하도록 프롬프트 가이드를 데이터에 포함해 전송한다. (예: `260206_목동학원_강의실` → 보강 시 `260206_목동학원_강의실 전경`)

### 블로그 자동화와 Cloudinary
- **Named Transformation 사용 원칙:** 이미지 가공(리사이즈·압축 등)은 Cloudinary **Named Transformation**으로 정의하여 블로그·채널별로 재사용. 가변 한글 텍스트(워터마크 등)는 변형 이름이 아닌 별도 옵션으로 전달하는 구조를 유지.

## 7. 설계 문서 및 확정 원칙 (2026-02-07 반영)
- **BLUEPRINT.md**와 **JOURNAL.md**에 시스템 골조 및 비즈니스 로직이 확정되어 있음. **향후 생성되는 모든 컴포넌트·라우트·기능은 이 문서들의 원칙을 따라야 함.**
- **적용 대상 요약:** (1) 상담 카드 UI: 1행(마켓·실측·고객분류·업체명·AS·골든타임), 2행(지역|업종|전화|인입|필요|대표금액, **2행 우측 끝 고정** 구글챗 버튼·연결 상태별 초록/회색 분기), 3·4행. (2) 고객 등급: 동일 연락처 기반 등급 상향 평준화(한 번 단골은 모든 카드에서 단골). (3) AS: 신청 시 `status=AS_WAITING`, [AS 대기] 탭 필터, [종료] 탭에서 AS 대기 건 미노출. (4) 다중 견적: `metadata.estimate_history[]`, 대표 금액 = 확정 견적 → 최신 견적 → expected_revenue. (5) 실측: 상담 타임라인에서 실측 데이터 직접 렌더링 금지; [실측 자료(PDF)] 버튼 → 모달 → `/measurement/upload`. 실측 PDF·메모는 Supabase Storage `measurement-drawings` 전용, Signed URL만 미리보기. (6) 오픈마켓: source·order_number·is_market_order·마켓별 배지.
- 신규 개발 시 BLUEPRINT 섹션 2(UI/UX 인터랙션 표준) 및 3(비즈니스 로직)을 우선 참조할 것.

## 8. 성공의 기준 (Success Metrics)
- **효율성:** 기존 수동 견적 및 일정 관리 대비 업무 시간 50% 단축.
- **데이터화:** 모든 고객 문의가 100% 히스토리로 남고, 누락되는 가망 고객 제로화.
- **자동화:** 시공 사진 업로드 후 5분 이내에 블로그 및 SNS 포스팅 초안 생성 완료.

## 9. 현재 진행 상황 및 이슈 (최신)
- **현재 진행 상황:** 상담 관리 모듈(Phase 1) 고도화 완료. **시공 사례 뱅크**를 전용 페이지(PortfolioBank)로 분리 완료. 이미지 자산 관리(ImageAssetViewer)는 관리자 창고만 담당. 업체명 자동 식별자(display_name) 도입 성공. 견적 관리(예산 기획안·확정 견적서) 실무 전면 리팩토링 완료. PPT/PDF 발주서 시스템 중심 배치 및 제품별 시공 현장(`/products-sites`) 연동.
- **2026-02-08 반영:** (1) **역할·컴포넌트 분리:** `/image-assets` → **ImageAssetViewer** (관리자 전용). `/portfolio`, `/assets` → **PortfolioBank** (영업 전용). 두 컴포넌트 역할 혼동 금지. (2) **뱅크 전용:** `fetchApprovedProjectAssets()`·`rowToProjectAsset`(imageAssetService), 현장별/사진별 토글, 업종 필터, 카톡 공유 바, 라이트박스 앞뒤·이 현장 앨범 보기. (3) **검수 프로세스:** 업로드 시 content_hash 중복 차단, status(pending/approved), 뱅크는 approved만. (4) **공유:** `/public/share?ids=...`, ShareCart·공유 링크 복사·카카오 공유.
- **2026-02-08 완료 (JOURNAL 동기화):** (1) **20행 고정** — 견적서 테이블 20행 고정·패딩, PDF/미리보기 동일 적용. (2) **PDF/이미지 파일명** — `buildEstimateImageFilename`(견적서_YYYY-MM-DD_업체명.png), `buildEstimatePdfFilename`(견적서_업체명.pdf). (3) **상담 카드 금액** — 삭제 시 estimate_history·expected_revenue·final_amount 연동; 확정 시 final_amount·final_estimate_id·계약완료; 카드 3행은 **확정견적** 단일 표시(ReadOnly). (4) **4단계 뱃지** — 텍스트 고정 영역(상담접수·견적중·계약완료·시공완료) 항상 노출. (5) **PDF 모달** — 스크롤 80vh·sticky 상단바·[최종 확정] 버튼. (6) **상담 히스토리** — 시스템 메시지 왼쪽 정렬·수직 가이드라인. (7) **데이터 통합 관리** — `/admin/migration`, 테스트 모드·멀티 업로드·AI 파싱 Mock·검수 테이블·is_test·과거데이터·테스트 삭제.
- **2026-02-08 선수교체 요약 (상담·타임라인):** 상태 바 6버튼(상담접수~캔슬)·비활성 gray-400·활성만 단계별 색상, 상태 변경 시 setListTab으로 해당 탭 전환. 탭: 전체|미처리|진행중|AS대기|종료|**캔슬**(거절만). 인입채널 9종(채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타)·기본 채널톡·metadata.source. 카드 1행: 등급·업체명·골든·AS·확정견적; 2행: 골든배지(Hot/Active/Warning/진행중)·인입채널·지역·업종·전화·인입/요청일. 골든타임: dateUtils getElapsedDays/getGoldenTimeState, 31일+ 배지 제거·opacity-70, 완료·캔슬·AS 시 미노출. 6단계 프로그레스(접수|견적|계약|완료|AS|캔슬). 조회 기간 **이번달** 추가·기본값. **consultation_messages.is_visible** 마이그레이션; 관리자 시스템 메시지 영구 삭제(Trash2)·모든 메시지 숨기기(EyeOff)·관리자만 다시 보이기(Eye). admin: localStorage findgagu-role 또는 ?admin=1.
- **시공 뱅크 Lock-in:** (1) **통합 검색** `filterByUnifiedSearch`: 제품명(tags)·색상·현장명을 AND 조건으로 필터. (2) **역방향 견적**: 뱅크에서 제품 태그 클릭 → `location.state`(focusConsultationId, addEstimateProductName)로 상담 관리 진입 → 견적 모달 자동 오픈 및 품명 행 삽입. (3) **이미지 이원화 훅** `useDualSourceGallery`: Supabase 썸네일 + Cloudinary 고화질 분기 호출 확정.
- **Safety:** 페이지 이동 시 state 전달 방어(Optional Chaining, `state?.focusConsultationId`, `String(state.addEstimateProductName).trim()`). `?focus=` 처리 useEffect는 의존성 `[location.state, location.search]`만 사용하며, `lastLocationKeyRef`로 동일 진입 시 모달 중복 오픈·무한 루프 차단. AddEstimate 초기 데이터는 `Partial<EstimateFormData>` 및 EstimateRow 필수 필드 준수로 타입 무결성 유지.
- **이미지 이원화 강제:** 모든 시공 사진 업로드는 `uploadConstructionImageDual`로 Cloudinary(고화질) + Supabase(썸네일) 분기. env: `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET` 필수.
- **데이터 매칭·태그:** `productDataMatching.getDataByProductTag`(tag_mappings 1:N 반영), `tagMappingService.getCloudinaryTags`.
- **역산 로직 전역:** `roundToPriceUnit`, `getMarginSignalClass` 행·수익 분석기 전역 적용. 품명 표준 [품명](사이즈/색상), color·costEstimated·역산됨/(추정) 표시.
- **AI 견적 도우미 (Mock):** `estimateAiService.parseQuickCommand`, `estimateUtils` 금액·총액·역산.
- **채팅 UI:** Tailwind 기본 스타일 유지. **빌드:** `npm run build` 성공.
- **2026-02-09 반영:** (1) **상담 카드 숨기기(Soft Delete):** `consultations.is_visible` (boolean, default true). 상세 히스토리 탭에 관리자 전용 [이 상담 숨기기] → **앱 내 확인 Dialog**(취소/숨기기) 후 리스트·통계에서 제외. (2) **관리자 아카이브:** `/admin/archive`(ArchivePage), 숨긴 상담만 조회, [복구]/[영구 삭제], [TEST] 필터. (3) **useConsultations:** `src/hooks/useConsultations.ts` — visibleOnly true/false로 리스트 vs 아카이브 분리. (4) **데이터 무결성:** 상담 목록·통계·실측·제품별 시공·ConsultationChat 등 모든 select에 `is_visible = true` 필터 강제. (5) **마이그레이션:** 저장 시 created_at = 인입일(quoteDate) 소급, 검수 테이블 인입일(날짜) Date Picker, 저장 후 상담 관리 이동·골든타임 정확 반영. AI 파싱 API: `VITE_MIGRATION_PARSE_API` 환경변수로 연동. (6) **채널톡 FAQ 문법·AS 매칭:** `channelTalkService.ts` — FAQ_DATA 객체 키 중 특수문자(**A/S**)를 `'A/S'` 등 따옴표로 감싸 문법 에러 해결, 모든 키 따옴표 적용. "AS 문의드려요" 등 슬래시 없이 입력해도 A/S 답변이 나오도록 **'AS'** 키 추가(동일 답변). 시뮬레이터(`/admin/test-console`)에서 문의 입력 시 FAQ 매칭·3단계 자동 응답 검증 가능.

---

**비고 (Note)**  
이 컨텍스트 문서는 FINDGAGU-OS의 **최상위 헌법**으로 간주한다. AI가 새로운 기능을 제안하거나 UI를 설계할 때는 반드시 여기에 명시된 운영 원칙(정보 계층화, 데이터 무결성), 사용자 페르소나별 진입점, 그리고 BLUEPRINT·JOURNAL의 확정 원칙을 지켜야 한다.