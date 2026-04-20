/**
 * Vercel Deploy Hook 트리거.
 *
 * 사용 시나리오:
 * - 블로그 정본 승인(approve), 공개 카드뉴스 발행 등 “공개 페이지 목록/내용이 변하는 액션” 직후
 *   이 함수를 호출하면, Vercel에서 새 빌드가 돌면서 prerender/sitemap이 최신화된다.
 *
 * 환경 변수(런타임에 클라이언트로 주입):
 * - VITE_VERCEL_DEPLOY_HOOK_URL  (필수, 빈 값이면 no-op)
 *
 * 동작:
 * - 같은 탭에서 30초 내 중복 호출은 디바운스되어 1회만 실제 호출된다.
 * - 호출 실패해도 사용자 액션은 막지 않는다 (로그만 남김).
 * - 한 번의 액션 직후 보통 한 번만 호출된다는 가정. (여러 탭에서 동시 발행은 드물다)
 */

const HOOK_URL = (import.meta.env.VITE_VERCEL_DEPLOY_HOOK_URL ?? '').toString().trim()
const DEBOUNCE_MS = 30_000

let pendingTimer: ReturnType<typeof setTimeout> | null = null
let lastQueuedReason = ''
let lastFiredAt = 0

function fireOnce(reason: string): void {
  if (!HOOK_URL) return
  const now = Date.now()
  lastFiredAt = now
  // fire-and-forget. mode: 'no-cors' 로 응답을 보지 않고 호출만 한다.
  // (Vercel deploy hook은 단순 GET/POST 호출이면 새 빌드를 트리거)
  void fetch(HOOK_URL, { method: 'POST', mode: 'no-cors', keepalive: true })
    .then(() => {
      console.info(`[deployHook] triggered (${reason})`)
    })
    .catch((err) => {
      console.warn('[deployHook] fetch failed (무시됨, 사용자 액션엔 영향 없음):', err)
    })
}

/**
 * 디바운스된 deploy hook 트리거.
 *
 * - reason: 디버그 로그용 (예: "blog-approved:siteName")
 * - 같은 30초 윈도우 안에 여러 번 호출되어도 1회만 실제 호출된다.
 * - HOOK_URL 이 비어있으면 조용히 무시한다 (로컬 개발용 안전장치).
 */
export function requestDeployHookTrigger(reason: string): void {
  if (!HOOK_URL) {
    console.debug(`[deployHook] VITE_VERCEL_DEPLOY_HOOK_URL 미설정 → 스킵 (${reason})`)
    return
  }
  lastQueuedReason = reason
  if (pendingTimer) {
    return
  }
  pendingTimer = setTimeout(() => {
    pendingTimer = null
    const reasonNow = lastQueuedReason
    fireOnce(reasonNow)
  }, DEBOUNCE_MS)
}

/**
 * 마지막 호출 시각 (디버그용).
 */
export function getLastDeployHookFiredAt(): number {
  return lastFiredAt
}
