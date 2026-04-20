import { broadenPublicDisplayName } from '@/lib/showroomShareService'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { getShowroomImagePreviewUrl } from '@/lib/imageAssetService'

export type ShowroomCaseContentSeed = {
  siteName: string
  externalLabel?: string | null
  industry?: string | null
  headlineHook?: string | null
  painPoint?: string | null
  problemDetail?: string | null
  solutionPoint?: string | null
  solutionDetail?: string | null
  evidencePoints?: string[]
}

export const SHOWROOM_CARDNEWS_SIGNATURE_IMAGE_URL = '/assets/showroom-cardnews-signature.png'

export type CardNewsSlideImageRef = 'auto' | 'before' | 'after' | 'signature' | (string & {})

export function makeCardNewsAssetImageRef(assetId: string): CardNewsSlideImageRef {
  return `asset:${assetId.trim()}` as CardNewsSlideImageRef
}

/** UI 옵션 라벨 — 비포어/애프터·제품명 등 */
export function formatShowroomAssetPickerLabel(asset: ShowroomImageAsset): string {
  const role =
    asset.before_after_role === 'before'
      ? '비포어'
      : asset.before_after_role === 'after'
        ? '애프터'
        : '기타'
  const name = asset.product_name?.trim() || asset.color_name?.trim() || '컷'
  return `${role} · ${name}`
}

export function parseCardNewsAssetImageId(ref: string | undefined | null): string | null {
  if (!ref?.startsWith('asset:')) return null
  const id = ref.slice('asset:'.length).trim()
  return id || null
}

export type ShowroomCaseCardNewsSlide = {
  key: 'hook' | 'problem' | 'specific-problem' | 'solution' | 'evidence' | 'cta'
  title: string
  body: string
  /** 미지정·auto면 역할(hook/problem/…)에 따라 Before/After 자동; `asset:<id>`는 해당 image_assets 컷 */
  imageRef?: CardNewsSlideImageRef
  /** 저장 시 스냅샷 URL(공개 사례 페이지가 자산 목록 없이 표시) */
  imageUrl?: string | null
}

function sortBeforeAfterRole(
  images: ShowroomImageAsset[] | undefined | null,
  role: 'before' | 'after',
): ShowroomImageAsset[] {
  return (Array.isArray(images) ? images : [])
    .filter((i) => i.before_after_role === role)
    .sort((a, b) => {
      const oa = a.before_after_site_order ?? 9999
      const ob = b.before_after_site_order ?? 9999
      if (oa !== ob) return oa - ob
      if (a.is_main !== b.is_main) return a.is_main ? -1 : 1
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0
      return tb - ta
    })
}

/**
 * 훅·애프터 / 문제 인식·비포어 / 구체 문제·애프터 / 해결·애프터 / 변화·애프터 / CTA·브랜드 시그니처
 */
export function buildDefaultCardNewsImageRefs(
  images: ShowroomImageAsset[] | undefined | null,
): Record<ShowroomCaseCardNewsSlide['key'], CardNewsSlideImageRef> {
  const befores = sortBeforeAfterRole(images, 'before')
  const afters = sortBeforeAfterRole(images, 'after')
  const mainAfter = afters.find((i) => i.is_main) ?? afters[0]
  const hook = mainAfter ? makeCardNewsAssetImageRef(mainAfter.id) : 'after'
  const problem = befores[0] ? makeCardNewsAssetImageRef(befores[0]!.id) : 'before'
  const specificProblem = afters[1] ? makeCardNewsAssetImageRef(afters[1]!.id) : mainAfter ? makeCardNewsAssetImageRef(mainAfter.id) : 'after'
  const solution = afters[1] ? makeCardNewsAssetImageRef(afters[1]!.id) : mainAfter ? makeCardNewsAssetImageRef(mainAfter.id) : 'after'
  const evidence = afters[2] ? makeCardNewsAssetImageRef(afters[2]!.id) : mainAfter ? makeCardNewsAssetImageRef(mainAfter.id) : 'after'
  const cta: CardNewsSlideImageRef = 'signature'
  return { hook, problem, 'specific-problem': specificProblem, solution, evidence, cta }
}

