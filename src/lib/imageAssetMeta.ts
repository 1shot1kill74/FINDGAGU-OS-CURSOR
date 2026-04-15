import { broadenPublicDisplayName } from '@/lib/showroomPublicDisplayName'

export function parseBeforeAfterMeta(metadata: unknown): {
  role: 'before' | 'after' | null
  groupId: string | null
  raw: Record<string, unknown> | null
} {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { role: null, groupId: null, raw: null }
  }
  const raw = metadata as Record<string, unknown>
  const role = raw.before_after_role === 'before' || raw.before_after_role === 'after'
    ? raw.before_after_role
    : null
  const groupId = typeof raw.before_after_group_id === 'string' && raw.before_after_group_id.trim()
    ? raw.before_after_group_id.trim()
    : null
  return { role, groupId, raw }
}

export function parseStoredSpaceId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  if (raw.startsWith('spaces/')) return raw.slice('spaces/'.length) || null
  const roomMatch = raw.match(/\/room\/([A-Za-z0-9_-]+)/)
  if (roomMatch?.[1]) return roomMatch[1]
  return raw
}

export function normalizeConsultationName(value: string | null | undefined): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized
    .replace(/^(상담접수|견적중|계약완료|시공완료|접수|견적|진행|완료|거절|무효|AS)\s+/i, '')
    .trim()
    .toLowerCase()
}

function normalizeDisplayToken(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? '').trim().replace(/\s+/g, ' ')
  return normalized || fallback
}

function formatExternalDisplayNameMonth(...dateCandidates: Array<string | null | undefined>): string | null {
  for (const candidate of dateCandidates) {
    const raw = (candidate ?? '').trim()
    if (!raw) continue
    const parsed = new Date(raw)
    const time = parsed.getTime()
    if (!Number.isFinite(time)) continue
    const year = String(parsed.getFullYear()).slice(-2)
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    return `${year}${month}`
  }
  return null
}

function getExternalDisplayNamePhoneSuffix(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : '0000'
}

export function buildExternalDisplayName(params: {
  requestDate?: string | null
  startDate?: string | null
  createdAt?: string | null
  region?: string | null
  industry?: string | null
  customerPhone?: string | null
}): string | null {
  const monthCode = formatExternalDisplayNameMonth(params.requestDate, params.startDate, params.createdAt)
  if (!monthCode) return null
  const region = normalizeDisplayToken(params.region, '미지정')
  const industry = normalizeDisplayToken(params.industry, '기타')
  const phoneSuffix = getExternalDisplayNamePhoneSuffix(params.customerPhone)
  return `${monthCode} ${region} ${industry} ${phoneSuffix}`
}

export function buildBroadExternalDisplayName(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim()
  if (!normalized) return null
  return broadenPublicDisplayName(normalized) ?? normalized
}

export function parseImageAssetMeta(metadata: unknown): {
  raw: Record<string, unknown>
  spaceId: string | null
  consultationId: string | null
  canonicalSiteName: string | null
  legacySiteName: string | null
  spaceDisplayName: string | null
  externalDisplayName: string | null
  broadExternalDisplayName: string | null
} {
  const raw = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...(metadata as Record<string, unknown>) }
    : {}
  const consultationId = typeof raw.consultation_id === 'string' && raw.consultation_id.trim()
    ? raw.consultation_id.trim()
    : null
  const canonicalSiteName = typeof raw.canonical_site_name === 'string' && raw.canonical_site_name.trim()
    ? raw.canonical_site_name.trim()
    : null
  const legacySiteName = typeof raw.legacy_site_name === 'string' && raw.legacy_site_name.trim()
    ? raw.legacy_site_name.trim()
    : null
  const spaceDisplayName = typeof raw.space_display_name === 'string' && raw.space_display_name.trim()
    ? raw.space_display_name.trim()
    : null
  const externalDisplayName = typeof raw.external_display_name === 'string' && raw.external_display_name.trim()
    ? raw.external_display_name.trim()
    : null
  const broadExternalDisplayName = typeof raw.broad_external_display_name === 'string' && raw.broad_external_display_name.trim()
    ? raw.broad_external_display_name.trim()
    : null
  return {
    raw,
    spaceId: parseStoredSpaceId(raw.space_id),
    consultationId,
    canonicalSiteName,
    legacySiteName,
    spaceDisplayName,
    externalDisplayName,
    broadExternalDisplayName,
  }
}

export function getExternalDisplayNameFromImageAssetMeta(metadata: unknown): string | null {
  return parseImageAssetMeta(metadata).externalDisplayName
}

export function getBroadExternalDisplayNameFromImageAssetMeta(metadata: unknown): string | null {
  return parseImageAssetMeta(metadata).broadExternalDisplayName
}
