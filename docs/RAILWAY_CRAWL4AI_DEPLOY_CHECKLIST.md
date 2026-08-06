# Railway Crawl4AI 배포 체크리스트

## 목표

- Vercel에서 edu-outreach **본문 불러오기**가 Crawl4AI를 쓰게 한다
- Scrapling/Playwright는 Vercel에 올리지 않는다
- 쇼룸 숏츠 워커(`showroom-shorts-worker`)와 **별도 서비스**로 분리한다

## 1. Railway 서비스 (배포됨)

| 항목 | 값 |
|------|-----|
| Project | `findgagu-crawl4ai` (`32d9f369-fcde-49f3-8f72-2c2cd0dd526e`) |
| Workspace | 현재 CLI 로그인 계정 (`hello@befoaftr.com` / befoaftr's Projects) |
| URL | `https://findgagu-crawl4ai-production.up.railway.app` |
| Target port | `11235` |
| Root / Dockerfile | `crawl4ai/` |

> 참고: Findgagu 숏츠 워커(`findgagu-showroom-shorts-worker`)는 **다른 Railway 로그인**에 있어 이 계정에서는 Unauthorized였다. Crawl4AI는 사용 가능했던 계정에 새 프로젝트로 올렸다. 나중에 FG Railway로 옮기려면 해당 계정으로 `railway login` 후 재배포.

환경 변수:

| Key | Value |
|-----|--------|
| `CRAWL4AI_API_TOKEN` | 로컬 `업무참고용/.secrets/crawl4ai_api_token`과 동일 |
| `PORT` | `11235` |

## 2. Vercel (FG 트랙)

서버 환경 변수 (Production / Preview):

```bash
CRAWL4AI_BASE_URL=https://<crawl4ai-service>.up.railway.app
CRAWL4AI_API_TOKEN=<same-token>
```

`VITE_` 접두사 금지 (브라우저 노출 방지).

설정 후 재배포 1회.

## 3. 로컬 `.env` (선택)

개발 중에도 Railway를 쓰려면:

```bash
CRAWL4AI_BASE_URL=https://<crawl4ai-service>.up.railway.app
CRAWL4AI_API_TOKEN=...
```

로컬 Docker를 쓰려면 `http://127.0.0.1:11235`로 두면 된다.

## 4. 검증

```bash
# health (토큰 없이도 200인 빌드가 일반적)
curl -sS -o /dev/null -w "%{http_code}\n" "$CRAWL4AI_BASE_URL/health"

# markdown 추출
curl -sS -X POST "$CRAWL4AI_BASE_URL/md" \
  -H "Authorization: Bearer $CRAWL4AI_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.job-post.co.kr/news/articleView.html?idxno=118847","f":"fit"}'
```

OS UI: `/admin/edu-outreach` → 리드 선택 → **본문 불러오기** → `engine: crawl4ai`.

## 5. 장애 시

- Railway 로그: Chromium / OOM → 플랜 메모리 상향, shm 관련 오류 확인
- Vercel 로그: `CRAWL4AI_*` 미설정 → Readability fallback만 동작
- 401 → 토큰 불일치
- 타임아웃 → cold start / 슬리프 — always-on 또는 워커 타임아웃 여유
