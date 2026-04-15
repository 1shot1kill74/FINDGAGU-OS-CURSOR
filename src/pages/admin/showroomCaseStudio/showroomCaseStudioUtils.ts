import { getShowroomAssetGroupKey, type ShowroomImageAsset } from '@/lib/imageAssetService'
import { broadenPublicDisplayName } from '@/lib/showroomShareService'
import type { ShowroomCaseCardNewsPackage, ShowroomCaseCardNewsSlide, ShowroomCaseContentSeed } from '@/lib/showroomCaseContentPackage'
import {
  buildDefaultCardNewsImageRefs,
  buildShowroomAssetUrlByIdMap,
  buildShowroomCaseCardNewsPackage,
  getShowroomCasePublicDisplayName,
  normalizeShowroomCardNewsSlides,
  parseCardNewsSlidesFromStoredResponse,
  resolveCardNewsSlideImageUrl,
} from '@/lib/showroomCaseContentPackage'
import { PROBLEM_FRAME_OPTIONS, SOLUTION_FRAME_OPTIONS } from './showroomCaseStudioConstants'
import type { CaseDraftSeedRow, CaseDraftState, StudioCardNewsSlide } from './showroomCaseStudioTypes'

export function buildStudioContentSeed(row: CaseDraftSeedRow): ShowroomCaseContentSeed {
  const rawGeneratedPainPoint = summarizeText(row.problemDetail, 30)
  const rawGeneratedSolutionPoint = summarizeText(row.solutionDetail, 30)
  const generatedHeadlineHook = buildHeadlineHook({ problemDetail: row.problemDetail })
  const finalHeadlineHook = normalizeText(row.headlineHook) || generatedHeadlineHook
  const previewPainPoint = rawGeneratedPainPoint || (row.problemCode ? PROBLEM_FRAME_OPTIONS.find((item) => item.code === row.problemCode)?.summary ?? '' : '')
  const previewSolutionPoint = rawGeneratedSolutionPoint || (row.solutionCode ? SOLUTION_FRAME_OPTIONS.find((item) => item.code === row.solutionCode)?.summary ?? '' : '')
  const evidencePoints = row.evidencePoints.split('\n').map((item) => item.trim()).filter(Boolean)
  return {
    siteName: row.siteName,
    externalLabel: row.externalLabel,
    industry: row.industry,
    headlineHook: finalHeadlineHook,
    painPoint: previewPainPoint,
    problemDetail: row.problemDetail,
    solutionPoint: previewSolutionPoint,
    solutionDetail: row.solutionDetail,
    evidencePoints,
  }
}

function getProblemFrameMeta(row: Pick<CaseDraftState, 'problemCode' | 'problemFrameLabel' | 'cardNewsSlides'>) {
  const option = row.problemCode
    ? PROBLEM_FRAME_OPTIONS.find((item) => item.code === row.problemCode)
    : undefined
  const slideTitle = row.cardNewsSlides.find((slide) => slide.key === 'problem')?.title ?? ''
  return {
    label: normalizeText(slideTitle) || normalizeText(row.problemFrameLabel) || option?.label || '',
    summary: option?.summary || '',
  }
}

function getSolutionFrameMeta(row: Pick<CaseDraftState, 'solutionCode' | 'solutionFrameLabel' | 'cardNewsSlides'>) {
  const option = row.solutionCode
    ? SOLUTION_FRAME_OPTIONS.find((item) => item.code === row.solutionCode)
    : undefined
  const slideTitle = row.cardNewsSlides.find((slide) => slide.key === 'solution')?.title ?? ''
  return {
    label: normalizeText(slideTitle) || normalizeText(row.solutionFrameLabel) || option?.label || '',
    summary: option?.summary || '',
  }
}

