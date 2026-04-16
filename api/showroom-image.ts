import { createClient } from '@supabase/supabase-js'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 120
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

type AssetRow = {
  id: string
  cloudinary_url: string | null
  thumbnail_url: string | null
  site_name: string | null
  location: string | null
  business_type: string | null
  created_at: string | null
  public_watermark_status?: string | null
}

type RequestLike = {
  method?: string
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
  socket: { remoteAddress?: string | undefined }
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { send(body: string | Buffer): void }
}

function getSupabasePublicClient() {
  const url = process.env.VITE_SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase public credentials are not configured.')
  }
  return createClient(url, anonKey, { auth: { persistSession: false } })
}

function normalizeSpace(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

function pickWatermarkCode(siteName: string | null) {
  const normalized = normalizeSpace(siteName)
  if (!normalized) return null
  const match = normalized.match(/([A-Z]?\d{4})$/i)
  return match?.[1] ? match[1].toUpperCase() : null
}

function toBroadRegion(location: string | null) {
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

function broadenPublicDisplayName(siteName: string | null) {
  const normalized = normalizeSpace(siteName)
  if (!normalized) return null
  const parts = normalized.split(' ')
  if (parts.length < 3) return normalized
  const hasMonthPrefix = /^\d{4}$/.test(parts[0] ?? '')
  const regionIndex = hasMonthPrefix ? 1 : 0
  const regionToken = parts[regionIndex] ?? ''
  const cityToken = parts[regionIndex + 1] ?? ''
  const broadRegion = toBroadRegion(`${regionToken} ${cityToken}`)
  const shouldReplaceRegion = /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)$/.test(regionToken)
  if (!shouldReplaceRegion) return normalized
  return [hasMonthPrefix ? parts[0] : null, broadRegion, ...parts.slice(regionIndex + 2)]
    .filter(Boolean)
    .join(' ')
}

function toMonthCode(createdAt: string | null) {
  if (!createdAt) return ''
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${String(parsed.getFullYear()).slice(-2)}${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

function buildDisplayName(row: AssetRow) {
  const publicName = broadenPublicDisplayName(row.site_name)
  const code = pickWatermarkCode(publicName)
  const monthCode = toMonthCode(row.created_at)
  const region = toBroadRegion(row.location)
  const businessType = normalizeSpace(row.business_type) || '기타'
  return publicName || [monthCode, region, businessType, code].filter(Boolean).join(' ').trim() || '시공 사례'
}

function getClientIp(req: RequestLike) {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket.remoteAddress ?? 'unknown'
}

function checkRateLimit(ip: string) {
  const now = Date.now()
  const current = rateLimitStore.get(ip)
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { limited: false, remaining: RATE_LIMIT_MAX_REQUESTS - 1 }
  }
  current.count += 1
  rateLimitStore.set(ip, current)
  return {
    limited: current.count > RATE_LIMIT_MAX_REQUESTS,
    remaining: Math.max(0, RATE_LIMIT_MAX_REQUESTS - current.count),
  }
}

async function fetchAssetRow(assetId: string): Promise<AssetRow | null> {
  const supabase = getSupabasePublicClient()
  const { data, error } = await (supabase as any)
    .rpc('get_public_showroom_assets')
    .eq('id', assetId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }
  return (data as AssetRow | null) ?? null
}

async function fetchRemoteImage(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'findgagu-open-showroom-image-proxy/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch source image: ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

function sanitizeDownloadName(value: string) {
  return value
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .slice(0, 80) || 'showroom-case'
}

function encodeCloudinaryText(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '%20')
}

function buildCloudinaryWatermarkedUrl(sourceUrl: string, displayName: string, variant: 'thumb' | 'full') {
  const repeatedText = encodeCloudinaryText('FINDGAGU OPEN SHOWROOM')
  const footerText = encodeCloudinaryText(`파인드가구 오픈쇼룸 | 무단 재사용·재배포 금지 | ${displayName}`)
  const brandFont = variant === 'thumb' ? '28' : '42'
  const footerFont = variant === 'thumb' ? '20' : '28'
  const quality = variant === 'thumb' ? 'q_auto:good' : 'q_auto'
  const watermarkTransforms = [
    `l_text:Arial_${brandFont}_bold:${repeatedText},co_white,o_18,g_center`,
    `l_text:Arial_${footerFont}_bold:${footerText},co_white,o_88,g_south,y_20`,
    `${quality},f_jpg`,
  ].join('/')

  return sourceUrl.replace('/image/upload/', `/image/upload/${watermarkTransforms}/`)
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      res.status(405).send('Method Not Allowed')
      return
    }

    const ip = getClientIp(req)
    const rate = checkRateLimit(ip)
    res.setHeader('X-RateLimit-Remaining', String(rate.remaining))
    if (rate.limited) {
      res.status(429).send('Too Many Requests')
      return
    }

    const assetId = typeof req.query.id === 'string' ? req.query.id.trim() : ''
    const variant = req.query.variant === 'full' ? 'full' : 'thumb'
    if (!assetId) {
      res.status(400).send('Missing asset id')
      return
    }

    const row = await fetchAssetRow(assetId)
    if (!row) {
      res.status(404).send('Asset not found')
      return
    }

    const sourceUrl = variant === 'full'
      ? normalizeSpace(row.cloudinary_url) || normalizeSpace(row.thumbnail_url)
      : normalizeSpace(row.thumbnail_url) || normalizeSpace(row.cloudinary_url)

    if (!sourceUrl) {
      res.status(404).send('Source image not available')
      return
    }

    const displayName = buildDisplayName(row)
    const watermarkedUrl = row.public_watermark_status === 'ready'
      ? sourceUrl
      : buildCloudinaryWatermarkedUrl(sourceUrl, displayName, variant)
    const watermarked = await fetchRemoteImage(watermarkedUrl)
    const filename = sanitizeDownloadName(displayName)

    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600')
    res.setHeader('Content-Disposition', `inline; filename="${filename}.jpg"`)
    res.status(200).send(watermarked)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected proxy error'
    res.status(500).send(message)
  }
}