export function buildShowroomAssetUrlByIdMap(images: ShowroomImageAsset[] | undefined | null): Map<string, string> {
  const m = new Map<string, string>()
  for (const a of Array.isArray(images) ? images : []) {
    m.set(a.id, getShowroomImagePreviewUrl(a))
  }
  return m
}

/** 역할·이미지 설정으로 미리보기 URL 결정 (작업실·사례 페이지 공통) */
export function resolveCardNewsSlideImageUrl(params: {
  role: string
  imageRef?: CardNewsSlideImageRef | string
  beforeUrl: string
  afterUrl: string
  assetUrlById?: Map<string, string>
  imageUrl?: string | null
}): string {
  const snap = params.imageUrl?.trim()
  if (snap) return snap
  const before = params.beforeUrl?.trim() ?? ''
  const after = params.afterUrl?.trim() ?? ''
  const ir = params.imageRef
  if (ir === 'signature') return SHOWROOM_CARDNEWS_SIGNATURE_IMAGE_URL
  const assetId = typeof ir === 'string' ? parseCardNewsAssetImageId(ir) : null
  if (assetId && params.assetUrlById?.has(assetId)) {
    const u = params.assetUrlById.get(assetId)?.trim() ?? ''
    if (u) return u
  }
  if (ir === 'before' && before) return before
  if (ir === 'after' && after) return after

  const role = params.role?.trim().toLowerCase() ?? ''
  if (role === 'problem' && before) return before
  if (role === 'hook' && after) return after
  if ((role === 'solution' || role === 'evidence' || role === 'cta') && after) return after
  return after || before || ''
}

function mergeSummaryAndDetail(summary: string, detail: string): string {
  const a = clean(summary)
  const b = clean(detail)
  if (!a) return b || ''
  if (!b) return a
  if (b.includes(a)) return b
  return `${a}\n\n${b}`
}

function splitSentenceChunks(text: string, maxChunkLength = 30): string[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
  if (!normalized) return []
  const sentences = normalized
    .split(/(?<=[.!?]|다\.|요\.|니다\.|까요\?|\?)/)
    .map((item) => item.trim())
    .filter(Boolean)
  const units = (sentences.length > 0 ? sentences : [normalized])
    .flatMap((sentence) => sentence.split(/,\s+|:\s+|;\s+/).map((item) => item.trim()).filter(Boolean))
  const chunks: string[] = []
  for (const unit of units) {
    if (unit.length <= maxChunkLength) {
      chunks.push(unit)
      continue
    }
    const words = unit.split(/\s+/).filter(Boolean)
    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length > maxChunkLength && current) {
        chunks.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    if (current) chunks.push(current)
  }
  return chunks
}

function formatCardNewsDisplayBody(text: string, linesPerParagraph = 2): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const rawParagraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split('\n').map((line) => line.trim()).filter(Boolean))
    .filter((paragraph) => paragraph.length > 0)
  if (rawParagraphs.length > 1) {
    return rawParagraphs.map((paragraph) => paragraph.join('\n')).join('\n')
  }
  const lines = rawParagraphs[0] ?? []
  if (lines.length <= linesPerParagraph) return lines.join('\n')
  const paragraphs: string[] = []
  for (let index = 0; index < lines.length; index += linesPerParagraph) {
    paragraphs.push(lines.slice(index, index + linesPerParagraph).join('\n'))
  }
  return paragraphs.join('\n')
}

function formatEvidenceCardNewsBody(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const bulletCandidates = normalized.includes('\n')
    ? normalized.split('\n')
    : normalized.split(/\s+-\s+/)

  const items = bulletCandidates
    .map((item) => {
      const trimmed = item.trim()
      if (!trimmed) return ''
      return trimmed.replace(/^-\s*/, '').trim()
    })
    .filter(Boolean)

  if (items.length <= 1) return formatCardNewsDisplayBody(normalized)
  return items.map((item) => `- ${item}`).join('\n')
}

