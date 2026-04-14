import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CalendarDays, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePublicShowroomChannelTalk } from '@/hooks/usePublicShowroomChannelTalk'
import {
  fetchPublicShowroomCardNewsListItems,
  type PublicShowroomCardNewsListItem,
} from '@/lib/publicShowroomCardNewsService'

function formatPublishedAt(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ko-KR')
}

export default function PublicShowroomCardNewsPage() {
  usePublicShowroomChannelTalk()

  const [items, setItems] = useState<PublicShowroomCardNewsListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchPublicShowroomCardNewsListItems()
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
      })
      .catch((reason) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : '공개 카드뉴스 목록을 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <p className="text-sm text-neutral-600">공개 카드뉴스를 불러오는 중…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-4 px-4">
        <p className="max-w-md text-center text-sm text-neutral-700">{error}</p>
        <Button asChild variant="outline">
          <Link to="/public/showroom">쇼룸으로 돌아가기</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 md:px-6">
          <Button asChild variant="ghost" size="sm" className="w-fit gap-1.5 px-0 text-neutral-600 hover:text-neutral-900">
            <Link to="/public/showroom">
              <ArrowLeft className="h-4 w-4" />
              쇼룸으로 돌아가기
            </Link>
          </Button>
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">Public Card News</p>
              <h1 className="mt-1 text-2xl font-bold text-neutral-900 md:text-3xl">공개 카드뉴스 모아보기</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                발행된 카드뉴스만 모아 보고, 우리 공간과 비슷한 문제를 먼저 빠르게 확인할 수 있게 구성했습니다.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
              <Images className="h-4 w-4" />
              공개 발행 {items.length}건
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {items.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
            <h2 className="text-lg font-semibold text-neutral-900">아직 공개 발행된 카드뉴스가 없습니다.</h2>
            <p className="mt-2 text-sm text-neutral-600">작업실에서 공개 발행한 카드만 이 목록에 노출됩니다.</p>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Link
                key={`${item.siteKey}-${item.publishedAt ?? 'draft'}`}
                to={`/public/showroom/cardnews/${encodeURIComponent(item.siteKey)}`}
                className="group overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-neutral-200">
                  {item.coverImageUrl ? (
                    <img
                      src={item.coverImageUrl}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-500">대표 이미지 준비 중</div>
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    {item.industry && (
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 font-medium text-neutral-700">
                        {item.industry}
                      </span>
                    )}
                    {item.publishedAt && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatPublishedAt(item.publishedAt)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">{item.displayName}</h2>
                  </div>
                  <p className="line-clamp-2 whitespace-pre-wrap text-base font-medium leading-relaxed text-neutral-900">
                    {item.hook}
                  </p>
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-neutral-600">
                    {item.summary}
                  </p>
                  <div className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    카드뉴스 보기
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
