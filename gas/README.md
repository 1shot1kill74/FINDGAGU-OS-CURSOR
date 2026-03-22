# 구글 시트 → Supabase consultations 동기화 (Apps Script)

## 시트 열 매핑

| 시트 열 | 인덱스 | DB 컬럼 | 설명 |
|---------|--------|---------|------|
| A | data[0] | project_name | 업체명(프로젝트명) |
| B | data[1] | link | 구글챗 링크 |
| C | data[2] | created_at | 시작일자 (과거 날짜 그대로 Overwrite) |

## 설정

1. [Google Apps Script](https://script.google.com) 에서 새 프로젝트 생성
2. `Code.gs` 내용 복사 후 붙여넣기
3. **스크립트 속성** 설정:
   - 파일 → 프로젝트 속성 → 스크립트 속성
   - `SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_SERVICE_KEY`: Service Role Key (Supabase 대시보드 → 설정 → API)

## n8n 워크플로우 설정

- `gas/n8n-workflow.json`은 Supabase URL/키를 하드코딩하지 않고 `n8n` 환경변수를 참조합니다.
- 워크플로우 임포트 전 `n8n` 인스턴스에 아래 값을 설정해야 합니다.
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_KEY`
- 워크플로우의 Webhook path는 `chat-space-created`입니다.
- GAS의 `MAKE_SYNC_WEBHOOK_URL` 스크립트 속성에는 실제로 `n8n` 프로덕션 Webhook URL을 넣어야 합니다.
- 워크플로우의 `MESSAGE` 분기는 **Google Chat HTTP 엔드포인트 앱**이 interaction event를 이 Webhook으로 보내는 경우에만 동작합니다.
- Google Chat 공식 `MESSAGE` 이벤트는 **방 전체 모든 메시지**가 아니라 **@멘션, 슬래시 명령, 앱과의 DM**에서만 발생합니다.

## update_date 소스 오브 트루스

- 앱이 보는 최종 기준값은 `consultations.update_date` 입니다.
- **주 갱신 경로:** `gas/AutoAddBot.gs`의 `patchUpdateDates_()`가 Chat `spaces.list()`의 `lastActiveTime`을 읽어 5분 주기로 Supabase `update_date`를 PATCH 합니다.
- **보조 갱신 경로:** `gas/n8n-workflow.json`의 `MESSAGE` 분기. 단, 이 경로는 Google Chat 앱 interaction event가 실제로 들어올 때만 동작합니다.
- 따라서 일반 채팅방 활동을 넓게 커버하는 기준은 현재 **GAS lastActiveTime 경로**이고, `n8n MESSAGE`는 보조 실시간 경로로 보는 것이 맞습니다.

## Google Chat → n8n MESSAGE 실운영 점검

### 1. n8n 기본 상태

- 워크플로우가 `active: true` 인지 확인합니다.
- Google Chat 앱 설정과 GAS `MAKE_SYNC_WEBHOOK_URL`에는 **프로덕션 URL**인 `https://findgagu.app.n8n.cloud/webhook/chat-space-created`를 사용합니다.
- `webhook-test` URL이 들어가 있으면 운영 이벤트는 쌓이지 않습니다.
- `n8n` 환경변수 `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`가 실제 운영값으로 설정되어 있어야 합니다.

### 2. Google Chat 앱 설정

- Google Cloud Console의 Google Chat API 설정에서 **HTTP 엔드포인트 URL**이 위 프로덕션 Webhook과 정확히 일치해야 합니다.
- URL을 바꿨다면 저장 후 오류 없이 반영되었는지 다시 확인합니다.
- 앱이 테스트/배포 가능한 상태인지, 그리고 실제 대상 스페이스에 **앱이 멤버로 들어가 있는지** 확인합니다.
- 슬래시 명령 테스트를 할 계획이면, Chat 앱 설정에 해당 명령이 실제로 등록되어 있어야 합니다.

### 2-1. 콘솔 화면 기준 확인 항목

- Google Cloud Console → **Google Chat API** → **Configuration** 화면에서 연결 방식이 `HTTP endpoint URL`인지 확인합니다.
- 같은 화면의 **HTTP endpoint URL** 값이 `https://findgagu.app.n8n.cloud/webhook/chat-space-created`와 완전히 동일한지 확인합니다.
- 앱 표시 설정(이름, 아바타, 설명)보다 중요한 것은 **연결 URL 저장 성공 여부**입니다. 저장 직후 에러가 났다면 이벤트 전달은 기대하면 안 됩니다.
- 테스트 대상 Workspace에서 이 앱이 **사용 가능 상태**인지 확인합니다. 앱이 배포 전/비공개 상태면 실제 사용자 공간에서 호출이 안 될 수 있습니다.
- 테스트하려는 스페이스에 앱이 실제로 추가되어 있어야 하며, 앱이 없는 방에서 보낸 메시지는 당연히 앱으로 가지 않습니다.
- 슬래시 명령으로 점검하려면 Configuration의 **Commands** 항목에 실제 명령이 등록되어 있어야 합니다.
- DM 테스트를 하려면 사용자가 Chat 검색에서 해당 앱을 찾아 **1:1 대화창을 열 수 있는 상태**여야 합니다.

### 2-2. 요청 검증 메모

- Google Chat은 HTTP 엔드포인트 호출 시 `Authorization: Bearer ...` 헤더를 붙여 보냅니다.
- 공식 문서 기준으로 이 토큰은 Google Chat이 보낸 요청인지 검증할 때 사용할 수 있습니다.
- 현재 구조의 핵심 문제는 대개 **검증 실패보다 interaction 이벤트 자체가 조건에 맞지 않는 경우**입니다.
- 즉, n8n 실행 이력이 아예 없다면 먼저 `@멘션` / 슬래시 명령 / DM으로 테스트했는지부터 봐야 합니다.
- URL을 저장할 때 문제가 있었다고 의심되면, 가장 현실적인 재확인 방법은 **Configuration 화면에서 같은 프로덕션 URL을 다시 저장하고 테스트를 반복**하는 것입니다.

### 3. 이벤트 기대값 바로잡기

- 일반 채팅방의 평문 대화는 `MESSAGE` 이벤트로 오지 않을 수 있습니다.
- 현재 n8n의 `MESSAGE` 분기는 **@멘션**, **슬래시 명령**, **앱과의 DM** 같은 interaction 이벤트만 기대하는 구조입니다.
- 따라서 테스트는 반드시 아래 셋 중 하나로 해야 합니다.
- 같은 스페이스에서 `@앱이름 테스트`
- 등록된 슬래시 명령 실행
- 앱과 1:1 DM에서 메시지 전송

### 4. 어디서 끊기는지 구분하는 법

- 위 테스트를 했는데 n8n 실행 이력 자체가 없으면, 문제는 **Supabase가 아니라 Google Chat 앱 → Webhook 전달 구간**입니다.
- n8n 실행 이력은 생기는데 `type`이 `MESSAGE`가 아니면, 현재 테스트 입력이 interaction 이벤트가 아닌 것입니다.
- n8n 실행 이력에 `body.space.name`이 들어오는데 DB가 안 바뀌면, 그때는 `channel_chat_id` 매칭 또는 Supabase 권한/헤더를 보면 됩니다.

### 5. 빠른 스모크 테스트 순서

1. n8n 워크플로우 활성화 확인
2. Google Chat 앱 HTTP 엔드포인트 URL 재확인
3. 앱이 들어가 있는 스페이스에서 `@앱이름 테스트` 전송
4. n8n 실행 이력에서 `body.type === "MESSAGE"` 와 `body.space.name` 확인
5. Supabase `consultations.channel_chat_id = body.space.name` 행의 `update_date` 변경 확인

### 6. 운영 판단

- **방 전체 활동을 넓게 반영**하려면 현재 주 경로는 `GAS lastActiveTime → update_date PATCH` 입니다.
- **즉시성 보강**이 필요하면 `n8n MESSAGE`를 유지하되, 이 경로는 interaction 이벤트 한정이라는 전제를 운영 문서에 계속 명시해야 합니다.

### 7. 대표님용 1분 실행 절차

1. `n8n`에서 워크플로우가 켜져 있는지 확인
2. Google Cloud Console `Google Chat API → Configuration`에서 `HTTP endpoint URL = https://findgagu.app.n8n.cloud/webhook/chat-space-created` 확인
3. 앱이 들어가 있는 채팅방에서 일반 메시지 말고 `@앱이름 테스트` 전송
4. `n8n` 실행 이력이 생겼는지 확인
5. 실행 이력에 `body.type = MESSAGE` 와 `body.space.name` 이 보이면 거의 연결 성공
6. Supabase에서 `channel_chat_id = body.space.name` 행의 `update_date` 가 오늘 날짜로 바뀌었는지 확인

### 8. n8n 실행 이력 판독표

- **실행 이력 없음**
문제 구간은 `Google Chat 앱 → Webhook` 입니다. URL, 앱 배포/사용 가능 상태, 스페이스 멤버십, 테스트 방식(`@멘션`/슬래시/DM)을 다시 봅니다.
- **실행 이력 있음, `body.type` 이 `ADDED_TO_SPACE`**
앱 추가 이벤트만 들어온 것입니다. `MESSAGE` 실시간 갱신 테스트는 아직 안 된 상태입니다.
- **실행 이력 있음, `body.type` 이 `MESSAGE` 아님**
일반 대화나 다른 이벤트일 가능성이 큽니다. `@앱이름 테스트` 또는 슬래시 명령으로 다시 테스트합니다.
- **실행 이력 있음, `body.type = MESSAGE`, `body.space.name` 있음**
Google Chat → n8n 전달은 성공입니다. 이제 Supabase PATCH 쪽을 보면 됩니다.
- **실행 이력 있음, `body.type = MESSAGE` 인데 DB 미변경**
`consultations.channel_chat_id` 와 `body.space.name` 일치 여부, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, PATCH 헤더를 확인합니다.
- **DB는 바뀌는데 앱 화면이 그대로**
프론트 fetch/Realtimе 반영 타이밍 문제일 수 있으니 새로고침 또는 탭 재진입으로 확인합니다.

## 사용

### 1. 기존 데이터 삭제 후 재동기화

1. `runDeleteAllConsultations()` 실행 (트리거에서 선택 후 실행)
2. `initialSyncAll()` 실행

### 2. 일반 동기화

- `initialSyncAll()` 실행 — 활성 시트의 데이터를 Supabase로 Upsert (project_name 기준)

## 날짜 형식

시작일자(C열)는 아래 형식 지원:

- `YYYY-MM-DD`
- `YYYY.MM.DD`, `YYYY/MM/DD`
- `YYYYMMDD`
- Excel 날짜 번호
