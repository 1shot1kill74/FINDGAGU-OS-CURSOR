/**
 * AEO 정본 페이지 — 관리형 스터디카페 가구 가이드
 * `/public/showroom` 카탈로그와 분리된 인용·검색용 문서면
 */
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePageHead } from '@/lib/usePageHead'
import {
  FINDGAGU_COM_TREND_CORPUS,
} from '@/lib/aeo/findgaguComTrendCorpus'
import {
  FINDGAGU_ENTITY_ONE_LINER,
  MANAGED_STUDY_CAFE_CHECKLIST,
  MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  MANAGED_STUDY_CAFE_FAQS,
  MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
  MANAGED_STUDY_CAFE_GUIDE_PATH,
  MANAGED_STUDY_CAFE_GUIDE_TITLE,
} from '@/lib/aeo/managedStudyCafeFurnitureGuide'
import {
  PUBLIC_SHOWROOM_BRAND,
  PUBLIC_SHOWROOM_HUB_PATH,
  buildOrganizationJsonLd,
  buildPublicShowroomBasicMetas,
  getPublicShowroomCanonicalUrl,
} from '@/lib/publicShowroomSeo'
import { openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'

export default function PublicManagedStudyCafeFurnitureGuidePage() {
  const metas = useMemo(
    () =>
      buildPublicShowroomBasicMetas({
        title: MANAGED_STUDY_CAFE_GUIDE_TITLE,
        description: MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
        canonicalPath: MANAGED_STUDY_CAFE_GUIDE_PATH,
        ogType: 'article',
      }),
    [],
  )

  const jsonLd = useMemo(() => {
    const pageUrl = getPublicShowroomCanonicalUrl(MANAGED_STUDY_CAFE_GUIDE_PATH)
    return [
      buildOrganizationJsonLd(),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: MANAGED_STUDY_CAFE_GUIDE_TITLE,
        description: MANAGED_STUDY_CAFE_GUIDE_DESCRIPTION,
        inLanguage: 'ko-KR',
        mainEntityOfPage: pageUrl,
        author: {
          '@type': 'Organization',
          name: PUBLIC_SHOWROOM_BRAND,
        },
        publisher: {
          '@type': 'Organization',
          name: PUBLIC_SHOWROOM_BRAND,
        },
        about: [
          '관리형 스터디카페 가구',
          '관리형 독서실 가구',
          '스터디카페 가구업체',
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: MANAGED_STUDY_CAFE_FAQS.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.answer,
          },
        })),
      },
    ]
  }, [])

  usePageHead({
    title: MANAGED_STUDY_CAFE_GUIDE_TITLE,
    metas,
    canonicalUrl: getPublicShowroomCanonicalUrl(MANAGED_STUDY_CAFE_GUIDE_PATH),
    jsonLd,
  })

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link to={PUBLIC_SHOWROOM_HUB_PATH} className="text-sm font-semibold text-slate-900">
            {PUBLIC_SHOWROOM_BRAND} 온라인 쇼룸
          </Link>
          <Link
            to={PUBLIC_SHOWROOM_HUB_PATH}
            className="text-sm text-slate-600 underline-offset-2 hover:underline"
          >
            사례 보기
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="text-sm font-medium text-slate-500">가이드</p>
        <h1 className="mt-2 text-2xl font-bold leading-snug tracking-tight text-slate-900 md:text-3xl">
          관리형 스터디카페 가구, 고르기 전에
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{FINDGAGU_ENTITY_ONE_LINER}</p>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{MANAGED_STUDY_CAFE_FEATURED_ANSWER}</p>

        <section className="mt-10" aria-labelledby="guide-checklist">
          <h2 id="guide-checklist" className="text-lg font-semibold text-slate-900">
            선택 체크리스트
          </h2>
          <ul className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            {MANAGED_STUDY_CAFE_CHECKLIST.map((item) => (
              <li key={item.label} className="text-sm leading-relaxed text-slate-700 md:text-base">
                <span className="font-semibold text-slate-900">{item.label}</span>
                <span className="text-slate-400"> — </span>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="guide-faq">
          <h2 id="guide-faq" className="text-lg font-semibold text-slate-900">
            자주 묻는 질문
          </h2>
          <dl className="mt-4 space-y-5 border-t border-slate-200 pt-4">
            {MANAGED_STUDY_CAFE_FAQS.map((faq) => (
              <div key={faq.question}>
                <dt className="text-sm font-semibold text-slate-900 md:text-base">{faq.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600 md:text-base">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-10" aria-labelledby="guide-sources">
          <h2 id="guide-sources" className="text-lg font-semibold text-slate-900">
            원문 (파인드가구 트랜드 분석)
          </h2>
          <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            {FINDGAGU_COM_TREND_CORPUS.map((entry) => (
              <li key={entry.id} className="text-sm">
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-700 underline-offset-2 hover:underline"
                >
                  {entry.title}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 border-t border-slate-200 pt-8">
          <p className="text-sm leading-relaxed text-slate-600">
            실제 시공 Before/After는 온라인 쇼룸에서 확인할 수 있습니다. 도면·평수·타겟을 알려주시면 배치와 가구 구성을 맞춰 드립니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to={PUBLIC_SHOWROOM_HUB_PATH}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
            >
              쇼룸 사례 보기
            </Link>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800"
              onClick={() =>
                openShowroomConsultationChat({
                  surface: 'guide_page',
                  concern: '관리형 창업 또는 전환',
                })
              }
            >
              맞춤 상담하기
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
