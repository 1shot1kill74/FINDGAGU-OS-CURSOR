# 쇼룸 케이스 콘텐츠 n8n Import Quickstart

## 1. Import 할 파일
- `docs/content-system/IMPORT_THIS__N8N__SHOWROOM_CASE_CONTENT__CARDNEWS_AND_BLOG.json`

## 2. 권장 구조
- **하나의 입력**을 받습니다.
- 같은 웹훅을 쓰되, `channel` 값으로 **카드뉴스 요청**과 **블로그 요청**을 분기합니다.
- 즉 한 번 요청할 때는 한 결과만 생성합니다.

즉 구조는:

`공통 입력 1개 + channel -> cardnews 또는 blog`

여기서 중요한 점:
- 카드뉴스와 블로그는 같은 원천 데이터를 공유합니다.
- 하지만 실제 생성 요청은 각각 따로 보냅니다.
- 결과도 요청한 타입만 반환됩니다.

## 3. n8n에서 바로 할 일
1. `Create workflow` 또는 새 워크플로우 화면으로 이동
2. 우측 상단 `More actions`
3. `Import from file...`
4. 위 JSON 파일 선택
5. 워크플로우 이름 확인 후 저장
6. 필요 시 `Test workflow`
7. 사용 준비가 끝나면 `Publish`

## 4. Webhook path
- `findgagu-showroom-case-content-generate`

예상 URL:

`https://YOUR_N8N_HOST/webhook/findgagu-showroom-case-content-generate`

## 5. 필요한 환경 변수
- `OPENAI_API_KEY`

이 템플릿은 `Authorization: Bearer {{$env.OPENAI_API_KEY}}` 방식으로 OpenAI를 호출합니다.

## 6. 입력 payload 핵심 필드
테스트 payload:
- `docs/content-system/IMPORT_THIS__PAYLOAD_TEST__SHOWROOM_CASE_CONTENT__CARDNEWS_AND_BLOG.json`

기본 입력 예시:

```json
{
  "contentType": "showroom-case-content",
  "channel": "cardnews",
  "displayName": "2505 경기권 관리형 6888",
  "siteName": "견적 2505 평택스터디카페(리뉴얼) 6888",
  "externalLabel": "2505 경기권 관리형 6888",
  "industry": "관리형 스터디카페",
  "titleHint": "2505 경기권 관리형 6888",
  "hook": "왜 리뉴얼이 필요했을까요?",
  "problemSummary": "노후 인수 매장이라 첫인상과 매출 설득력이 약했습니다.",
  "problemDetail": "오래된 스터디카페를 인수한 뒤 매출 부진이 이어졌고, 경쟁사와 차별화되는 인상을 다시 만들어야 했습니다.",
  "solutionSummary": "관리형다운 밀도와 동선 중심으로 다시 기획했습니다.",
  "solutionDetail": "좌석 구성과 이동 흐름, 관리형 운영에 맞는 분위기까지 함께 정리해 리뉴얼 방향을 설계했습니다.",
  "evidencePoints": [
    "입구 첫인상에서 관리형 이미지가 더 분명해짐",
    "좌석과 동선의 읽힘이 좋아짐",
    "비슷한 업종 사례와 비교해 설명하기 쉬워짐"
  ],
  "cardNews": {
    "slides": [
      { "slide": 1, "role": "hook", "title": "2505 경기권 관리형 6888", "text": "왜 리뉴얼이 필요했을까요?" },
      { "slide": 2, "role": "problem", "title": "문제 인식", "text": "오래된 스터디카페를 인수한 뒤 매출 부진이 이어졌습니다." },
      { "slide": 3, "role": "solution", "title": "해결 접근", "text": "관리형다운 밀도와 동선 중심으로 다시 기획했습니다." },
      { "slide": 4, "role": "evidence", "title": "변화 포인트", "text": "- 입구 첫인상 정리\n- 좌석 흐름 개선" },
      { "slide": 5, "role": "cta", "title": "온라인 쇼룸에서 더 보기", "text": "비슷한 사례를 온라인 쇼룸에서 더 비교해보세요." }
    ]
  },
  "blogDraftMarkdown": "# 2505 경기권 관리형 6888\n\n## 한 줄 훅\n왜 리뉴얼이 필요했을까요?\n\n## 현장 과제\n오래된 스터디카페를 인수한 뒤 매출 부진이 이어졌고, 경쟁사와 차별화되는 인상을 다시 만들어야 했습니다."
}
```

## 7. 응답 형태
`channel` 값에 따라 응답 구조가 달라집니다.

### 카드뉴스 요청 응답 예시

```json
{
  "ok": true,
  "contentType": "showroom-case-content",
  "channel": "cardnews",
  "displayName": "2505 경기권 관리형 6888",
  "generatedAt": "2026-04-14T00:00:00.000Z",
  "payload": {
    "request": {},
    "cardNews": {}
  }
}
```

### 블로그 요청 응답 예시

```json
{
  "ok": true,
  "contentType": "showroom-case-content",
  "channel": "blog",
  "displayName": "2505 경기권 관리형 6888",
  "generatedAt": "2026-04-14T00:00:00.000Z",
  "payload": {
    "request": {},
    "blog": {}
  }
}
```

### 잘못된 channel 응답 예시

```json
{
  "ok": false,
  "error": "unsupported_channel",
  "message": "channel must be either \"cardnews\" or \"blog\"."
}
```

## 8. 운영 권장
- 앱에서는 버튼은 둘이지만, 웹훅 URL은 하나로 유지합니다.
- `카드뉴스 생성 요청` 버튼은 `channel: "cardnews"`로 호출합니다.
- `블로그 생성 요청` 버튼은 `channel: "blog"`로 호출합니다.
- 이렇게 하면 URL은 하나지만 결과물은 각각 독립적으로 다룰 수 있습니다.

## 9. 다음 단계
- 앱의 `카드뉴스 패키지 복사`를 `channel: "cardnews"` webhook 호출 버튼으로 교체
- 앱의 `블로그 초안 복사`를 `channel: "blog"` webhook 호출 버튼으로 교체
- 응답 JSON을 `showroom_case_profiles.metadata` 또는 별도 콘텐츠 테이블에 저장
- 카드뉴스/블로그 각각 `생성 중 / 완료 / 실패` 상태를 독립적으로 표시