export function buildTemplatedCaseSeed(row: CaseDraftState): ShowroomCaseContentSeed {
  const problem = getProblemFrameMeta(row)
  const solution = getSolutionFrameMeta(row)
  const slideMap = slideMapFromRow(row)
  const problemBody = slideMap.get('problem')?.body?.trim() ?? ''
  const solutionBody = slideMap.get('solution')?.body?.trim() ?? ''
  const evidenceBody = slideMap.get('evidence')?.body?.trim() ?? row.evidencePoints
  const problemDetail = normalizeText(row.problemDetail || problemBody)
  const solutionDetail = normalizeText(row.solutionDetail || solutionBody)
  const evidencePoints = evidenceBody
    .split('\n')
    .map((item) => item.replace(/^-\s*/, '').trim())
    .filter(Boolean)
  const painPoint = problem.summary || summarizeText(problemDetail, 30)
  const solutionPoint = solution.summary || summarizeText(solutionDetail, 30)
  const hookBase = problem.label || painPoint || problemDetail
  const headlineHook = normalizeText(row.headlineHook) || (hookBase ? `${summarizeText(hookBase, 22)} 왜 생겼을까요?` : buildHeadlineHook({ problemDetail }))

  return {
    siteName: row.siteName,
    externalLabel: row.externalLabel,
    industry: row.industry,
    headlineHook,
    painPoint,
    problemDetail: compactLines([
      problem.label ? `${problem.label} 프레임` : '',
      problemDetail,
    ]).join('\n\n'),
    solutionPoint,
    solutionDetail: compactLines([
      solution.label ? `${solution.label} 프레임` : '',
      solutionDetail,
    ]).join('\n\n'),
    evidencePoints,
  }
}

export function buildTemplatedStudioSlides(row: CaseDraftState): StudioCardNewsSlide[] {
  const pkg = buildShowroomCaseCardNewsPackage(buildTemplatedCaseSeed(row))
  const defaults = buildDefaultCardNewsImageRefs(row.projectImages ?? [])
  return pkg.slides.map((slide) => ({
    id: crypto.randomUUID(),
    key: slide.key,
    title: slide.title,
    body: slide.body,
    imageRef: defaults[slide.key],
  }))
}

export function studioSlidesFromResponse(
  response: unknown,
  computedPkg: ShowroomCaseCardNewsPackage,
  projectImages: ShowroomImageAsset[] | undefined,
  options?: { problemFrameLabel?: string; solutionFrameLabel?: string },
): StudioCardNewsSlide[] {
  const defaults = buildDefaultCardNewsImageRefs(projectImages ?? [])
  const parsed = parseCardNewsSlidesFromStoredResponse(response)
  const slides = normalizeShowroomCardNewsSlides({
    slides: parsed,
    fallbackSlides: computedPkg.slides,
  })
  return slides.map((slide) => {
    const title =
      slide.key === 'problem' && options?.problemFrameLabel?.trim()
        ? options.problemFrameLabel.trim()
        : slide.key === 'solution' && options?.solutionFrameLabel?.trim()
          ? options.solutionFrameLabel.trim()
          : slide.title
    return {
      id: crypto.randomUUID(),
      key: slide.key,
      title,
      body: slide.body,
      imageRef:
        slide.imageRef && slide.imageRef !== 'auto'
          ? slide.imageRef
          : defaults[slide.key],
      imageUrl: slide.imageUrl,
    }
  })
}

function slideMapFromRow(row: CaseDraftState): Map<ShowroomCaseCardNewsSlide['key'], StudioCardNewsSlide> {
  return new Map(row.cardNewsSlides.map((s) => [s.key, s]))
}

/** 카드 편집 내용을 프로필·n8n 시드로 쓰기 위한 값입니다. */
export function deriveStudioSeedFromSlides(row: CaseDraftState): ShowroomCaseContentSeed {
  if (
    row.problemCode
    || row.solutionCode
    || row.problemFrameLabel.trim()
    || row.solutionFrameLabel.trim()
    || row.problemDetail.trim()
    || row.solutionDetail.trim()
  ) {
    return buildTemplatedCaseSeed(row)
  }
  const m = slideMapFromRow(row)
  const problemBody = m.get('problem')?.body?.trim() ?? ''
  const specificProblemBody = m.get('specific-problem')?.body?.trim() ?? problemBody
  const solutionBody = m.get('solution')?.body?.trim() ?? ''
  const hookBody = m.get('hook')?.body?.trim() ?? ''
  const evidenceBody = m.get('evidence')?.body?.trim() ?? ''

  const evidencePoints = evidenceBody
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean)

  const painPoint = summarizeText(problemBody, 30)
  const solutionPoint = summarizeText(solutionBody, 30)
  const headlineHook = normalizeText(hookBody) || buildHeadlineHook({ problemDetail: specificProblemBody || problemBody })

  return {
    siteName: row.siteName,
    externalLabel: row.externalLabel,
    industry: row.industry,
    headlineHook,
    painPoint,
    problemDetail: specificProblemBody,
    solutionPoint,
    solutionDetail: solutionBody,
    evidencePoints,
  }
}

