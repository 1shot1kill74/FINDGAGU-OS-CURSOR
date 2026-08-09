/** 현재 발행·재합성 기본 포맷. After → Before 반전 → 타임랩스. */
export const SHOWROOM_SHORTS_DEFAULT_VARIANT_ID = 'after_reveal' as const

export const SHOWROOM_SHORTS_VARIANT_IDS = [
  'after_reveal',
  'problem_solution',
  'split_compare',
  'detail_proof',
] as const

export type ShowroomShortsVariantId = (typeof SHOWROOM_SHORTS_VARIANT_IDS)[number]

/**
 * YouTube 제목 로테 풀.
 * `10초 만에 보는 … 대변신` 고정은 양산·템플릿 신호라 폐기.
 * seed 해시로 고르므로 연속 업로드에서도 제목이 갈라진다.
 */
export const SHOWROOM_SHORTS_TITLE_TEMPLATES = [
  '원래 이 공간이 이랬다구요? | {site}',
  '{site}, 비었던 공간이 이렇게 바뀌었습니다',
  'Before → After | {site} 공간 변화',
  '이 자리, 원래는 달랐습니다 | {site}',
  '{site} 스터디카페 인테리어 Before/After',
  '설계 전후가 한눈에 | {site}',
] as const

export type ShowroomShortsCompositionConfig = {
  variantId: ShowroomShortsVariantId
  titleVariant: ShowroomShortsVariantId
  videoVariant: ShowroomShortsVariantId
  audioVariant: 'tts_hook_bgm' | 'bgm_only'
  openingMode: 'after_reveal' | 'problem_focus' | 'split_compare' | 'detail_proof'
  openingSeconds: number
  beforeBeatSeconds: number
  afterHoldSeconds: number
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
    'variantId' | 'titleVariant' | 'videoVariant' | 'audioVariant' | 'titleTemplate'
  > & { titleTemplate?: string }
> = {
  after_reveal: {
    openingMode: 'after_reveal',
    openingSeconds: 0.85,
    beforeBeatSeconds: 1.0,
    afterHoldSeconds: 1.5,
    hookLine1: '원래 이 공간이',
    hookLine2: '이랬다구요?',
    ttsScript: '원래 이 공간이 이랬다구요? {site} 공간이 10초 뒤 이렇게 바뀝니다.',
    bgmVolume: 0.22,
  },
  // 아래 포맷은 보류. 기본값은 After 콜드오픈으로 고정.
  problem_solution: {
    openingMode: 'problem_focus',
    openingSeconds: 0,
    beforeBeatSeconds: 0,
    afterHoldSeconds: 1.5,
    hookLine1: '어두웠던 공간을',
    hookLine2: '이렇게 바꿨습니다',
    ttsScript: '어두웠던 {site} 공간을 이렇게 바꿨습니다.',
    bgmVolume: 0.24,
  },
  split_compare: {
    openingMode: 'split_compare',
    openingSeconds: 0,
    beforeBeatSeconds: 0,
    afterHoldSeconds: 1.5,
    hookLine1: 'Before와 After,',
    hookLine2: '차이가 보이시나요?',
    ttsScript: '{site}의 Before와 After를 한눈에 비교해 보세요.',
    bgmVolume: 0.24,
  },
  detail_proof: {
    openingMode: 'detail_proof',
    openingSeconds: 0,
    beforeBeatSeconds: 0,
    afterHoldSeconds: 1.5,
    hookLine1: '완성도는',
    hookLine2: '디테일에서 달라집니다',
    ttsScript: '{site}의 변화는 디테일에서 달라집니다.',
    bgmVolume: 0.24,
  },
}

function compactSiteName(siteName: string) {
  return siteName.replace(/^\d{2,6}\s*/u, '').trim() || '이 공간'
}

function hashSeed(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return hash
}

/** seed 기준으로 제목 템플릿을 고른다. 연속 job이 같은 문장으로 나오지 않게. */
export function pickShowroomShortsTitleTemplate(seed: string): string {
  const templates = SHOWROOM_SHORTS_TITLE_TEMPLATES
  const index = hashSeed(seed || 'default') % templates.length
  return templates[index] ?? templates[0]
}

export function getShowroomShortsVariantConfig(
  seed: string,
  siteName: string,
  override?: Partial<ShowroomShortsCompositionConfig> | null,
): ShowroomShortsCompositionConfig {
  // 당분간 영상 포맷은 After 콜드오픈 고정. 제목/오디오만 override 허용.
  const variantId = SHOWROOM_SHORTS_DEFAULT_VARIANT_ID
  const copy = VARIANT_COPY[variantId]
  const normalizedSite = compactSiteName(siteName)
  const titleVariant =
    override?.titleVariant && SHOWROOM_SHORTS_VARIANT_IDS.includes(override.titleVariant)
      ? override.titleVariant
      : variantId

  return {
    variantId,
    titleVariant,
    videoVariant: variantId,
    // TTS 훅은 대기실 BA 숏츠에 맞지 않아 비활성. BGM만 사용.
    audioVariant: 'bgm_only',
    openingMode: 'after_reveal',
    openingSeconds: Number.isFinite(override?.openingSeconds)
      ? Math.max(0.5, Math.min(Number(override?.openingSeconds), 1.5))
      : copy.openingSeconds,
    beforeBeatSeconds: Number.isFinite(override?.beforeBeatSeconds)
      ? Math.max(0.5, Math.min(Number(override?.beforeBeatSeconds), 2))
      : copy.beforeBeatSeconds,
    afterHoldSeconds: Number.isFinite(override?.afterHoldSeconds)
      ? Math.max(0.8, Math.min(Number(override?.afterHoldSeconds), 2.5))
      : copy.afterHoldSeconds,
    hookLine1: override?.hookLine1?.trim() || copy.hookLine1,
    hookLine2: override?.hookLine2?.trim() || copy.hookLine2,
    ttsScript: (override?.ttsScript?.trim() || copy.ttsScript)
      .replace(/\{site\}/gu, normalizedSite)
      .slice(0, 100),
    titleTemplate: override?.titleTemplate?.trim() || pickShowroomShortsTitleTemplate(seed),
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
