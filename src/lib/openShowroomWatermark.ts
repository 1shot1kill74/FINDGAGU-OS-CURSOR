import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'

export type OpenShowroomWatermarkVariant = 'thumb' | 'full'
export type OpenShowroomWatermarkStatus = 'pending' | 'ready' | 'failed' | 'skipped'

export const OPEN_SHOWROOM_WATERMARK_VERSION = 2

function normalizeSpace(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

/** Cloudinary text overlay는 `/` 를 경로 구분자로 해석해 400이 난다. */
export function sanitizeOpenShowroomWatermarkLabel(displayName: string): string {
  return normalizeSpace(displayName)
    .replace(/[/\\]/g, '·')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 이미 transform이 끼어 있거나 version이 빠진 thumb URL은 워터마크 소스로 쓰지 않는다. */
function pickWatermarkSourceUrl(
  sourceUrl: string | null | undefined,
  thumbnailUrl?: string | null | undefined,
): string | null {
  const source = normalizeSpace(sourceUrl)
  if (source.includes('/image/upload/') && /\/v\d+\//.test(source)) return source

  const thumb = normalizeSpace(thumbnailUrl)
  if (thumb.includes('/image/upload/') && /\/v\d+\//.test(thumb)) return thumb

  if (source.includes('/image/upload/')) return source
  if (thumb.includes('/image/upload/')) return thumb
  return null
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
  const safeDisplayName = sanitizeOpenShowroomWatermarkLabel(displayName)
  const repeatedText = encodeCloudinaryText('FINDGAGU OPEN SHOWROOM')
  const footerText = encodeCloudinaryText(`파인드가구 오픈쇼룸 | 무단 재사용·재배포 금지 | ${safeDisplayName}`)
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
  // thumb에 이미 붙은 c_limit 변환을 다시 감싸면 version이 빠지며 404가 난다.
  const source = pickWatermarkSourceUrl(params.sourceUrl, params.thumbnailUrl)
  const fullUrl = buildOpenShowroomWatermarkedUrl(source, params.displayName, 'full')
  const thumbnailUrl = buildOpenShowroomWatermarkedUrl(source, params.displayName, 'thumb')

  return {
    fullUrl,
    thumbnailUrl,
    status: fullUrl && thumbnailUrl ? 'ready' : 'failed',
    version: OPEN_SHOWROOM_WATERMARK_VERSION,
  }
}

/** image_assets 공개 워터마크 컬럼 패치 (승격·백필 공용) */
export function buildOpenShowroomWatermarkDbFields(params: {
  sourceUrl: string | null | undefined
  thumbnailUrl?: string | null | undefined
  siteName?: string | null
  externalDisplayName?: string | null
  broadExternalDisplayName?: string | null
  location?: string | null
  businessType?: string | null
  createdAt?: string | null
}): {
  public_watermarked_url: string | null
  public_watermarked_thumbnail_url: string | null
  public_watermark_status: OpenShowroomWatermarkStatus
  public_watermark_version: number
  public_watermark_updated_at: string
} {
  const displayName = buildOpenShowroomDisplayName({
    siteName: params.siteName,
    externalDisplayName: params.externalDisplayName,
    broadExternalDisplayName: params.broadExternalDisplayName,
    location: params.location,
    businessType: params.businessType,
    createdAt: params.createdAt,
  })
  const watermark = buildOpenShowroomWatermarkedUrls({
    sourceUrl: params.sourceUrl,
    thumbnailUrl: params.thumbnailUrl,
    displayName,
  })
  const updatedAt = new Date().toISOString()

  if (!watermark.fullUrl || !watermark.thumbnailUrl) {
    return {
      public_watermarked_url: null,
      public_watermarked_thumbnail_url: null,
      public_watermark_status: 'failed',
      public_watermark_version: OPEN_SHOWROOM_WATERMARK_VERSION,
      public_watermark_updated_at: updatedAt,
    }
  }

  return {
    public_watermarked_url: watermark.fullUrl,
    public_watermarked_thumbnail_url: watermark.thumbnailUrl,
    public_watermark_status: 'ready',
    public_watermark_version: OPEN_SHOWROOM_WATERMARK_VERSION,
    public_watermark_updated_at: updatedAt,
  }
}
