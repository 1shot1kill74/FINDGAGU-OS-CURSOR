/**
 * 숏츠 댓글 → 연속 랜딩 (모바일 우선)
 * 릴스 BA 1+1이 아니라, 대기실에 모인 그 현장 사진을 더 보여 준다.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import {
  trackShowroomAbmShortsLandingEnter,
  trackShowroomAbmShortsMoreSitesClick,
} from '@/lib/showroomAbmTracking'
import { captureShowroomAbmAttribution } from '@/lib/showroomAbmTraffic'
import { fetchPublicShowroomShortsLanding, type PublicShowroomShortsLanding } from '@/lib/showroomShortsLanding'
import { openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'
import { usePageHead } from '@/lib/usePageHead'
import {
  PUBLIC_SHOWROOM_BRAND,
  buildPublicShowroomBasicMetas,
  getPublicShowroomCanonicalUrl,
} from '@/lib/publicShowroomSeo'

function roleLabel(role: string) {
  if (role === 'before') return 'BEFORE'
  if (role === 'after') return 'AFTER'
  return null
}

export default function PublicShowroomShortsLandingPage() {
  usePublicShowroomChannelTalk()
  const { jobId = '' } = useParams<{ jobId: string }>()
  const [searchParams] = useSearchParams()
  const [landing, setLanding] = useState<PublicShowroomShortsLanding | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const trackedEnterJobId = useRef<string | null>(null)

  useEffect(() => {
    captureShowroomAbmAttribution({ jobId })
  }, [jobId])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchPublicShowroomShortsLanding(jobId)
      .then((result) => {
        if (cancelled) return
        if (!result) {
          setLanding(null)
          setError('이 숏츠에 연결된 현장을 찾지 못했습니다.')
          return
        }
        setLanding(result)
        captureShowroomAbmAttribution({ jobId: result.jobId })
        if (trackedEnterJobId.current !== result.jobId) {
          trackedEnterJobId.current = result.jobId
          trackShowroomAbmShortsLandingEnter({
            jobId: result.jobId,
            siteName: result.displayName,
          })
        }
      })
      .catch(() => {
        if (cancelled) return
        setLanding(null)
        setError('현장을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [jobId])

  const catalogHref = (() => {
    const params = new URLSearchParams(searchParams)
    if (!params.get('entry')) params.set('entry', 'shorts')
    const attributedJobId = landing?.jobId || jobId
    if (attributedJobId && !params.get('jobId')) params.set('jobId', attributedJobId)
    // 허브 BA 페이지네이션에서 영상 현장과 같은 카드를 바로 열기
    const baSiteCandidates = [landing?.shortName, landing?.displayName]
      .map((value) => (value ?? '').trim())
      .filter((value) => value && value !== '시공 사례')
    if (baSiteCandidates[0]) params.set('baSite', baSiteCandidates[0])
    const query = params.toString()
    return `/public/showroom${query ? `?${query}` : ''}#showroom-featured-ba-heading`
  })()

  const seoTitle = landing
    ? `${landing.displayName} 현장 — ${PUBLIC_SHOWROOM_BRAND} 숏츠`
    : `${PUBLIC_SHOWROOM_BRAND} 숏츠 현장`
  const seoDescription = landing
    ? `${landing.displayName} 숏츠에 나온 현장의 Before/After 사진을 이어서 보고 상담을 요청하세요.`
    : '숏츠에 나온 현장 사진을 이어서 보고 상담을 요청하세요.'
  const canonicalPath = jobId
    ? `/public/showroom/shorts/${encodeURIComponent(jobId)}`
    : '/public/showroom'
  const heroImage = landing?.gallery[0]?.url ?? null
  const shortsMetas = useMemo(
    () =>
      buildPublicShowroomBasicMetas({
        title: seoTitle,
        description: seoDescription,
        canonicalPath,
        imageUrl: heroImage,
        robots: 'noindex, follow',
      }),
    [seoTitle, seoDescription, canonicalPath, heroImage],
  )
  usePageHead({
    title: seoTitle,
    metas: shortsMetas,
    canonicalUrl: getPublicShowroomCanonicalUrl(canonicalPath),
  })

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f6f3ee] px-5">
        <p className="text-sm text-stone-500">현장을 불러오는 중…</p>
      </div>
    )
  }

  if (error || !landing) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#f6f3ee] px-5 text-center">
        <p className="text-base font-medium text-stone-800">{error ?? '현장을 찾을 수 없습니다.'}</p>
        <Link
          to={catalogHref}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-stone-900 px-6 text-sm font-semibold text-white"
        >
          다른 현장 더 보기
        </Link>
      </div>
    )
  }

  const afterCount = landing.gallery.filter((item) => item.role === 'after').length

  return (
    <div className="min-h-[100dvh] bg-[#f6f3ee] text-stone-900">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="mb-4">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-teal-800 uppercase">
            Findgagu Showroom
          </p>
          <h1 className="mt-2 text-[1.35rem] leading-snug font-semibold tracking-tight">
            방금 보신 {landing.displayName} 현장입니다
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-stone-600">
            숏츠에 나온 Before 한 장 다음에, After {afterCount}장을 이어서 볼 수 있습니다.
          </p>
        </header>

        <section className="flex flex-1 flex-col gap-3" aria-label={`${landing.displayName} 사진`}>
          {landing.gallery.map((item, index) => {
            const label = roleLabel(item.role)
            return (
              <figure key={`${item.id}-${index}`} className="overflow-hidden rounded-2xl bg-stone-200">
                <img
                  src={item.url}
                  alt={`${landing.displayName} 사진 ${index + 1}`}
                  className="aspect-[4/3] w-full object-cover"
                  loading={index < 2 ? 'eager' : 'lazy'}
                />
                {label ? (
                  <figcaption
                    className={
                      item.role === 'after'
                        ? 'bg-teal-800 px-3 py-2 text-xs font-semibold tracking-wide text-white'
                        : 'bg-stone-900/90 px-3 py-2 text-xs font-semibold tracking-wide text-white'
                    }
                  >
                    {label}
                  </figcaption>
                ) : null}
              </figure>
            )
          })}
        </section>

        <div className="mt-5">
          <Link
            to={catalogHref}
            onClick={() => {
              trackShowroomAbmShortsMoreSitesClick({
                jobId: landing.jobId,
                siteName: landing.displayName,
              })
            }}
            className="flex min-h-12 items-center justify-center rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700"
          >
            다른 현장 더 보기
          </Link>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200/80 bg-[#f6f3ee]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => {
              openShowroomConsultationChat({
                surface: 'shorts_landing',
                siteName: landing.displayName,
              })
            }}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-stone-900 px-4 text-sm font-semibold text-white shadow-lg shadow-stone-900/15"
          >
            이 현장처럼 상담하기
          </button>
        </div>
      </div>
    </div>
  )
}
