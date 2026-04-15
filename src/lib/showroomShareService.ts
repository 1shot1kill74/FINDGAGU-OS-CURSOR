import { supabase } from '@/lib/supabase'
import { mapPublicShowroomRpcRowToShowroomAsset, type ShowroomImageAsset } from '@/lib/imageAssetService'
import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'
import { createShareToken } from '@/lib/shareToken'

export { broadenPublicDisplayName }

export const SHOWROOM_SHARE_EXPIRY_DAYS = 3
const PUBLIC_SHOWROOM_RPC_PAGE_SIZE = 1000

export const DEFAULT_PUBLIC_SHOWROOM_PATH = '/public/showroom'
export const DEFAULT_PUBLIC_SHOWROOM_ORIGIN = 'https://findgagu-os-cursor.vercel.app'
const PAUSED_PUBLIC_SHOWROOM_HOSTS = new Set(['findgagu.com', 'www.findgagu.com'])

export type ResolvedShowroomShare = {
  token: string
  title: string
  description: string
  industry_scope: string | null
  source: string | null
  preview_site_limit: number
  created_at: string | null
  expires_at: string | null
}

function buildPublicShowroomImageProxyUrl(assetId: string, variant: 'thumb' | 'full'): string {
  const query = new URLSearchParams({
    id: assetId,
    variant,
  })
  return `/api/showroom-image?${query.toString()}`
}

function mapToProtectedPublicShowroomAsset(asset: ShowroomImageAsset): ShowroomImageAsset {
  return {
    ...asset,
    site_name: broadenPublicDisplayName(asset.site_name) ?? asset.site_name,
    cloudinary_url: buildPublicShowroomImageProxyUrl(asset.id, 'full'),
    // Keep card thumbnails on the CDN for faster public showroom loads.
    thumbnail_url: asset.thumbnail_url || asset.cloudinary_url,
  }
}

type CreateShowroomShareInput = {
  title?: string
  description?: string
  expiresAt?: string
  industryScope?: string | null
  source?: string | null
  channelUserChatId?: string | null
  /** 맞춤 쇼룸에서 먼저 보여 줄 현장(사이트) 개수 상한 */
  previewSiteLimit?: number
}

function isPausedPublicShowroomBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value.includes('://') ? value : `https://${value}`)
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/'
    return PAUSED_PUBLIC_SHOWROOM_HOSTS.has(parsed.hostname) && normalizedPath === '/showroom'
  } catch {
    return false
  }
}

function getShowroomBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString().trim()
  if (!configured || isPausedPublicShowroomBaseUrl(configured)) {
    return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
  }

  try {
    const parsed = new URL(configured.includes('://') ? configured : `https://${configured}`)
    const origin = parsed.origin
    const path = parsed.pathname.replace(/\/+$/, '') || ''

    if (path.endsWith(DEFAULT_PUBLIC_SHOWROOM_PATH)) return `${origin}${path}`
    if (!path || path === '/' || path === '/showroom') return `${origin}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
    if (!path.includes('public/showroom')) return `${origin}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
    return `${origin}${path}`
  } catch {
    return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
  }
}

export function buildShowroomShareUrl(token: string): string {
  const baseUrl = getShowroomBaseUrl()
  const url = new URL(baseUrl)
  url.searchParams.set('t', token)
  return url.toString()
}

export function getShowroomShareExpiryIso(days = SHOWROOM_SHARE_EXPIRY_DAYS): string {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt.toISOString()
}

export async function createShowroomShareLink(input: CreateShowroomShareInput): Promise<{ token: string; url: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createShareToken()
    const insertPayload: Record<string, unknown> = {
      token,
      title: input.title?.trim() || null,
      description: input.description?.trim() || null,
      industry_scope: input.industryScope?.trim() || null,
      source: input.source?.trim() || null,
      channel_user_chat_id: input.channelUserChatId?.trim() || null,
    }

    if (input.previewSiteLimit != null && Number.isFinite(input.previewSiteLimit)) {
      const cap = Math.min(50, Math.max(1, Math.floor(input.previewSiteLimit)))
      insertPayload.preview_site_limit = cap
    }

    if (input.expiresAt) {
      insertPayload.expires_at = input.expiresAt
    }

    const { error } = await (supabase as any).from('showroom_share_links').insert(insertPayload)
    if (!error) {
      return { token, url: buildShowroomShareUrl(token) }
    }

    if (!String(error.message).toLowerCase().includes('duplicate')) {
      throw new Error(error.message)
    }
  }

  throw new Error('쇼룸 공유 토큰 생성에 실패했습니다. 다시 시도해 주세요.')
}

export async function resolveShowroomShare(token: string): Promise<ResolvedShowroomShare | null> {
  const trimmed = token.trim()
  if (!trimmed) return null

  const { data, error } = await (supabase as any).rpc('resolve_public_showroom_share', { share_token: trimmed })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null

  const record = data as Record<string, unknown>
  const rawLimit = record.preview_site_limit
  let preview_site_limit = 6
  if (typeof rawLimit === 'number' && Number.isFinite(rawLimit)) {
    preview_site_limit = Math.min(50, Math.max(1, Math.floor(rawLimit)))
  } else if (typeof rawLimit === 'string' && /^\d+$/.test(rawLimit)) {
    preview_site_limit = Math.min(50, Math.max(1, parseInt(rawLimit, 10)))
  }

  return {
    token: String(record.token ?? trimmed),
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '시공사례 쇼룸',
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : '담당자가 전달한 외부 쇼룸 링크입니다.',
    industry_scope: typeof record.industry_scope === 'string' && record.industry_scope.trim() ? record.industry_scope.trim() : null,
    source: typeof record.source === 'string' && record.source.trim() ? record.source.trim() : null,
    preview_site_limit,
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
  }
}

async function fetchAllPublicShowroomRpcRows(
  rpcName: string,
  args?: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  let from = 0

  while (true) {
    const query = (supabase as any)
      .rpc(rpcName, args ?? {})
      .range(from, from + PUBLIC_SHOWROOM_RPC_PAGE_SIZE - 1)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const page = (data ?? []) as Record<string, unknown>[]
    if (page.length === 0) break

    rows.push(...page)
    if (page.length < PUBLIC_SHOWROOM_RPC_PAGE_SIZE) break
    from += PUBLIC_SHOWROOM_RPC_PAGE_SIZE
  }

  return rows
}

export async function fetchPublicShowroomAssets(): Promise<ShowroomImageAsset[]> {
  const rows = await fetchAllPublicShowroomRpcRows('get_public_showroom_assets')
  return rows.map((r) => mapToProtectedPublicShowroomAsset(mapPublicShowroomRpcRowToShowroomAsset(r)))
}

export async function fetchPublicShowroomAssetsByShareToken(
  token: string,
  options?: { includeAll?: boolean },
): Promise<ShowroomImageAsset[]> {
  const trimmed = token.trim()
  if (!trimmed) return []

  const rows = await fetchAllPublicShowroomRpcRows('get_public_showroom_assets_by_share_token', {
    share_token: trimmed,
    include_all: Boolean(options?.includeAll),
  })
  return rows.map((r) => mapToProtectedPublicShowroomAsset(mapPublicShowroomRpcRowToShowroomAsset(r)))
}
