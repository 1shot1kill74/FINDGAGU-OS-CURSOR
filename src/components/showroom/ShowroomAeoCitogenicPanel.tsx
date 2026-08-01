import {
  FINDGAGU_ENTITY_ONE_LINER,
  MANAGED_STUDY_CAFE_CHECKLIST,
  MANAGED_STUDY_CAFE_FEATURED_ANSWER,
  MANAGED_STUDY_CAFE_FAQS,
} from '@/lib/aeo/managedStudyCafeFurnitureGuide'
import { FINDGAGU_COM_TREND_CORPUS } from '@/lib/aeo/findgaguComTrendCorpus'

type Props = {
  /** always: 크롤·상시 노출 · concern: 고민 카드 선택 시 */
  variant?: 'always' | 'concern'
}

/**
 * AI/검색이 추출하기 쉬운 정의·체크리스트·FAQ.
 * 오픈쇼룸(공개) 전용 — 내부 쇼룸 운영 UI에는 넣지 않음.
 */
export default function ShowroomAeoCitogenicPanel({ variant = 'concern' }: Props) {
  const headingId =
    variant === 'always' ? 'showroom-aeo-guide-always' : 'showroom-aeo-guide-concern'

  // 화면에는 핵심 8개만 — 전체는 JSON-LD(허브 FAQ)에 실림
  const visibleFaqs = MANAGED_STUDY_CAFE_FAQS.slice(0, 8)

  return (
    <section
      className={
        variant === 'always'
          ? 'my-8 rounded-2xl border border-slate-200 bg-white px-5 py-6'
          : 'my-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5'
      }
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-semibold text-slate-900">
        관리형 스터디카페 가구, 고르기 전에
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{FINDGAGU_ENTITY_ONE_LINER}</p>
      <p className="mt-3 text-sm leading-relaxed text-slate-700">{MANAGED_STUDY_CAFE_FEATURED_ANSWER}</p>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">선택 체크리스트</h3>
      <ul className="mt-2 space-y-2">
        {MANAGED_STUDY_CAFE_CHECKLIST.map((item) => (
          <li key={item.label} className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">{item.label}</span>
            <span className="text-slate-500"> — </span>
            <span>{item.detail}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">자주 묻는 질문</h3>
      <dl className="mt-2 space-y-3">
        {visibleFaqs.map((faq) => (
          <div key={faq.question}>
            <dt className="text-sm font-medium text-slate-900">{faq.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-slate-600">{faq.answer}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-5 text-sm font-semibold text-slate-800">원문 (파인드가구 트랜드 분석)</h3>
      <ul className="mt-2 space-y-1.5">
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
  )
}
