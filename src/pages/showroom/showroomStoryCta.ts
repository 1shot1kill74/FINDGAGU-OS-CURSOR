import { toast } from 'sonner'
import { openPublicShowroomChannelTalk } from '@/lib/channelTalkWeb'
import {
  trackShowroomAbmConsultationClick,
  type ShowroomAbmConsultationSurface,
} from '@/lib/showroomAbmTracking'
import { normalizeConcernTag } from '@/pages/showroom/showroomPageGrouping'

const CONSULTATION_OPEN_ERROR = '상담 창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'

export type ShowroomConsultationTrackContext = {
  surface: ShowroomAbmConsultationSurface
  concern?: string | null
  siteName?: string | null
}

export function openShowroomConsultationChat(track?: ShowroomConsultationTrackContext): boolean {
  if (track) {
    trackShowroomAbmConsultationClick(track)
  }
  if (openPublicShowroomChannelTalk()) return true
  toast.error(CONSULTATION_OPEN_ERROR)
  return false
}

const CONCERN_STORY_CTA: Record<string, { buttonLabel: string; inlineHint: string }> = {
  '관리형 창업 또는 전환': {
    buttonLabel: '관리형 맞춤 레이아웃 상담하기',
    inlineHint: '관리형·러셀형 레이아웃',
  },
  '매출 향상 스터디카페 리뉴얼': {
    buttonLabel: '스터디카페 리뉴얼 맞춤형 상담하기',
    inlineHint: '스터디카페 리뉴얼',
  },
  '스터디카페를 관리형으로 전환': {
    buttonLabel: '스터디카페를 관리형으로 전환 상담하기',
    inlineHint: '관리형 전환',
  },
  '스터디카페 같은 학원 자습실': {
    buttonLabel: '우리 학원 맞춤형 자습실 상담하기',
    inlineHint: '학원 자습실',
  },
  '고교학점제 자습공간 구축': {
    buttonLabel: '우리 학교 맞춤형 제안서 및 견적 상담하기',
    inlineHint: '고교학점제 자습공간',
  },
  '아파트 독서실 리뉴얼': {
    buttonLabel: '우리 아파트 맞춤형 리뉴얼 제안서 요청하기',
    inlineHint: '아파트 독서실 리뉴얼',
  },
}

function trimSiteLabel(value: string | null | undefined, maxLength = 16): string {
  const trimmed = value?.trim() ?? ''
  if (!trimmed) return '이 현장'
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength)}…`
}

export function resolveShowroomCaseConsultationCopy(input: {
  concern?: string | null
  siteDisplayName?: string | null
}): {
  concern: string | null
  buttonLabel: string
  stickyShortLabel: string
  helperLine: string
  trustLine: string
  inlineTitle: string
  inlineBody: string
} {
  const validConcern = resolveShowroomConcernTag(input.concern)
  const config = validConcern ? CONCERN_STORY_CTA[validConcern] : null
  const siteLabel = trimSiteLabel(input.siteDisplayName)
  const buttonLabel = config?.buttonLabel ?? `${siteLabel} 같은 공간 1차 상담`
  const stickyShortLabel = buttonLabel.length > 22 ? '1차 상담 받기' : buttonLabel
  const topicHint = config?.inlineHint ?? '비슷한 공간 레이아웃'

  return {
    concern: validConcern,
    buttonLabel,
    stickyShortLabel,
    helperLine: `${siteLabel} 사례를 참고해 ${topicHint} 방향을 채팅으로 안내드립니다.`,
    trustLine: '전화 영업 없음 · 1차 방향·레이아웃 제안',
    inlineTitle: validConcern
      ? `우리 공간도 ${config?.inlineHint ?? '이런 방향'}으로 가능할까요?`
      : `${siteLabel} 같은 공간, 우리 현장도 가능할까요?`,
    inlineBody: '현장 사진·평수·좌석 수만 알려주세요. 견적 강요 없이 채팅으로 1차 방향을 드립니다.',
  }
}

export function resolveShowroomConcernTag(concern: string | null | undefined): string | null {
  return normalizeConcernTag(concern)
}

export function resolveShowroomStoryCta(concern: string | null | undefined): {
  concern: string | null
  buttonLabel: string
} {
  const copy = resolveShowroomCaseConsultationCopy({ concern })
  return {
    concern: copy.concern,
    buttonLabel: copy.buttonLabel,
  }
}


export function buildShowroomStoryBackHref(concern: string | null | undefined): string {
  const validConcern = resolveShowroomConcernTag(concern)
  if (!validConcern) {
    return '/public/showroom#showroom-concern-heading'
  }
  return `/public/showroom?${new URLSearchParams({ concern: validConcern }).toString()}#showroom-concern-heading`
}

export function appendShowroomConcernQuery(path: string, concern: string | null | undefined): string {
  const validConcern = resolveShowroomConcernTag(concern)
  if (!validConcern) return path

  const hashIndex = path.indexOf('#')
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : ''
  const base = hashIndex >= 0 ? path.slice(0, hashIndex) : path
  const queryIndex = base.indexOf('?')
  const pathname = queryIndex >= 0 ? base.slice(0, queryIndex) : base
  const existingQuery = queryIndex >= 0 ? base.slice(queryIndex + 1) : ''
  const params = new URLSearchParams(existingQuery)
  params.set('concern', validConcern)
  return `${pathname}?${params.toString()}${hash}`
}
