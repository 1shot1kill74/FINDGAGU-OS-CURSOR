/**
 * 제품별 시공 현장 리스트 — 발주서에서 추출한 제품명·규격 태그 기준으로 현장(상담) 목록 표시
 */
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Package, Search, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'

interface ConsultationBasic {
  id: string
  company_name: string | null
}

interface ProductSiteRow {
  productTag: string
  consultationIds: string[]
}

export default function ProductSitesPage() {
  const [orderDocs, setOrderDocs] = useState<Array<{ id: string; consultation_id: string; product_tags: string[] }>>([])
  const [consultations, setConsultations] = useState<Record<string, ConsultationBasic>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: docs, error: docsError } = await supabase
        .from('order_documents')
        .select('id, consultation_id, product_tags')
      if (docsError || !docs) {
        setLoading(false)
        return
      }
      const withTags = (docs as Array<{ id: string; consultation_id: string; product_tags: unknown }>).filter(
        (d) => Array.isArray(d.product_tags) && d.product_tags.length > 0
      )
      setOrderDocs(
        withTags.map((d) => ({
          id: d.id,
          consultation_id: d.consultation_id,
          product_tags: d.product_tags as string[],
        }))
      )
      const ids = [...new Set(withTags.map((d) => d.consultation_id))]
      if (ids.length > 0) {
        const { data: cons } = await supabase.from('consultations').select('id, company_name').eq('is_visible', true).in('id', ids)
        const map: Record<string, ConsultationBasic> = {}
        ;(cons ?? []).forEach((c) => {
          map[c.id] = { id: c.id, company_name: c.company_name }
        })
        setConsultations(map)
      }
      setLoading(false)
    }
    load()
  }, [])

  const productToSites: ProductSiteRow[] = []
  const tagToIds: Record<string, Set<string>> = {}
  orderDocs.forEach((d) => {
    d.product_tags.forEach((tag) => {
      const t = tag.trim()
      if (!t) return
      if (!tagToIds[t]) tagToIds[t] = new Set()
      tagToIds[t].add(d.consultation_id)
    })
  })
  Object.entries(tagToIds).forEach(([productTag, set]) => {
    productToSites.push({ productTag, consultationIds: [...set] })
  })
  productToSites.sort((a, b) => a.productTag.localeCompare(b.productTag))

  const q = search.trim().toLowerCase()
  const filtered = q ? productToSites.filter((r) => r.productTag.toLowerCase().includes(q)) : productToSites

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
            ← 상담 관리
          </Link>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5" />
            제품별 시공 현장
          </h1>
        </div>
        <p className="text-xs text-muted-foreground">
          발주서에 기재된 제품명·규격 태그 기준으로 현장 리스트를 자동 구성합니다.
        </p>
      </header>

      <main className="p-4">
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제품명·규격 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground rounded-lg border border-dashed border-border">
            {q ? '검색 결과가 없습니다.' : '발주서에 제품 태그가 없습니다.'}
            <p className="mt-1 text-xs">상담 → 실측·발주서 탭에서 발주서를 추가한 뒤, 제품명·규격을 태그로 입력하면 여기에 반영됩니다.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {filtered.map((row) => (
              <li key={row.productTag} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-2 bg-muted/50 border-b border-border font-medium text-foreground flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  {row.productTag}
                </div>
                <ul className="divide-y divide-border">
                  {row.consultationIds.map((cid) => (
                    <li key={cid} className="px-4 py-2 flex items-center justify-between gap-2">
                      <span className="text-sm text-foreground">
                        {consultations[cid]?.company_name ?? '(업체명 없음)'}
                      </span>
                      <Link
                        to="/consultation"
                        state={{ focusConsultationId: cid }}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        상담 보기
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
