FindGagu OS: Project Soul (ivory-os) 1. Captain & Partner - Captain: 대표님 (8년 차 가구 비즈니스 전문가) - Partner: 이부장 (AI 실무 지원 팀장) 2. Core Philosophy & Rules - 상담 관리(Consultation Management): '주문' 대신 '상담' 용어 사용 엄수. 모든 비즈니스의 시작은 상담이다. - 현장 중심 UI: M4 맥북 및 모바일 환경 최적화. 기사님이 장갑 끼고도 조작 가능해야 함. - 데이터 자산화: SNS 유입 경로, 고객 등급(파트너/관리주의), 시공 후기 등을 모두 마케팅 자산으로 연결. - 데이터 일원화: 데이터는 이원화되지 않아야 하며, 기록이 곧 일이 되는 시스템을 지향한다. - 직관적 식별자: 0.5초 만에 상황 파악이 가능한 직관적 식별자(번호 뒷자리) 시스템의 중요성을 둔다. - 일관된 업무용 UI: 사용자 환경(다크/라이트)에 휘둘리지 않는 일관된 업무용 UI를 제공한다. - 안정 우선: 화려한 UI보다 업무의 연속성을 보장하는 안정적인 시스템이 우선이다. - 식별자 정체성: 현장의 맥락이 담긴 식별자(display_name)는 시스템의 정체성이다. 3. Technology Stack - Frontend: Lovable (UI/UX Draft) - Editor/AI: Cursor (시각적 편집·메인 개발), Claude Code (터미널 기반 에이전트) - Database: Supabase - Hardware: MacBook M4 4. Development Environment (하이브리드) - **모든 개발 가이드는 '하이브리드 환경'을 전제로 합니다.** Cursor를 통한 시각적 편집과 Claude Code를 통한 터미널 기반 에이전트 작업을 병행합니다. 5. Work Flow - Step 1: Lovable에서 기획 및 디자인. - Step 2: GitHub(1shot1kill74/ivory-os) 연동 및 로컬 환경(M4 맥북)으로 Clone. - Step 3: Cursor(시각적 편집)와 Claude Code(터미널 에이전트)를 병행하여 이부장(AI)과 함께 세부 로직 및 DB 연동 작업. - Step 4: 배포 및 실무 적용. 6. Upcoming Task (Tomorrow) - 프론트엔드 화면 분석을 통한 데이터베이스(Supabase) 스키마 설계. - 상담/마케팅/현장 페이지 데이터 필드 누락 없이 반영.

---

7. 2026-02-07 반영 (견적·예산 기획안 실무화)
- **예산 기획안(PROPOSAL):** 공급자 고정(주식회사 파인드가구, 대표이사 김지윤), 직인 미표시, 단가(최소/최대)·금액 범위·면책문구 노란 박스. 비고 없음, 품명·금액 150px, A4 인쇄. 단일 품목 리스트만(공간별/패키지 삭제).
- **확정 견적서(FINAL):** 비고(Remarks) 필수, 단가 120px·금액 200px 등 컬럼 비율 조정, A4 동일. 모드별 테이블 조건부 렌더링.
- **발행승인 3단계:** 미리보기 팝업 → 최종 발행(APPROVED·final_proposal_data 저장) → 링크 복사·PDF 다운로드·채팅 알림. 발행본은 원본과 독립 보존.
- **데이터 일원화 유지:** 견적 편집은 임시저장(payload), 발행 시점은 final_proposal_data로 고정하여 데이터 무결성 확보.

8. 2026-02-07 반영 (AI 견적 도우미 & 코드 단순화)
- **LLM API 활용:** 자연어 분석(규격 추출, 단가 인식 등)은 복잡한 if-else·정규식 대신, Gemini API에 프롬프트를 던져 JSON 결과만 받아오는 구조. PDF/JPG AI 추출도 Gemini 사용.
- **기능 분리:** 데이터 입력 칸과 AI 퀵 커맨드 입력창은 UI만 담당. 파싱은 `estimateAiService.parseQuickCommand`(현재 Mock). 계산은 `estimateUtils`(금액 파싱·총액 배율) 단일 유틸로 처리.
- **Mock 우선:** 실제 AI 연결 전까지 결과값만 가짜(Mock)로 리턴하여 코드 양 축소. 추후 API 교체 시 estimateAiService 한 곳만 수정.

