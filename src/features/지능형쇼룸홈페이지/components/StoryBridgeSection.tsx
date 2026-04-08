interface StoryBridgeSectionProps {
  topProducts: Array<[string, number]>
}

export default function StoryBridgeSection({ topProducts }: StoryBridgeSectionProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 md:px-8">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[32px] border border-white/10 bg-white/5 p-6">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Reasoning</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">왜 현장 중심으로 보여주려는가</h2>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            고객은 제품명보다 먼저 결과를 봅니다. 그래서 메인 홈페이지는 완성된 현장을 먼저 보여주고, 그 현장을 만들기 위해 어떤 제품 조합과 어떤 해결 방식이 들어갔는지를 뒤에서 연결합니다.
          </p>

          <div className="mt-6 space-y-3">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
              <p className="text-sm font-medium text-white">기존 구조</p>
              <p className="mt-1 text-xs leading-6 text-stone-300">제품이 메인이고, 현장은 증거처럼 따라오는 흐름</p>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/8 p-4">
              <p className="text-sm font-medium text-white">쇼룸형 홈페이지 구조</p>
              <p className="mt-1 text-xs leading-6 text-stone-200">현장이 메인이고, 제품은 그 결과를 만드는 솔루션으로 자연스럽게 연결되는 흐름</p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-white/10 bg-[#16110f] p-6">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Product Bridge</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">이 분위기를 만들 때 자주 연결되는 제품</h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {topProducts.length > 0 ? (
              topProducts.map(([productName, count]) => (
                <div key={productName} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-base font-semibold text-white">{productName}</p>
                  <p className="mt-2 text-sm leading-6 text-stone-300">
                    현재 선택된 대표 사례 안에서 {count}개 현장에 연결되는 주력 제품입니다. 제품을 먼저 파는 것이 아니라 결과를 설명할 때 자연스럽게 이어지는 역할을 합니다.
                  </p>
                  <p className="mt-4 text-xs text-stone-400">선택된 사례의 공통 분위기를 만드는 연결 제품으로 이해하시면 됩니다.</p>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-stone-300">
                아직 충분히 분류된 제품 데이터가 없어, 이 영역은 메타데이터 정리 후 더 정교하게 구성할 수 있습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