function shapeCardNewsBodyForDisplay(
  text: string,
  role?: 'hook' | 'problem' | 'specific-problem' | 'solution' | 'evidence' | 'cta' | string,
): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  if (normalized.includes('\n')) return formatCardNewsDisplayBody(normalized)

  const normalizedRole = role?.trim().toLowerCase() ?? ''
  const maxChunkLength =
    normalizedRole === 'hook' ? 20
      : normalizedRole === 'cta' ? 18
      : 24
  const maxLines =
    normalizedRole === 'hook' ? 3
      : normalizedRole === 'cta' ? 4
      : 5
  const linesPerParagraph =
    normalizedRole === 'hook' ? 1 : 2

  const lines = splitSentenceChunks(normalized, maxChunkLength).slice(0, maxLines)
  if (lines.length === 0) return normalized
  return formatCardNewsDisplayBody(lines.join('\n'), linesPerParagraph)
}

export type ShowroomCardDisplayRole = 'hook' | 'problem' | 'solution' | 'evidence' | 'cta'
  | 'specific-problem'

export function formatShowroomCardTextForDisplay(params: {
  text: string
  role?: ShowroomCardDisplayRole | string
}): string {
  const normalized = params.text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const role = params.role?.trim().toLowerCase()
  if (role === 'evidence' || role === 'specific-problem') return formatEvidenceCardNewsBody(normalized)
  return shapeCardNewsBodyForDisplay(normalized, role)
}

