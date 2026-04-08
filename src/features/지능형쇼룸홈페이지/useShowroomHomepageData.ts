import {
  buildShowroomFollowupSummary,
  resolveShowroomCaseProfile,
  type ShowroomCaseProfile,
} from '@/features/지능형쇼룸홈페이지/showroomCaseProfileService'
import { buildShowroomContextParams } from '@/features/지능형쇼룸홈페이지/showroomEngagementService'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'

export type ConcernId = 'all' | 'management' | 'renewal' | 'academy' | 'school'

export type ConcernCard = {
  id: ConcernId
  title: string
  summary: string
  industryKeywords: string[]
  category: string
}

export interface SiteGroup {
  key: string
  siteName: string
  location: string
  businessTypes: string[]
  products: string[]
  colors: string[]
  images: ShowroomImageAsset[]
  mainImage: ShowroomImageAsset | null
  hasBeforeAfter: boolean
  profile: ShowroomCaseProfile
}

export const CONCERN_CARDS: ConcernCard[] = [
  {
    id: 'all',
    title: '대표 사례 전체 보기',
    summary: '주력 현장을 중심으로 파인드가구의 결과물을 빠르게 확인합니다.',
    industryKeywords: [],
    category: '대표 사례',
  },
  {
    id: 'management',
    title: '관리형 창업 또는 전환',
    summary: '관리 동선과 좌석 운영이 중요한 공간을 우선 보여줍니다.',
    industryKeywords: ['관리형', '스터디카페'],
    category: '관리형 창업',
  },
  {
    id: 'renewal',
    title: '리뉴얼 설득 사례',
    summary: 'Before/After 또는 전환 포인트가 있는 사례를 우선 노출합니다.',
    industryKeywords: ['스터디카페', '아파트'],
    category: '리뉴얼 상담',
  },
  {
    id: 'academy',
    title: '학원 자습실 기획',
    summary: '학원 운영과 학습 몰입 관점에서 설명하기 좋은 사례를 모읍니다.',
    industryKeywords: ['학원'],
    category: '학원 자습실 문의',
  },
  {
    id: 'school',
    title: '학교 공간 구축',
    summary: '학교, 고교학점제, 공공성 있는 공간 사례를 우선 보여줍니다.',
    industryKeywords: ['학교'],
    category: '고교학점제 행정 상담',
  },
]

function sortDetailImages(images: ShowroomImageAsset[]): ShowroomImageAsset[] {
  return [...images].sort((a, b) => {
    const order = (role: ShowroomImageAsset['before_after_role']) => {
      if (role === 'before') return 0
      if (role === 'after') return 1
      return 2
    }
    const roleDiff = order(a.before_after_role) - order(b.before_after_role)
    if (roleDiff !== 0) return roleDiff
    if (a.is_main !== b.is_main) return a.is_main ? -1 : 1
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return aTime - bTime
  })
}

export function buildSiteGroups(assets: ShowroomImageAsset[]): SiteGroup[] {
  const bySite = new Map<string, ShowroomImageAsset[]>()
  for (const asset of assets) {
    const siteName = (asset.site_name ?? '').trim()
    if (!siteName) continue
    const list = bySite.get(siteName) ?? []
    list.push(asset)
    bySite.set(siteName, list)
  }

  return Array.from(bySite.entries())
    .map(([siteName, images]) => {
      const businessTypes = Array.from(new Set(images.map((image) => image.business_type?.trim()).filter(Boolean) as string[]))
      const products = Array.from(new Set(images.map((image) => image.product_name?.trim()).filter(Boolean) as string[]))
      const colors = Array.from(new Set(images.map((image) => image.color_name?.trim()).filter(Boolean) as string[]))
      const sortedImages = sortDetailImages(images)
      const mainImage = sortedImages.find((image) => image.before_after_role !== 'before') ?? sortedImages[0] ?? null
      const hasBefore = images.some((image) => image.before_after_role === 'before')
      const hasAfter = images.some((image) => image.before_after_role === 'after')
      const profile = resolveShowroomCaseProfile({
        siteName,
        businessTypes,
        products,
        hasBeforeAfter: hasBefore && hasAfter,
      })
      return {
        key: siteName,
        siteName,
        location: images[0]?.location?.trim() ?? '',
        businessTypes,
        products,
        colors,
        images: sortedImages,
        mainImage,
        hasBeforeAfter: hasBefore && hasAfter,
        profile,
      }
    })
    .sort((a, b) => {
      const scoreA = Number(a.hasBeforeAfter) * 100 + a.images.length
      const scoreB = Number(b.hasBeforeAfter) * 100 + b.images.length
      return scoreB - scoreA
    })
}

export function matchesConcern(group: SiteGroup, concern: ConcernCard): boolean {
  if (concern.id === 'all') return true
  const industryText = `${group.businessTypes.join(' ')} ${group.products.join(' ')}`.toLowerCase()
  return concern.industryKeywords.some((keyword) => industryText.includes(keyword.toLowerCase()))
}

export function buildConceptContactUrl(group: SiteGroup, concern: ConcernCard): string {
  const query = new URLSearchParams()
  query.set('site_name', group.siteName)
  query.set('category', concern.category)
  if (group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url) {
    query.set('image_url', group.mainImage?.thumbnail_url || group.mainImage?.cloudinary_url || '')
  }
  const followupSummary = buildShowroomFollowupSummary(group.siteName, group.profile)
  query.set('showroom_context', `${group.siteName} 사례와 비슷한 방향으로 상담을 요청합니다. ${followupSummary}`)
  query.set('showroom_entry_label', concern.title)
  buildShowroomContextParams({
    sourceSurface: 'homepage',
    siteName: group.siteName,
    followupSummary,
  }).forEach((value, key) => query.set(key, value))
  return `/contact?${query.toString()}`
}

export function buildCompactCaseLabel(siteName: string): string {
  const parts = siteName.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return parts.slice(-2).join(' ')
  }
  return siteName.trim()
}

export function buildSiteFactChips(group: SiteGroup): string[] {
  return [
    group.profile.seatCountBand,
    group.profile.areaPyeongBand,
    group.profile.budgetBand,
  ].filter(Boolean)
}
