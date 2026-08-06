#!/usr/bin/env bash
# Crawl4AI Railway 배포 헬퍼 (FG 트랙)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/crawl4ai"

if command -v track-auto >/dev/null 2>&1; then
  track-auto ensure "$ROOT" || true
fi

TOKEN_FILE="${CRAWL4AI_TOKEN_FILE:-$HOME/Desktop/업무참고용/.secrets/crawl4ai_api_token}"
if [[ -z "${CRAWL4AI_API_TOKEN:-}" && -f "$TOKEN_FILE" ]]; then
  CRAWL4AI_API_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export CRAWL4AI_API_TOKEN
fi
if [[ -z "${CRAWL4AI_API_TOKEN:-}" ]]; then
  echo "CRAWL4AI_API_TOKEN 이 필요합니다." >&2
  exit 1
fi

RAILWAY=(npx -y @railway/cli)

echo "==> Railway 로그인 상태"
"${RAILWAY[@]}" whoami

if [[ ! -f "$ROOT/crawl4ai/.railway/config.json" && ! -f "$ROOT/.railway/config.json" ]]; then
  echo "Railway 프로젝트가 링크되어 있지 않습니다."
  echo "대화형으로 링크하려면:"
  echo "  cd crawl4ai && npx -y @railway/cli link"
  echo "또는 대시보드에서 서비스 생성 후 Root Directory=crawl4ai 로 연결하세요."
  exit 2
fi

echo "==> 환경변수 설정 (CRAWL4AI_API_TOKEN)"
"${RAILWAY[@]}" variables set "CRAWL4AI_API_TOKEN=$CRAWL4AI_API_TOKEN"

echo "==> 배포"
"${RAILWAY[@]}" up --detach

echo "==> 도메인"
"${RAILWAY[@]}" domain || true
"${RAILWAY[@]}" status || true

echo "완료 후 Vercel에 CRAWL4AI_BASE_URL / CRAWL4AI_API_TOKEN 을 넣고 재배포하세요."
echo "체크리스트: docs/RAILWAY_CRAWL4AI_DEPLOY_CHECKLIST.md"