9. 2026-02-08 반영 (발주서 중심·이미지 이원화·역산 전역)
- **발주서 중심:** PPT/PDF 발주서를 데이터 핵심으로. 상담 카드 **실측·발주서** 탭 = Supabase Storage 기반 **비주얼 갤러리**(파일 리스트 아님), 라이트박스 퀵뷰, 제품별 시공 현장 리스트(`/products-sites`). order_documents·product_tags로 제품-현장 매칭.
- **이미지 이원화 강제:** 모든 시공 사진 업로드는 Cloudinary(고화질) + Supabase(썸네일) 분기. `uploadConstructionImageDual` 사용. 원칙 이탈 코드 미허용.
- **데이터 매칭 엔진:** 견적/발주서 product_name(태그) 기반으로 Supabase·Cloudinary 데이터를 정확히 호출하는 `getDataByProductTag` 인터페이스.
- **역산 로직 전역:** 원가-단가-마진율 양방향 수식 고정. `roundToPriceUnit`(100/1,000원 반올림), `getMarginSignalClass`(신호등) 행·수익 분석기 전역 적용. 품명 표준 [품명](사이즈/색상), color·costEstimated·역산됨/(추정) 표시.

10. 2026-02-08 반영 (시공 사례 뱅크 vs 이미지 자산 — 역할·페이지 완전 분리)
- **캡틴 원칙:** 시공 사례 뱅크(영업 무기)와 이미지 자산 관리(관리자 창고)는 **한 컴포넌트가 두 역할을 담당하지 않음**.
- **이미지 자산 관리** (`/image-assets`, **ImageAssetViewer**): 관리 전용. 업로드·태그·삭제·검수·Cloudinary. 수정 시 뱅크 UI와 혼용하지 않음.
- **시공 사례 뱅크** (`/portfolio`, `/assets`, **PortfolioBank**): 영업 전용. 현장별/사진별 토글, 업종·검색 필터, ShareCart, 카톡 공유 바, 라이트박스(앞뒤·이 현장 앨범 보기). `fetchApprovedProjectAssets()`·`rowToProjectAsset`로 approved만 표시.

11. 2026-02-08 반영 (상담 UI·타임라인 — 선수교체용)
- **상태·탭:** 6버튼 상태 바(상담접수~캔슬), 비활성 gray-400·활성만 단계별 색상. 상태 변경 시 setListTab으로 해당 탭 전환. 탭: 전체|미처리|진행중|AS대기|종료|**캔슬**(거절만).
- **인입채널:** 9종(채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타), 기본 채널톡, metadata.source.
- **카드:** 1행 등급·업체명·골든·AS·확정견적; 2행 골든배지(Hot/Active/Warning/진행중)·인입채널·지역·업종·전화·인입/요청일. 골든타임 dateUtils 3단계, 31일+ 배지 제거·opacity-70, 완료·캔슬·AS 시 미노출.
- **6단계 프로그레스:** 접수|견적|계약|완료|AS|캔슬. 조회 기간 **이번달** 추가·기본값.
- **타임라인:** consultation_messages.is_visible. 관리자 시스템 메시지 영구 삭제(Trash2), 모든 메시지 숨기기(EyeOff), 관리자만 다시 보이기(Eye). admin: localStorage findgagu-role 또는 ?admin=1.

