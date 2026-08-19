import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, FileText, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import {
  buildCanonicalBlogPostFromN8nBlogResponse,
  renderCanonicalBlogPostHtml,
  type ShowroomCaseBlogImageOverlayHint,
} from '@/lib/showroomCaseCanonicalBlog'
import { usePageHead, type PageHeadJsonLd, type PageHeadMetaTag } from '@/lib/usePageHead'
import { getPublicShowroomDefaultOgImageUrl } from '@/lib/publicShowroomSeo'
import {
  buildPublicShowroomCasePath,
  getShowroomCasePublicSlug,
  looksLikeLegacyShowroomCaseKey,
} from '@/lib/showroomCaseSlug'
import {
  loadShowroomCaseApproachBundle,
  resolvePublicShowroomCaseHref,
  type ShowroomCaseApproachBundle,
} from '@/lib/showroomCaseApproachData'
import { matchesHiddenShowroomSite } from '@/lib/showroomHiddenSites'
import { fetchApprovedBlogShowroomCaseProfileDrafts, type ShowroomCaseProfileDraft } from '@/lib/showroomCaseProfileService'
import { fetchPublicShowroomAssets } from '@/lib/showroomShareService'
import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import { ShowroomBeforeAfterTapPreview } from '@/components/showroom/ShowroomBeforeAfterTapPreview'
import { ShowroomCaseBlogHtml } from '@/components/showroom/ShowroomCaseBlogHtml'
import { ShowroomStoryStickyMiniCta } from '@/pages/showroom/ShowroomStoryStickyMiniCta'
import { ShowroomCaseConsultationCta } from '@/pages/showroom/ShowroomCaseConsultationCta'
import { getBroadPublicLabel } from '@/pages/showroom/showroomPageGrouping'
import {
  appendShowroomConcernQuery,
  buildShowroomStoryBackHref,
  resolveShowroomStoryCta,
} from '@/pages/showroom/showroomStoryCta'
import { trackShowroomAbmEvent } from '@/lib/showroomAbmTracking'

const PROBLEM_FRAME_SUMMARY: Record<string, string> = {
  'focus-fatigue': '오래 머물기 어렵고 집중이 쉽게 끊기는 구조입니다.',
  'broken-flow': '이동과 관리 흐름이 끊겨 사용성과 운영 효율이 함께 떨어집니다.',
  'storage-chaos': '정리와 보관 체계가 공간 안에서 해결되지 않아 어수선함이 누적됩니다.',
  'weak-zoning': '공간의 역할 구분이 약해 학습, 협업, 대기 흐름이 섞여 보입니다.',
}

const SOLUTION_FRAME_SUMMARY: Record<string, string> = {
  'layout-for-focus': '오래 머물 수 있는 좌석 흐름을 먼저 잡고, 가구를 그에 맞춰 배치합니다.',
  'flow-optimized': '이동과 관리 동선을 짧게 만들어 사용하는 사람과 운영자 모두 덜 힘든 구조로 정리합니다.',
  'storage-integrated': '정리는 사후 관리가 아니라 가구 구성 안에서 자연스럽게 해결되도록 만듭니다.',
  'zoning-by-purpose': '한 공간 안에서도 활동 목적에 따라 구역이 읽히도록 제품과 배치를 정리합니다.',
}

type Mode = 'public' | 'internal'

function normalizeComparableText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function stripTrailingEllipsis(value: string): string {
  return value.replace(/[.…]+$/g, '').trim()
}

function isPreviewOfLongerText(preview: string | null | undefined, full: string | null | undefined): boolean {
  const normalizedPreview = stripTrailingEllipsis(normalizeComparableText(preview))
  const normalizedFull = normalizeComparableText(full)
  if (!normalizedPreview || !normalizedFull) return false
  if (normalizedPreview === normalizedFull) return true
  if (normalizedPreview.length < 8) return false
  return normalizedFull.startsWith(normalizedPreview)
}

type RelatedCase = {
  siteName: string
  externalLabel: string | null
  industry: string | null
  title: string
  summary: string
  href: string
  score: number
}

