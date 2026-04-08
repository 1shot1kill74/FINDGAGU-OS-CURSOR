import { CONCERN_CARDS, type ConcernId } from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'

interface ConcernSectionProps {
  selectedConcernId: ConcernId
  onSelectConcern: (id: ConcernId) => void
}

export default function ConcernSection({ selectedConcernId, onSelectConcern }: ConcernSectionProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Concern Entry</p>
          <h2 className="mt-2 text-2xl font-semibold text-white md:text-3xl">지금 가장 가까운 고민부터 골라보세요</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-stone-300">
          한 번의 클릭으로 판단하지 않습니다. 비슷한 사례를 천천히 둘러보신 뒤, 필요할 때만 이어서 문의하실 수 있게 구성했습니다.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {CONCERN_CARDS.map((card) => {
          const selected = card.id === selectedConcernId
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectConcern(card.id)}
              className={`rounded-3xl border p-5 text-left transition ${
                selected
                  ? 'border-amber-300 bg-amber-300/10 shadow-[0_0_0_1px_rgba(252,211,77,0.25)]'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              <p className="text-sm font-semibold text-white">{card.title}</p>
              <p className="mt-3 text-xs leading-6 text-stone-300">{card.summary}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
