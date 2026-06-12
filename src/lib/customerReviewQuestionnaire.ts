export type CustomerReviewQuestion = {
  id: 'worry_before' | 'change_after' | 'recommend_line'
  label: string
  placeholder: string
  required: boolean
  maxLength: number
}

export const CUSTOMER_REVIEW_QUESTIONS: CustomerReviewQuestion[] = [
  {
    id: 'worry_before',
    label: '시공 전, 가장 걱정했던 점',
    placeholder: '예: 좁은 공간에서 좌석 수를 유지할 수 있을지 걱정됐습니다.',
    required: true,
    maxLength: 120,
  },
  {
    id: 'change_after',
    label: '시공 후, 가장 달라진 점',
    placeholder: '예: 동선이 정리되고 첫인상이 훨씬 관리형답게 바뀌었습니다.',
    required: true,
    maxLength: 120,
  },
  {
    id: 'recommend_line',
    label: '비슷한 업종 원장님께 한 마디',
    placeholder: '예: 상담 때 레이아웃까지 같이 봐주셔서 결정하기 수월했습니다. (선택)',
    required: false,
    maxLength: 120,
  },
]

export const CUSTOMER_REVIEW_CONSENT_TEXT =
  '익명 또는 지역·상호 일부 마스킹 후 마케팅·시공사례 페이지에 사용해도 됩니다.'

export function buildManualKakaoReviewMessage(params: {
  customerName?: string | null
  siteName?: string | null
  reviewUrl: string
}): string {
  const name = params.customerName?.trim() || '원장님'
  const site = params.siteName?.trim()
  const siteLine = site ? `\n(${site} 시공 건 기준)` : ''

  return [
    `${name}, 안녕하세요. 파인드가구입니다.`,
    `시공 후 공간은 잘 쓰고 계신가요?${siteLine}`,
    '',
    '다른 원장님들께 도움이 될 수 있도록',
    '한 줄 후기만 부탁드립니다. (약 1분)',
    '',
    `👉 ${params.reviewUrl}`,
    '',
    '바쁘시면 아래 3가지만 카톡으로 답 주셔도 됩니다.',
    '1) 시공 전 걱정',
    '2) 시공 후 달라진 점',
    '3) 비슷한 업종 원장님께 한 마디 (선택)',
  ].join('\n')
}

export function buildFollowUpKakaoReviewMessage(params: {
  customerName?: string | null
  reviewUrl: string
}): string {
  const name = params.customerName?.trim() || '원장님'
  return [
    `${name}, 혹시 바쁘셨을까요?`,
    '후기는 짧게 한 줄만 적어주셔도 큰 도움이 됩니다.',
    '',
    `👉 ${params.reviewUrl}`,
  ].join('\n')
}

export function buildThankYouKakaoReviewMessage(params: {
  customerName?: string | null
}): string {
  const name = params.customerName?.trim() || '원장님'
  return [
    `${name}, 소중한 후기 감사합니다.`,
    '확인 후 사례 자료에 반영할 수 있도록 검토하겠습니다.',
    '좋은 공간 운영 응원드립니다.',
  ].join('\n')
}
