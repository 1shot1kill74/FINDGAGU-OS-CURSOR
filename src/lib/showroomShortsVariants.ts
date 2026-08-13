/** 현재 발행·재합성 기본 포맷. After → Before 반전 → 타임랩스. */
export const SHOWROOM_SHORTS_DEFAULT_VARIANT_ID = 'after_reveal' as const

/**
 * 성과 집계·기존 레코드 호환용 식별자.
 * 컷 순서는 After 콜드오픈 하나로 고정하고, 반복 신호는 문구·색·BGM 회전으로 흩뜨린다.
 */
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

/**
 * After 콜드오픈용 훅 로테 풀.
 * 고정 훅(`원래 이 공간이/이랬다구요?`)은 제목 풀과 같은 이유(양산·템플릿 신호)로 회전한다.
 * 오버레이 OCR에 같은 문장이 반복 노출되지 않게 seed 해시로 고른다. 2줄 고정.
 */
export const SHOWROOM_SHORTS_HOOK_POOL: ReadonlyArray<readonly [string, string]> = [
  ['원래 이 공간이', '이랬다구요?'],
  ['이게 같은 공간이', '맞을까요?'],
  ['처음엔 이런', '모습이었습니다'],
  ['바뀌기 전 모습,', '상상되세요?'],
  ['이 공간의 시작은', '이랬습니다'],
  ['전과 후, 차이가', '보이시나요?'],
] as const

/**
 * 타임랩스 구간 보조 자막 풀. 1줄, 길면 720px에서 잘리니 20자 이내로 유지한다.
 * 고정 문장 반복은 훅보다 노출 시간이 길어 자막 인식에 더 강한 반복 신호가 된다.
 */
export const SHOWROOM_SHORTS_SUB_POOL = [
  '이렇게 바뀌는 과정입니다',
  '설치는 이렇게 진행됩니다',
  '같은 자리, 같은 각도입니다',
  '실제 시공 현장입니다',
  '완성까지 이렇게 채워집니다',
] as const

/** 마지막 After 홀드 구간 CTA 자막 풀. 1줄, 20자 이내. */
export const SHOWROOM_SHORTS_CTA_POOL = [
  '파인드가구 온라인 쇼룸',
  '비슷한 현장 더 보기',
  '우리 공간도 가능할까요?',
  '좌석 배치부터 상담합니다',
  '견적은 프로필 링크에서',
  '학교·독학관 시공 전문',
  '도면 주시면 배치 잡습니다',
  '전후 사례 더 있습니다',
] as const

/**
 * 오버레이 색·자막 위치 변형.
 * 컷 순서가 같아도 첫 프레임 색 시그니처가 갈라지도록 회전한다.
 * ffmpeg drawtext 색 표기(0xRRGGBB)를 그대로 쓴다.
 */
export const SHOWROOM_SHORTS_OVERLAY_VARIANTS = [
  { hookColor: '0xffd54a', ctaColor: '0xffffff', textYShift: 0 },
  { hookColor: '0x8ce8ff', ctaColor: '0xffd54a', textYShift: 12 },
  { hookColor: '0xffffff', ctaColor: '0xffd54a', textYShift: -12 },
  { hookColor: '0xffe066', ctaColor: '0xbdf0ff', textYShift: 18 },
] as const

/**
 * 프레임 모드. 같은 컷 순서라도 첫 프레임 구도가 갈라진다.
 * `message_bands`는 영상을 정사각으로 두고 위·아래 검정 밴드에 자막을 넣어 사진을 가리지 않는다.
 * `full_bleed`는 9:16을 꽉 채우고 자막을 사진 위에 얹는다.
 * 풀에 `message_bands`를 두 번 넣어 밴드 2 : 풀 1로 뽑는다.
 */
export const SHOWROOM_SHORTS_FRAME_MODE_POOL = [
  'message_bands',
  'message_bands',
  'full_bleed',
] as const

export type ShowroomShortsFrameMode = 'message_bands' | 'full_bleed'

/**
 * BGM 풀. 워커 `assets/bgm/{track}.mp3`와 파일명이 1:1로 맞아야 한다.
 * 잡 생성 시 하나를 골라 config에 스냅샷하므로 어떤 편에 어떤 곡이 쓰였는지 조회할 수 있다.
 */
