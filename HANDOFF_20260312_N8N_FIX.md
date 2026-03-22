# n8n 워크플로우 수정 보고서
**날짜:** 2026-03-12  
**문제:** Google Chat 앱이 `1일정등록이(가) 응답하지 않음` 표시

---

## 🔍 근본 원인 분석

### 발견된 문제
워크플로우의 **노드 연결 순서가 잘못**되어 있었습니다.

#### 잘못된 구조 (이전):
```
Webhook 
  → Prepare Chat Response 
  → Respond to Google Chat 
  → Is MESSAGE? (조건 분기)
    → [true] Parse Message → ...
    → [false] Set Variables → ...
```

**문제점:**
1. **조건 분기 전에 응답을 보냄**: `Is MESSAGE?` 조건을 확인하기 **전에** Google Chat에 응답을 보냅니다
2. **모든 이벤트에 응답**: ADDED_TO_SPACE, REMOVED_FROM_SPACE 등 MESSAGE가 아닌 이벤트에도 응답을 시도합니다
3. **데이터 구조 불일치**: `Prepare Chat Response` 노드가 `body.message.text`를 참조하는데, ADDED_TO_SPACE 이벤트에는 `message` 필드가 없습니다

#### 실제 발생한 일:
1. Google Chat이 ADDED_TO_SPACE 이벤트를 Webhook으로 전송
2. `Prepare Chat Response`가 실행되어 `body.message?.text`를 확인 (undefined → 빈 문자열)
3. 기본 메시지 생성: "메시지를 확인했습니다..."
4. `Respond to Google Chat`가 이 응답을 보냄
5. **문제:** Google Chat은 ADDED_TO_SPACE 이벤트에 대해 메시지 응답을 기대하지 않음
6. 결과: "1일정등록이(가) 응답하지 않음" 오류 표시

---

## ✅ 수정 내용

### 올바른 구조 (수정 후):
```
Webhook 
  → Is MESSAGE? (조건 분기)
    → [true] Prepare Chat Response 
             → Respond to Google Chat 
             → Parse Message 
             → [견적서] Command? → ...
    → [false] Set Variables 
              → Check Supabase 
              → Row Found? → ...
```

### 수정된 파일: `gas/n8n-workflow.json`

#### 1. 연결 순서 변경
```json
"connections": {
  "Webhook": {
    "main": [[{"node": "Is MESSAGE?", "type": "main", "index": 0}]]
  },
  "Is MESSAGE?": {
    "main": [
      [{"node": "Prepare Chat Response", "type": "main", "index": 0}],
      [{"node": "Set Variables", "type": "main", "index": 0}]
    ]
  },
  "Prepare Chat Response": {
    "main": [[{"node": "Respond to Google Chat", "type": "main", "index": 0}]]
  },
  "Respond to Google Chat": {
    "main": [[{"node": "Parse Message", "type": "main", "index": 0}]]
  }
}
```

#### 2. 노드 위치 조정
- `Is MESSAGE?`: position [200, 340]
- `Prepare Chat Response`: position [420, 120]
- `Respond to Google Chat`: position [640, 120]
- `Parse Message`: position [860, 120]
- `[견적서] Command?`: position [1080, 120]

#### 3. 조건 표현식 안전성 강화
```json
"leftValue": "={{ $json.body?.type }}"
```
(optional chaining 추가)

---

## 🎯 수정 효과

### 이전 동작:
- ❌ ADDED_TO_SPACE → 잘못된 응답 → "응답하지 않음" 오류
- ❌ REMOVED_FROM_SPACE → 잘못된 응답 → 오류
- ✅ MESSAGE → 정상 응답 (우연히 작동)

### 수정 후 동작:
- ✅ ADDED_TO_SPACE → 조건 불일치 → Set Variables로 분기 → Supabase에 신규 등록
- ✅ REMOVED_FROM_SPACE → 조건 불일치 → Set Variables로 분기 → 처리
- ✅ MESSAGE → 조건 일치 → 응답 생성 → Google Chat에 응답 → 메시지 파싱 → 견적서 처리

---

## 📋 다음 단계

### n8n에 워크플로우 적용
1. n8n 웹 UI에 로그인
2. "Google Chat Space → Supabase Sync" 워크플로우 열기
3. 워크플로우 JSON 가져오기 (Import from JSON)
4. 수정된 `gas/n8n-workflow.json` 파일 내용 붙여넣기
5. 저장 및 활성화 확인

### 테스트 시나리오
1. **ADDED_TO_SPACE 테스트**
   - 새 Google Chat Space에 봇 추가
   - "응답하지 않음" 오류가 **나타나지 않아야** 함
   - Supabase `consultations` 테이블에 새 행이 생성되어야 함

2. **MESSAGE 테스트**
   - Space에 일반 메시지 전송
   - 봇이 "메시지를 확인했습니다..." 응답
   - `update_date` 업데이트 확인

3. **견적서 테스트**
   - 이미지 첨부 + "견적서" 텍스트 전송
   - 봇이 "견적서 요청을 받았습니다..." 응답
   - 자동 견적 처리 확인

---

## 🔧 기술 세부사항

### Google Chat 이벤트 타입
- `ADDED_TO_SPACE`: 봇이 Space에 추가됨 (message 필드 없음)
- `REMOVED_FROM_SPACE`: 봇이 Space에서 제거됨 (message 필드 없음)
- `MESSAGE`: 사용자가 메시지 전송 (message 필드 있음)

### Webhook Response 요구사항
- MESSAGE 이벤트: JSON 응답 필요 (`{ "text": "..." }`)
- ADDED_TO_SPACE: 응답 불필요 (HTTP 200만 필요)
- REMOVED_FROM_SPACE: 응답 불필요 (HTTP 200만 필요)

### n8n `respondToWebhook` 노드
- MESSAGE 분기에서만 실행되도록 수정
- 다른 이벤트는 자동으로 HTTP 200 반환 (응답 노드 없이)

---

## 📊 예상 결과

### 성공 지표
- ✅ "응답하지 않음" 오류 사라짐
- ✅ ADDED_TO_SPACE 이벤트 시 Supabase에 자동 등록
- ✅ MESSAGE 이벤트 시 정상 응답
- ✅ 견적서 자동 처리 정상 작동

### 모니터링
- n8n 실행 로그에서 오류 확인
- Google Chat에서 봇 응답 확인
- Supabase `consultations` 테이블 데이터 확인

---

## 🎓 교훈

1. **조건 분기는 최대한 빨리**: 이벤트 타입에 따라 다른 처리가 필요하면 Webhook 직후에 분기
2. **응답은 필요할 때만**: MESSAGE 이벤트에만 응답 노드 실행
3. **Optional chaining 사용**: `$json.body?.type`으로 안전하게 접근
4. **워크플로우 시각화**: 노드 위치를 논리적 흐름에 맞게 배치

---

**수정 완료:** 2026-03-12  
**다음 작업:** n8n UI에서 워크플로우 임포트 및 테스트