type UseRelatedApprovedBlogCasesParams = {
  enabled: boolean
  currentSiteName: string
  currentIndustry: string | null
  currentProblemCode: string | null
  currentSolutionCode: string | null
  currentBusinessTypes: string[]
}

function useRelatedApprovedBlogCases(params: UseRelatedApprovedBlogCasesParams): RelatedCase[] {
  const {
    enabled,
    currentSiteName,
    currentIndustry,
    currentProblemCode,
    currentSolutionCode,
    currentBusinessTypes,
  } = params
  const [drafts, setDrafts] = useState<ShowroomCaseProfileDraft[]>([])
  const [publicAssets, setPublicAssets] = useState<ShowroomImageAsset[]>([])

  useEffect(() => {
    if (!enabled) {
      setDrafts([])
      setPublicAssets([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const [rows, publicRows] = await Promise.all([
          fetchApprovedBlogShowroomCaseProfileDrafts(),
          fetchPublicShowroomAssets(),
        ])
        if (!cancelled) {
          setDrafts(rows)
          setPublicAssets(publicRows)
        }
      } catch {
        if (!cancelled) {
          setDrafts([])
          setPublicAssets([])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled])

  return useMemo<RelatedCase[]>(() => {
    if (!enabled || drafts.length === 0) return []
    const myTypes = new Set(currentBusinessTypes.map((t) => t.trim()).filter(Boolean))
    const scored = drafts
      .filter((d) => d.siteName.trim() !== currentSiteName.trim())
      .filter((d) => !matchesHiddenShowroomSite(d.siteName, d.canonicalSiteName))
      .map((d) => {
        let score = 0
        if (currentIndustry && d.industry && d.industry === currentIndustry) score += 3
        if (currentProblemCode && d.problemCode && d.problemCode === currentProblemCode) score += 2
        if (currentSolutionCode && d.solutionCode && d.solutionCode === currentSolutionCode) score += 1
        const summary =
          d.canonicalBlogPost?.structured?.featuredAnswer?.trim()
          || d.canonicalBlogPost?.seo?.seoDescription?.trim()
          || d.painPoint?.trim()
          || d.solutionPoint?.trim()
          || ''
        const title = d.canonicalBlogPost?.seo?.title?.trim() || d.canonicalBlogPost?.title?.trim() || d.siteName
        const externalLabel = d.canonicalSiteName ?? null
        const candidateType = (d.industry ?? '').trim()
        if (candidateType && myTypes.has(candidateType)) score += 1
        return {
          siteName: d.siteName,
          externalLabel,
          industry: d.industry ?? null,
          title,
          summary: summary.length > 140 ? `${summary.slice(0, 137)}…` : summary,
          href: resolvePublicShowroomCaseHref(d, publicAssets),
          score,
        }
      })
      .filter((r) => r.score > 0 || (currentIndustry == null && currentProblemCode == null))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return a.title.localeCompare(b.title, 'ko')
      })
    return scored.slice(0, 2)
  }, [enabled, drafts, publicAssets, currentSiteName, currentIndustry, currentProblemCode, currentSolutionCode, currentBusinessTypes])
}

export default function ShowroomCaseApproachPage({ mode = 'public' }: { mode?: Mode }) {
  usePublicShowroomChannelTalk(mode === 'public')

  const { siteKey } = useParams<{ siteKey: string }>()
  const [searchParams] = useSearchParams()
  const storyConcern = resolveShowroomStoryCta(searchParams.get('concern')).concern
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<ShowroomCaseApproachBundle | null>(null)

  const backHref = mode === 'public'
    ? buildShowroomStoryBackHref(storyConcern)
    : '/admin/showroom-case-studio'

  useEffect(() => {
    if (!siteKey) {
      setLoading(false)
      setError('현장 정보가 없습니다.')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      const result = await loadShowroomCaseApproachBundle(
        siteKey,
        mode === 'public' ? 'public' : 'internal'
      )
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        if (mode === 'public') {
          trackShowroomAbmEvent({
            eventName: 'abm_case_open_fail',
            siteName: siteKey,
            concern: storyConcern,
            metadata: { reason: result.reason ?? 'unknown', entry: 'case' },
          })
        }
        if (result.reason === 'not_found') {
          setError('해당 전후 비교 사례를 찾을 수 없습니다.')
        } else if (result.reason === 'incomplete') {
          setError('이 현장은 전후 이미지 세트가 완성되지 않아 설명 페이지를 열 수 없습니다.')
        } else {
          setError(result.message ?? '불러오지 못했습니다.')
        }
        setBundle(null)
        return
      }
      if (mode === 'public') {
        trackShowroomAbmEvent({
          eventName: 'abm_case_open',
          siteName: result.data.siteName,
          concern: storyConcern,
          industry: result.data.businessTypes[0] ?? null,
          metadata: { entry: 'case' },
        })
      }
      setBundle(result.data)
    })()

    return () => {
      cancelled = true
    }
  }, [siteKey, mode, storyConcern])

  const resolvedBundle: ShowroomCaseApproachBundle = bundle ?? {
    siteName: '',
    externalLabel: null,
    businessTypes: [],
    beforeImage: null,
    afterImage: null,
    siteImages: [],
    profile: null,
  }
  const pain = resolvedBundle.profile?.painPoint?.trim() || (resolvedBundle.profile?.problemCode ? PROBLEM_FRAME_SUMMARY[resolvedBundle.profile.problemCode] ?? '' : '')
  const solution = resolvedBundle.profile?.solutionPoint?.trim() || (resolvedBundle.profile?.solutionCode ? SOLUTION_FRAME_SUMMARY[resolvedBundle.profile.solutionCode] ?? '' : '')
  const displayName = resolvedBundle.externalLabel?.trim() || resolvedBundle.siteName
  const publicDisplayName = getBroadPublicLabel(resolvedBundle.siteName, resolvedBundle.externalLabel)
  const headlineName = mode === 'public' ? publicDisplayName : displayName
  const headlineHook = resolvedBundle.profile?.headlineHook?.trim() || pain || '이 공간은 무엇이 달라졌을까요?'
  const problemDetail = resolvedBundle.profile?.problemDetail?.trim()
  const solutionDetail = resolvedBundle.profile?.solutionDetail?.trim()
  const normalizedPain = normalizeComparableText(pain)
  const normalizedProblemDetail = normalizeComparableText(problemDetail)
  const normalizedSolution = normalizeComparableText(solution)
  const normalizedSolutionDetail = normalizeComparableText(solutionDetail)
  const isProblemPreview = Boolean(problemDetail) && isPreviewOfLongerText(pain, problemDetail)
  const isSolutionPreview = Boolean(solutionDetail) && isPreviewOfLongerText(solution, solutionDetail)
  const shouldShowProblemSummary = Boolean(pain) && !isProblemPreview
  const shouldShowProblemDetail = Boolean(problemDetail) && normalizedPain !== normalizedProblemDetail
  const shouldShowSolutionSummary = Boolean(solution) && !isSolutionPreview
  const shouldShowSolutionDetail = Boolean(solutionDetail) && normalizedSolution !== normalizedSolutionDetail
  const evidencePoints = resolvedBundle.profile?.evidencePoints?.filter((item) => item.trim()) ?? []
  const hasCopy = Boolean(pain || solution)
  const beforeHeroUrl = resolvedBundle.beforeImage?.thumbnail_url || resolvedBundle.beforeImage?.cloudinary_url || ''
  const afterHeroUrl = resolvedBundle.afterImage?.thumbnail_url || resolvedBundle.afterImage?.cloudinary_url || ''
  const hasBeforeAfterImages = Boolean(beforeHeroUrl.trim() && afterHeroUrl.trim())

  const isStoryLayout = mode === 'public'
  const canonicalBlog = resolvedBundle.profile?.canonicalBlogPost ?? null
  const generatedBlogPreview = useMemo(() => {
    if (canonicalBlog?.status === 'approved') return null
    const response = resolvedBundle.profile?.blogGeneration.response
    if (!response) return null
    return buildCanonicalBlogPostFromN8nBlogResponse({
      siteName: resolvedBundle.siteName,
      n8nResponse: response,
      beforeImageUrl: beforeHeroUrl,
      afterImageUrl: afterHeroUrl,
    })
  }, [afterHeroUrl, beforeHeroUrl, canonicalBlog?.status, resolvedBundle.profile?.blogGeneration.response, resolvedBundle.siteName])
  const displayBlog = canonicalBlog && (mode === 'internal' || canonicalBlog.status === 'approved')
    ? canonicalBlog
    : isStoryLayout
      ? generatedBlogPreview
      : null
  const showCanonicalBlogSection = displayBlog !== null

  const showRelatedCases = mode === 'public' && Boolean(canonicalBlog?.status === 'approved')
  const relatedCases = useRelatedApprovedBlogCases({
    enabled: showRelatedCases,
    currentSiteName: resolvedBundle.siteName,
    currentIndustry: resolvedBundle.profile?.industry ?? null,
    currentProblemCode: resolvedBundle.profile?.problemCode ?? null,
    currentSolutionCode: resolvedBundle.profile?.solutionCode ?? null,
    currentBusinessTypes: resolvedBundle.businessTypes,
  })

  const seoTitle = canonicalBlog?.seo.title?.trim() || `${headlineName} — 파인드가구 온라인 쇼룸 사례`
  const seoDescription = canonicalBlog?.seo.seoDescription?.trim() || pain || solution || ''
  const ogTitle = canonicalBlog?.seo.ogTitle?.trim() || seoTitle
  const ogDescription = canonicalBlog?.seo.ogDescription?.trim() || seoDescription
  const featuredAnswer = displayBlog?.structured?.featuredAnswer?.trim() || ''
  const faqItems = (displayBlog?.structured?.faqItems ?? []).filter(
    (q): q is { question: string; answer: string } =>
      Boolean(q && typeof q.question === 'string' && typeof q.answer === 'string' && q.question.trim() && q.answer.trim()),
  )
  const geoPoints = (displayBlog?.structured?.geoPoints ?? []).filter(
    (g): g is string => typeof g === 'string' && g.trim().length > 0,
  )
  const heroImageForOg = afterHeroUrl || beforeHeroUrl || getPublicShowroomDefaultOgImageUrl()
  const publicSlug = mode === 'public' && resolvedBundle.siteName
    ? getShowroomCasePublicSlug({
        siteName: resolvedBundle.siteName,
        title: canonicalBlog?.seo.title || canonicalBlog?.title,
        canonicalPath: canonicalBlog?.seo.canonicalPath,
      })
    : null
  const publicCasePath = resolvedBundle.siteName
    ? buildPublicShowroomCasePath({
        siteName: resolvedBundle.siteName,
        title: canonicalBlog?.seo.title || canonicalBlog?.title,
        canonicalPath: canonicalBlog?.seo.canonicalPath,
      })
    : null
  const currentCaseKey = (() => {
    if (!siteKey) return ''
    try {
      return decodeURIComponent(siteKey).trim()
    } catch {
      return siteKey.trim()
    }
  })()
  const canonicalUrl =
    typeof window !== 'undefined' && mode === 'public' && canonicalBlog?.status === 'approved'
      ? (publicCasePath
          ? new URL(publicCasePath, window.location.origin).toString()
          : `${window.location.origin}${window.location.pathname}`)
      : null

  const pageMetas = useMemo<PageHeadMetaTag[]>(() => {
    const list: PageHeadMetaTag[] = []
    if (seoDescription) list.push({ kind: 'name', name: 'description', content: seoDescription })
    if (ogTitle) list.push({ kind: 'property', property: 'og:title', content: ogTitle })
    if (ogDescription) list.push({ kind: 'property', property: 'og:description', content: ogDescription })
    list.push({ kind: 'property', property: 'og:type', content: 'article' })
    if (heroImageForOg) {
      list.push({ kind: 'property', property: 'og:image', content: heroImageForOg })
      list.push({ kind: 'property', property: 'og:image:width', content: '1200' })
      list.push({ kind: 'property', property: 'og:image:height', content: '630' })
    }
    if (typeof window !== 'undefined' && mode === 'public') {
      list.push({ kind: 'property', property: 'og:url', content: window.location.href })
    }
    list.push({ kind: 'name', name: 'twitter:card', content: 'summary_large_image' })
    if (ogTitle) list.push({ kind: 'name', name: 'twitter:title', content: ogTitle })
    if (ogDescription) list.push({ kind: 'name', name: 'twitter:description', content: ogDescription })
    if (heroImageForOg) list.push({ kind: 'name', name: 'twitter:image', content: heroImageForOg })
    if (mode === 'internal' || (canonicalBlog && canonicalBlog.status !== 'approved')) {
      list.push({ kind: 'name', name: 'robots', content: 'noindex, nofollow' })
    }
    return list
  }, [seoDescription, ogTitle, ogDescription, heroImageForOg, mode, canonicalBlog])

  const pageJsonLd = useMemo<PageHeadJsonLd[]>(() => {
    const list: PageHeadJsonLd[] = []
    if (canonicalBlog && canonicalBlog.status === 'approved') {
      const article: PageHeadJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: seoTitle,
        inLanguage: 'ko',
        author: { '@type': 'Organization', name: '파인드가구' },
        publisher: { '@type': 'Organization', name: '파인드가구' },
      }
      if (seoDescription) article.description = seoDescription
      if (heroImageForOg) article.image = [heroImageForOg]
      const datePublished = canonicalBlog.approvedAt || canonicalBlog.createdAt
      if (datePublished) article.datePublished = datePublished
      if (canonicalBlog.updatedAt) article.dateModified = canonicalBlog.updatedAt
      if (canonicalUrl) article.mainEntityOfPage = canonicalUrl
      list.push(article)

      if (faqItems.length > 0) {
        list.push({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqItems.map((q) => ({
            '@type': 'Question',
            name: q.question.trim(),
            acceptedAnswer: { '@type': 'Answer', text: q.answer.trim() },
          })),
        })
      }
    }
    return list
  }, [canonicalBlog, seoTitle, seoDescription, heroImageForOg, faqItems, canonicalUrl])

  usePageHead({
    title: seoTitle,
    metas: pageMetas,
    canonicalUrl,
    jsonLd: pageJsonLd,
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <p className="text-sm text-neutral-600">사례를 불러오는 중…</p>
      </div>
    )
  }

  if (error || !bundle) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-neutral-700 text-center max-w-md">{error ?? '표시할 수 없습니다.'}</p>
        <Button asChild variant="outline">
          <Link to={backHref}>돌아가기</Link>
        </Button>
      </div>
    )
  }

  if (
    mode === 'public'
    && publicSlug
    && currentCaseKey
    && currentCaseKey !== publicSlug
    && looksLikeLegacyShowroomCaseKey(currentCaseKey)
    && publicCasePath
  ) {
    const suffix = searchParams.toString()
    return <Navigate replace to={`${publicCasePath}${suffix ? `?${suffix}` : ''}`} />
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 md:px-6">
          <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-neutral-600 hover:text-neutral-900">
            <Link to={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {mode === 'public' ? '오픈 쇼룸' : '케이스 작업실'}
            </Link>
          </Button>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              {isStoryLayout ? '이 현장의 이야기' : '현장 기획 방식'}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900 md:text-3xl">{headlineName}</h1>
            {bundle.businessTypes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {bundle.businessTypes.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="inline-flex rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={cn('mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6 md:py-10', isStoryLayout && 'pb-24')}>
        {/* 공개 스토리: 전후(짧게) → 이야기 → 상담 → (아래) FAQ·지역·관련사례·쇼룸복귀. 데이터 삭제 없이 배치만 조정 */}
        {hasBeforeAfterImages ? (
          <section className="space-y-2" aria-labelledby="approach-ba-hero">
            {isStoryLayout ? (
              <div className="space-y-0.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">전후 비교</p>
                <h2 id="approach-ba-hero" className="text-lg font-semibold text-neutral-900">이 현장의 변화</h2>
              </div>
            ) : (
              <h2 id="approach-ba-hero" className="text-lg font-semibold text-neutral-900">전후 비교</h2>
            )}
            {isStoryLayout ? (
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <ShowroomBeforeAfterTapPreview
                  beforeSrc={beforeHeroUrl}
                  afterSrc={afterHeroUrl}
                  altLabel={headlineName}
                  aspectClassName="aspect-[16/10]"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                  <div className="relative aspect-[4/3] bg-neutral-100">
                    <img src={beforeHeroUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                      Before
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                  <div className="relative aspect-[4/3] bg-neutral-100">
                    <img src={afterHeroUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                      After
                    </span>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : null}

        {showCanonicalBlogSection && displayBlog ? (
          <section className="space-y-3" aria-labelledby="canonical-blog-article">
            <div className="flex flex-wrap items-center gap-2 text-neutral-900">
              <FileText className="h-5 w-5 text-emerald-700" aria-hidden />
              <h2 id="canonical-blog-article" className="text-lg font-semibold">
                {isStoryLayout ? '사례 이야기' : '사례 블로그 글'}
              </h2>
              {mode === 'internal' && displayBlog.status !== 'approved' ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                  미승인 정본은 공개 사용자에게 숨김 · 작업실에서 승인 필요
                </span>
              ) : null}
            </div>
            {(() => {
              const overlayHints: ShowroomCaseBlogImageOverlayHint[] = []
              const pushAssetHint = (asset: ShowroomImageAsset | null | undefined) => {
                if (!asset) return
                const urls = [asset.cloudinary_url, asset.thumbnail_url]
                for (const url of urls) {
                  const trimmed = url?.trim()
                  if (!trimmed) continue
                  overlayHints.push({
                    url: trimmed,
                    beforeAfter:
                      asset.before_after_role === 'before' || asset.before_after_role === 'after'
                        ? asset.before_after_role
                        : null,
                    productName: asset.product_name?.trim() || null,
                    colorName: asset.color_name?.trim() || null,
                  })
                }
              }
              const siteAssets = resolvedBundle.siteImages?.length
                ? resolvedBundle.siteImages
                : [resolvedBundle.beforeImage, resolvedBundle.afterImage]
              for (const asset of siteAssets) pushAssetHint(asset)
              const previewHtml = renderCanonicalBlogPostHtml(displayBlog, { overlayHints })
              return (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-800">
                  {featuredAnswer ? (
                    <aside
                      aria-label="핵심 요약"
                      className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-sm leading-relaxed text-emerald-900"
                    >
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">핵심 요약</p>
                      <p className="whitespace-pre-wrap">{featuredAnswer}</p>
                    </aside>
                  ) : null}
                  <ShowroomCaseBlogHtml html={previewHtml} />
                </div>
              )
            })()}
          </section>
        ) : null}

        {isStoryLayout ? (
          <ShowroomCaseConsultationCta
            concern={storyConcern}
            siteDisplayName={headlineName}
            siteName={resolvedBundle.siteName}
            surface="case_inline"
          />
        ) : null}

        {/* 부가 정보: 데이터 유지, 상담 아래로 내려 접어 둠 */}
        {isStoryLayout && (faqItems.length > 0 || geoPoints.length > 0) ? (
          <section className="space-y-2" aria-label="부가 정보">
            {faqItems.length > 0 ? (
              <details className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
                  자주 묻는 질문 ({faqItems.length})
                </summary>
                <ul className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
                  {faqItems.map((qa, idx) => (
                    <li key={`${idx}-${qa.question}`} className="rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-900">Q. {qa.question}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">A. {qa.answer}</p>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {geoPoints.length > 0 ? (
              <details className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
                  지역 · 위치 메모 ({geoPoints.length})
                </summary>
                <ul className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
                  {geoPoints.map((g, idx) => (
                    <li
                      key={`${idx}-${g}`}
                      className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs text-neutral-700"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        ) : null}

        {!isStoryLayout && showCanonicalBlogSection && displayBlog ? (
          <>
            {faqItems.length > 0 ? (
              <section aria-label="자주 묻는 질문" className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="mb-3 text-base font-semibold text-neutral-900">자주 묻는 질문</h3>
                <ul className="space-y-3">
                  {faqItems.map((qa, idx) => (
                    <li key={`${idx}-${qa.question}`} className="rounded-xl border border-neutral-100 bg-neutral-50/60 px-4 py-3">
                      <p className="text-sm font-semibold text-neutral-900">Q. {qa.question}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">A. {qa.answer}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {geoPoints.length > 0 ? (
              <section aria-label="지역 정보" className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h3 className="mb-2 text-sm font-semibold text-neutral-900">지역 · 위치 메모</h3>
                <ul className="flex flex-wrap gap-2">
                  {geoPoints.map((g, idx) => (
                    <li
                      key={`${idx}-${g}`}
                      className="inline-flex rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        {!isStoryLayout && !hasCopy && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            이 현장의 과제·해결 설명은 준비 중입니다. 전후 이미지와 쇼룸 목록은 아래에서 확인할 수 있습니다.
          </section>
        )}

        {!isStoryLayout && (pain || problemDetail) && (
          <section className="space-y-3" aria-labelledby="approach-problem">
            <div className="flex items-center gap-2 text-neutral-900">
              <FileText className="h-5 w-5 text-emerald-700" aria-hidden />
              <h2 id="approach-problem" className="text-lg font-semibold">
                현장 과제
              </h2>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-800">
              <div className="space-y-4 leading-relaxed">
                {shouldShowProblemSummary && (
                  <p className="font-medium whitespace-pre-wrap">{pain}</p>
                )}
                {shouldShowProblemDetail && (
                  <p className="text-neutral-700 whitespace-pre-wrap">{problemDetail}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {!isStoryLayout && (solution || solutionDetail) && (
          <section className="space-y-3" aria-labelledby="approach-solution">
            <div className="flex items-center gap-2 text-neutral-900">
              <Images className="h-5 w-5 text-emerald-700" aria-hidden />
              <h2 id="approach-solution" className="text-lg font-semibold">
                해결 방식
              </h2>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 text-neutral-800">
              <div className="space-y-4 leading-relaxed">
                {shouldShowSolutionSummary && (
                  <p className="font-medium whitespace-pre-wrap">{solution}</p>
                )}
                {shouldShowSolutionDetail && (
                  <p className="text-neutral-700 whitespace-pre-wrap">{solutionDetail}</p>
                )}
              </div>
            </div>
          </section>
        )}

        {!isStoryLayout && evidencePoints.length > 0 && (
          <section className="space-y-3" aria-labelledby="approach-evidence">
            <div className="flex items-center gap-2 text-neutral-900">
              <Images className="h-5 w-5 text-emerald-700" aria-hidden />
              <h2 id="approach-evidence" className="text-lg font-semibold">
                변화 포인트
              </h2>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <ul className="space-y-2 text-sm leading-relaxed text-neutral-800">
                {evidencePoints.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-[2px] text-emerald-700">-</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showRelatedCases && relatedCases.length > 0 ? (
          <section className="space-y-2 border-t border-neutral-200 pt-6" aria-labelledby="related-cases">
            <h2 id="related-cases" className="text-sm font-semibold text-neutral-600">
              관련 사례 더 보기
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {relatedCases.map((c) => (
                <li key={c.siteName}>
                  <Link
                    to={appendShowroomConcernQuery(c.href, storyConcern)}
                    className="block h-full rounded-xl border border-neutral-200 bg-white px-3 py-3 transition hover:border-neutral-300 hover:bg-neutral-50"
                  >
                    {c.industry ? (
                      <p className="text-[11px] font-medium text-neutral-500">{c.industry}</p>
                    ) : null}
                    <p className="mt-0.5 text-sm font-medium text-neutral-800">{c.title}</p>
                    {c.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-neutral-500">{c.summary}</p>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-col items-start gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-neutral-500">
            {isStoryLayout
              ? (storyConcern
                ? '같은 고민의 다른 성공 사례를 더 보려면 쇼룸으로 돌아가세요.'
                : '다른 성공 사례를 더 보려면 쇼룸으로 돌아가세요.')
              : '같은 형태로 우리 공간을 상담받고 싶다면 문의로 연결해 주세요.'}
          </p>
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-neutral-600">
            <Link to={backHref}>
              <Images className="h-3.5 w-3.5" />
              {mode === 'public'
                ? (storyConcern ? '같은 고민 사례 더 보기' : '쇼룸 더 보기')
                : '작업실로 돌아가기'}
            </Link>
          </Button>
        </div>
      </main>
      {isStoryLayout ? (
        <ShowroomStoryStickyMiniCta
          enabled
          concern={storyConcern}
          siteDisplayName={headlineName}
          siteName={resolvedBundle.siteName}
        />
      ) : null}
    </div>
  )
}