export const SHOWROOM_SHORTS_BGM_POOL = [
  'lyria-01-bright-acoustic',
  'lyria-02-soft-piano',
  'lyria-03-rhodes-soul',
  'lyria-04-warm-house',
  'lyria-05-ambient-pads',
  'lyria-06-handpan-pulse',
  'lyria-07-delay-electric',
  'lyria-08-analog-synth',
  'lyria-09-mallet-hope',
  'lyria-10-nylon-bossa',
  'bright-lines-new-light-sample-b-24-34',
] as const

export type ShowroomShortsBgmTrack = (typeof SHOWROOM_SHORTS_BGM_POOL)[number]

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
  subLine: string
  ctaLine: string
  hookColor: string
  ctaColor: string
  textYShift: number
  frameMode: ShowroomShortsFrameMode
  bgmTrack: ShowroomShortsBgmTrack
  ttsScript: string
  titleTemplate: string
  bgmVolume: number
}

/** After 콜드오픈 고정 타이밍. 컷 순서를 바꾸지 않으므로 포맷별 분기가 없다. */
const BASE_COPY = {
  openingMode: 'after_reveal',
  openingSeconds: 0.85,
  beforeBeatSeconds: 1.0,
  afterHoldSeconds: 1.5,
  ttsScript: '원래 이 공간이 이랬다구요? {site} 공간이 10초 뒤 이렇게 바뀝니다.',
  bgmVolume: 0.22,
} as const

function compactSiteName(siteName: string) {
  return siteName.replace(/^\d{2,6}\s*/u, '').trim() || '이 공간'
}

/**
 * FNV-1a. salt를 접두로 붙여 축마다 다른 순열을 쓴다.
 * 같은 seed·salt면 항상 같은 결과라 재합성해도 결과가 유지된다.
 */
