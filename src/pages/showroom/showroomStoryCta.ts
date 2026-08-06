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

/** 학교·아파트: 상담(판매) 대신 내부 보고·행정 검토용 마이크로 커밋 CTA */
const SOFT_COMMIT_CONCERNS = new Set(['고교학점제 자습공간 구축', '아파트 독서실 리뉴얼'])

type ConcernStoryCtaConfig = {
  buttonLabel: string
  stickyShortLabel?: string
  inlineHint: string
  helperLine?: string
  trustLine?: string
  inlineTitle?: string
  inlineBody?: string
}

const CONCERN_STORY_CTA: Record<string, ConcernStoryCtaConfig> = {
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
    buttonLabel: '내부 보고용 학교 사례 정리 받기',
    stickyShortLabel: '행정 검토 자료 요청',
    inlineHint: '고교학점제 자습공간',
    helperLine: '교장·행정 보고에 쓰기 좋게, 유사 학교 사례와 체크포인트를 먼저 정리해 드립니다.',
    trustLine: '견적 상담 전 · 내부 검토용 자료',
    inlineTitle: '고교학점제 공간, 내부 보고용으로 먼저 정리할까요?',
    inlineBody: '입찰·회의 전에 쓸 유사 사례와 규격 체크포인트만 정리해 드립니다. 바로 업체를 정하는 단계가 아닙니다.',
  },
  '아파트 독서실 리뉴얼': {
    buttonLabel: '입대의 보고용 사례 요약 받기',
    stickyShortLabel: '보고용 요약 요청',
    inlineHint: '아파트 독서실 리뉴얼',
    helperLine: '입대의·주민 설명에 쓰기 좋게, 커뮤니티 리뉴얼 전후와 포인트를 요약해 드립니다.',
    trustLine: '상담 전 · 입대의 보고용 요약',
    inlineTitle: '입주민 설득용으로 사례를 먼저 정리할까요?',
    inlineBody: '단지 회의·입대의에 가져갈 전후 사례 요약을 드립니다. 지금 바로 시공을 결정하는 단계가 아닙니다.',
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
  const stickyShortLabel =
    config?.stickyShortLabel ??
    (buttonLabel.length > 22 ? '현장 맞춤 레이아웃 상담' : buttonLabel)

  return {
    concern: validConcern,
    buttonLabel,
    stickyShortLabel,
    helperLine:
      config?.helperLine ?? '고객님의 업종·평수·운영 방식에 맞는 최적 레이아웃을 제안합니다.',
    trustLine: config?.trustLine ?? '현장 맞춤 1차 레이아웃 · 채팅 상담',
    inlineTitle:
      config?.inlineTitle ??
      (validConcern
        ? `우리 ${config?.inlineHint ?? '공간'}에 맞는 최적 레이아웃, 가능할까요?`
        : `${siteLabel} 같은 공간, 우리 현장도 가능할까요?`),
    inlineBody:
      config?.inlineBody ??
      '평수·좌석 수·운영 방식만 알려주세요. 우리 현장 상황에 맞는 최적 배치를 제안합니다.',
  }
}

export function resolveShowroomConcernTag(concern: string | null | undefined): string | null {
  return normalizeConcernTag(concern)
}

export function isSoftCommitShowroomConcern(concern: string | null | undefined): boolean {
  const tag = resolveShowroomConcernTag(concern)
  return Boolean(tag && SOFT_COMMIT_CONCERNS.has(tag))
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
    return '/public/showroom'
  }
  return `/public/showroom?${new URLSearchParams({ concern: validConcern }).toString()}`
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
