# Crawl4AI on Railway

Vercel 서버리스에서는 Playwright/로컬 Docker를 못 돌리므로, 본문 추출용 Crawl4AI를 Railway에 상시 띄운다.

Findgagu OS `POST /api/edu-outreach-fetch-article` → `CRAWL4AI_BASE_URL` → 이 서비스.

## 로컬 이미지 테스트

```bash
# 토큰은 환경변수로만
export CRAWL4AI_API_TOKEN="$(tr -d '[:space:]' < ~/Desktop/업무참고용/.secrets/crawl4ai_api_token)"
docker build -t findgagu-crawl4ai .
docker run --rm -p 11235:11235 --shm-size=1g -e CRAWL4AI_API_TOKEN "$CRAWL4AI_API_TOKEN" findgagu-crawl4ai
```

## Railway 배포 (요약)

1. 새 서비스 생성 (기존 shorts worker와 **분리**)
2. Root Directory: `crawl4ai`
3. Builder: Dockerfile
4. Variables: `CRAWL4AI_API_TOKEN=<secret>`
5. Public Networking: 컨테이너 포트 `11235`
6. 생성된 URL을 Vercel / 로컬 `.env`에:

```bash
CRAWL4AI_BASE_URL=https://<service>.up.railway.app
CRAWL4AI_API_TOKEN=<same-secret>
```

CLI 스크립트: `scripts/deploy-crawl4ai-railway.sh`

자세한 체크리스트: `docs/RAILWAY_CRAWL4AI_DEPLOY_CHECKLIST.md`