function hashSeed(seed: string, salt: string): number {
  const value = `${salt}:${seed.trim() || 'showroom-shorts'}`
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

function pickFrom<T>(pool: readonly T[], seed: string, salt: string): T {
  return pool[hashSeed(seed, salt) % pool.length] ?? pool[0]
}

/** seed 기준으로 제목 템플릿을 고른다. 연속 job이 같은 문장으로 나오지 않게. */
export function pickShowroomShortsTitleTemplate(seed: string): string {
  return pickFrom(SHOWROOM_SHORTS_TITLE_TEMPLATES, seed, 'title')
}

/** seed 기준 훅 2줄. 축마다 salt가 달라 제목-훅 조합이 함께 굳지 않는다. */
export function pickShowroomShortsHookLines(seed: string): readonly [string, string] {
  return pickFrom(SHOWROOM_SHORTS_HOOK_POOL, seed, 'hook')
}

export function pickShowroomShortsSubLine(seed: string): string {
  return pickFrom(SHOWROOM_SHORTS_SUB_POOL, seed, 'sub')
}

export function pickShowroomShortsCtaLine(seed: string): string {
  return pickFrom(SHOWROOM_SHORTS_CTA_POOL, seed, 'cta')
}

export function pickShowroomShortsOverlayVariant(seed: string) {
  return pickFrom(SHOWROOM_SHORTS_OVERLAY_VARIANTS, seed, 'overlay')
}

export function pickShowroomShortsBgmTrack(seed: string): ShowroomShortsBgmTrack {
  return pickFrom(SHOWROOM_SHORTS_BGM_POOL, seed, 'bgm')
}

export function pickShowroomShortsFrameMode(seed: string): ShowroomShortsFrameMode {
  return pickFrom(SHOWROOM_SHORTS_FRAME_MODE_POOL, seed, 'frame')
}

function normalizeOverlayColor(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value.trim() : ''
  return /^0x[0-9a-f]{6}$/iu.test(raw) ? raw : fallback
}

function normalizeBgmTrack(value: unknown, fallback: ShowroomShortsBgmTrack): ShowroomShortsBgmTrack {
  return isShowroomShortsBgmTrack(value) ? value : fallback
}

function normalizeFrameMode(
  value: unknown,
  fallback: ShowroomShortsFrameMode,
): ShowroomShortsFrameMode {
  return value === 'message_bands' || value === 'full_bleed' ? value : fallback
}

export function getShowroomShortsVariantConfig(
  seed: string,
  siteName: string,
  override?: Partial<ShowroomShortsCompositionConfig> | null,
): ShowroomShortsCompositionConfig {
  const normalizedSite = compactSiteName(siteName)
  const [pooledHook1, pooledHook2] = pickShowroomShortsHookLines(seed)
  const overlay = pickShowroomShortsOverlayVariant(seed)

  return {
    // 컷 순서는 단일 포맷. 식별자는 성과 집계·기존 레코드 호환용으로만 남긴다.
    variantId: SHOWROOM_SHORTS_DEFAULT_VARIANT_ID,
    titleVariant: SHOWROOM_SHORTS_DEFAULT_VARIANT_ID,
    videoVariant: SHOWROOM_SHORTS_DEFAULT_VARIANT_ID,
    // TTS 훅은 대기실 BA 숏츠에 맞지 않아 비활성. BGM만 사용.
    audioVariant: 'bgm_only',
    openingMode: 'after_reveal',
    openingSeconds: Number.isFinite(override?.openingSeconds)
      ? Math.max(0.5, Math.min(Number(override?.openingSeconds), 1.5))
      : BASE_COPY.openingSeconds,
    beforeBeatSeconds: Number.isFinite(override?.beforeBeatSeconds)
      ? Math.max(0.5, Math.min(Number(override?.beforeBeatSeconds), 2))
      : BASE_COPY.beforeBeatSeconds,
    afterHoldSeconds: Number.isFinite(override?.afterHoldSeconds)
      ? Math.max(0.8, Math.min(Number(override?.afterHoldSeconds), 2.5))
      : BASE_COPY.afterHoldSeconds,
    hookLine1: override?.hookLine1?.trim() || pooledHook1,
    hookLine2: override?.hookLine2?.trim() || pooledHook2,
    subLine: override?.subLine?.trim() || pickShowroomShortsSubLine(seed),
    ctaLine: override?.ctaLine?.trim() || pickShowroomShortsCtaLine(seed),
    hookColor: normalizeOverlayColor(override?.hookColor, overlay.hookColor),
    ctaColor: normalizeOverlayColor(override?.ctaColor, overlay.ctaColor),
    textYShift: Number.isFinite(override?.textYShift)
      ? Math.max(-24, Math.min(Number(override?.textYShift), 24))
      : overlay.textYShift,
    frameMode: normalizeFrameMode(override?.frameMode, pickShowroomShortsFrameMode(seed)),
    bgmTrack: normalizeBgmTrack(override?.bgmTrack, pickShowroomShortsBgmTrack(seed)),
    ttsScript: (override?.ttsScript?.trim() || BASE_COPY.ttsScript)
      .replace(/\{site\}/gu, normalizedSite)
      .slice(0, 100),
    titleTemplate: override?.titleTemplate?.trim() || pickShowroomShortsTitleTemplate(seed),
    bgmVolume: Number.isFinite(override?.bgmVolume)
      ? Math.max(0.05, Math.min(Number(override?.bgmVolume), 0.4))
      : BASE_COPY.bgmVolume,
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

export function isShowroomShortsBgmTrack(value: unknown): value is ShowroomShortsBgmTrack {
  return typeof value === 'string' && (SHOWROOM_SHORTS_BGM_POOL as readonly string[]).includes(value)
}

export function formatShowroomShortsVariantLabel(value: unknown) {
  if (value === 'after_reveal') return 'After 콜드오픈'
  if (value === 'problem_solution') return '문제→해결'
  if (value === 'split_compare') return 'Before/After 비교'
  if (value === 'detail_proof') return '디테일 증명'
  return '기본 포맷'
}

export function formatShowroomShortsFrameModeLabel(value: unknown) {
  if (value === 'message_bands') return '밴드 (정사각 + 위·아래 검정)'
  if (value === 'full_bleed') return '풀 (9:16 꽉, 자막 겹침)'
  return '풀 (9:16 꽉, 자막 겹침)'
}

/** 화면 표시용 BGM 라벨. `lyria-04-warm-house` → `04 warm house` */
export function formatShowroomShortsBgmLabel(value: unknown) {
  if (!isShowroomShortsBgmTrack(value)) return '자동 배정'
  if (value === 'bright-lines-new-light-sample-b-24-34') return 'bright lines'
  return value.replace(/^lyria-/u, '').replace(/-/gu, ' ')
}
