import { supabase } from '@/lib/supabase'

export const SHOWROOM_SHARE_EXPIRY_DAYS = 3

export type ResolvedShowroomShare = {
  token: string
  title: string
  description: string
  industry_scope: string | null
  source: string | null
  created_at: string | null
  expires_at: string | null
}

type CreateShowroomShareInput = {
  title?: string
  description?: string
  expiresAt?: string
  industryScope?: string | null
  source?: string | null
  channelUserChatId?: string | null
}

function createShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
}

function getShowroomBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString().trim()
  return configured || 'https://findgagu.com/showroom'
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
  return {
    token: String(record.token ?? trimmed),
    title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '시공사례 쇼룸',
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : '담당자가 전달한 외부 쇼룸 링크입니다.',
    industry_scope: typeof record.industry_scope === 'string' && record.industry_scope.trim() ? record.industry_scope.trim() : null,
    source: typeof record.source === 'string' && record.source.trim() ? record.source.trim() : null,
    created_at: typeof record.created_at === 'string' ? record.created_at : null,
    expires_at: typeof record.expires_at === 'string' ? record.expires_at : null,
  }
}
