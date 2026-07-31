#!/usr/bin/env bash
# Crawl4AI → Cursor MCP stdio bridge.
# Native Docker SSE (/mcp/sse) often hangs in Cursor discovery; this uses REST via npm bridge.
set -euo pipefail

ENDPOINT="${CRAWL4AI_BASE_URL:-http://127.0.0.1:11235}"
TOKEN_FILE="${CRAWL4AI_TOKEN_FILE:-$HOME/Desktop/업무참고용/.secrets/crawl4ai_api_token}"

if [[ -z "${CRAWL4AI_API_TOKEN:-}" && -f "$TOKEN_FILE" ]]; then
  CRAWL4AI_API_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  export CRAWL4AI_API_TOKEN
fi

if [[ -z "${CRAWL4AI_API_TOKEN:-}" ]]; then
  echo "CRAWL4AI_API_TOKEN missing (set env or $TOKEN_FILE)" >&2
  exit 1
fi

# Health gate: fail fast if Docker container is down
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$ENDPOINT/health" || true)"
if [[ "$code" != "200" ]]; then
  # /health may require auth on some builds; also accept 401 as "up"
  code2="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$ENDPOINT/" || true)"
  if [[ "$code2" != "200" && "$code2" != "401" && "$code2" != "307" ]]; then
    echo "Crawl4AI not reachable at $ENDPOINT (start: scripts/start-crawl4ai.sh)" >&2
    exit 1
  fi
fi

exec npx -y -p crawl4ai-mcp-sse-stdio crawl4ai-mcp \
  --stdio \
  --endpoint "$ENDPOINT" \
  --bearer-token "$CRAWL4AI_API_TOKEN"