function normalizeCardNewsSource(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/프레임$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatCardNewsSections(
  sections: Array<string | null | undefined>,
  options?: { maxLines?: number; maxChunkLength?: number; linesPerParagraph?: number },
): string {
  const normalizedSections = sections
    .map((section) => normalizeCardNewsSource(section))
    .filter(Boolean)
  const dedupedSections: string[] = []
  normalizedSections.forEach((section) => {
    const previous = dedupedSections[dedupedSections.length - 1] ?? ''
    if (!previous) {
      dedupedSections.push(section)
      return
    }
    if (section === previous) return
    if (section.includes(previous)) {
      dedupedSections[dedupedSections.length - 1] = section
      return
    }
    dedupedSections.push(section)
  })

  const maxLines = options?.maxLines ?? 4
  const maxChunkLength = options?.maxChunkLength ?? 30
  const paragraphs: string[] = []
  let usedLines = 0

  for (const section of dedupedSections) {
    if (usedLines >= maxLines) break
    const lines = splitSentenceChunks(section, maxChunkLength)
    if (lines.length === 0) continue
    const available = maxLines - usedLines
    const taken = lines.slice(0, available)
    if (taken.length === 0) continue
    paragraphs.push(taken.join('\n'))
    usedLines += taken.length
  }

  return formatCardNewsDisplayBody(paragraphs.join('\n\n'), options?.linesPerParagraph ?? 2)
}

export type ShowroomCaseCardNewsPackage = {
  displayName: string
  slides: ShowroomCaseCardNewsSlide[]
}

/** 운영자 최소 브리프 — LLM 프롬프트에서 사실 원천으로 우선 사용하도록 명시 */
export type ShowroomCaseN8nAuthorBrief = {
  primaryProblemNote: string
  primarySolutionNote: string
  evidenceNotes: string[]
}

/** 블로그/n8n용 — DB 이미지 자산 메타를 LLM이 전개 문장에 녹이도록 전달 */
export type ShowroomCaseN8nImageContextItem = {
  assetId: string
  /** 미리보기용 공개 URL — `body_markdown`의 `![alt](url)`에 그대로 사용 */
  url: string
  /** 비포/애프/미분류 */
  beforeAfter: 'before' | 'after' | null
  productName: string | null
  colorName: string | null
  location: string | null
  businessType: string | null
  isMain: boolean
  /** 프롬프트에 그대로 붙일 한 줄 설명 */
  summaryLine: string
}

export type ShowroomCaseN8nPayload = {
  contentType: 'showroom-case-content'
  channel: 'cardnews+blog'
  displayName: string
  siteName: string
  externalLabel: string | null
  industry: string | null
  titleHint: string
  hook: string
  problemSummary: string
  problemDetail: string
  solutionSummary: string
  solutionDetail: string
  evidencePoints: string[]
  /** 최소 입력(LLM 확장 시 우선 참고). `problemDetail`/`solutionDetail`과 동일 원천을 명시적으로 분리해 둠 */
  authorBrief: ShowroomCaseN8nAuthorBrief
  cardNews: ShowroomCaseCardNewsPackage
  blogDraftMarkdown: string
  /** 현장 컷 메타(제품·컬러·비포애프 등) — 블로그 분량·구체성 보강용 */
  imageContext: ShowroomCaseN8nImageContextItem[]
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function compactLines(values: Array<string | null | undefined>): string[] {
  return values.map((value) => clean(value)).filter(Boolean)
}

export function getShowroomCasePublicDisplayName(seed: ShowroomCaseContentSeed): string {
  return clean(broadenPublicDisplayName(seed.externalLabel ?? null))
    || clean(seed.externalLabel)
    || clean(seed.siteName)
    || '시공 사례'
}

export function buildShowroomCaseCardNewsPackage(seed: ShowroomCaseContentSeed): ShowroomCaseCardNewsPackage {
  const displayName = getShowroomCasePublicDisplayName(seed)
  const evidencePoints = (seed.evidencePoints ?? []).map((item) => clean(item)).filter(Boolean)
  return {
    displayName,
    slides: [
      {
        key: 'hook',
        title: displayName,
        body: formatCardNewsSections([clean(seed.headlineHook) || '이 공간은 무엇이 달라졌을까요?'], {
          maxLines: 3,
          maxChunkLength: 20,
          linesPerParagraph: 2,
        }),
      },
      {
        key: 'problem',
        title: '문제 인식',
        body: formatCardNewsSections(
          [seed.painPoint ?? ''],
          {
            maxLines: 3,
            maxChunkLength: 22,
            linesPerParagraph: 1,
          },
        ) || formatCardNewsDisplayBody('문제 인식을\n정리 중입니다.', 1),
      },
      {
        key: 'specific-problem',
        title: '구체 문제',
        body: formatCardNewsSections(
          [seed.problemDetail ?? ''],
          {
            maxLines: 5,
            maxChunkLength: 24,
            linesPerParagraph: 2,
          },
        ) || formatCardNewsDisplayBody('구체 문제를\n정리 중입니다.'),
      },
      {
        key: 'solution',
        title: '해결 접근',
        body: formatCardNewsSections(
          [seed.solutionPoint ?? '', seed.solutionDetail ?? ''],
          {
            maxLines: 5,
            maxChunkLength: 24,
            linesPerParagraph: 2,
          },
        ) || formatCardNewsDisplayBody('적용 방향을\n정리 중입니다.'),
      },
      {
        key: 'evidence',
        title: '변화 포인트',
        body: evidencePoints.length > 0 ? evidencePoints.map((item) => `- ${item}`).join('\n') : '전후 변화와 관찰 포인트를 정리 중입니다.',
      },
      {
        key: 'cta',
        title: '우리 공간에도 적용해볼까요?',
        body: formatCardNewsSections(
          [
            `${displayName} 사례처럼`,
            '우리 공간에 맞는, 교육 환경 구성이 필요하다면',
            '파인드가구와 상의하세요',
          ],
          {
            maxLines: 4,
            maxChunkLength: 18,
            linesPerParagraph: 2,
          },
        ),
      },
    ],
  }
}

export function buildShowroomCaseBlogDraft(seed: ShowroomCaseContentSeed): string {
  const displayName = getShowroomCasePublicDisplayName(seed)
  const headlineHook = clean(seed.headlineHook) || '이 공간은 무엇이 달라졌을까요?'
  const painPoint = clean(seed.painPoint)
  const problemDetail = clean(seed.problemDetail)
  const solutionPoint = clean(seed.solutionPoint)
  const solutionDetail = clean(seed.solutionDetail)
  const evidencePoints = (seed.evidencePoints ?? []).map((item) => clean(item)).filter(Boolean)
  const evidenceBlock = evidencePoints.length > 0
    ? evidencePoints.map((item) => `- ${item}`).join('\n')
    : '- 전후 변화와 관찰 포인트를 정리 중입니다.'

  return [
    `# ${displayName}`,
    '',
    `## 한 줄 훅`,
    headlineHook,
    '',
    `## 현장 과제`,
    compactLines([painPoint, problemDetail]).join('\n\n') || '현장 과제를 정리 중입니다.',
    '',
    `## 해결 방식`,
    compactLines([solutionPoint, solutionDetail]).join('\n\n') || '적용 방향을 정리 중입니다.',
    '',
    `## 변화 포인트`,
    evidenceBlock,
    '',
    `## 마무리`,
    `${displayName} 사례처럼 우리 공간에 맞는 교육 환경을 고민하고 있다면, 현재 공간의 과제부터 함께 정리해보는 것이 가장 빠른 출발점입니다.`,
  ].join('\n')
}

/**
 * n8n/OpenAI 없이 작업실에서 만든 6장 패키지를
 * `cardNewsGeneration.response`에 넣을 때 사용합니다. {@link ShowroomCaseApproachPage}가 읽는 형식과 맞춥니다.
 */
export function buildLocalCardNewsMasterResponse(
  pkg: ShowroomCaseCardNewsPackage,
  options?: { slideImageUrls?: string[] },
): {
  cardNews: {
    master: {
      cta: string
      slides: Array<{
        slide: number
        role: string
        title: string
        text: string
        imageRef?: string
        imageAssetId?: string
        imageUrl?: string
      }>
    }
  }
} {
  const ctaBody = pkg.slides.find((s) => s.key === 'cta')?.body ?? ''
  return {
    cardNews: {
      master: {
        cta: ctaBody,
        slides: pkg.slides.map((slide, index) => {
          const imageUrl =
            options?.slideImageUrls?.[index]?.trim() ?? slide.imageUrl?.trim() ?? ''
          const ir = slide.imageRef
          const assetId = typeof ir === 'string' ? parseCardNewsAssetImageId(ir) : null
          const base: {
            slide: number
            role: string
            title: string
            text: string
            imageUrl?: string
            imageAssetId?: string
            imageRef?: string
          } = {
            slide: index + 1,
            role: slide.key,
            title: slide.title,
            text: slide.body,
          }
          if (imageUrl) base.imageUrl = imageUrl
          if (assetId) {
            base.imageAssetId = assetId
            base.imageRef = `asset:${assetId}`
          } else if (ir === 'before' || ir === 'after' || ir === 'signature') {
            base.imageRef = ir
          }
          return base
        }),
      },
    },
  }
}

const CARD_KEYS: ShowroomCaseCardNewsSlide['key'][] = ['hook', 'problem', 'specific-problem', 'solution', 'evidence', 'cta']

function normalizeStoredSlideRole(role: string): ShowroomCaseCardNewsSlide['key'] {
  const r = clean(role).toLowerCase()
  if (r === 'specific_problem' || r === 'specificproblem' || r === 'problem-detail' || r === 'detail-problem') return 'specific-problem'
  if (CARD_KEYS.includes(r as ShowroomCaseCardNewsSlide['key'])) return r as ShowroomCaseCardNewsSlide['key']
  return 'evidence'
}

export function normalizeShowroomCardNewsSlides(params: {
  slides: ShowroomCaseCardNewsSlide[] | null | undefined
  fallbackSlides?: ShowroomCaseCardNewsSlide[]
}): ShowroomCaseCardNewsSlide[] {
  const orderedKeys: ShowroomCaseCardNewsSlide['key'][] = ['hook', 'problem', 'specific-problem', 'solution', 'evidence', 'cta']
  const fallbackMap = new Map((params.fallbackSlides ?? []).map((slide) => [slide.key, slide]))
  const existingMap = new Map((params.slides ?? []).map((slide) => [slide.key, slide]))
  const normalizedSlides: ShowroomCaseCardNewsSlide[] = []

  const legacyProblem = existingMap.get('problem')
  if (!existingMap.has('specific-problem') && legacyProblem && fallbackMap.has('specific-problem')) {
    existingMap.set('specific-problem', {
      ...fallbackMap.get('specific-problem')!,
      imageRef: fallbackMap.get('specific-problem')?.imageRef ?? legacyProblem.imageRef,
      imageUrl: fallbackMap.get('specific-problem')?.imageUrl ?? legacyProblem.imageUrl,
    })
  }

  orderedKeys.forEach((key) => {
    const existing = existingMap.get(key)
    if (existing) {
      normalizedSlides.push(existing)
      return
    }
    const fallback = fallbackMap.get(key)
    if (fallback) normalizedSlides.push(fallback)
  })

  return normalizedSlides
}

/** 저장된 cardNewsGeneration.response에서 슬라이드 배열을 복원합니다. */
export function parseCardNewsSlidesFromStoredResponse(response: unknown): ShowroomCaseCardNewsSlide[] | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null
  const root = response as Record<string, unknown>
  const payloadWrap =
    root.payload && typeof root.payload === 'object' && !Array.isArray(root.payload)
      ? (root.payload as Record<string, unknown>)
      : null
  const cardNews =
    root.cardNews && typeof root.cardNews === 'object' && !Array.isArray(root.cardNews)
      ? (root.cardNews as Record<string, unknown>)
      : payloadWrap?.cardNews && typeof payloadWrap.cardNews === 'object' && !Array.isArray(payloadWrap.cardNews)
        ? (payloadWrap.cardNews as Record<string, unknown>)
        : null
  const master = cardNews?.master && typeof cardNews.master === 'object' && !Array.isArray(cardNews.master)
    ? cardNews.master as Record<string, unknown>
    : null
  const slides = master?.slides
  if (!Array.isArray(slides) || slides.length === 0) return null

  const out: ShowroomCaseCardNewsSlide[] = []
  for (const raw of slides) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const s = raw as Record<string, unknown>
    const role = normalizeStoredSlideRole(typeof s.role === 'string' ? s.role : '')
    const title = clean(typeof s.title === 'string' ? s.title : '')
    const text = clean(typeof s.text === 'string' ? s.text : typeof s.body === 'string' ? s.body : '')
    const ir = s.imageRef
    let imageRef: CardNewsSlideImageRef = 'auto'
    if (ir === 'before' || ir === 'after' || ir === 'signature') imageRef = ir
    else if (typeof ir === 'string' && ir.startsWith('asset:')) imageRef = ir as CardNewsSlideImageRef
    const aid = typeof s.imageAssetId === 'string' ? s.imageAssetId.trim() : ''
    if (!parseCardNewsAssetImageId(typeof ir === 'string' ? ir : '') && aid) {
      imageRef = makeCardNewsAssetImageRef(aid)
    }
    const imageUrl = clean(typeof s.imageUrl === 'string' ? s.imageUrl : '')
    out.push({ key: role, title, body: text, imageRef, ...(imageUrl ? { imageUrl } : {}) })
  }
  return out.length > 0 ? out : null
}

