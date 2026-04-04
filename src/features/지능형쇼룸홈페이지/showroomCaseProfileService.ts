import {
  INDUSTRY_PRESETS,
  SITE_OVERRIDES,
  type ShowroomCaseProfile,
} from '@/features/지능형쇼룸홈페이지/data/caseProfiles'

function normalizeIndustryLabel(businessTypes: string[]): string {
  const joined = businessTypes.join(' ').toLowerCase()
  if (joined.includes('관리형')) return '관리형'
  if (joined.includes('학원')) return '학원'
  if (joined.includes('스터디카페') || joined.includes('독서실')) return '스터디카페'
  if (joined.includes('학교') || joined.includes('고교학점제')) return '학교'
  if (joined.includes('아파트') || joined.includes('커뮤니티')) return '아파트'
  return '기타'
}

export type { ShowroomCaseProfile }

export function resolveShowroomCaseProfile(params: {
  siteName: string
  businessTypes: string[]
  products: string[]
  hasBeforeAfter: boolean
}): ShowroomCaseProfile {
  const industry = normalizeIndustryLabel(params.businessTypes)
  const base = INDUSTRY_PRESETS[industry] ?? INDUSTRY_PRESETS.기타
  const override = SITE_OVERRIDES[params.siteName] ?? {}
  const leadProduct = params.products[0]?.trim()
  const beforeAfterLine = params.hasBeforeAfter
    ? '전후 비교가 가능해 변화 논리를 설명하기 좋습니다.'
    : '대표 결과 위주로 공간 분위기를 빠르게 이해하기 좋습니다.'

  return {
    seatCountBand: override.seatCountBand ?? base.seatCountBand,
    seatCountNote: override.seatCountNote ?? base.seatCountNote,
    areaPyeongBand: override.areaPyeongBand ?? base.areaPyeongBand,
    budgetBand: override.budgetBand ?? base.budgetBand,
    painPoint: override.painPoint ?? base.painPoint,
    solutionPoint: override.solutionPoint ?? base.solutionPoint,
    operatorReview: override.operatorReview ?? base.operatorReview,
    recommendedFor: override.recommendedFor ?? base.recommendedFor,
    channelFollowupSummary:
      override.channelFollowupSummary ??
      `${params.siteName} 사례는 ${base.seatCountBand} 규모에서 자주 참고하는 유형입니다. ${beforeAfterLine}`,
    channelFollowupPrompt:
      override.channelFollowupPrompt ??
      `${params.siteName}${leadProduct ? `의 ${leadProduct}` : ''} 구성이 비슷한 방향인지 답장 주시면 좌석 수, 예산대, 변화 포인트를 이어서 설명드리겠습니다.`,
  }
}

export function buildShowroomFollowupSummary(siteName: string, profile: ShowroomCaseProfile): string {
  return `${siteName} 사례 기준으로는 ${profile.seatCountBand}, ${profile.areaPyeongBand}, ${profile.budgetBand} 정도에서 많이 검토합니다. ${profile.solutionPoint}`
}
