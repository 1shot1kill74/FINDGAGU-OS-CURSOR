/**
 * 발주서·배치도 통합 관리 페이지
 * - image_assets 테이블에서 category in ('purchase_order', 'floor_plan') 조회
 * - 필터: 업종, 카테고리(발주서/배치도), 고객명
 * - ImageAssetViewer 스타일의 그리드 뷰
 */
import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Search, FileText, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

const CATEGORY_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'purchase_order', label: '발주서' },
  { value: 'floor_plan', label: '배치도' },
] as const

const SECTOR_OPTIONS = ['학원', '관리형', '스터디카페', '학교', '아파트', '기타'] as const

interface OrderAssetRow {
  id: string
  cloudinary_url: string
  thumbnail_url: string | null
  category: string | null
  site_name: string | null
  business_type: string | null
  storage_type: string | null
  storage_path: string | null
  created_at: string | null
  metadata?: { file_type?: string; file_name?: string }
}

export default function OrderAssets() {
  const [assets, setAssets] = useState<OrderAssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [customerQuery, setCustomerQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('image_assets')
      .select('id, cloudinary_url, thumbnail_url, category, site_name, business_type, storage_type, storage_path, created_at, metadata')
      .or('category.eq.purchase_order,category.eq.floor_plan')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled && data) setAssets(data as OrderAssetRow[])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let list = assets
    if (sectorFilter) {
      list = list.filter((a) => (a.business_type ?? '').trim() === sectorFilter)
    }
    if (categoryFilter !== 'all') {
      list = list.filter((a) => (a.category ?? '').trim() === categoryFilter)
    }
    if (customerQuery.trim()) {
      const q = customerQuery.trim().toLowerCase()
      list = list.filter((a) => (a.site_name ?? '').toLowerCase().includes(q))
    }
    return list
  }, [assets, sectorFilter, categoryFilter, customerQuery])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
              ← 상담 관리
            </Link>
            <h1 className="text-lg font-bold text-foreground">발주서 · 배치도 관리</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xl flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="고객명 검색"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">업종:</span>
            <select
              value={sectorFilter ?? ''}
              onChange={(e) => setSectorFilter(e.target.value || null)}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors"
            >
              <option value="">전체</option>
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">카테고리:</span>
            {CATEGORY_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setCategoryFilter(value)}
                className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                  categoryFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground mb-4">발주서·배치도가 없습니다.</p>
            <p className="text-xs text-muted-foreground">상담 관리 → 실측 자료 탭에서 업로드하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filtered.map((a) => {
              const hasThumb = !!(a.thumbnail_url && a.thumbnail_url.trim())
              const isDocNoThumb = (a.metadata?.file_type === 'pdf' || (a.storage_path ?? '').toLowerCase().match(/\.(pdf|ppt|pptx)$/)) && !hasThumb
              return (
              <a
                key={a.id}
                href={a.cloudinary_url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative rounded-lg border border-border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors group"
              >
                <div className="aspect-[4/3] relative bg-muted">
                  {isDocNoThumb ? (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2">
                      <FileText className="h-10 w-10 text-muted-foreground shrink-0" />
                      <span className="text-[10px] font-medium text-foreground truncate w-full text-center">
                        {a.metadata?.file_name || 'PDF'}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={a.thumbnail_url || a.cloudinary_url}
                      alt={a.site_name || a.category || ''}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <span
                    className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      a.category === 'purchase_order' ? 'bg-blue-500/90 text-white' : 'bg-emerald-500/90 text-white'
                    }`}
                  >
                    {a.category === 'purchase_order' ? <FileText className="h-2.5 w-2.5" /> : <LayoutGrid className="h-2.5 w-2.5" />}
                    {a.category === 'purchase_order' ? '발주서' : '배치도'}
                  </span>
                </div>
                <div className="p-1.5">
                  <p className="text-xs font-medium truncate">{a.site_name || '—'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.business_type || '—'}</p>
                </div>
              </a>
            )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
