FindGagu OS: Project Soul (ivory-os) 1. Captain & Partner - Captain: 대표님 (8년 차 가구 비즈니스 전문가) - Partner: 이부장 (AI 실무 지원 팀장) 2. Core Philosophy & Rules - 상담 관리(Consultation Management): '주문' 대신 '상담' 용어 사용 엄수. 모든 비즈니스의 시작은 상담이다. - 현장 중심 UI: M4 맥북 및 모바일 환경 최적화. 기사님이 장갑 끼고도 조작 가능해야 함. - 데이터 자산화: SNS 유입 경로, 고객 등급(파트너/관리주의), 시공 후기 등을 모두 마케팅 자산으로 연결. - 데이터 일원화: 데이터는 이원화되지 않아야 하며, 기록이 곧 일이 되는 시스템을 지향한다. - 직관적 식별자: 0.5초 만에 상황 파악이 가능한 직관적 식별자(번호 뒷자리) 시스템의 중요성을 둔다. - 일관된 업무용 UI: 사용자 환경(다크/라이트)에 휘둘리지 않는 일관된 업무용 UI를 제공한다. - 안정 우선: 화려한 UI보다 업무의 연속성을 보장하는 안정적인 시스템이 우선이다. - 식별자 정체성: 현장의 맥락이 담긴 식별자(display_name)는 시스템의 정체성이다. 3. Technology Stack - Frontend: Lovable (UI/UX Draft) - Editor/AI: Cursor (Main Development) - Database: Supabase - Hardware: MacBook M4 4. Work Flow - Step 1: Lovable에서 기획 및 디자인. - Step 2: GitHub(1shot1kill74/ivory-os) 연동 및 로컬 환경(M4 맥북)으로 Clone. - Step 3: Cursor에서 이부장(AI)과 함께 세부 로직 및 DB 연동 작업. - Step 4: 배포 및 실무 적용. 5. Upcoming Task (Tomorrow) - 프론트엔드 화면 분석을 통한 데이터베이스(Supabase) 스키마 설계. - 상담/마케팅/현장 페이지 데이터 필드 누락 없이 반영.

---

6. 2026-02-07 반영 (견적·예산 기획안 실무화)
- **예산 기획안(PROPOSAL):** 공급자 고정(주식회사 파인드가구, 대표이사 김지윤), 직인 미표시, 단가(최소/최대)·금액 범위·면책문구 노란 박스. 비고 없음, 품명·금액 150px, A4 인쇄. 단일 품목 리스트만(공간별/패키지 삭제).
- **확정 견적서(FINAL):** 비고(Remarks) 필수, 단가 120px·금액 200px 등 컬럼 비율 조정, A4 동일. 모드별 테이블 조건부 렌더링.
- **발행승인 3단계:** 미리보기 팝업 → 최종 발행(APPROVED·final_proposal_data 저장) → 링크 복사·PDF 다운로드·채팅 알림. 발행본은 원본과 독립 보존.
- **데이터 일원화 유지:** 견적 편집은 임시저장(payload), 발행 시점은 final_proposal_data로 고정하여 데이터 무결성 확보.

7. 2026-02-07 반영 (AI 견적 도우미 & 코드 단순화)
- **LLM API 활용:** 자연어 분석(규격 추출, 단가 인식 등)은 복잡한 if-else·정규식 대신, Gemini API에 프롬프트를 던져 JSON 결과만 받아오는 구조. PDF/JPG AI 추출도 Gemini 사용.
- **기능 분리:** 데이터 입력 칸과 AI 퀵 커맨드 입력창은 UI만 담당. 파싱은 `estimateAiService.parseQuickCommand`(현재 Mock). 계산은 `estimateUtils`(금액 파싱·총액 배율) 단일 유틸로 처리.
- **Mock 우선:** 실제 AI 연결 전까지 결과값만 가짜(Mock)로 리턴하여 코드 양 축소. 추후 API 교체 시 estimateAiService 한 곳만 수정.

8. 2026-02-08 반영 (발주서 중심·이미지 이원화·역산 전역)
- **발주서 중심:** PPT/PDF 발주서를 데이터 핵심으로. 상담 카드 **실측·발주서** 탭 = Supabase Storage 기반 **비주얼 갤러리**(파일 리스트 아님), 라이트박스 퀵뷰, 제품별 시공 현장 리스트(`/products-sites`). order_documents·product_tags로 제품-현장 매칭.
- **이미지 이원화 강제:** 모든 시공 사진 업로드는 Cloudinary(고화질) + Supabase(썸네일) 분기. `uploadConstructionImageDual` 사용. 원칙 이탈 코드 미허용.
- **데이터 매칭 엔진:** 견적/발주서 product_name(태그) 기반으로 Supabase·Cloudinary 데이터를 정확히 호출하는 `getDataByProductTag` 인터페이스.
- **역산 로직 전역:** 원가-단가-마진율 양방향 수식 고정. `roundToPriceUnit`(100/1,000원 반올림), `getMarginSignalClass`(신호등) 행·수익 분석기 전역 적용. 품명 표준 [품명](사이즈/색상), color·costEstimated·역산됨/(추정) 표시.

