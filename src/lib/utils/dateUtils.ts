/**
 * created_at 기준 경과일·골든타임 단계 계산 (BLUEPRINT 30일 골든타임 관리)
 * D+0~7 초긴급, D+8~20 진행중, D+21~30 마감임박, D+27 시 담당자 알림 트리거용
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000
export const GOLDEN_TIME_DAYS = 30
/** 종료 3일 전 = D+27, 담당자 알림 트리거 시점 */
export const GOLDEN_TIME_DEADLINE_SOON_DAYS = 27

/**
 * 기준일(또는 오늘)로부터 created_at까지 경과한 일수 (소수점 버림)
 */
export function getElapsedDays(createdAt: string | Date, refDate?: Date): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt).getTime() : createdAt.getTime()
  const ref = refDate ? refDate.getTime() : Date.now()
  return Math.floor((ref - created) / MS_PER_DAY)
}

export type GoldenTimeTier = 'urgent' | 'progress' | 'deadline' | null

export interface GoldenTimeState {
  /** 경과 일수 (D+n) */
  elapsedDays: number
  /** D+0~7 urgent, D+8~20 progress, D+21~30 deadline, 30일 초과 시 null */
  tier: GoldenTimeTier
  /** 30일 이내 여부 (기존 isGoldenTime 호환) */
  isGoldenTime: boolean
  /** D+27 여부 — 종료 3일 전, 담당자 알림 트리거용 (BLUEPRINT) */
  isDeadlineSoon: boolean
}

/**
 * created_at 기준 골든타임 단계 반환
 * - D+0~7: 초긴급 (urgent)
 * - D+8~20: 진행중 (progress)
 * - D+21~30: 마감임박 (deadline)
 * - 30일 초과: tier null, isGoldenTime false
 * - D+27: isDeadlineSoon true (알림 트리거용)
 */
export function getGoldenTimeState(createdAt: string | Date, refDate?: Date): GoldenTimeState {
  const elapsedDays = getElapsedDays(createdAt, refDate)
  const isGoldenTime = elapsedDays <= GOLDEN_TIME_DAYS
  let tier: GoldenTimeTier = null
  if (elapsedDays <= 7) tier = 'urgent'
  else if (elapsedDays <= 20) tier = 'progress'
  else if (elapsedDays <= 30) tier = 'deadline'

  const isDeadlineSoon = elapsedDays === GOLDEN_TIME_DEADLINE_SOON_DAYS

  return { elapsedDays, tier, isGoldenTime, isDeadlineSoon }
}