function sortAssetsForBlogContext(images: ShowroomImageAsset[]): ShowroomImageAsset[] {
  const list = Array.isArray(images) ? [...images] : []
  return list.sort((a, b) => {
    const ra = a.before_after_role === 'before' ? 0 : a.before_after_role === 'after' ? 1 : 2
    const rb = b.before_after_role === 'before' ? 0 : b.before_after_role === 'after' ? 1 : 2
    if (ra !== rb) return ra - rb
    const oa = a.before_after_site_order ?? 9999
    const ob = b.before_after_site_order ?? 9999
    if (oa !== ob) return oa - ob
    if (a.is_main !== b.is_main) return a.is_main ? -1 : 1
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })
}

/**
 * 상담 이미지 자산 메타를 n8n 블로그 프롬프트에 실을 요약 행으로 만듭니다.
 * 사실(메타)만 넘기고, LLM이 전개·연결하도록 합니다.
 */
export function buildShowroomCaseN8nImageContext(images: ShowroomImageAsset[] | undefined | null): ShowroomCaseN8nImageContextItem[] {
  const sorted = sortAssetsForBlogContext(images ?? [])
  const max = 30
  const out: ShowroomCaseN8nImageContextItem[] = []
  for (const a of sorted.slice(0, max)) {
    const id = a.id?.trim()
    if (!id) continue
    const role =
      a.before_after_role === 'before' || a.before_after_role === 'after' ? a.before_after_role : null
    const productName = clean(a.product_name) || null
    const colorName = clean(a.color_name) || null
    const location = clean(a.location) || null
    const businessType = clean(a.business_type) || null
    const mainTag = a.is_main ? '대표컷' : ''
    const roleKo =
      role === 'before' ? '비포' : role === 'after' ? '애프터' : '기타'
    const bits = [
      mainTag,
      roleKo,
      productName,
      colorName,
      location,
      businessType,
    ].filter(Boolean)
    const summaryLine =
      bits.length > 0 ? bits.join(' · ') : `${roleKo} 컷`
    const url = getShowroomImagePreviewUrl(a).trim()
    out.push({
      assetId: id,
      url,
      beforeAfter: role,
      productName,
      colorName,
      location,
      businessType,
      isMain: Boolean(a.is_main),
      summaryLine,
    })
  }
  return out
}

