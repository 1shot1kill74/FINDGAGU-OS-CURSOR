/**
 * AEO 정본 가이드 — 업종별 체크리스트·FAQ
 * `/public/showroom/guide/:slug`
 */
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { FINDGAGU_ENTITY_ONE_LINER } from '@/lib/aeo/managedStudyCafeFurnitureGuide'
import { getRelatedShowroomGuides, getShowroomGuideBySlug } from '@/lib/aeo/showroomGuides'
import { usePageHead } from '@/lib/usePageHead'
import {
  PUBLIC_SHOWROOM_BRAND,
  PUBLIC_SHOWROOM_DOMAIN_ROLES,
  PUBLIC_SHOWROOM_HUB_PATH,
  buildOrganizationJsonLd,
  buildPublicShowroomBasicMetas,
  getPublicShowroomCanonicalUrl,
} from '@/lib/publicShowroomSeo'
import { openShowroomConsultationChat } from '@/pages/showroom/showroomStoryCta'

export default function PublicShowroomGuidePage() {
  const { slug } = useParams<{ slug: string }>()
  const guide = getShowroomGuideBySlug(slug)
  const related = guide ? getRelatedShowroomGuides(guide.slug) : []

  const metas = useMemo(
    () =>
      guide
        ? buildPublicShowroomBasicMetas({
            title: guide.title,
            description: guide.description,
            canonicalPath: guide.path,
            ogType: 'article',
          })
        : [],
    [guide],
  )

  const jsonLd = useMemo(() => {
    if (!guide) return []
    const pageUrl = getPublicShowroomCanonicalUrl(guide.path)
    return [
      buildOrganizationJsonLd(),
      {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: guide.title,
        description: guide.description,
        inLanguage: 'ko-KR',
        mainEntityOfPage: pageUrl,
        author: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        publisher: { '@type': 'Organization', name: PUBLIC_SHOWROOM_BRAND },
        about: [...guide.about],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: guide.faqs.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      },
    ]
  }, [guide])

  usePageHead({
    title: guide?.title ?? PUBLIC_SHOWROOM_BRAND,
    metas,
    canonicalUrl: guide ? getPublicShowroomCanonicalUrl(guide.path) : undefined,
    jsonLd,
  })

  if (!guide) {
    return <Navigate replace to={PUBLIC_SHOWROOM_HUB_PATH} />
  }

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
          {guide.h1}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{FINDGAGU_ENTITY_ONE_LINER}</p>
        <p className="mt-4 text-base leading-relaxed text-slate-700">{guide.featuredAnswer}</p>

        <section className="mt-10" aria-labelledby="guide-checklist">
          <h2 id="guide-checklist" className="text-lg font-semibold text-slate-900">
            선택 체크리스트
          </h2>
          <ul className="mt-4 space-y-3 border-t border-slate-200 pt-4">
            {guide.checklist.map((item) => (
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
            {guide.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="text-sm font-semibold text-slate-900 md:text-base">{faq.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600 md:text-base">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {guide.sources && guide.sources.length > 0 ? (
          <section className="mt-10" aria-labelledby="guide-sources">
            <h2 id="guide-sources" className="text-lg font-semibold text-slate-900">
              원문 (파인드가구 트랜드 분석)
            </h2>
            <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4">
              {guide.sources.map((entry) => (
                <li key={entry.url} className="text-sm">
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
        ) : null}

        {related.length > 0 ? (
          <section className="mt-10" aria-labelledby="guide-related">
            <h2 id="guide-related" className="text-lg font-semibold text-slate-900">
              다른 공간 가이드
            </h2>
            <ul className="mt-4 space-y-2 border-t border-slate-200 pt-4">
              {related.map((item) => (
                <li key={item.slug} className="text-sm">
                  <Link to={item.path} className="text-slate-700 underline-offset-2 hover:underline">
                    {item.teaserLabel} — {item.h1}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-10" aria-labelledby="guide-domains">
          <h2 id="guide-domains" className="text-lg font-semibold text-slate-900">
            공식 사이트
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
            {PUBLIC_SHOWROOM_DOMAIN_ROLES.showroom.summary} {PUBLIC_SHOWROOM_DOMAIN_ROLES.product.summary}
          </p>
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
                  concern: guide.concern,
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
