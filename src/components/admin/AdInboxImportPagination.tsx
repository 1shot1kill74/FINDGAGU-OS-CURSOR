import { SHOWROOM_IMPORT_PAGE_SIZE } from '@/lib/adInboxStudio'

type Props = {
  page: number
  totalItems: number
  pageSize?: number
  onChange: (page: number) => void
  disabled?: boolean
}

/** 가져오기 다이얼로그용 페이지 번호 (1, 2, 3…) */
export default function AdInboxImportPagination({
  page,
  totalItems,
  pageSize = SHOWROOM_IMPORT_PAGE_SIZE,
  onChange,
  disabled,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  if (totalItems <= pageSize) return null

  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)
  const pages = visiblePageNumbers(page, totalPages)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
      <p className="text-[11px] text-neutral-500">
        {start}–{end} / 전체 {totalItems}개 · {pageSize}개씩
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          disabled={disabled || page <= 1}
          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 disabled:opacity-40"
          onClick={() => onChange(page - 1)}
        >
          이전
        </button>
        {pages.map((n, idx) =>
          n === '…' ? (
            <span key={`ellipsis-${idx}`} className="px-1 text-[11px] text-neutral-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-[28px] rounded-md px-2 py-1 text-[11px] font-medium ${
                n === page
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-200 text-neutral-600 hover:border-neutral-300'
              } disabled:opacity-40`}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={disabled || page >= totalPages}
          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 disabled:opacity-40"
          onClick={() => onChange(page + 1)}
        >
          다음
        </button>
      </div>
    </div>
  )
}

function visiblePageNumbers(current: number, total: number): Array<number | '…'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const set = new Set<number>([1, total, current, current - 1, current + 1])
  if (current <= 3) {
    set.add(2)
    set.add(3)
    set.add(4)
  }
  if (current >= total - 2) {
    set.add(total - 1)
    set.add(total - 2)
    set.add(total - 3)
  }
  const sorted = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out: Array<number | '…'> = []
  for (let i = 0; i < sorted.length; i += 1) {
    const n = sorted[i]
    if (i > 0 && n - sorted[i - 1] > 1) out.push('…')
    out.push(n)
  }
  return out
}

export function paginateItems<T>(items: T[], page: number, pageSize = SHOWROOM_IMPORT_PAGE_SIZE): T[] {
  const safePage = Math.max(1, page)
  const start = (safePage - 1) * pageSize
  return items.slice(start, start + pageSize)
}