export function studioRowToCardPackage(row: CaseDraftState): ShowroomCaseCardNewsPackage {
  const seed = deriveStudioSeedFromSlides(row)
  const projectImages = row.projectImages ?? []
  const assetMap = buildShowroomAssetUrlByIdMap(projectImages)
  const defaults = buildDefaultCardNewsImageRefs(projectImages)
  return {
    displayName: getShowroomCasePublicDisplayName(seed),
    slides: row.cardNewsSlides.map((s) => {
      const effectiveRef = s.imageRef === 'auto' ? defaults[s.key] : s.imageRef
      return {
        key: s.key,
        title: s.title,
        body: s.body,
        imageRef: s.imageRef,
        imageUrl:
          resolveCardNewsSlideImageUrl({
            role: s.key,
            imageRef: effectiveRef,
            beforeUrl: row.beforeUrl,
            afterUrl: row.afterUrl,
            assetUrlById: assetMap,
            imageUrl: s.imageUrl,
          }) || null,
      }
    }),
  }
}

export function getGenerationStatusLabel(status: CaseDraftState['cardNewsGeneration']['status']) {
  switch (status) {
    case 'processing':
      return '생성 중'
    case 'completed':
      return '완료'
    case 'failed':
      return '실패'
    default:
      return '대기'
  }
}

export function getGenerationStatusTone(status: CaseDraftState['cardNewsGeneration']['status']) {
  switch (status) {
    case 'processing':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
    case 'failed':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

export function formatGenerationTimestamp(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ko-KR')
}

export function buildPublicCardNewsPath(siteKey: string) {
  return `/public/showroom/cardnews/${encodeURIComponent(siteKey)}`
}

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function compactLines(values: Array<string | null | undefined>): string[] {
  return values.map((value) => normalizeText(value ?? '')).filter(Boolean)
}

export function summarizeText(value: string, maxLength = 48): string {
  const normalized = normalizeText(value)
  if (!normalized) return ''
  const sentence = normalized
    .split(/[.!?]\s+|(?:입니다|입니다만|합니다|합니다만|했어요|했습니다)\s+/)[0]
    ?.trim() || normalized
  if (sentence.length <= maxLength) return sentence
  return `${sentence.slice(0, maxLength - 1).trim()}…`
}

function buildHeadlineHook(params: {
  problemDetail: string
}): string {
  const problem = summarizeText(params.problemDetail, 22)
  if (problem) return `${problem} 왜 생겼을까요?`
  return '이 공간은 무엇이 달라졌을까요?'
}

function preferredSiteName(images: ShowroomImageAsset[]) {
  const sorted = [...images].sort((a, b) => {
    const at = a.created_at ? new Date(a.created_at).getTime() : 0
    const bt = b.created_at ? new Date(b.created_at).getTime() : 0
    return bt - at
  })
  for (const image of sorted) {
    const canonical = image.canonical_site_name?.trim()
    if (canonical) return canonical
    const siteName = image.site_name?.trim()
    if (siteName) return siteName
  }
  return '미지정'
}

function preferredExternalLabel(images: ShowroomImageAsset[]) {
  for (const image of images) {
    const value = broadenPublicDisplayName(image.external_display_name?.trim() ?? null)
    if (value) return value
  }
  return ''
}

export function groupBeforeAfter(assets: ShowroomImageAsset[]) {
  const byGroup = new Map<string, ShowroomImageAsset[]>()
  assets
    .filter((asset) => asset.before_after_role === 'before' || asset.before_after_role === 'after')
    .forEach((asset) => {
      const key = getShowroomAssetGroupKey(asset)
      const list = byGroup.get(key) ?? []
      list.push(asset)
      byGroup.set(key, list)
    })

  return Array.from(byGroup.values())
    .filter((images) => images.some((i) => i.before_after_role === 'before') && images.some((i) => i.before_after_role === 'after'))
    .map((images) => {
      const before = images.find((i) => i.before_after_role === 'before') ?? null
      const after = images.find((i) => i.before_after_role === 'after' && i.is_main) ?? images.find((i) => i.before_after_role === 'after') ?? null
      return {
        siteName: preferredSiteName(images),
        externalLabel: preferredExternalLabel(images),
        industry: images.map((i) => i.business_type?.trim()).find(Boolean) ?? '기타',
        products: Array.from(new Set(images.map((i) => i.product_name?.trim()).filter(Boolean) as string[])),
        before,
        after,
        images,
      }
    })
    .sort((a, b) => a.siteName.localeCompare(b.siteName, 'ko'))
}