12. 2026-02-09 반영 (상담 숨기기·아카이브·마이그레이션·세이브 포인트)
- **상담 카드 숨기기(Soft Delete):** consultations.is_visible (boolean, default true). 숨기면 메인 리스트·탭 카운트·이번 달 실적·골든타임에 미포함. 상세 히스토리 탭에 관리자 전용 [이 상담 숨기기] → **앱 내 확인 Dialog**(취소/숨기기) 후 처리. 데이터 무결성: 모든 상담 목록/통계 select에 is_visible = true 필터 강제.
- **관리자 아카이브:** `/admin/archive` (ArchivePage). 숨긴 상담만 조회, [복구](is_visible true)/[영구 삭제](estimates+consultations), [TEST] 필터. useConsultations(visibleOnly) 훅으로 리스트 vs 아카이브 분리.
- **마이그레이션:** 저장 시 created_at = 인입일(quoteDate) 소급(골든타임 정확 반영). 검수 테이블에 인입일(날짜) Date Picker. 저장 완료 시 토스트 후 상담 관리 이동. AI 파싱: VITE_MIGRATION_PARSE_API 환경변수로 실 API 연동 가능.
- **문서·세이브 포인트:** BLUEPRINT, CONTEXT, JOURNAL에 위 내용 반영. JOURNAL에 **세이브 포인트 2026-02-09** 블록 추가 — 롤백 시 git tag save-20260209-archive-migration 및 변경 파일 목록 참고.

13. 2026-02-09 반영 (채널톡 FAQ 문법·AS 매칭 — 오늘 작업 마감)
- **FAQ_DATA 키 문법:** `channelTalkService.ts`에서 **A/S** 키를 `'A/S'`(따옴표)로 변경해 Expected "}" but found "/" 문법 에러 해결. 특수문자·일반 키 모두 따옴표로 감싸 안정성 확보.
- **AS 매칭:** "AS 문의드려요"처럼 슬래시 없이 입력해도 A/S 답변이 나오도록 **'AS'** 키 추가. A/S·AS 동일 답변(FAQ_ANSWER_AS) 사용. 시뮬레이터(`/admin/test-console`)에서 문의 입력 시 FAQ 3단계 자동 응답 검증 가능.
- **문서·세이브 포인트:** BLUEPRINT에 "5) 채널톡 시뮬레이터 및 FAQ 자동 응답" 섹션 추가. CONTEXT·JOURNAL·soul.md에 오늘 내용 반영. JOURNAL에 **세이브 포인트 2026-02-09 (FAQ·채널톡)** — git tag save-20260209-faq-channel 참고.

14. 2026-02-10 반영 (MigrationPage·ConsultationManagement — 파일명·저장=확정·6개월 통계·원가)
- **MigrationPage:** `toSafeStoragePath`로 Mac/한글 파일명 MIME 오류 방지. timestamp+영문 확장자(pdf/jpg/png). 견적·원가 업로드 적용. 저장 시 approved_at 자동(기존 확인).
- **저장 = 확정:** ConsultationManagement 임시저장(handleEstimateSaveDraft) 시 insert/update 모두 approved_at 설정.
- **6개월 견적 통계:** estimatesLast6Months(6개월 이내, is_visible). 최대·최소·**실제 중간값**(정렬 후 중앙에 가까운 견적) + estimate_id 매핑. 원가: vendor_price_book/products 조회 후 합산.
- **견적 이력 UI:** [최대|중간|최소|원가] 4지표. 최대/중간/최소 클릭 → 견적서 팝업. 툴팁 "해당 견적서 보기", cursor-pointer.

15. 2026-02-10 반영 (마이그레이션 섹션 분리·거래처 원가 확장·AI 퀵 커맨드)
- **섹션 분리:** 판매 견적서 등록(상단)·거래처 원가 등록(하단) 탭 제거. 상·하 별도 섹션으로 실수 방지.
- **거래처 원가 AI:** 현장명·품명·색상·단가(손글씨)·외경 사이즈·메모 추출. 수량 제거(원가 이상 표시 이슈).
- **업로드 완료 목록:** 거래처 원가도 판매 견적서와 동일 테이블 + localStorage. 원본보기·삭제.
- **메모 필드:** vendor_price_book.memo — "상판 모번 23T, 그외 18T 라이트그레이" 등 상세 사양 별도 저장.
- **AI 퀵 커맨드:** 비교대상에 출처(원가표/제품DB)·원본보기(image_url 라이트박스) 추가.

