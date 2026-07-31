# 교육용 가구 B2B 아웃리치 파이프라인

Human-in-the-loop 반자동 시스템. 공개 시그널만 수집하고, AI/휴리스틱이 점수화하며, **사람 승인 후에만** 제안/쇼룸 링크를 보낸다(MVP는 복사+발송 로그).

## 1. 아키텍처 요약

```
Source → Collect → Normalize → AI/Heuristic Score → Approval Queue → Send(manual) → CRM/Log
```

| 단계 | MVP | 비고 |
|------|-----|------|
| Source | **네이버 뉴스/지역 검색 API** (주력) + Google News 보조 + 공식 공고 수동 | BefoAftr `NAVER_CLIENT_*` 재사용. SNS 스크래핑 금지 |
| Collect | `POST /api/edu-outreach-collect` `{ provider }` + OS 버튼 | Mac 로컬 크론 의존 없음 (Vercel API) |
| Normalize | `edu_outreach_signals` | external_id dedupe |
| Score | `eduOutreachScoring.ts` (heuristic) | Gemini 업그레이드 슬롯 |
| Approval | `/admin/edu-outreach` | 승인 전 자동 발송 없음 |
| Send | 클립보드 복사 + `edu_outreach_send_logs` | 광고성 DM/메일 자동 난사 금지 |
| CRM | 승인·발송 후 `consultations` promote는 다음 PR | 운영 CRM 오염 방지 |

**연락 타이밍:** 학원 원장 등은 `lunch_or_late_evening`(점심·21:30–23:00). 군/학교는 `official_channel_only`.

## 2. 데이터 모델

| 테이블 | 역할 |
|--------|------|
| `edu_outreach_sources` | 공개 소스 설정 |
| `edu_outreach_signals` | 원문 시그널 |
| `edu_outreach_leads` | 정규화 리드 + fit_score/status |
| `edu_outreach_drafts` | 메시지 초안 |
| `edu_outreach_approvals` | 승인/거절 감사 로그 |
| `edu_outreach_send_logs` | 발송(또는 복사) 로그 |
| `edu_outreach_poll_runs` | 수집 런 |

마이그레이션: `supabase/migrations/20260801020000_create_edu_outreach.sql`

## 3. AI 출력 JSON

```json
{
  "fit_score": 78.0,
  "industry": "academy",
  "intent": "renewal",
  "region": "경기",
  "why": "업종=academy · 의도=renewal · 지역=경기",
  "outreach_angle": "ba_shorts_showroom",
  "draft_message": "...",
  "cta_url": "https://www.findgagu.co.kr/public/showroom?utm_source=edu_outreach&utm_medium=manual",
  "source_url": "https://...",
  "evidence_quote": "..."
}
```

## 4. 업종별 시그널 예시

| 업종 | 시그널 |
|------|--------|
| 학원 | 개원/확장/이전/리뉴얼, 독서실 리모델링, 책상 교체 |
| 학교 | 기자재/가구 구매, 특별실 조성 |
| 스터디카페·관리형 | 오픈·리뉴얼·좌석 교체 |
| 아파트 | 커뮤니티 독서실/스터디룸 가구 교체·입찰 |
| 군부대 | 나라장터·부대 시설 개선 **공식 공고만** (개인 휴대폰 금지) |

제외: 가정집 인테리어, 일반 카페, 호텔/병원, 불특정 SNS 개인.

## 5. MVP 소스/플로우

1. OS → **네이버 뉴스** (`provider: naver_news`) → 개원/리모델링 시그널 → 점수 → `queued`
2. OS → **네이버 지역** (`provider: naver_local`) → 학원/스터디/독서실 업체 풀 (`intent=directory`) → 점수 → 큐  
   - 전화번로는 저장만. **자동 문자/콜 금지**, 승인 후 사람이 업무 채널로만
3. 보조: Google News RSS / 공식 공고 수동 등록
4. 승인 큐에서 초안 수정 → 승인 → **복사 + 발송 로그**

환경변수: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (BefoAftr와 동일. 앱에 검색>뉴스·지역 활성화)

### 본문 추출 (원문보기 / 본문 불러오기)

우선순위: **Crawl4AI → Scrapling → Readability** (`api/edu-outreach-fetch-article.ts`)

| 엔진 | 로컬 준비 | env |
|------|-----------|-----|
| Crawl4AI | `scripts/start-crawl4ai.sh` (Docker `:11235`) | `CRAWL4AI_BASE_URL`, `CRAWL4AI_API_TOKEN` |
| Scrapling | Playwright chromium + `업무참고용/.venvs/scrapling` | `SCRAPLING_PYTHON` |
| Readability | 의존성 없음 (fallback) | — |

Cursor MCP: 네이티브 Docker SSE(`/mcp/sse`)는 discovery 타임아웃이 잦아 `scripts/crawl4ai-mcp-stdio.sh` stdio 브릿지를 사용한다. Scrapling MCP는 `scrapling mcp` stdio.

Vercel 서버리스에서는 Playwright/로컬 Docker 불가 → 원격 `CRAWL4AI_BASE_URL` 또는 Readability만.

## 6. 구현 태스크 (파일 경로)

| 파일 | 상태 |
|------|------|
| `supabase/migrations/20260801020000_create_edu_outreach.sql` | ✅ |
| `src/lib/eduOutreachTypes.ts` | ✅ |
| `src/lib/eduOutreachScoring.ts` | ✅ |
| `src/lib/eduOutreachService.ts` | ✅ |
| `api/edu-outreach-collect.ts` | ✅ |
| `api/edu-outreach-fetch-article.ts` | ✅ |
| `scripts/edu_outreach_extract_article.py` | ✅ |
| `scripts/start-crawl4ai.sh` / `crawl4ai-mcp-stdio.sh` | ✅ |
| `src/pages/admin/EduOutreachQueuePage.tsx` | ✅ |
| `src/App.tsx` / `internalRouteLabel.ts` / `DashboardPage.tsx` | ✅ |
| Gemini rescore Edge/API | 다음 |
| Vercel Cron (서버) 주기 수집 | 다음 |
| 승인 리드 → `consultations` promote | 다음 |
| 나라장터 OpenAPI 키 연동 | 다음 (키 필요) |

## 7. 컴플라이언스 체크리스트

- [x] SNS 로그인·비공개 스크래핑 없음
- [x] 사전 동의 없는 광고성 DM/메일/문자 **자동 난사 없음**
- [x] Mac 로컬 크론 의존 없음
- [x] Human-in-the-loop (승인 UI)
- [x] 군부대: 공식 채널/수동 공고만, `official_channel_only`
- [x] 가정집·일반 카페 등 exclude 규칙
- [ ] 발송 전 수신 채널이 업무/공식 연락처인지 운영자가 확인 (프로세스)
- [ ] 개인정보 최소 수집 (MVP는 공개 URL·기관명 중심)

## 8. 첫 PR 범위

1. 스키마 + seed 소스
2. Google News 공개 RSS 수집 API
3. 휴리스틱 점수 + 초안
4. `/admin/edu-outreach` 승인 큐 + 수동 발송 로그
5. 대시보드 진입점 + 본 문서

**포함하지 않음:** 자동 이메일/카톡 발송, SNS 스크래핑, 프로덕션 마이그레이션 강제 적용, Gemini 필수 의존.

## 성공지표

| 지표 | 정의 |
|------|------|
| 승인률 | approve / (approve+reject+excluded 리뷰분) |
| 회신률 | replied / sent (운영자가 status 갱신) |
| 상담 전환 | converted → consultations 연결 후 |
| 주간 유효 리드 | fit≥55 & not rejected, 업종별 |
