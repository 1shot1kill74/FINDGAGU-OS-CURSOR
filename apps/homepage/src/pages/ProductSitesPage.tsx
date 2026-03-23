import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Package, Search } from 'lucide-react'
import { fetchPublicProductSiteRows, type ProductSiteRow } from '@/lib/publicData'

export default function ProductSitesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<ProductSiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '')

  useEffect(() => {
    let cancelled = false
    fetchPublicProductSiteRows().then((result) => {
      if (!cancelled) {
        setRows(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) =>
      row.productTag.toLowerCase().includes(normalized) ||
      row.businessTypes.some((businessType) => businessType.toLowerCase().includes(normalized)) ||
      row.locations.some((location) => location.toLowerCase().includes(normalized))
    )
  }, [query, rows])

  const updateQuery = (value: string) => {
    setQuery(value)
    const params = new URLSearchParams(searchParams)
    if (value.trim()) params.set('q', value.trim())
    else params.delete('q')
    setSearchParams(params)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Product Entry</p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-white">
            <Package className="h-6 w-6" />
            제품 적용 현장 보기
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
            특정 제품이나 규격으로 먼저 들어온 고객도 단순 가격 비교에 머무르지 않도록, 실제 적용 현장과 함께 보여주는 페이지입니다.
          </p>
        </div>
        <Link to="/showroom" className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10">
          현장 중심 쇼룸으로 이동
        </Link>
      </div>

      <div className="mt-6 max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="제품명·규격 검색"
            className="h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-10 pr-4 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-stone-300">
          제품 적용 현장을 불러오는 중…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-8 text-sm text-stone-300">
          검색 결과가 없습니다.
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {filteredRows.map((row) => (
            <section key={row.productTag} className="overflow-hidden rounded-[28px] border border-white/10 bg-[#181412]">
              <div className="border-b border-white/10 bg-white/5 px-5 py-4">
                <h2 className="text-base font-semibold text-white">{row.productTag}</h2>
                <p className="mt-1 text-xs text-stone-400">{row.siteNames.length}개 현장에 연결된 대표 제품</p>
              </div>
              <div className="grid gap-3 px-5 py-5 md:grid-cols-2">
                {row.siteNames.map((siteName) => (
                  <div key={`${row.productTag}-${siteName}`} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                    <p className="text-sm font-medium text-white">{siteName}</p>
                    <p className="mt-2 text-xs leading-6 text-stone-400">
                      제품을 먼저 보고 들어온 고객도 실제 현장 맥락으로 다시 설명할 수 있도록 연결합니다.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {row.businessTypes.slice(0, 2).map((businessType) => (
                        <span key={`${siteName}-${businessType}`} className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-stone-300">
                          {businessType}
                        </span>
                      ))}
                      {row.locations[0] && (
                        <span className="rounded-full bg-white/8 px-2.5 py-1 text-[11px] text-stone-300">
                          {row.locations[0]}
                        </span>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Link
                        to={`/showroom?q=${encodeURIComponent(siteName)}`}
                        className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
                      >
                        관련 현장 보기
                      </Link>
                      <Link
                        to={`/contact?category=${encodeURIComponent('제품 적용 현장 상담')}&site_name=${encodeURIComponent(siteName)}`}
                        className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-stone-950 transition hover:bg-amber-300"
                      >
                        상담 연결
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
