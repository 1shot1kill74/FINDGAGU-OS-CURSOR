# 콘텐츠 시스템 저널

> 이 문서는 콘텐츠 시스템 관련 핵심 결정과 운영 기준을 날짜별로 간단히 남긴다.

---

## 2026-03-28

### 현재 판단
- 현재 체크아웃 기준에서는 `docs/content-system` 문서 세트가 거의 비어 있으므로, 실행 가능한 운영 문서를 먼저 복원하는 것이 우선이다.
- 콘텐츠 시스템은 단순 콘텐츠 작성 도구가 아니라 `발행 큐 -> 콘텐츠 상세 -> 배포 관리 -> 자동화 큐 -> 템플릿`으로 이어지는 운영형 백오피스로 정의한다.
- 운영자는 단순 성공 토스트보다 `지금 보고 있는 정보가 최신인지`, `무엇을 먼저 눌러야 하는지`를 화면 안에서 즉시 이해할 수 있어야 한다.

### 오늘 한 일
- `docs/content-system` 하위의 운영 문서 세트를 다시 채우기 시작했다.
- 기본 복원 대상은 `WORKFLOW`, `AUTOMATION_RUNBOOK`, `AUTOMATION_DEPLOY_CHECKLIST`, `CONTENT_READINESS_GUIDE`, `SCREEN_SPEC`로 정했다.
- 문서의 톤은 "개발 설명"보다 "운영자가 그대로 따라 할 수 있는 기준"에 맞춘다.
- 발행 큐에 `쇼룸에서 동기화`를 추가해 내부 쇼룸 원천 이미지에서 콘텐츠 후보를 가져오는 흐름을 연결했다.
- 동기화된 신규 후보는 기본 배포 채널 뼈대를 함께 생성해 상세/배포 화면에서 바로 이어서 확인할 수 있게 했다.
- `공유용 요약` 아래의 `오늘 할 일 3줄`은 실제 필터 결과와 우선 분류를 바탕으로 자동 생성되도록 정리했다.
- 콘텐츠 워크스페이스 서비스에 `auto/local/supabase` 원천 모드와 안전 fallback을 추가했다.
- `content_derivatives`, `content_activity_logs`를 화면/서비스/로컬 상태에 포함시켜 상세 화면 정보 밀도를 높였다.
- 콘텐츠 저장, 자동화 요청/재시도, 배포 상태 변경 같은 조작은 활동 로그에 자동 기록되도록 정리했다.
- 콘텐츠 저장/배포 상태 변경/자동화 요청/템플릿 저장은 `Supabase 반영 시도 -> 실패 시 로컬 fallback` 흐름으로 확장했다.
- 화면 토스트는 `Supabase 저장 성공`, `로컬 저장`, `로컬 fallback`을 구분해서 보여주도록 정리했다.
- 원문 저장 시 기본 파생초안 원격 업서트도 함께 수행하도록 확장했다.
- 쇼룸 동기화는 로컬 상태뿐 아니라 `content_items`, `content_blog_drafts`, `content_distributions`, `content_derivatives`, `content_activity_logs` 원격 반영까지 시도하도록 연결했다.
- 서비스가 `마지막 저장 결과`를 기억하고, 각 화면이 `Supabase / 로컬 / 로컬 fallback` 상태를 즉시 보여주도록 정리했다.
- 활동 로그 원격 반영은 중복 오류를 줄이기 위해 insert 대신 upsert 성격으로 조정했다.
- `content_items`, `content_blog_drafts`, `content_distributions`, `content_templates`, `content_automation_jobs`, `content_activity_logs` 원격 payload를 스키마 초안 기준으로 더 촘촘히 채우도록 정리했다.
- 자동화 작업은 `distribution_id`, `payload`까지 함께 싣고, 블로그 원문은 고정 id 업서트 방식으로 맞췄다.

### 다음 기준
- 문서가 살아 있는 상태를 먼저 만들고, 이후 실제 화면/코드와 차이가 나는 부분을 다시 맞춘다.
- 로그인 선행, 새로고침 기준, 연동 확인, 실URL 전환 검증 순서를 모든 문서에서 일관되게 유지한다.

---

## 2026-03-29

### 현재 판단
- 콘텐츠 시스템은 이제 신규 기능 추가보다 `실운영 전 최종 점검`과 `배포 품질 정리`가 더 중요한 단계다.
- 운영자에게 보여주는 힌트는 고정 문구가 아니라 실제 시각 차이와 현재 상태를 반영해야 한다.
- 내부 브라우저 흐름 검수는 로그인 세션이 없으면 끝까지 진행할 수 없으므로, 비로그인 상태에서 검증 가능한 보호 라우트/리다이렉트 흐름부터 먼저 확인한다.

