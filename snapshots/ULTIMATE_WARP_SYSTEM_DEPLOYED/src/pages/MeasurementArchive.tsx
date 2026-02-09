import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Ruler, Search, FileText, ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

const MEASUREMENT_DRAWINGS_BUCKET = 'measurement-drawings'

interface MeasurementRow {
  id: string
  company: string
  managerName: string
  status: string | null
  assignee: string | null
  scheduledDate: string | null
  drawingPath: string | null
  createdAt: string
}

export default function MeasurementArchive() {
  const [list, setList] = useState<MeasurementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('consultations')
        .select('id, created_at, metadata')
        .order('created_at', { ascending: false })
      if (error) {
        toast.error('목록을 불러오지 못했습니다.')
        setLoading(false)
        return
      }
      const rows: MeasurementRow[] = []
      for (const row of data || []) {
        const m = ((row as Record<string, unknown>).metadata as Record<string, unknown>) || {}
        const company = (m.company_name as string) || '(업체명 없음)'
        const managerName = (m.manager_name as string) || ''
        const hasMeasurement =
          m.measurement_status != null ||
          m.measurement_drawing_path != null ||
          (m.measurement_assignee as string) ||
          (m.measurement_scheduled_date as string)
        if (!hasMeasurement) continue
        rows.push({
          id: String((row as Record<string, unknown>).id),
          company,
          managerName,
          status: (m.measurement_status as string) || null,
          assignee: (m.measurement_assignee as string) || null,
          scheduledDate: (m.measurement_scheduled_date as string)?.slice(0, 10) || null,
          drawingPath: (m.measurement_drawing_path as string) || null,
          createdAt: String((row as Record<string, unknown>).created_at ?? ''),
        })
      }
      setList(rows)
      setLoading(false)
    }
    load()
  }, [])

  const openPreview = async (path: string) => {
    const { data, error } = await supabase.storage.from(MEASUREMENT_DRAWINGS_BUCKET).createSignedUrl(path, 300)
    if (error) {
      toast.error('미리보기를 불러올 수 없습니다.')
      return
    }
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? list.filter(
        (r) =>
          r.company.toLowerCase().includes(q) ||
          (r.managerName && r.managerName.toLowerCase().includes(q)) ||
          (r.assignee && r.assignee.toLowerCase().includes(q))
      )
    : list

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
            ← 상담 관리
          </Link>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Ruler className="h-5 w-5" />
            실측 관리
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="업체명·담당자 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 w-[200px] text-sm"
            />
          </div>
          <Link to="/measurement/upload">
            <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm">
              <Upload className="h-3.5 w-3.5" />
              실측 정보 입력
            </Button>
          </Link>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {q ? '검색 결과가 없습니다.' : '실측 데이터가 있는 상담이 없습니다.'}
            <div className="mt-2">
              <Link to="/measurement/upload" className="text-primary font-medium hover:underline">
                실측 정보 입력 →
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">업체명</th>
                  <th className="text-left p-3 font-medium">담당자</th>
                  <th className="text-left p-3 font-medium">실측 상태</th>
                  <th className="text-left p-3 font-medium">실측 담당</th>
                  <th className="text-left p-3 font-medium">예정일</th>
                  <th className="text-left p-3 font-medium">도면</th>
                  <th className="text-left p-3 font-medium">동작</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.company}</td>
                    <td className="p-3 text-muted-foreground">{r.managerName || '—'}</td>
                    <td className="p-3">{r.status || '—'}</td>
                    <td className="p-3">{r.assignee || '—'}</td>
                    <td className="p-3">{r.scheduledDate || '—'}</td>
                    <td className="p-3">
                      {r.drawingPath ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <FileText className="h-3.5 w-3.5" /> PDF
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 flex items-center gap-1">
                      {r.drawingPath && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openPreview(r.drawingPath!)}>
                          미리보기
                        </Button>
                      )}
                      <Link to={`/measurement/upload?consultationId=${r.id}`}>
                        <Button type="button" variant="ghost" size="sm" className="h-8 text-xs gap-1">
                          <ExternalLink className="h-3 w-3" />
                          입력/수정
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
