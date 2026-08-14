const PUBLIC_SHOWROOM_CASE_PREFIX = '/public/showroom/case/'

export type ShowroomCaseSlugSource = {
  siteName: string
  title?: string | null
  canonicalPath?: string | null
}

function decodeCaseKey(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    return decodeURIComponent(trimmed).trim()
  } catch {
    return trimmed
  }
}

export function slugifyShowroomCaseLabel(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[“”"'`]/g, '')
    .replace(/[—–―|｜·•]/g, ' ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[.,!?;:/\\=+*~@#$%^&]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function stripInternalCaseCodes(slug: string): string {
  return slug
    .replace(/(^|-)견적(?=-|$)/g, '$1')
    .replace(/(^|-)A-?S(?=-|$)/gi, '$1')
    .replace(/(^|-)\d{4}(?=-|$)/g, '$1')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function buildShowroomCaseSlug(input: ShowroomCaseSlugSource): string {
  const siteName = input.siteName.trim()
  const title = input.title?.trim() || ''
  const fromCanonical = input.canonicalPath?.trim()
    ? fromCanonicalPath(input.canonicalPath)
    : ''
  if (fromCanonical && !looksLikeLegacyShowroomCaseKey(fromCanonical)) {
    return fromCanonical
  }

  const headline = (title.split(/[—–―|｜]/)[0] || title || siteName).trim()
  const paren = title.match(/\(([^)]+)\)/)?.[1]?.trim() || ''
  const merged = paren && !headline.includes(paren) ? `${headline} ${paren}` : headline
  let slug = stripInternalCaseCodes(slugifyShowroomCaseLabel(merged))
  if (!slug) slug = stripInternalCaseCodes(slugifyShowroomCaseLabel(siteName))
  if (!slug) slug = 'case'
  if (slug.length > 80) slug = slug.slice(0, 80).replace(/-+$/g, '')
  return slug
}

function fromCanonicalPath(canonicalPath: string): string {
  const path = canonicalPath.trim()
  const marker = PUBLIC_SHOWROOM_CASE_PREFIX
  const idx = path.indexOf(marker)
  const segments = path.split('/').filter(Boolean)
  const tail = idx >= 0 ? path.slice(idx + marker.length) : (segments[segments.length - 1] ?? '')
  return decodeCaseKey(tail).replace(/\/+$/, '')
}

export function looksLikeLegacyShowroomCaseKey(value: string): boolean {
  const key = decodeCaseKey(value)
  if (!key) return false
  if (/\s/.test(key)) return true
  if (key.includes('/') || key.includes('견적')) return true
  if (/(^|-)\d{4}(?=-|$)/.test(key) && /[가-힣]/.test(key) === false) return true
  if (/^\d{4}\s/.test(key)) return true
  return false
}

export function getShowroomCasePublicSlug(input: ShowroomCaseSlugSource): string {
  return buildShowroomCaseSlug(input)
}

export function listShowroomCaseSlugAliases(input: ShowroomCaseSlugSource): string[] {
  const slug = getShowroomCasePublicSlug(input)
  const suffix = input.siteName.match(/(\d{4})\s*$/)?.[1]
  if (suffix && !slug.endsWith(`-${suffix}`)) {
    return [slug, `${slug}-${suffix}`.slice(0, 80)]
  }
  return [slug]
}

export function buildPublicShowroomCasePath(input: ShowroomCaseSlugSource): string {
  return `${PUBLIC_SHOWROOM_CASE_PREFIX}${encodeURIComponent(getShowroomCasePublicSlug(input))}`
}

export function buildPublicShowroomCasePathFromSlug(slug: string): string {
  return `${PUBLIC_SHOWROOM_CASE_PREFIX}${encodeURIComponent(slug)}`
}

export function assignUniqueShowroomCaseSlugs(
  rows: ShowroomCaseSlugSource[],
): Map<string, string> {
  const used = new Map<string, string>()
  const counts = new Map<string, number>()
  for (const row of rows) {
    const siteName = row.siteName.trim()
    if (!siteName) continue
    let slug = getShowroomCasePublicSlug(row)
    const seen = counts.get(slug) ?? 0
    counts.set(slug, seen + 1)
    if (seen > 0) {
      const suffix = siteName.match(/(\d{4})\s*$/)?.[1] ?? String(seen + 1)
      slug = `${slug}-${suffix}`.slice(0, 80)
    }
    used.set(siteName, slug)
  }
  return used
}

export function draftMatchesShowroomCaseKey(
  input: ShowroomCaseSlugSource & { canonicalSiteName?: string | null },
  rawKey: string,
): boolean {
  const key = decodeCaseKey(rawKey)
  if (!key) return false
  if (input.siteName.trim() === key) return true
  if (input.canonicalSiteName?.trim() === key) return true
  return listShowroomCaseSlugAliases(input).includes(key)
}
