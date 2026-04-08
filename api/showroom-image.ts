import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 120
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

type AssetRow = {
  id: string
  cloudinary_url: string | null
  thumbnail_url: string | null
  location: string | null
  business_type: string | null
  created_at: string | null
  metadata?: Record<string, unknown> | null
}

function getSupabaseAdminClient() {
  const url = process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase server credentials are not configured.')
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

function normalizeSpace(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ')
}

function pickWatermarkCode(metadata: Record<string, unknown> | null | undefined) {
  const candidates = [
    typeof metadata?.public_display_name === 'string' ? metadata.public_display_name : '',
    typeof metadata?.external_display_name === 'string' ? metadata.external_display_name : '',
  ]
  for (const candidate of candidates) {
    const normalized = normalizeSpace(candidate)
    const match = normalized.match(/([A-Z]?\d{4})$/i)
    if (match?.[1]) return match[1].toUpperCase()
  }
  return null
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

function toMonthCode(createdAt: string | null) {
  if (!createdAt) return ''
  const parsed = new Date(createdAt)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${String(parsed.getFullYear()).slice(-2)}${String(parsed.getMonth() + 1).padStart(2, '0')}`
}

function buildDisplayName(row: AssetRow) {
  const metadata = row.metadata ?? {}
  const code = pickWatermarkCode(metadata)
  const monthCode = toMonthCode(row.created_at)
  const region = toBroadRegion(row.location)
  const businessType = normalizeSpace(row.business_type) || '기타'
  return [monthCode, region, businessType, code].filter(Boolean).join(' ').trim() || '시공 사례'
}

function getClientIp(req: VercelRequest) {
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
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('image_assets')
    .select('id, cloudinary_url, thumbnail_url, location, business_type, created_at, metadata')
    .eq('id', assetId)
    .eq('is_consultation', true)
    .not('category', 'in', '("purchase_order","floor_plan")')
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

async function addWatermark(input: Buffer, displayName: string, variant: 'thumb' | 'full') {
  const image = sharp(input).rotate()
  const metadata = await image.metadata()
  const width = metadata.width ?? (variant === 'thumb' ? 800 : 1600)
  const height = metadata.height ?? Math.round(width * 0.75)
  const repeatedText = 'FINDGAGU OPEN SHOWROOM'
  const footerText = `파인드가구 오픈쇼룸 | 무단 재사용·재배포 금지 | ${displayName}`
  const diagonalFontSize = variant === 'thumb' ? 22 : 34
  const footerFontSize = variant === 'thumb' ? 18 : 24
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wm" patternUnits="userSpaceOnUse" width="320" height="220" patternTransform="rotate(-26)">
          <text x="0" y="120" fill="rgba(255,255,255,0.16)" font-size="${diagonalFontSize}" font-family="Arial, sans-serif" font-weight="700">${repeatedText}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
      <rect x="0" y="${height - (variant === 'thumb' ? 42 : 56)}" width="${width}" height="${variant === 'thumb' ? 42 : 56}" fill="rgba(0,0,0,0.42)" />
      <text x="${width / 2}" y="${height - (variant === 'thumb' ? 15 : 20)}" text-anchor="middle" fill="rgba(255,255,255,0.92)" font-size="${footerFontSize}" font-family="Arial, sans-serif" font-weight="600">${footerText}</text>
    </svg>
  `

  return image
    .composite([{ input: Buffer.from(svg), gravity: 'center' }])
    .jpeg({ quality: variant === 'thumb' ? 72 : 82, mozjpeg: true })
    .toBuffer()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const buffer = await fetchRemoteImage(sourceUrl)
    const displayName = buildDisplayName(row)
    const watermarked = await addWatermark(buffer, displayName, variant)
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
