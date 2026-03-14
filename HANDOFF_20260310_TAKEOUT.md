# Handoff: Takeout 이미지 브라우저 작업 상태

## 목적
- Google Chat 과거 이미지(현재는 **Google Takeout 기반만**)를 상담카드의 `견적 관리` 탭에서 쉽게 찾아보고,
- 사람이 직접 골라서 `견적 검토` 흐름으로 넘기게 만드는 것이 1차 목표였다.

## 현재 확정된 방향
- **OCR 자동 선별 중심 아님**
  - 대표님 판단: 사람이 전체 이미지를 훑는 방식이 더 빠르고 안전함
  - 따라서 기본 UX는 `스페이스별 이미지 모아보기 -> 크게 보기 -> 견적 검토로 가져오기`
- **카드 강제 이동보다 검색창 자동 입력**
  - 같은 스페이스를 여러 프로젝트가 재사용한 레거시 상황 때문에, 스페이스 클릭으로 카드 강제 이동하는 방식은 신뢰도가 낮음
  - 현재 채택한 방식은 `스페이스 제목 클릭 -> displayName을 메인 검색창에 자동 입력 -> 사용자가 결과 카드 클릭`

## 현재 구현 상태

### 1. 견적 관리 탭에서 Takeout 이미지 열기
- 위치: 상담카드 우측 패널 -> `견적 관리`
- 버튼: `테이크아웃 이미지 가져오기`

관련 파일:
- `src/components/Consultation/ConsultationEstimateTab.tsx`
- `src/components/estimate/TakeoutQuoteInboxDialog.tsx`

### 2. 이미지 표시 방식
- 기본: 현재 상담카드와 연결된 스페이스 이미지 우선 표시
- 버튼: `전체 스페이스 보기`로 다른 스페이스까지 확장
- 썸네일 클릭: 앱 내부 확대 미리보기 Dialog
- 확대 미리보기 내부:
  - 큰 이미지 표시
  - `새 탭`
  - `견적 검토로 가져오기`

### 3. 검색창 자동 입력
- 연결된 스페이스는 `스페이스 ID + displayName`을 함께 보여줌
- 그 제목을 클릭하면:
  - Takeout 다이얼로그가 닫힘
  - 메인 목록 검색창에 해당 `displayName`이 자동 입력됨
  - 목록이 그 이름 기준으로 필터링됨
- 이 동작은 실제 브라우저 테스트로 확인함

관련 파일:
- `src/pages/ConsultationManagement.tsx`
- `src/components/estimate/TakeoutQuoteInboxDialog.tsx`

## 현재 데이터 범위
- 현재 구현은 **Takeout 전체 10개 통합이 아님**
- 최신 1개 Takeout 기준으로만 인덱스를 만들고 있음
- 현재 기준:
  - Takeout 버전: `Takeout 9`
  - 스페이스 수: `296`
  - 이미지 수: `2375`

인덱스/캐시 위치:
- 원본 이미지: `/Users/findgagu/findgagu-os-data/staging/Takeout 9/Google Chat/Groups/...`
- 앱 표시용 복사본: `public/assets/takeout-quote-inbox/`
- 인덱스 파일: `public/data/takeout-quote-inbox.json`

중요:
- 앱에서 보는 이미지는 원본이 아니라 **복사본(캐시)** 이다
- 작업 후 불필요해지면 이 캐시는 삭제 가능
- 다시 만들려면:
  - `npx tsx scripts/buildTakeoutQuoteInbox.ts`

관련 파일:
- `scripts/buildTakeoutQuoteInbox.ts`

## 현재 동작 검증 결과

### 검증된 것
- 로컬 개발 서버에서 `견적 관리 -> 테이크아웃 이미지 가져오기` 열림
- 현재 스페이스 우선 표시 동작 확인
- `전체 스페이스 보기` 동작 확인
- 썸네일 클릭 시 앱 내부 확대 미리보기 정상
- 확대 미리보기 안에서 `견적 검토로 가져오기` 버튼 정상 표시
- `견적 검토로 가져오기` 클릭 시 기존 AI 검토 흐름 연결됨
- 연결된 스페이스 제목 클릭 시 메인 검색창에 displayName 자동 입력됨

### 아직 한계가 있는 것
- 선택한 이미지가 실제 `AI 분석 성공`으로 이어지는지는 이미지별 편차가 큼
- 몇몇 테스트 이미지는 `AI 분석 결과가 비어 있습니다`로 끝남
- 즉, 흐름 연결은 되었지만 모든 이미지가 견적서 파싱에 성공하는 것은 아님

## 현재 수작업 진행 메모
- `2026-03-10` 기준, **견적서 업로드 작업은 `Takeout 9`의 `9페이지`까지 완료**.
- 이 메모는 중간 진행 상황 기록용이며, 이후 이어서 작업할 때 시작 지점 확인에 사용.

## 최근 세이브 포인트
- `3272786` checkpoint: 완료 카드 재활동 신호와 운영 원칙 정리
- `5d885c2` checkpoint: 테이크아웃 이미지 가져오기 1차 연결
- `39a9060` checkpoint: 테이크아웃 이미지 확대보기 추가

## 현재 워크트리에서 이번 작업 관련 미커밋 파일
- `src/components/Consultation/ConsultationEstimateTab.tsx`
- `src/components/estimate/TakeoutQuoteInboxDialog.tsx`
- `src/pages/ConsultationManagement.tsx`
- `BLUEPRINT.md`
- `CONTEXT.md`
- `JOURNAL.md`

주의:
- 저장소 전체는 매우 더러운 상태다
- 이번 작업과 무관한 수정/미추적 파일이 매우 많으므로 절대 전체 스테이징/정리하지 말 것

## 이번 작업에서 중요한 운영 판단
- **지금은 로컬 작업이 맞음**
  - 원본 Takeout 10개가 대표님 PC 로컬에 있음
  - 현재 앱과 브라우저 검증도 로컬에서 바로 해야 함
- **카드 스플릿은 아직 구현하지 않음**
  - 같은 스페이스를 여러 프로젝트 카드로 나누는 기능은 후순위
  - 우선은 데이터 모으기 + 수동 귀속 + 나중에 사람 승인형 분리

## 아직 안 한 것
- Takeout 10개 전체 통합 인덱스
- 캐시 이미지 정리 스크립트
- 카드 스플릿(같은 스페이스의 다중 프로젝트 분리)
- Google Chat 실시간 첨부파일 수집

## 다음 에이전트 추천 시작점
1. `HANDOFF_20260310_TAKEOUT.md` 읽기
2. `git status --short`로 현재 워크트리 다시 확인
3. `src/components/estimate/TakeoutQuoteInboxDialog.tsx`
4. `src/components/Consultation/ConsultationEstimateTab.tsx`
5. `src/pages/ConsultationManagement.tsx`
6. 필요 시 `BLUEPRINT.md`, `CONTEXT.md`, `JOURNAL.md` 확인

## 지금 기준 대표님에게 설명할 사용법
- 상담카드 열기
- `견적 관리` 탭으로 이동
- `테이크아웃 이미지 가져오기`
- 필요하면 `전체 스페이스 보기`
- 이미지 썸네일 클릭해서 크게 보기
- 괜찮으면 `견적 검토로 가져오기`
- 다른 스페이스 카드를 찾고 싶으면 스페이스 제목을 눌러 displayName을 메인 검색창에 넣고, 필터된 결과 카드 중에서 선택

## 개발 서버
- 최근 확인된 로컬 개발 서버 주소: `http://127.0.0.1:5174/`
