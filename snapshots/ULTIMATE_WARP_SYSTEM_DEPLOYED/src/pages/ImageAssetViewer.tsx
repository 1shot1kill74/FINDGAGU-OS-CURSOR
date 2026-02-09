import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Upload, X, Copy, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { MOCK_REFERENCE_CASES } from '@/data/referenceCases'
import {
  getAssetUrl,
  getSyncStatus,
  toMarkdownImageLine,
  getBaseAltText,
  buildImageExportPayload,
  ensureCanDelete,
  ensureCanUpdate,
  generateFileName,
} from '@/lib/imageAssetService'
import type { ProjectImageAsset, SyncStatus } from '@/types/projectImage'
import { USAGE_TYPES, type UsageType } from '@/types/projectImage'

const BUCKET = 'construction-assets'
const PAGE_SIZE = 24
type SortKey = 'latest' | 'industry' | 'popular'

const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: 'Cloudinary 연동',
  cloudinary_only: 'Cloudinary만',
  storage_only: 'Storage만',
  missing: '미연동',
}

function rowToProjectAsset(row: {
  id: string
  cloudinary_public_id: string
  usage_type: string
  display_name: string | null
  storage_path: string | null
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  view_count: number
  created_at: string
}): ProjectImageAsset {
  const usageType = USAGE_TYPES.includes(row.usage_type as UsageType) ? (row.usage_type as UsageType) : 'Marketing'
  const storagePath = row.storage_path?.trim() || null
  const asset: ProjectImageAsset = {
    id: row.id,
    cloudinaryPublicId: row.cloudinary_public_id,
    usageType,
    displayName: row.display_name?.trim() || null,
    url: getAssetUrl(
      { cloudinaryPublicId: row.cloudinary_public_id, storagePath },
      'marketing'
    ),
    thumbnailUrl: storagePath
      ? supabase.storage.from(BUCKET).getPublicUrl(row.thumbnail_path || row.storage_path || '').data.publicUrl
      : getAssetUrl(
          { cloudinaryPublicId: row.cloudinary_public_id, storagePath },
          'mobile'
        ),
    storagePath,
    consultationId: row.consultation_id,
    projectTitle: row.project_title,
    industry: row.industry,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at,
    syncStatus: getSyncStatus({
      cloudinaryPublicId: row.cloudinary_public_id,
      storagePath,
      usageType,
    }),
  }
  return asset
}

/** construction_images 레거시 행 → ProjectImageAsset (cloudinary 없으면 storage_only) */
function legacyRowToAsset(row: {
  id: string
  storage_path: string
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  is_marketing_ready: boolean
  view_count: number
  created_at: string
}): ProjectImageAsset {
  const storagePath = row.storage_path?.trim() || null
  const cloudinaryPublicId = '' // 레거시: Cloudinary ID 없음
  const usageType: UsageType = row.is_marketing_ready ? 'Marketing' : 'Archive'
  const url = storagePath
    ? supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
    : ''
  return {
    id: row.id,
    cloudinaryPublicId: cloudinaryPublicId,
    usageType,
    displayName: null,
    url,
    thumbnailUrl: row.thumbnail_path
      ? supabase.storage.from(BUCKET).getPublicUrl(row.thumbnail_path).data.publicUrl
      : url,
    storagePath,
    consultationId: row.consultation_id,
    projectTitle: row.project_title,
    industry: row.industry,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at,
    syncStatus: getSyncStatus({ cloudinaryPublicId, storagePath, usageType }),
  }
}

/** Mock: Cloudinary ID 시뮬레이션 (표시는 원본 URL, 마크다운은 Cloudinary URL) */
function getMockAssets(): ProjectImageAsset[] {
  const out: ProjectImageAsset[] = []
  MOCK_REFERENCE_CASES.forEach((c) => {
    c.images.forEach((displayUrl, i) => {
      const publicId = `mock/${c.id}-${i}`
      out.push({
        id: `mock-${c.id}-${i}`,
        cloudinaryPublicId: publicId,
        usageType: 'Marketing',
        displayName: null,
        url: displayUrl,
        thumbnailUrl: displayUrl,
        storagePath: null,
        consultationId: null,
        projectTitle: c.title,
        industry: c.industry,
        viewCount: 0,
        createdAt: new Date().toISOString(),
        syncStatus: 'cloudinary_only',
      })
    })
  })
  return out.reverse()
}

