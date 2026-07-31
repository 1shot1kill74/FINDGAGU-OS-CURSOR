#!/usr/bin/env bash
# Crawl4AI 로컬 기동 (MCP + REST :11235)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 꺼져 있습니다. Docker Desktop을 켠 뒤 다시 실행하세요."
  open -a Docker || true
  exit 1
fi

TOKEN_FILE="${CRAWL4AI_TOKEN_FILE:-$HOME/Desktop/업무참고용/.secrets/crawl4ai_api_token}"
if [[ -z "${CRAWL4AI_API_TOKEN:-}" && -f "$TOKEN_FILE" ]]; then
  export CRAWL4AI_API_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi

docker compose -f docker-compose.crawl4ai.yml up -d
echo "Crawl4AI: http://127.0.0.1:11235"
echo "MCP SSE : http://127.0.0.1:11235/mcp/sse"