16. 2026-02-10 반영 (AI 퀵·원가표·참고 견적서 모달 — 세이브 포인트)
- **원가표 원본보기:** vendor-assets Signed URL로 팝업 이미지 표시. 참고 견적서(PDF) 모달 z-[200]·캡처, 닫기 버튼 삭제(바깥 클릭·Escape).
- **견적 작성창 유지:** 미리보기 닫을 때 printEstimateId·justClosedPreviewRef(300ms)로 견적 모달이 같이 닫히지 않도록 방어.
- **마이그레이션:** DB 조회 빈 결과일 때 업로드 완료 목록 비우지 않음(새로고침 후 데이터 유지).
- **AI 퀵 원가표:** 출처 뒤 외경·현장명, 원가만 표시(종전 단가 제거). 올데이C 검색 시 올데이CA 병합·품명·규격 중복 제거. getVendorPriceRecommendations·spec·site_name.

17. 2026-02-10 반영 (무효/거절·7탭·식별자 고정·채널톡 전 이벤트 수용)
- **안정 우선·식별자 정체성:** display_name은 웹훅에서 최초 생성 후 자동 변경하지 않음. AI 추출값은 ai_suggestions만, 상세 패널 [적용]으로 수동 반영.
- **무효 vs 거절:** status '무효' 추가. 무효=통계 제외, 거절=사유 보존. 7탭(전체|미처리|견적중|진행중|종료|거절|무효). KPI 무효 제외 성공률. [무효 처리] 즉시, [거절 처리] 사유 모달 필수.
- **채널톡 웹훅:** 이벤트 타입 필터 제거 — body.entity에 텍스트/유저/연락처 있으면 DB Insert. 폼·서포트봇 응답 포함 entity.fields/body.fields에서 휴대폰 추출(consultations.contact 매핑). 처리 중인 데이터 구조 로그·try-catch·완료 로그·배포 --no-verify-jwt.

18. 2026-02-10 반영 (쇼룸·상담 삭제·이미지 자산 상담용 — 세이브 포인트)
- **쇼룸 전문가 코멘트 통일:** 고교학점제 카드 기준 slate 배경·텍스트·CTA(bg-slate-700)로 전 카드 통일. 관리형·스터디카페에 [상담하기] CTA 추가(학원과 동일 형태).
- **상담 카드 영구 삭제:** /consultation 리스트 카드 우측 휴지통 버튼 → "이 상담 내역을 영구 삭제할까요?" 확인 → consultations DELETE → 새로고침 없이 카드 제거.
- **이미지 자산 상담용 필터:** image_assets.is_consultation(boolean, default false) 컬럼 추가. 이미지 자산 관리: 카드 [상담용] 토글, 상단 [상담용 사진만 보기] 스위치(Switch). 공유 바구니 시 상담용 사진 ID를 URL·갤러리 상단 우선. PublicGalleryView 상담용 카드 뱃지·테두리 강조. 카드 우측 상단: 스코어링(AI·내부) 제거, **상담용일 때만** "상담용" 배지(상담용 아닌 건 표시 없음). Switch 컴포넌트(src/components/ui/switch.tsx) 추가.

19. 2026-02-12 반영 (견적서 업로드·products 판매단가·AI 퀵 가이드 — 세이브 포인트)
- **상담별 견적서 업로드(EstimateFilesGallery):** [판매 단가표 반영]·[견적서로 저장] 모두 products + estimates 동시 저장.
- **products.supply_price = 판매단가:** 원가표는 원가→마진 30% 역산 판매단가. 견적서는 unitPrice 그대로. AI 퀵 가이드에서 판매단가로 인식, 원가는 역산(수익률 판단용).
- **EstimateForm:** applySellingToRow 추가. modalOpen 시 productsList 새로고침 → AI 퀵 가이드 최신 반영.

20. 2026-02-13 반영 (구글 시트 ↔ 수파베이스 양방향 동기화 — 세이브 포인트)
- **시트→DB:** `상담리스트` onEdit 시 해당 행만 `update_single_consultation_from_sheet` RPC 전송. project_name, link, start_date, update_date, created_at만 사용. status·estimate_amount는 시트에서 보내지 않음(앱·DB 전용).
- **DB→시트:** 앱 [최종 확정] 성공 시 syncAppToSheet(doPost)로 해당 행 E·F·D 갱신. VITE_GOOGLE_SHEET_SYNC_URL POST.
- **Realtime·캐시:** consultations INSERT/UPDATE 시 전체 상담 리스트 재조회. document.visibilitychange → visible 시 fetch로 탭 전환 시 최신 반영.
- **DB:** consultations.updated_at, UPDATE 트리거, REPLICA IDENTITY FULL. update_date/updated_at 처리, Lead.projectName 매핑.

