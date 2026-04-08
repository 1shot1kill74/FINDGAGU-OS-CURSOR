# 프로젝트 저널 아카이브 — 2026 Q1

> 루트 `JOURNAL.md`에서 분리한 과거 로그 아카이브입니다.  
> 이 문서는 2026-02-05부터 2026-03-10까지의 결정과 세이브 포인트를 보존합니다.

---

## 2026-03-10 까지의 핵심 흐름

### 2026-03-10 — Takeout 기반 견적 이미지 브라우저 1차 정리

- Google Chat 실시간 첨부파일 수집보다 `Google Takeout 기반` 흐름을 먼저 운영 기준으로 삼았습니다.
- OCR 자동 선별보다 `스페이스별 전체 이미지 수동 선택`이 더 안정적이라는 판단을 내렸습니다.
- 같은 스페이스를 여러 프로젝트가 재사용한 레거시 상황 때문에, 스페이스 클릭 시 강제 카드 이동보다 `displayName을 메인 검색창에 주입`하는 방식을 채택했습니다.
- 원본은 대표님 PC의 Takeout 폴더에 남기고, 앱 프로젝트 안에서는 로컬 백업 캐시와 공개용 인덱스를 분리해 관리합니다.

### 2026-03-08 — AutoAddBot.gs 복구 · 연락처 파싱 드라이런

- `gas/AutoAddBot.gs`가 실수로 삭제됐으나 VSCode 로컬 히스토리로 최신본을 복구했습니다.
- `dryRunContactScan()` 실행 결과, 실행자 소속 스페이스 기준으로 연락처/지역 파싱 가능성을 확인했습니다.
- 남은 과제는 `CONTACT_SCAN_SHEET_ID` 검증과 `applyContactScanFromSheet()` 실행입니다.

### 2026-03-07 — 견적서 AI 분석 수정 · 드래그앤드롭 · n8n MESSAGE 이벤트 처리

- `analyze-quote`를 `gemini-3.1-flash-lite-preview` 기준으로 정리했습니다.
- `EstimateFilesGallery`에 드래그앤드롭 업로드를 붙였습니다.
- `ConsultationManagement`는 `sheetUpdateDate`를 제거하고 `updateDate` 단일 기준으로 정리했습니다.
- `n8n` 워크플로우에 MESSAGE 이벤트 분기를 추가해, Google Chat interaction event 기준 `update_date` 갱신 경로를 보강했습니다.

### 2026-03-05 오후 — n8n 운영 안정화 · 시스템 구조 정리

- 채팅방 생성 -> GAS AutoAddBot -> n8n -> Supabase 직접 저장의 `3세대 구조`를 확정했습니다.
- `displayName` 파싱은 직원 입력 안정성이 낮아 포기했고, 그대로 `project_name`으로 저장하는 방향을 택했습니다.
- 구글 시트는 더 이상 메인 데이터 흐름이 아닌 `레거시`로 봤습니다.

### 2026-03-05 — GAS AutoAddBot 안정화 · Make -> n8n 전환

- OAuth 스코프, createTime 필터, processed 저장 시점, Invalid Date 가드 버그를 정리했습니다.
- `channel_chat_id` 컬럼을 추가하고, n8n 워크플로우를 `Webhook -> Normalize -> 기존/신규 분기` 구조로 안정화했습니다.
- Make 무료 플랜 한계를 넘기 위해 n8n으로 완전히 전환했습니다.

### 2026-03-02 — 구글챗 전수 마이그레이션 v5

- `user_info.json` 기반 2,344개 스페이스를 상담카드와 1:1로 이식했습니다.
- Supabase/PostgREST의 1,000건 제한을 우회하기 위해 `range()` 배치 루프와 반복 삭제(Nuclear Cleanup) 패턴을 정립했습니다.

### 2026-03-01 — Phase 1 구조적 정리

- 환경변수는 `src/lib/config.ts`, 상수는 `src/lib/constants.ts`로 중앙화했습니다.
- `ConsultationManagement`의 탭 콘텐츠를 `src/components/Consultation/` 하위 컴포넌트로 분리했습니다.
- 자동 견적 엔진과 가격 분석 스크립트 파이프라인을 만들었습니다.

---

## 2026-02 기록 요약

### 2026-02-22 — 마이그레이션 파이프라인 · analyze-quote 강화

- `migrate-data.ts`에 exists -> full 2단계 플로우, 503 재시도, 주소 오탐 방지 로직을 넣었습니다.
- `analyze-quote`는 exists 모드와 Pre-check 규칙을 추가해 비용과 오류를 줄이는 방향으로 손봤습니다.

