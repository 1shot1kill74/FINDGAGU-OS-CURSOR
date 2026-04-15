/**
 * 쇼룸 공유·공유 갤러리 등에서 쓰는 긴 랜덤 토큰 (중복 시 재시도).
 */
export function createShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}