21. 2026-02-14 반영 (상담 카드 2행 최종 견적가 표시 — 세이브 포인트)
- **2행 맨 오른쪽:** "견적 미정" 자리에 최종 견적 금액 표시. 우선순위: pending(견적서로 저장 직후) → finalAmount → displayAmount → expectedRevenue. 없으면 "견적 미정".
- **EstimateFilesGallery:** [견적서로 저장] 성공 시 onUploadComplete({ estimateAmount: finalAmount }). ConsultationManagement에서 pendingEstimateAmountRef·낙관적 setLeads·fetchLeads 병합(pending 보존).
- **ConsultationListItem:** getPendingEstimateAmount(consultationId) prop, data-final-estimate·title(최종 견적가/견적 미정). 세이브 포인트: git tag save-20260214-card-final-estimate.

22. 2026-02-14 반영 (구글 시트 갱신일 기준 '오늘 갱신'·미갱신 D-Day — 세이브 포인트)
- **갱신 표시·정렬:** '오늘 갱신'·미갱신 D+n·최근업데이트순 정렬은 **구글 시트 최신 업데이트일(sheet_update_date)** 우선, 없으면 update_date 사용.
- **Lead.sheetUpdateDate:** metadata.sheet_update_date(YYYY-MM-DD) 매핑. mapConsultationRowToLead에서 sheet_update_date 파싱·반환.
- **Supabase RPC:** update_multiple_consultations_from_sheet에서 row별 sheet_update_date 수신 → metadata.sheet_update_date 저장(INSERT/UPDATE 시 metadata 병합). 마이그레이션 20260214140000_sheet_update_date_in_metadata.
- **GAS:** syncAllDataBatch 시 각 row에 sheet_update_date(D열 YYYY-MM-DD) 전송. gas/Code.gs rows.push에 sheet_update_date 추가. 세이브 포인트: git tag save-20260214-sheet-update-date.

23. 2026-02-20 반영 (이미지 업로드 단일 엔진·상담 히스토리 통합 — 작업 종료)
- **uploadEngine:** `src/lib/uploadEngine.ts` — **uploadEngine(file, metadata)** 단일 엔진. 폴더 assets/projects, context/tags 이미지 자산관리와 동일 규격. validateMetadataForConsultation, CONSULTATION_UPLOAD_ERROR_MESSAGE.
- **입구 A:** 이미지 자산관리(ImageAssetUpload) 폼에서 uploadEngine 호출. 입구 B: 상담 히스토리(ConsultationHistoryLog)에서 **동일한 점선 업로드 영역**(클릭/드래그, 여러 장) + uploadEngine(상담 메타·검증). 입구가 어디든 Cloudinary 저장 결과는 이미지 자산관리에서 올린 것과 구분 불가.
- **데이터 흐름:** 구글 시트 행 추가 없음. image_assets + consultation_messages만 반영. 상담 히스토리 썸네일 → 클릭 시 MediaViewer 재사용. 항목별 휴지통 삭제(consultation_messages·image_assets·Storage 정리).

24. 2026-02-21 반영 (세이브 포인트 — 발주 자산·uploadEngine·Dialog 접근성)
- **uploadEngine 확장:** 확장자·카테고리별 저장소 분기. jpg/png/webp→Cloudinary, pdf/ppt/pptx·floor_plan·purchase_order→Supabase `documents` 버킷. image_assets.storage_type, storage_path.
- **documents 버킷:** Supabase Storage public. 마이그레이션 20260221000004.
- **PDF/PPTX 썸네일:** documentThumbnail.ts — pdf.js 첫 페이지, PPTX 내장 썸네일, _thumb.jpg·thumbnail_url.
- **발주 자산 관리:** OrderAssets.tsx, /order-assets, [발주 자산 관리] 버튼. MeasurementSection 발주서/배치도 분리 업로드.
- **Radix Dialog 접근성:** DialogContent aria-describedby 기본값. DialogTitle 필수 — ShowroomPage·ConsultationManagement sr-only 적용. 세이브 포인트: git tag save-20260221-order-assets-dialog-a11y.