export function buildShowroomCaseN8nPayload(
  seed: ShowroomCaseContentSeed,
  options?: { cardNewsPackage?: ShowroomCaseCardNewsPackage; projectImages?: ShowroomImageAsset[] },
): ShowroomCaseN8nPayload {
  const displayName = getShowroomCasePublicDisplayName(seed)
  const hook = clean(seed.headlineHook) || '이 공간은 무엇이 달라졌을까요?'
  const problemSummary = clean(seed.painPoint)
  const problemDetail = clean(seed.problemDetail)
  const solutionSummary = clean(seed.solutionPoint)
  const solutionDetail = clean(seed.solutionDetail)
  const evidencePoints = (seed.evidencePoints ?? []).map((item) => clean(item)).filter(Boolean)
  const cardNews = options?.cardNewsPackage ?? buildShowroomCaseCardNewsPackage(seed)
  const blogDraftMarkdown = buildShowroomCaseBlogDraft(seed)

  const authorBrief: ShowroomCaseN8nAuthorBrief = {
    primaryProblemNote: clean(seed.problemDetail),
    primarySolutionNote: clean(seed.solutionDetail),
    evidenceNotes: evidencePoints,
  }

  const imageContext = buildShowroomCaseN8nImageContext(options?.projectImages)

  return {
    contentType: 'showroom-case-content',
    channel: 'cardnews+blog',
    displayName,
    siteName: clean(seed.siteName),
    externalLabel: clean(seed.externalLabel) || null,
    industry: clean(seed.industry) || null,
    titleHint: displayName,
    hook,
    problemSummary,
    problemDetail,
    solutionSummary,
    solutionDetail,
    evidencePoints,
    authorBrief,
    cardNews,
    blogDraftMarkdown,
    imageContext,
  }
}
