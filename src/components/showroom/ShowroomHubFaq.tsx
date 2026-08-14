import { PUBLIC_SHOWROOM_HUB_FAQS } from '@/lib/publicShowroomSeo'

/** 허브 FAQ — JSON-LD `PUBLIC_SHOWROOM_HUB_FAQS`와 동일 문구를 화면에 노출 */
export default function ShowroomHubFaq() {
  return (
    <section className="my-6 rounded-2xl border border-slate-200 bg-white px-5 py-4" aria-labelledby="showroom-hub-faq">
      <h2 id="showroom-hub-faq" className="text-sm font-semibold text-slate-900">
        자주 묻는 질문
      </h2>
      <dl className="mt-3 space-y-3">
        {PUBLIC_SHOWROOM_HUB_FAQS.map((item) => (
          <div key={item.question}>
            <dt className="text-sm font-medium text-slate-900">{item.question}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-slate-600">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