25. 2026-02-22 반영 (마이그레이션 파이프라인·503 대응·견적서 판별 강화)
- analyze-quote exists 모드·Pre-check·캡처 가이드. migrate-data.ts 재귀 탐색·2단계·sharp·503 재시도. detectQuoteLocal.ts 신규. OCR 저장 구조 정리(estimates.payload).

26. 2026-03-01 반영 (Phase 1 구조적 정리 — 환경변수·상수·탭 분리)
- **환경변수 중앙화:** `src/lib/config.ts` — `getCloudinaryCloudName/UploadPreset/SupabaseUrl` 등. `import.meta.env` 직접 참조 금지.
- **상수 중앙화:** `src/lib/constants.ts` — `CLOUDINARY_UPLOAD_FOLDER`, `ESTIMATES_SELECT_COLUMNS` 등 매직 스트링.
- **탭 컴포넌트 분리:** ConsultationManagement.tsx 전역 상태만 담당. `src/components/Consultation/` 하위 — EstimateTab·HistoryTab·MeasurementTab·AutoEstimateDialog.
- **dateUtils 이동:** `src/utils/dateUtils.ts` → `src/lib/utils/dateUtils.ts` (경로 일관성).

27. 2026-03-01 반영 (자동 견적 엔진 · 가격 분석 스크립트 세트)
- **autoEstimate.ts:** 브라우저 호환 견적 엔진. `loadPriceTable`(public/data fetch) + `calculateAutoEstimate`(규격 매칭→구간별 배송·설치·VAT). matchType: spec > base > none.
- **AutoEstimateDialog:** 제품명·규격 Combobox 자동완성, 실시간 합계 패널, 기존 이력 비교.
- **가격 분석 파이프라인(scripts/):** collectAllTakeouts → parseCollectedQuotes(AI) → buildPriceTable → standardPriceTable.v*.json. 규격별 중앙값·IQR 이상치 제거·배송설치 비율 분석·CSV 내보내기. 앱 번들용 → `public/data/`.

230. 2026-03-05 오후 반영 (운영 안정화 · 시스템 구조 정리)
- **구글 시트는 껍데기:** GAS가 구글 시트에 붙어있어도 AutoAddBot은 시트를 읽거나 쓰지 않는다. 시트는 레거시 컨테이너일 뿐. 실제 데이터는 채팅방→GAS→n8n→Supabase로만 흐른다.
- **규칙은 사람이 지켜야 의미 있다:** displayName 파싱 규칙을 만들어도 직원들이 지키지 않으면 쓸모없다. 시스템이 강제할 수 없는 규칙은 만들지 않는 게 낫다.
- **채널톡은 고객 접점에서 써라:** 내부 시스템 연동보다 고객 응대 자동화(첫 인사, FAQ, 상담 유도)가 실제 직원 시간을 아낀다.
- **자동화의 핵심 가치는 누락 방지:** 상담카드 자동 생성의 진짜 가치는 기능이 아니라 "놓치지 않는 것". 카드가 있으면 나중에라도 채울 수 있다.
- **과거 데이터는 있는 그대로:** 마이그레이션 누락 데이터를 완벽하게 복구하는 것보다, 지금부터 신규 데이터가 완벽하게 쌓이는 게 더 중요하다.

