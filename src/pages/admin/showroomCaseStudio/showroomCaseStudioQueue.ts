import type { CaseDraftState } from '@/pages/admin/showroomCaseStudio/showroomCaseStudioTypes'

export type BlogQueueFilter = 'all' | 'missing' | 'draft' | 'approved'
export type NaverQueueFilter = 'all' | 'pending' | 'done'

export type BlogQueueStatus = Exclude<BlogQueueFilter, 'all'>

export const BLOG_BATCH_MAX = 20

export const BLOG_QUEUE_FILTERS: Array<{ id: BlogQueueFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'missing', label: '미제작' },
  { id: 'draft', label: '초안' },
  { id: 'approved', label: '공개' },
]

export const NAVER_QUEUE_FILTERS: Array<{ id: NaverQueueFilter; label: string }> = [
  { id: 'all', label: '네이버 전체' },
  { id: 'pending', label: '네이버 대기' },
  { id: 'done', label: '네이버 완료' },
]

export function getNaverQueueStatus(row: CaseDraftState): Exclude<NaverQueueFilter, 'all'> {
  return row.naverBlogPackage.done ? 'done' : 'pending'
}

export function getBlogQueueStatus(row: CaseDraftState): BlogQueueStatus {
  const status = row.canonicalBlogPost?.status
  if (!row.canonicalBlogPost) return 'missing'
  if (status === 'approved') return 'approved'
  // 과거 scheduled 건도 초안으로 취급 — 바로 발행하면 됨
  return 'draft'
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
