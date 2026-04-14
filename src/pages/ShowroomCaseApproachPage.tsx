import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, Images, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import { buildShowroomCaseCardNewsPackage, formatShowroomCardTextForDisplay, normalizeShowroomCardNewsSlides, resolveCardNewsSlideImageUrl } from '@/lib/showroomCaseContentPackage'
import {
  loadShowroomCaseApproachBundle,
  type ShowroomCaseApproachBundle,
} from '@/lib/showroomCaseApproachData'

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
type EntryType = 'case' | 'cardnews'

type GeneratedCardNewsSlide = {
  slide?: number
  role?: string
  title?: string
  text?: string
  imageRef?: string
  imageUrl?: string
  imageAssetId?: string
}

type GeneratedCardNewsPayload = {
  payload?: {
    cardNews?: {
      master?: {
        slides?: GeneratedCardNewsSlide[]
        cta?: string
      }
    }
  }
  cardNews?: {
    master?: {
      slides?: GeneratedCardNewsSlide[]
      cta?: string
    }
  }
  master?: {
    slides?: GeneratedCardNewsSlide[]
    cta?: string
  }
}

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

function getGeneratedCardNewsSlides(value: unknown): GeneratedCardNewsSlide[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const payload = value as GeneratedCardNewsPayload
  const slides =
    payload.payload?.cardNews?.master?.slides
    ?? payload.cardNews?.master?.slides
    ?? payload.master?.slides

  if (!Array.isArray(slides)) return []
  return slides.filter((slide) => slide && typeof slide === 'object')
}

function getSlideImageUrl(params: {
  role?: string
  imageRef?: string
  imageUrl?: string | null
  beforeUrl?: string | null
  afterUrl?: string | null
}) {
  const ir = params.imageRef
  const normalizedRef =
    ir === 'before' || ir === 'after' || ir === 'signature'
      ? ir
      : typeof ir === 'string' && ir.startsWith('asset:')
        ? ir
        : 'auto'
  return resolveCardNewsSlideImageUrl({
    role: params.role?.trim() ?? '',
    imageRef: normalizedRef,
    beforeUrl: params.beforeUrl?.trim() ?? '',
    afterUrl: params.afterUrl?.trim() ?? '',
    imageUrl: params.imageUrl,
  })
}

