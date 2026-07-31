import type { CaseDraftState } from '@/pages/admin/showroomCaseStudio/showroomCaseStudioTypes'

export type BlogQueueFilter = 'all' | 'missing' | 'draft' | 'scheduled' | 'approved'

export type BlogQueueStatus = Exclude<BlogQueueFilter, 'all'>

export const BLOG_BATCH_MAX = 20

export const BLOG_QUEUE_FILTERS: Array<{ id: BlogQueueFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'missing', label: '미제작' },
  { id: 'draft', label: '초안' },
  { id: 'scheduled', label: '예약' },
  { id: 'approved', label: '공개' },
]

export function getBlogQueueStatus(row: CaseDraftState): BlogQueueStatus {
  const status = row.canonicalBlogPost?.status
  if (!row.canonicalBlogPost) return 'missing'
  if (status === 'approved') return 'approved'
  if (status === 'scheduled') return 'scheduled'
  return 'draft'
}

export function defaultBlogScheduleStartLocalInput(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setHours(21, 30, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, concurrency)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}