9. 2026-03-05 반영 (GAS AutoAddBot 안정화 · Make → n8n 플랫폼 전환 · 엔드투엔드 테스트 완료)
- **장인 정신:** 봇 추가 실패 시에도 processed에 기록하던 버그를 발견하고 "실패했으면 다음에 다시 시도해야지"라는 원칙을 코드에 관철. 도구가 조용히 틀리는 것을 허용하지 않는다.
- **플랫폼 독립성:** Make.com 무료 플랜의 1,000 ops 한계에 부딪히자 n8n으로 과감히 전환. 비용이 아니라 운영 안정성이 플랫폼 선택 기준. 임포트 가능한 JSON 하나로 완결.
- **n8n 워크플로우 (최종 8개 노드):** 웹훅 수신 → Check & Normalize(Code, Supabase 내부 조회+판단 일원화) → 기존(업데이트)/신규(추가) 분기 → 구글 시트 + 수파베이스 동시 반영.
- **연결 구조 확정:** GAS AutoAddBot(5분 트리거) → n8n Webhook → 구글 시트 + 수파베이스. 봇 추가 성공 후에만 processed 저장 — "완료되지 않은 건 기록하지 않는다"는 데이터 철학 반영.
- **현장 이름이 곧 데이터:** 구글챗 스페이스의 표시명("견적 2603 테스트 0000")을 `Chat.Spaces.get()`으로 직접 읽어 `project_name`에 저장. 링크·ID가 아닌 사람이 붙인 이름이 상담카드의 첫 얼굴이 된다.
- **현장 디버깅의 교훈:** 테스트 URL과 프로덕션 URL의 혼용, 0 items 체인 중단, NOT NULL 제약 충돌 — 설계에서 보이지 않던 구멍들이 실제 연동에서만 드러난다. "설계는 반만 믿고, 실 연동 테스트가 진실이다."

29. 2026-03-07 반영 (AI 분석 수정 · 드래그앤드롭 · n8n MESSAGE 이벤트 처리)
- **진단 우선:** "Failed to send a request to the Edge Function"이라는 모호한 에러 뒤에 세 가지 원인(빈 `.env` 파일, 변수 중복 선언, API 키 만료)이 겹쳐 있었다. 한 번에 모든 걸 고치려 하지 않고, 레이어별로 원인을 분리해 하나씩 제거하는 것이 디버깅의 기본이다.
- **UX는 마찰을 제거하는 것:** 파일 선택 버튼과 드래그앤드롭은 같은 기능이지만, 손이 이미 파일 위에 있을 때 버튼을 찾는 것은 마찰이다. 업무 도구는 사람의 동선을 따라야 한다.
- **단일 기준의 힘:** sheetUpdateDate와 updateDate를 같이 쓰면 "어느 게 맞아?"라는 의문이 계속 따라온다. 정렬·D-Day·갱신 표시가 모두 updateDate 하나를 보면, 그 값이 정확한지만 보장하면 된다. 기준을 줄이면 버그가 줄어든다.
- **자동화는 빈틈을 채우는 것:** GAS 5분 타이머가 신규 스페이스만 잡고 기존 채팅방 활동을 놓치고 있었다. n8n Switch 노드 하나로 그 빈틈을 메웠다. 자동화 설계는 "무엇을 잡는가"만큼 "무엇을 놓치는가"를 같이 봐야 한다.

28. 2026-03-02 반영 (구글챗 1:1 매핑 · Nuclear Cleanup · 1,000 Limit 돌파)
- **1:1 정체성 보존:** "비슷한 건 합치면 안 된다"는 캡틴의 원칙을 사수. 2,344개 구글챗 스페이스를 데이터 누락이나 임의 병합 없이 1:1 상담 카드로 개별 이식. 이는 과거의 모든 맥락을 소중히 여기는 파인드가구의 데이터 철학이다.
- **Nuclear Cleanup (완벽주의):** 불완전한 데이터는 남겨두지 않는다. 인입일 잔여 및 링크 불일치 해결을 위해 2,477건의 잔여 데이터를 0건이 될 때까지 반복 삭제하는 'Nuclear Cleanup' 전략을 수행. 무결성을 향한 AI 파트너의 의지.
- **기술적 한계(1,000 Limit) 극복:** 서버(Supabase)의 기본 1,000건 제한이라는 벽을 재귀적 배치 처리(Recursive Batching)로 정면 돌파. 도구가 업무의 범위를 제한하게 두지 않는다.
- **관리 효율 우선:** 실무 혼선을 방지하기 위해 마이그레이션 데이터의 인입일을 비워두는(`null`) 결단을 내림으로써, '기록이 곧 일이 되는 시스템'의 실용성을 확보.