### 오늘 한 일
- `운영 진단`을 발행 큐/자동화 큐/배포 관리에 연결하고, 콘텐츠 상세에는 `콘텐츠 진단` 블록을 추가했다.
- 자동화 큐의 `실패 항목 일괄 재요청`이 실제로 현재 필터 범위의 failed 작업 전체를 재적재하도록 수정했다.
- 발행 큐에 `실운영 최종 점검` 패널과 `최종 점검 요약` 복사 기능을 추가했다.
- `contentWorkspaceDiagnostics`에 워크스페이스 전체 기준의 검수 요약 계산 로직을 분리했다.
- `contentWorkspaceFreshness` 유틸을 추가하고, 발행 큐/콘텐츠 상세/자동화 큐/배포 관리의 새로고침 권장 힌트를 실제 시각 비교 기반으로 바꿨다.
- `vite.config.ts`에 수동 청크 분리를 넣어 `pdfjs`, `html2canvas`, `jsPDF` 관련 무거운 번들을 분리했다.
- 빌드 결과에서 이전에 남아 있던 500k 초과 청크 경고를 제거했다.
- 브라우저 기준으로 `http://127.0.0.1:5173/content` 비로그인 접근 시 `login?next=/content`로 수렴하는 보호 라우트 흐름을 확인했다.
- 로그인 페이지에서 `Google로 로그인` 버튼이 초기 세션 확인 뒤 활성화되는 흐름을 확인했다.
- 로그인 페이지에 `세션 확인 중` 상태와 `로그인 후 이동 대상` 안내를 추가해 내부 운영자 혼선을 줄였다.
- 실제 로그인 세션으로 `발행 큐 -> 콘텐츠 상세 -> 자동화 큐 -> 배포 관리` 딥링크 흐름을 점검했다.
- 브라우저 검수 중 발견된 `content_items.blog_template_id` 스키마 불일치 때문에 발생하던 Supabase fallback을 제거하기 위해, 원격 `content_items` payload에서 배포 스키마에 없는 템플릿 참조 컬럼을 제외했다.
- 발행 큐/콘텐츠 상세/자동화 큐/배포 관리의 `연동 상태 새로고침` 계열 버튼이 단순 시각 갱신이 아니라 실제 워크스페이스 스냅샷 재조회까지 수행하도록 정리했다.
- `자동화 큐 > 웹훅 호출`이 실제로 `content-automation-dispatch` Edge Function을 호출할 수 있도록 프론트 디스패치 헬퍼와 Edge Function 초안을 추가했다.
- 디스패치 payload 계약과 서버사이드 secret 규약을 `WEBHOOK_CONTRACT.md`로 분리해, n8n 또는 다른 외부 자동화와 연결할 때 기준 문서를 남겼다.
- 외부 자동화 완료 뒤 `content_automation_jobs`와 `content_distributions`를 다시 갱신할 수 있도록 `content-automation-callback` Edge Function 초안도 추가했다.
- `content_code`와 원격 `uuid id`를 서비스 계층에서 함께 관리하도록 바꿔, 로컬 쇼룸 sync 후보와 원격 콘텐츠 레코드가 같은 객체로 이어지게 정리했다.
- 쇼룸 동기화 시 `content_sources`에 `showroom_group`와 `image_asset` 연결을 함께 적재해, 콘텐츠 후보가 어떤 원천 자산 묶음에서 왔는지 원격에서도 추적 가능하게 만들었다.
- 원격 `content_sources_target_check`와 `one_primary_per_content` 제약을 확인해, `image_asset` source는 `showroom_group_key = null`, `is_primary = false` 규칙으로 맞추고 기존 223개 콘텐츠에 대해 `image_asset` 연결 2009건을 백필했다.
- 발행 큐/콘텐츠 상세의 원천 패널에서 `image-assets?assetId=...` 딥링크로 바로 자산 관리 화면을 열고 해당 카드에 포커스하도록 연결해, 콘텐츠 -> 원천 자산 검수 흐름을 한 번에 이어지게 만들었다.

### 남은 기준
- 내부 운영 계정으로 실제 로그인된 세션에서 `발행 큐 -> 콘텐츠 상세 -> 자동화 큐 -> 배포 관리`를 한 바퀴 끝까지 검수한다.
- 실URL/실Webhook 기준 1회전 검증을 통과하면 기능 구현보다 운영 튜닝 위주로 전환한다.
