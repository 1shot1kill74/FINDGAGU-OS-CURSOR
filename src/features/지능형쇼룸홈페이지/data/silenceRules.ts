export const SHOWROOM_SILENCE_RULES = {
  minQuietMinutesAfterLastBehavior: 10,
  minQuietMinutesAfterWeakSignal: 30,
  cooldownHoursAfterFollowup: 24,
  minimumSignalsBeforeProactiveFollowup: 2,
  description: [
    '단일 클릭 한 번만으로는 후속 메시지를 보내지 않는다.',
    '마지막 행동 직후에는 충분한 침묵 시간이 지나기 전까지 먼저 말 걸지 않는다.',
    '최근에 이미 후속 메시지를 보냈다면 24시간 동안 추가 발화를 멈춘다.',
    '관심 신호는 반복 조회, 상세 진입, Before/After 확인처럼 복합 행동으로 판단한다.',
  ],
} as const

export type ShowroomSilenceRules = typeof SHOWROOM_SILENCE_RULES