### 2026-02-21 — 발주 자산 · uploadEngine · Dialog 접근성

- `uploadEngine`으로 이미지와 문서를 저장소별로 분기하는 원칙을 세웠습니다.
- `OrderAssets.tsx`로 발주서/배치도 전용 관리 모듈을 만들었습니다.
- Radix Dialog 접근성 경고를 줄이기 위한 규칙을 정리했습니다.

### 2026-02-20 — 이미지 업로드 단일 엔진 · 상담 히스토리 통합

- 이미지 자산관리와 상담 히스토리 업로드를 같은 `uploadEngine`으로 통합했습니다.
- 상담 히스토리 업로드는 구글 시트가 아니라 `image_assets + consultation_messages`만 갱신하는 구조로 확정했습니다.

### 2026-02-14 ~ 2026-02-13 — 구글 시트 동기화 기준 정리

- 시트와 DB 양방향 동기화 구조를 만들고, `sheet_update_date` 개념을 도입했습니다.
- 앱 쪽 최종 견적가 노출과 시트 반영 우선순위를 정리했습니다.

### 2026-02-12 — 견적서 업로드 이중 저장 · products 판매단가

- 견적서 저장과 판매 단가표 반영 시 `products + estimates`를 함께 저장하는 구조를 확정했습니다.
- `products.supply_price`는 판매단가 기준으로 본다는 원칙을 굳혔습니다.

### 2026-02-10 — 무효/거절 분리 · AI 퀵 커맨드 · 채널톡 웹훅

- 무효와 거절을 분리해 KPI 분모 왜곡을 막는 방향을 잡았습니다.
- 상담 식별자 `display_name`은 최초 생성 후 자동으로 덮어쓰지 않는다는 원칙을 세웠습니다.
- 채널톡 웹훅은 이벤트 타입보다 실제 payload에서 연락처/텍스트를 뽑는 방향으로 보강했습니다.

### 2026-02-09 — 상담 숨기기 · 아카이브 · FAQ

- `consultations.is_visible` 기반 soft delete와 `/admin/archive` 복구 흐름을 정리했습니다.
- 채널톡 FAQ의 문법 오류와 `A/S`, `AS` 키 처리 문제를 해결했습니다.

### 2026-02-08 ~ 2026-02-07 — 골조 확정

- 상담 카드 UI, 이미지 자산 관리와 시공 사례 뱅크 분리, 공개 공유 시스템, 20행 견적 규격, 예산 기획안/확정 견적서 분리 등 1단계 골조를 확정했습니다.
- 실측 데이터는 상담 타임라인과 분리된 독립 모듈로 보게 했습니다.

### 2026-02-06 ~ 2024-02-05 — 초기 컨셉

- 골든타임, Wake-up, 현장기사 권한 분리, 용어를 `주문`에서 `상담`으로 전환하는 기본 컨셉을 세웠습니다.
- GitHub 이관과 M4 로컬 개발 환경 셋업을 마쳤습니다.

---

## 세이브 포인트 인덱스

| 태그 | 내용 |
|------|------|
| `save-20260305` | GAS AutoAddBot + n8n 엔드투엔드 완료 |
| `save-20260222-analyze-quote-edge` | analyze-quote Edge Function, parseFileWithAI invoke 전환 |
| `save-20260221-order-assets-dialog-a11y` | 발주 자산, uploadEngine 확장, Dialog 접근성 |
| `save-20260214-sheet-update-date` | 구글 시트 갱신일 기준 정리 |
| `save-20260214-card-final-estimate` | 상담 카드 최종 견적가 표시 |
| `save-20260213-google-sheet-sync` | 구글 시트와 수파베이스 양방향 동기화 |
| `save-20260212-estimate-upload-products-selling-price` | 견적서 이중 저장, products 판매단가 기준 |
| `save-20260210-ai-quick-estimate-modal` | AI 퀵 원가표, 참고 견적서 모달 UX |
| `save-20260210-showroom-consultation-image` | 쇼룸 통일, 상담 삭제, 이미지 상담용 분리 |
| `save-20260209-faq-channel` | 상담 숨기기, 아카이브, FAQ 정리 |

## 관련 문서

- 현재 기준 저널: `JOURNAL.md`
- 현재 운영 원칙: `CONTEXT.md`
- 현재 구현 기준: `BLUEPRINT.md`