9. 2026-02-08 반영 (시공 사례 뱅크 vs 이미지 자산 — 역할·페이지 완전 분리)
- **캡틴 원칙:** 시공 사례 뱅크(영업 무기)와 이미지 자산 관리(관리자 창고)는 **한 컴포넌트가 두 역할을 담당하지 않음**.
- **이미지 자산 관리** (`/image-assets`, **ImageAssetViewer**): 관리 전용. 업로드·태그·삭제·검수·Cloudinary. 수정 시 뱅크 UI와 혼용하지 않음.
- **시공 사례 뱅크** (`/portfolio`, `/assets`, **PortfolioBank**): 영업 전용. 현장별/사진별 토글, 업종·검색 필터, ShareCart, 카톡 공유 바, 라이트박스(앞뒤·이 현장 앨범 보기). `fetchApprovedProjectAssets()`·`rowToProjectAsset`로 approved만 표시.

10. 2026-02-08 반영 (상담 UI·타임라인 — 선수교체용)
- **상태·탭:** 6버튼 상태 바(상담접수~캔슬), 비활성 gray-400·활성만 단계별 색상. 상태 변경 시 setListTab으로 해당 탭 전환. 탭: 전체|미처리|진행중|AS대기|종료|**캔슬**(거절만).
- **인입채널:** 9종(채널톡·전화·소개·네이버·쿠팡·유튜브·블로그·SNS·기타), 기본 채널톡, metadata.source.
- **카드:** 1행 등급·업체명·골든·AS·확정견적; 2행 골든배지(Hot/Active/Warning/진행중)·인입채널·지역·업종·전화·인입/요청일. 골든타임 dateUtils 3단계, 31일+ 배지 제거·opacity-70, 완료·캔슬·AS 시 미노출.
- **6단계 프로그레스:** 접수|견적|계약|완료|AS|캔슬. 조회 기간 **이번달** 추가·기본값.
- **타임라인:** consultation_messages.is_visible. 관리자 시스템 메시지 영구 삭제(Trash2), 모든 메시지 숨기기(EyeOff), 관리자만 다시 보이기(Eye). admin: localStorage findgagu-role 또는 ?admin=1.

11. 2026-02-09 반영 (상담 숨기기·아카이브·마이그레이션·세이브 포인트)
- **상담 카드 숨기기(Soft Delete):** consultations.is_visible (boolean, default true). 숨기면 메인 리스트·탭 카운트·이번 달 실적·골든타임에 미포함. 상세 히스토리 탭에 관리자 전용 [이 상담 숨기기] → **앱 내 확인 Dialog**(취소/숨기기) 후 처리. 데이터 무결성: 모든 상담 목록/통계 select에 is_visible = true 필터 강제.
- **관리자 아카이브:** `/admin/archive` (ArchivePage). 숨긴 상담만 조회, [복구](is_visible true)/[영구 삭제](estimates+consultations), [TEST] 필터. useConsultations(visibleOnly) 훅으로 리스트 vs 아카이브 분리.
- **마이그레이션:** 저장 시 created_at = 인입일(quoteDate) 소급(골든타임 정확 반영). 검수 테이블에 인입일(날짜) Date Picker. 저장 완료 시 토스트 후 상담 관리 이동. AI 파싱: VITE_MIGRATION_PARSE_API 환경변수로 실 API 연동 가능.
- **문서·세이브 포인트:** BLUEPRINT, CONTEXT, JOURNAL에 위 내용 반영. JOURNAL에 **세이브 포인트 2026-02-09** 블록 추가 — 롤백 시 git tag save-20260209-archive-migration 및 변경 파일 목록 참고.

