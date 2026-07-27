import type { SpaceDisplayNameOption } from '@/lib/imageAssetUploadService'
import { compareSpaceDisplayNameOptions } from '@/lib/imageAssetUploadService'

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase()
}

function compactSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/\s+/g, '')
}

function extractTrailingFourDigitCode(value: string): string | null {
  const matches = value.match(/\d{4,}/g)
  if (!matches?.length) return null
  const last = matches[matches.length - 1]
  return last ? last.slice(-4) : null
}

export function getSiteOptionSearchScore(option: SpaceDisplayNameOption, query: string): number {
  const trimmed = query.trim()
  if (!trimmed) return 0
  const lowered = normalizeSearchValue(trimmed)
  const compact = compactSearchValue(trimmed)
  const display = option.display_name ?? ''
  const spaceId = option.space_id ?? ''
  const normalizedDisplay = normalizeSearchValue(display)
  const compactDisplay = compactSearchValue(display)
  const normalizedSpaceId = normalizeSearchValue(spaceId)
  const compactSpaceId = compactSearchValue(spaceId)
  const trailingCode = extractTrailingFourDigitCode(display) ?? ''

  if (normalizedSpaceId === lowered || compactSpaceId === compact) return 100
  if (trailingCode && trailingCode === trimmed) return 95
  if (normalizedDisplay === lowered || compactDisplay === compact) return 90
  if (normalizedDisplay.startsWith(lowered) || compactDisplay.startsWith(compact)) return 80
  if (normalizedDisplay.includes(lowered) || compactDisplay.includes(compact)) return 70
  if (normalizedSpaceId.includes(lowered) || compactSpaceId.includes(compact)) return 65
  if (trailingCode && trailingCode.includes(trimmed)) return 60
  return 0
}

export function matchesSiteOption(option: SpaceDisplayNameOption, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  const lowered = normalizeSearchValue(trimmed)
  const compact = compactSearchValue(trimmed)
  const terms = lowered.split(/\s+/).filter(Boolean)
  const display = option.display_name ?? ''
  const spaceId = option.space_id ?? ''
  const trailingCode = extractTrailingFourDigitCode(display) ?? ''
  const haystacks = [
    normalizeSearchValue(display),
    compactSearchValue(display),
    normalizeSearchValue(spaceId),
    compactSearchValue(spaceId),
    trailingCode,
  ].filter(Boolean)
  return (
    terms.every((term) => haystacks.some((value) => value.includes(term))) ||
    haystacks.some((value) => value.includes(lowered) || value.includes(compact))
  )
}

export function filterSiteNameSuggestions(
  options: SpaceDisplayNameOption[],
  query: string,
  limit = 20,
): SpaceDisplayNameOption[] {
  const filtered = query.trim()
    ? options
        .filter((option) => matchesSiteOption(option, query))
        .sort((a, b) => {
          const scoreDiff = getSiteOptionSearchScore(b, query) - getSiteOptionSearchScore(a, query)
          if (scoreDiff !== 0) return scoreDiff
          return compareSpaceDisplayNameOptions(a, b)
        })
    : options
  return filtered.slice(0, limit)
}