export default function ImageAssetViewer() {
  const [assets, setAssets] = useState<ProjectImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('latest')
  const [page, setPage] = useState(0)
  const [lightboxAsset, setLightboxAsset] = useState<ProjectImageAsset | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const fetchFromDb = useCallback(async () => {
    try {
      const { data: projectData, error: projectError } = await (supabase as any)
        .from('project_images')
        .select('*')
        .order('created_at', { ascending: false })
      if (!projectError && projectData?.length > 0) {
        return projectData.map((r: Parameters<typeof rowToProjectAsset>[0]) => rowToProjectAsset(r))
      }
      const { data: legacyData, error: legacyError } = await (supabase as any)
        .from('construction_images')
        .select('*')
        .order('created_at', { ascending: false })
      if (!legacyError && legacyData?.length > 0) {
        return legacyData.map((r: Parameters<typeof legacyRowToAsset>[0]) => legacyRowToAsset(r))
      }
      return []
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchFromDb().then((list) => {
      if (cancelled) return
      if (list.length > 0) setAssets(list)
      else setAssets(getMockAssets())
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchFromDb])

  const sorted = useMemo(() => {
    const arr = [...assets]
    if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    else if (sort === 'industry') arr.sort((a, b) => (a.industry || '').localeCompare(b.industry || '') || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    else arr.sort((a, b) => b.viewCount - a.viewCount)
    return arr
  }, [assets, sort])

  const paginated = useMemo(() => sorted.slice(0, (page + 1) * PAGE_SIZE), [sorted, page])
  const hasMore = paginated.length < sorted.length

  const loadMore = useCallback(() => setPage((p) => p + 1), [])

  const copyAllMarkdown = useCallback(() => {
    const lines = assets.map((a) => toMarkdownImageLine(a))
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success('블로그용 마크다운(Cloudinary URL)을 클립보드에 복사했습니다.')
    })
  }, [assets])

  const copyCurrentMarkdown = useCallback(() => {
    if (!lightboxAsset) return
    const line = toMarkdownImageLine(lightboxAsset)
    void navigator.clipboard.writeText(line).then(() => {
      toast.success('현재 이미지 마크다운(Cloudinary URL)을 복사했습니다.')
    })
  }, [lightboxAsset])

  const copyExportJson = useCallback(() => {
    const payload = buildImageExportPayload(assets)
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      toast.success('외부 자동화용 JSON(base_alt_text·프롬프트 가이드 포함)을 복사했습니다.')
    })
  }, [assets])

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
            ← 상담 관리
          </Link>
          <h1 className="text-lg font-bold text-foreground">이미지 자산 뷰어</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="latest">최신순</option>
            <option value="industry">업종별</option>
            <option value="popular">인기순(조회수)</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyAllMarkdown}>
            <Copy className="h-3.5 w-3.5" />
            블로그용 Markdown 복사
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyExportJson} title="n8n·Python 등에서 base_alt_text와 프롬프트 가이드 사용">
            <Copy className="h-3.5 w-3.5" />
            Export JSON (n8n)
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5" />
            업로드
          </Button>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {paginated.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setLightboxAsset(asset)}
                  className="rounded-lg border border-border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="aspect-[4/3] relative bg-muted">
                    <img
                      src={asset.thumbnailUrl || asset.url}
                      alt={getBaseAltText(asset)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {asset.usageType === 'Marketing' && (
                      <span className="absolute top-1 right-1 rounded bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5">
                        마케팅
                      </span>
                    )}
                    <span
                      className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        asset.syncStatus === 'synced'
                          ? 'bg-emerald-500/90 text-white'
                          : asset.syncStatus === 'cloudinary_only'
                            ? 'bg-blue-500/90 text-white'
                            : asset.syncStatus === 'storage_only'
                              ? 'bg-amber-500/90 text-white'
                              : 'bg-red-500/90 text-white'
                      }`}
                      title={SYNC_LABEL[asset.syncStatus]}
                    >
                      {asset.syncStatus === 'synced' && <CheckCircle className="h-2.5 w-2.5" />}
                      {asset.syncStatus === 'missing' && <AlertCircle className="h-2.5 w-2.5" />}
                      {SYNC_LABEL[asset.syncStatus]}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs font-medium truncate">{asset.projectTitle || '—'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{asset.industry || '—'}</p>
                    {asset.displayName && (
                      <p className="text-[10px] text-muted-foreground/80 truncate" title={asset.displayName}>파일명: {asset.displayName}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore}>더 보기</Button>
              </div>
            )}
          </>
        )}
      </main>

      {/* 라이트박스 */}
      <Dialog open={!!lightboxAsset} onOpenChange={(open) => !open && setLightboxAsset(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {lightboxAsset && (
            <>
              <DialogHeader className="px-4 py-2 border-b shrink-0 flex flex-row items-center justify-between">
                <DialogTitle className="text-sm truncate">{lightboxAsset.projectTitle || '시공 이미지'}</DialogTitle>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLightboxAsset(null)}><X className="h-4 w-4" /></Button>
              </DialogHeader>
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-muted/30">
                <img
                  src={lightboxAsset.url}
                  alt={getBaseAltText(lightboxAsset)}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
              <div className="px-4 py-2 border-t shrink-0 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Sync: {SYNC_LABEL[lightboxAsset.syncStatus]}</span>
                {lightboxAsset.industry && <span className="text-muted-foreground">업종: {lightboxAsset.industry}</span>}
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={copyCurrentMarkdown}>
                  <Copy className="h-3 w-3" />
                  블로그용 Markdown 복사
                </Button>
                {lightboxAsset.consultationId && (
                  <Link to="/consultation" className="text-primary font-medium hover:underline">
                    이 상담 건 보기 →
                  </Link>
                )}
                {/* 안전 장치 검증: 삭제/수정 전 양쪽 체크 (코드 수준 검증용) */}
                {(() => {
                  const del = ensureCanDelete(lightboxAsset)
                  const upd = ensureCanUpdate(lightboxAsset, {})
                  return (
                    <span className="text-[10px] text-muted-foreground ml-auto" title={`삭제: ${del.ok ? '가능' : del.reason}, 수정: ${upd.ok ? '가능' : upd.reason}`}>
                      {del.ok && upd.ok ? '✓ 안전' : '⚠ 제한'}
                    </span>
                  )
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 업로드 폼: 파일명 자동 생성 → cloudinary_public_id / display_name 동기화 */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>시공 이미지 업로드</DialogTitle>
          </DialogHeader>
          <UploadForm
            onSuccess={() => {
              setUploadOpen(false)
              fetchFromDb().then((list) => list.length > 0 && setAssets(list))
              toast.success('업로드되었습니다.')
            }}
            onCancel={() => setUploadOpen(false)}
            onError={(msg) => toast.error(msg)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UploadForm({
  onSuccess,
  onCancel,
  onError,
}: {
  onSuccess: () => void
  onCancel: () => void
  onError: (message: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [usageType, setUsageType] = useState<UsageType>('Marketing')
  const [inboundDate, setInboundDate] = useState('')
  const [projectTitle, setProjectTitle] = useState('')
  const [spaceType, setSpaceType] = useState('')
  const [industry, setIndustry] = useState('')
  const [sequenceIndex, setSequenceIndex] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      onError('파일을 선택하세요.')
      return
    }
    if (!projectTitle.trim()) {
      onError('프로젝트명(업체명)을 입력하세요.')
      return
    }
    const publicId = generateFileName(
      {
        inboundDate: inboundDate.trim() || undefined,
        companyName: projectTitle.trim(),
        spaceType: spaceType.trim() || '공간미지정',
      },
      sequenceIndex
    )
    setSubmitting(true)
    try {
      const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (uploadError) throw new Error(uploadError.message)
      const { error: insertError } = await (supabase as any)
        .from('project_images')
        .insert({
          cloudinary_public_id: publicId,
          display_name: publicId,
          usage_type: usageType,
          storage_path: path,
          thumbnail_path: null,
          consultation_id: null,
          project_title: projectTitle.trim() || null,
          industry: industry.trim() || null,
          view_count: 0,
        })
      if (insertError) throw new Error(insertError.message)
      onSuccess()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : '업로드 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">인입/촬영일</label>
        <Input
          type="date"
          value={inboundDate}
          onChange={(e) => setInboundDate(e.target.value)}
          className="h-10 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-0.5">비우면 오늘 날짜(YYMMDD)로 사용됩니다.</p>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">프로젝트명(업체명) <span className="text-destructive">*</span></label>
        <Input
          value={projectTitle}
          onChange={(e) => setProjectTitle(e.target.value)}
          placeholder="예: 목동학원"
          className="h-10 text-sm"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">공간 구분</label>
        <Input
          value={spaceType}
          onChange={(e) => setSpaceType(e.target.value)}
          placeholder="예: 강의실, 카운터, 독서실"
          className="h-10 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-0.5">비우면 &quot;공간미지정&quot;으로 저장됩니다.</p>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">순번</label>
        <Input
          type="number"
          min={1}
          value={sequenceIndex}
          onChange={(e) => setSequenceIndex(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="h-10 text-sm"
        />
        <p className="text-xs text-muted-foreground mt-0.5">파일명 예: 260206_목동학원_강의실_01</p>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">용도 (usage_type)</label>
        <select
          value={usageType}
          onChange={(e) => setUsageType(e.target.value as UsageType)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {USAGE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">파일</label>
        <Input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="h-10 text-sm"
        />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">업종</label>
        <Input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="학원, 스터디카페, 학교 등"
          className="h-10 text-sm"
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={submitting || !file || !projectTitle.trim()} className="flex-1 h-9 text-sm">
          {submitting ? '업로드 중…' : '업로드'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="h-9 text-sm">
          취소
        </Button>
      </div>
    </form>
  )
}
