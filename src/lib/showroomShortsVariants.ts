export const SHOWROOM_SHORTS_VARIANT_IDS = [
  'after_reveal',
  'problem_solution',
  'split_compare',
  'detail_proof',
] as const

export type ShowroomShortsVariantId = (typeof SHOWROOM_SHORTS_VARIANT_IDS)[number]

export type ShowroomShortsCompositionConfig = {
  variantId: ShowroomShortsVariantId
  titleVariant: ShowroomShortsVariantId
  videoVariant: ShowroomShortsVariantId
  audioVariant: 'tts_hook_bgm' | 'bgm_only'
  openingMode: 'after_reveal' | 'problem_focus' | 'split_compare' | 'detail_proof'
  openingSeconds: number
  hookLine1: string
  hookLine2: string
  ttsScript: string
  titleTemplate: string
  bgmVolume: number
}

const VARIANT_COPY: Record<
  ShowroomShortsVariantId,
  Omit<
    ShowroomShortsCompositionConfig,
    'variantId' | 'titleVariant' | 'videoVariant' | 'audioVariant'
  >
> = {
  after_reveal: {
    openingMode: 'after_reveal',
    openingSeconds: 0.9,
    hookLine1: '이 공간이',
    hookLine2: 'Before였다고요?',
    ttsScript: '{site}이 10초 뒤 이렇게 바뀝니다.',
    titleTemplate: '{site}이 Before였다고요? | 공간 대변신',
    bgmVolume: 0.24,
  },
  problem_solution: {
    openingMode: 'problem_focus',
    openingSeconds: 0,
    hookLine1: '어두웠던 공간을',
    hookLine2: '이렇게 바꿨습니다',
    ttsScript: '어두웠던 {site} 공간을 이렇게 바꿨습니다.',
    titleTemplate: '어두웠던 {site} 공간을 이렇게 바꿨습니다',
    bgmVolume: 0.24,
  },
  split_compare: {
    openingMode: 'split_compare',
    openingSeconds: 0,
    hookLine1: 'Before와 After,',
    hookLine2: '차이가 보이시나요?',
    ttsScript: '{site}의 Before와 After를 한눈에 비교해 보세요.',
    titleTemplate: 'Before와 After, 차이가 보이시나요? | {site}',
    bgmVolume: 0.24,
  },
  detail_proof: {
    openingMode: 'detail_proof',
    openingSeconds: 0,
    hookLine1: '완성도는',
    hookLine2: '디테일에서 달라집니다',
    ttsScript: '{site}의 변화는 디테일에서 달라집니다.',
    titleTemplate: '완성도는 디테일에서 달라집니다 | {site}',
    bgmVolume: 0.24,
  },
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function compactSiteName(siteName: string) {
  return siteName.replace(/^\d{2,6}\s*/u, '').trim() || '이 공간'
}

export function getShowroomShortsVariantConfig(
  seed: string,
  siteName: string,
  override?: Partial<ShowroomShortsCompositionConfig> | null,
): ShowroomShortsCompositionConfig {
  const variantId =
    override?.variantId && SHOWROOM_SHORTS_VARIANT_IDS.includes(override.variantId)
      ? override.variantId
      : SHOWROOM_SHORTS_VARIANT_IDS[stableHash(seed) % SHOWROOM_SHORTS_VARIANT_IDS.length]
  const copy = VARIANT_COPY[variantId]
  const normalizedSite = compactSiteName(siteName)

  return {
    variantId,
    titleVariant: override?.titleVariant ?? variantId,
    videoVariant: override?.videoVariant ?? variantId,
    audioVariant: override?.audioVariant === 'bgm_only' ? 'bgm_only' : 'tts_hook_bgm',
    openingMode: override?.openingMode ?? copy.openingMode,
    openingSeconds: Number.isFinite(override?.openingSeconds)
      ? Math.max(0, Math.min(Number(override?.openingSeconds), 1.5))
      : copy.openingSeconds,
    hookLine1: override?.hookLine1?.trim() || copy.hookLine1,
    hookLine2: override?.hookLine2?.trim() || copy.hookLine2,
    ttsScript: (override?.ttsScript?.trim() || copy.ttsScript)
      .replace(/\{site\}/gu, normalizedSite)
      .slice(0, 100),
    titleTemplate: override?.titleTemplate?.trim() || copy.titleTemplate,
    bgmVolume: Number.isFinite(override?.bgmVolume)
      ? Math.max(0.05, Math.min(Number(override?.bgmVolume), 0.4))
      : copy.bgmVolume,
  }
}

export function buildShowroomShortsVariantTitle(
  config: ShowroomShortsCompositionConfig,
  siteName: string,
) {
  return config.titleTemplate.replace(/\{site\}/gu, compactSiteName(siteName)).slice(0, 95)
}

export function isShowroomShortsVariantId(value: unknown): value is ShowroomShortsVariantId {
  return (
    typeof value === 'string' &&
    (SHOWROOM_SHORTS_VARIANT_IDS as readonly string[]).includes(value)
  )
}

export function formatShowroomShortsVariantLabel(value: unknown) {
  if (value === 'after_reveal') return 'After 콜드오픈'
  if (value === 'problem_solution') return '문제→해결'
  if (value === 'split_compare') return 'Before/After 비교'
  if (value === 'detail_proof') return '디테일 증명'
  return '기본 포맷'
}
