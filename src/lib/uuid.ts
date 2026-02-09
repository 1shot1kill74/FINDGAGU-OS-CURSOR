/**
 * UUID 유효성 검사 및 FK 삽입 시 null 보정
 * - Postgres uuid 타입/ FK 컬럼에 넣기 전에 사용
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 표준 UUID 형식(8-4-4-4-12 hex)인지 검사
 */
export function isValidUUID(value: string | null | undefined): boolean {
  if (value == null || typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length > 0 && UUID_REGEX.test(trimmed)
}

/**
 * FK 컬럼에 넣을 때: 유효한 UUID면 그대로, 아니면 null 반환
 */
export function ensureUUIDOrNull(value: string | null | undefined): string | null {
  return isValidUUID(value) ? (value as string).trim() : null
}