export default function ShowroomCaseApproachPage({ mode = 'public', entry = 'case' }: { mode?: Mode; entry?: EntryType }) {
  usePublicShowroomChannelTalk(mode === 'public')

  const { siteKey } = useParams<{ siteKey: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundle, setBundle] = useState<ShowroomCaseApproachBundle | null>(null)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)

  const backHref = mode === 'public'
    ? (entry === 'cardnews' ? '/public/showroom/cardnews' : '/public/showroom#showroom-before-after-section')
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
        mode === 'public'
          ? (entry === 'cardnews' ? 'published-cardnews' : 'public')
          : 'internal'
      )
      if (cancelled) return
      setLoading(false)
      if (!result.ok) {
        if (result.reason === 'not_found') {
          setError(entry === 'cardnews' ? '해당 공개 카드뉴스를 찾을 수 없습니다.' : '해당 전후 비교 사례를 찾을 수 없습니다.')
        } else if (result.reason === 'incomplete') {
          setError('이 현장은 전후 이미지 세트가 완성되지 않아 설명 페이지를 열 수 없습니다.')
        } else {
          setError(result.message ?? '불러오지 못했습니다.')
        }
        setBundle(null)
        return
      }
      setBundle(result.data)
      setActiveSlideIndex(0)
    })()

    return () => {
      cancelled = true
    }
  }, [siteKey, mode, entry])

  const contactHref = bundle
    ? `/contact?${new URLSearchParams({
        site_name: bundle.siteName,
        showroom_context: 'case_approach',
      }).toString()}`
    : '/contact'
  const generatedCardNewsSlides = useMemo(
    () => getGeneratedCardNewsSlides(bundle?.profile?.cardNewsGeneration?.response),
    [bundle?.profile?.cardNewsGeneration?.response]
  )
  const cardNewsPackage = useMemo(() => buildShowroomCaseCardNewsPackage({
    siteName: bundle?.siteName ?? '',
    externalLabel: bundle?.externalLabel ?? null,
    industry: bundle?.businessTypes[0] ?? null,
    headlineHook: bundle?.profile?.headlineHook?.trim() || bundle?.profile?.painPoint?.trim() || '',
    painPoint: bundle?.profile?.painPoint?.trim() || '',
    problemDetail: bundle?.profile?.problemDetail?.trim() || '',
    solutionPoint: bundle?.profile?.solutionPoint?.trim() || '',
    solutionDetail: bundle?.profile?.solutionDetail?.trim() || '',
    evidencePoints: bundle?.profile?.evidencePoints?.filter((item) => item.trim()) ?? [],
  }), [bundle])

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

  const pain = bundle.profile?.painPoint?.trim() || (bundle.profile?.problemCode ? PROBLEM_FRAME_SUMMARY[bundle.profile.problemCode] ?? '' : '')
  const solution = bundle.profile?.solutionPoint?.trim() || (bundle.profile?.solutionCode ? SOLUTION_FRAME_SUMMARY[bundle.profile.solutionCode] ?? '' : '')
  const displayName = bundle.externalLabel?.trim() || bundle.siteName
  const headlineHook = bundle.profile?.headlineHook?.trim() || pain || '이 공간은 무엇이 달라졌을까요?'
  const problemDetail = bundle.profile?.problemDetail?.trim()
  const solutionDetail = bundle.profile?.solutionDetail?.trim()
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
  const evidencePoints = bundle.profile?.evidencePoints?.filter((item) => item.trim()) ?? []
  const hasCopy = Boolean(pain || solution)
  const generatedDisplaySlides = generatedCardNewsSlides.length > 0
    ? generatedCardNewsSlides.map((slide, index) => {
        const rawRef = slide.imageRef
        const fromAssetId =
          typeof slide.imageAssetId === 'string' && slide.imageAssetId.trim()
            ? `asset:${slide.imageAssetId.trim()}`
            : undefined
        const imageRef =
          rawRef === 'before' || rawRef === 'after' || rawRef === 'signature'
            ? rawRef
            : typeof rawRef === 'string' && rawRef.startsWith('asset:')
              ? rawRef
              : fromAssetId
        const imageUrl = typeof slide.imageUrl === 'string' ? slide.imageUrl.trim() : undefined
        return {
          key: `${slide.role ?? 'slide'}-${index}`,
          role: slide.role?.trim() || '',
          title: slide.title?.trim() || `${index + 1}장`,
          body: slide.text?.trim() || '',
          imageRef,
          imageUrl,
        }
      })
    : cardNewsPackage.slides.map((slide) => ({
        key: slide.key,
        role: slide.key,
        title: slide.title,
        body: slide.body,
        imageRef: undefined,
        imageUrl: undefined,
      }))
  const normalizedCardSlides = normalizeShowroomCardNewsSlides({
    slides: generatedDisplaySlides.map((slide) => ({
      key: (slide.role || 'hook') as any,
      title: slide.title,
      body: slide.body,
      imageRef: slide.imageRef,
      imageUrl: slide.imageUrl,
    })),
    fallbackSlides: cardNewsPackage.slides,
  })
  const displaySlides = normalizedCardSlides.map((slide, index) => ({
    key: `${slide.key}-${index}`,
    role: slide.key,
    title: slide.title,
    body: slide.body,
    imageRef: slide.imageRef,
    imageUrl: slide.imageUrl ?? undefined,
  }))
  const activeSlide = displaySlides[activeSlideIndex] ?? displaySlides[0]
  const totalSlides = displaySlides.length
  const beforeHeroUrl = bundle.beforeImage?.thumbnail_url || bundle.beforeImage?.cloudinary_url || ''
  const afterHeroUrl = bundle.afterImage?.thumbnail_url || bundle.afterImage?.cloudinary_url || ''
  const hasBeforeAfterImages = Boolean(beforeHeroUrl.trim() && afterHeroUrl.trim())
  const activeSlideImageUrl = getSlideImageUrl({
    role: activeSlide?.role,
    imageRef: activeSlide?.imageRef,
    imageUrl: activeSlide?.imageUrl,
    beforeUrl: beforeHeroUrl,
    afterUrl: afterHeroUrl,
  })
  const heroPhotoLabel =
    beforeHeroUrl.trim() && activeSlideImageUrl.trim() === beforeHeroUrl.trim()
      ? 'Before'
      : afterHeroUrl.trim() && activeSlideImageUrl.trim() === afterHeroUrl.trim()
        ? 'After'
        : '사진'
  const goToPreviousSlide = () => setActiveSlideIndex((prev) => (prev - 1 + totalSlides) % totalSlides)
  const goToNextSlide = () => setActiveSlideIndex((prev) => (prev + 1) % totalSlides)

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 md:px-6">
          <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-neutral-600 hover:text-neutral-900">
            <Link to={backHref}>
              <ArrowLeft className="h-4 w-4" />
              {mode === 'public'
                ? (entry === 'cardnews' ? '카드뉴스 목록' : '전후 비교 목록')
                : '케이스 작업실'}
            </Link>
          </Button>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              {entry === 'cardnews' ? '공개 카드뉴스' : '현장 기획 방식'}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-neutral-900 md:text-3xl">{displayName}</h1>
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

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8 md:px-6 md:py-10">
        <section className="overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-sm">
          <div className="relative aspect-[16/10] bg-neutral-900">
            <img
              src={activeSlideImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
            <button
              type="button"
              onClick={goToPreviousSlide}
              className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
              aria-label="이전 카드"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={goToNextSlide}
              className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
              aria-label="다음 카드"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                  카드뉴스 {activeSlideIndex + 1}/{totalSlides}
                </span>
                <span className="inline-flex rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                  {heroPhotoLabel}
                </span>
              </div>
              <div className="mt-3 max-w-2xl rounded-2xl bg-black/45 px-4 py-3 backdrop-blur-[3px]">
                <p
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.6)' }}
              >
                  {activeSlide.title}
                </p>
                <p
                  className="mt-2 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-white md:text-[1.6rem]"
                  style={{ textShadow: '0 1px 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)' }}
                >
                  {formatShowroomCardTextForDisplay({
                    text: activeSlide.body,
                    role: activeSlide.role,
                  })}
                </p>
              </div>
            </div>
          </div>
          <div className="border-t border-neutral-200 bg-white px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {displaySlides.map((slide, index) => (
                  <button
                    key={`${slide.key}-${index}`}
                    type="button"
                    onClick={() => setActiveSlideIndex(index)}
                    className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      index === activeSlideIndex
                        ? 'bg-emerald-600 text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {index + 1}장 {slide.title}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">클릭해서 순서대로 넘겨보세요.</p>
            </div>
          </div>
        </section>

        {!hasCopy && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            이 현장의 과제·해결 설명은 준비 중입니다. 전후 이미지와 쇼룸 목록은 아래에서 확인할 수 있습니다.
          </section>
        )}

        {(pain || problemDetail) && (
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

        {(solution || solutionDetail) && (
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

        {evidencePoints.length > 0 && (
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

        {hasBeforeAfterImages && (
          <section className="space-y-4" aria-labelledby="approach-ba">
            <h2 id="approach-ba" className="text-lg font-semibold text-neutral-900">
              전후 비교
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="relative aspect-[4/3] bg-neutral-100">
                  <img
                    src={bundle.beforeImage?.thumbnail_url || bundle.beforeImage?.cloudinary_url || ''}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">
                    Before
                  </span>
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                <div className="relative aspect-[4/3] bg-neutral-100">
                  <img
                    src={bundle.afterImage?.thumbnail_url || bundle.afterImage?.cloudinary_url || ''}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
                    After
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-neutral-700">
            같은 형태로 우리 공간을 상담받고 싶다면 문의로 연결해 주세요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-1.5 bg-white">
              <Link to={backHref}>
                <Images className="h-4 w-4" />
                {mode === 'public'
                  ? (entry === 'cardnews' ? '카드뉴스 더 보기' : '쇼룸 더 보기')
                  : '작업실로 돌아가기'}
              </Link>
            </Button>
            <Button asChild className="gap-1.5 bg-emerald-700 hover:bg-emerald-800">
              <Link to={contactHref}>
                <MessageCircle className="h-4 w-4" />
                문의하기
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
