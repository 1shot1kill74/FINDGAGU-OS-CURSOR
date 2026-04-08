import { Link } from 'react-router-dom'

export default function ClosingCtaSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
      <div className="rounded-[36px] border border-white/10 bg-white/5 p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">CTA</p>
            <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">관심 있는 사례가 생기면, 그 사례 기준으로만 이어서 안내해 드립니다</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              쇼룸형 홈페이지의 목표는 고객이 먼저 충분히 보고 판단한 뒤, 필요할 때만 상담을 시작할 수 있게 만드는 것입니다. 반복적인 메시지보다 필요한 정보만 이어지는 구조를 지향합니다.
            </p>
            <p className="mt-3 text-xs leading-6 text-amber-100/80">
              예를 들어 "2512 서울 목동 관리형 9242 기준으로 더 보고 싶어요" 또는 "관리형 9242 사례처럼 상담받고 싶어요"처럼 남겨주시면 됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <a
              href="#featured-sites"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-stone-950 transition hover:bg-stone-200"
            >
              대표 사례 다시 보기
            </a>
            <Link
              to="/contact?category=쇼룸형%20홈페이지%20상담"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-transparent px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              사례 기반 상담 시작
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
