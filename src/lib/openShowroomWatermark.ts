import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'

export type OpenShowroomWatermarkVariant = 'thumb' | 'full'
export type OpenShowroomWatermarkStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export const OPEN_SHOWROOM_WATERMARK_VERSION = 1

function normalizeSpace(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

function toBroadRegion(location: string | null | undefined): string {
  const normalized = normalizeSpace(location)
  if (!normalized) return ''

  const firstToken = normalized.split(' ')[0] ?? ''
  const map: Record<string, string> = {
    서울: '서울권',
    경기: '경기권',
    인천: '경기권',
    부산: '부산권',
    대구: '대구권',
    광주: '광주권',
    대전: '대전권',
    울산: '울산권',
    세종: '충청권',
    강원: '강원권',
    충북: '충청권',
    충남: '충청권',
    전북: '전북권',
    전남: '전남권',
    경북: '경북권',
    경남: '경남권',
    제주: '제주권',
  }

  return map[firstToken] ?? firstToken
}

function toMonthCode(createdAt: string | null | undefined): string {
  const normalized = normalizeSpace(createdAt)
  if (!normalized) return ''

  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${String(parsed.getFullYear()).slice(-2)}${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

function encodeCloudinaryText(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '%20')
}

export function buildOpenShowroomDisplayName(params: {
  siteName?: string | null
  externalDisplayName?: string | null
  broadExternalDisplayName?: string | null
  location?: string | null
  businessType?: string | null
  createdAt?: string | null
}): string {
  const broadExternalDisplayName = normalizeSpace(params.broadExternalDisplayName)
  if (broadExternalDisplayName) return broadExternalDisplayName

  const externalDisplayName = normalizeSpace(params.externalDisplayName)
  if (externalDisplayName) {
    return broadenPublicDisplayName(externalDisplayName) ?? externalDisplayName
  }

  const siteName = normalizeSpace(params.siteName)
  if (siteName) {
    return broadenPublicDisplayName(siteName) ?? siteName
  }

  const monthCode = toMonthCode(params.createdAt)
  const broadRegion = toBroadRegion(params.location)
  const businessType = normalizeSpace(params.businessType) || '기타'

  return [monthCode, broadRegion, businessType].filter(Boolean).join(' ').trim() || '시공 사례'
}

export function buildOpenShowroomWatermarkTransformation(
  displayName: string,
  variant: OpenShowroomWatermarkVariant
): string {
  const repeatedText = encodeCloudinaryText('FINDGAGU OPEN SHOWROOM')
  const footerText = encodeCloudinaryText(`파인드가구 오픈쇼룸 | 무단 재사용·재배포 금지 | ${displayName}`)
  const brandFont = variant === 'thumb' ? '28' : '42'
  const footerFont = variant === 'thumb' ? '20' : '28'
  const quality = variant === 'thumb' ? 'q_auto:good' : 'q_auto'

  return [
    `l_text:Arial_${brandFont}_bold:${repeatedText},co_white,o_18,g_center`,
    `l_text:Arial_${footerFont}_bold:${footerText},co_white,o_88,g_south,y_20`,
    `${quality},f_jpg`,
  ].join('/')
}

export function buildOpenShowroomWatermarkedUrl(
  sourceUrl: string | null | undefined,
  displayName: string,
  variant: OpenShowroomWatermarkVariant
): string | null {
  const normalizedUrl = normalizeSpace(sourceUrl)
  if (!normalizedUrl.includes('/image/upload/')) return null

  const transformation = buildOpenShowroomWatermarkTransformation(displayName, variant)
  return normalizedUrl.replace('/image/upload/', `/image/upload/${ transformation }/`)
}

export function buildOpenShowroomWatermarkedUrls(params: {
  sourceUrl: string | null | undefined
  thumbnailUrl?: string | null | undefined
  displayName: string
}): {
  fullUrl: string | null
  thumbnailUrl: string | null
  status: OpenShowroomWatermarkStatus
  version: number
} {
  const fullUrl = buildOpenShowroomWatermarkedUrl(params.sourceUrl, params.displayName, 'full')
  const thumbnailUrl = buildOpenShowroomWatermarkedUrl(
    params.thumbnailUrl ?? params.sourceUrl,
    params.displayName,
    'thumb'
  )

  return {
    fullUrl,
    thumbnailUrl,
    status: fullUrl && thumbnailUrl ? 'ready' : 'failed',
    version: OPEN_SHOWROOM_WATERMARK_VERSION,
  }
}