12. 2026-02-09 반영 (채널톡 FAQ 문법·AS 매칭 — 오늘 작업 마감)
- **FAQ_DATA 키 문법:** `channelTalkService.ts`에서 **A/S** 키를 `'A/S'`(따옴표)로 변경해 Expected "}" but found "/" 문법 에러 해결. 특수문자·일반 키 모두 따옴표로 감싸 안정성 확보.
- **AS 매칭:** "AS 문의드려요"처럼 슬래시 없이 입력해도 A/S 답변이 나오도록 **'AS'** 키 추가. A/S·AS 동일 답변(FAQ_ANSWER_AS) 사용. 시뮬레이터(`/admin/test-console`)에서 문의 입력 시 FAQ 3단계 자동 응답 검증 가능.
- **문서·세이브 포인트:** BLUEPRINT에 "5) 채널톡 시뮬레이터 및 FAQ 자동 응답" 섹션 추가. CONTEXT·JOURNAL·soul.md에 오늘 내용 반영. JOURNAL에 **세이브 포인트 2026-02-09 (FAQ·채널톡)** — git tag save-20260209-faq-channel 참고.

13. 2026-02-10 반영 (MigrationPage·ConsultationManagement — 파일명·저장=확정·6개월 통계·원가)
- **MigrationPage:** `toSafeStoragePath`로 Mac/한글 파일명 MIME 오류 방지. timestamp+영문 확장자(pdf/jpg/png). 견적·원가 업로드 적용. 저장 시 approved_at 자동(기존 확인).
- **저장 = 확정:** ConsultationManagement 임시저장(handleEstimateSaveDraft) 시 insert/update 모두 approved_at 설정.
- **6개월 견적 통계:** estimatesLast6Months(6개월 이내, is_visible). 최대·최소·**실제 중간값**(정렬 후 중앙에 가까운 견적) + estimate_id 매핑. 원가: vendor_price_book/products 조회 후 합산.
- **견적 이력 UI:** [최대|중간|최소|원가] 4지표. 최대/중간/최소 클릭 → 견적서 팝업. 툴팁 "해당 견적서 보기", cursor-pointer.

14. 2026-02-10 반영 (마이그레이션 섹션 분리·거래처 원가 확장·AI 퀵 커맨드)
- **섹션 분리:** 판매 견적서 등록(상단)·거래처 원가 등록(하단) 탭 제거. 상·하 별도 섹션으로 실수 방지.
- **거래처 원가 AI:** 현장명·품명·색상·단가(손글씨)·외경 사이즈·메모 추출. 수량 제거(원가 이상 표시 이슈).
- **업로드 완료 목록:** 거래처 원가도 판매 견적서와 동일 테이블 + localStorage. 원본보기·삭제.
- **메모 필드:** vendor_price_book.memo — "상판 모번 23T, 그외 18T 라이트그레이" 등 상세 사양 별도 저장.
- **AI 퀵 커맨드:** 비교대상에 출처(원가표/제품DB)·원본보기(image_url 라이트박스) 추가.

15. 2026-02-10 반영 (AI 퀵·원가표·참고 견적서 모달 — 세이브 포인트)
- **원가표 원본보기:** vendor-assets Signed URL로 팝업 이미지 표시. 참고 견적서(PDF) 모달 z-[200]·캡처, 닫기 버튼 삭제(바깥 클릭·Escape).
- **견적 작성창 유지:** 미리보기 닫을 때 printEstimateId·justClosedPreviewRef(300ms)로 견적 모달이 같이 닫히지 않도록 방어.
- **마이그레이션:** DB 조회 빈 결과일 때 업로드 완료 목록 비우지 않음(새로고침 후 데이터 유지).
- **AI 퀵 원가표:** 출처 뒤 외경·현장명, 원가만 표시(종전 단가 제거). 올데이C 검색 시 올데이CA 병합·품명·규격 중복 제거. getVendorPriceRecommendations·spec·site_name.

16. 2026-02-10 반영 (무효/거절·7탭·식별자 고정·채널톡 전 이벤트 수용)
- **안정 우선·식별자 정체성:** display_name은 웹훅에서 최초 생성 후 자동 변경하지 않음. AI 추출값은 ai_suggestions만, 상세 패널 [적용]으로 수동 반영.
- **무효 vs 거절:** status '무효' 추가. 무효=통계 제외, 거절=사유 보존. 7탭(전체|미처리|견적중|진행중|종료|거절|무효). KPI 무효 제외 성공률. [무효 처리] 즉시, [거절 처리] 사유 모달 필수.
- **채널톡 웹훅:** 이벤트 타입 필터 제거 — body.entity에 텍스트/유저/연락처 있으면 DB Insert. 폼·서포트봇 응답 포함 entity.fields/body.fields에서 휴대폰 추출(consultations.contact 매핑). 처리 중인 데이터 구조 로그·try-catch·완료 로그·배포 --no-verify-jwt.