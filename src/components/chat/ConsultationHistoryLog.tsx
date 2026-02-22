/**
 * 상담 히스토리 로그 — 기록형 상황판
 * - 직원이 직접 상담 요약을 입력·저장
 * - 저장된 내용을 시간순 리스트로 표시 (과거 상담 한눈에)
 * - 실시간 채팅 아님. 상담 후 '누가, 어디에, 무엇을, 언제' 결론 기록용
 * - [이미지 추가] 버튼: 이미지 자산 관리 업로드 폼을 Dialog로 띄움. 업체명·프로젝트 ID 자동 입력.
 *   저장 시 기존 image_assets 로직 사용, 성공 시 썸네일만 히스토리에 참조 링크로 남김.
 * - PDF 등 비이미지는 기존처럼 Supabase Storage(chat-media)에만 저장.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, Send, Trash2, ImagePlus } from 'lucide-react'
import {
  buildCloudinaryUrlWithTransformation,
  buildCloudinaryUrl,
  CLOUDINARY_CHAT_THUMB,
} from '@/lib/imageAssetService'
import { MediaViewer } from '@/components/chat/MediaViewer'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ImageAssetUploadForm } from '@/components/image/ImageAssetUploadForm'
import type { ImageAssetUploadFormSuccessResult } from '@/components/image/ImageAssetUploadForm'

const CHAT_MEDIA_BUCKET = 'chat-media'

/** 이미지 확장자만 Cloudinary+이미지자산 경로로 업로드 */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i

interface HistoryEntry {
  id: string
  content: string
  created_at: string
  sender_id: string
  message_type: string
  file_url?: string | null
  file_name?: string | null
  metadata?: { public_id?: string; cloud_name?: string; image_asset_id?: string } | null
}

interface ConsultationHistoryLogProps {
  consultationId: string
  /** 이미지 자산관리와 동일 저장 시 site_name·public_id용 (업체/현장명) */
  projectName?: string
  onSaved?: () => void
}

export function ConsultationHistoryLog({ consultationId, projectName = '', onSaved }: ConsultationHistoryLogProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadFormOpen, setUploadFormOpen] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('consultation_messages')
      .select('id, content, created_at, sender_id, message_type, file_url, file_name, metadata')
      .eq('consultation_id', consultationId)
      .in('message_type', ['TEXT', 'SYSTEM', 'FILE'])
      .order('created_at', { ascending: true })
    setLoading(false)
    if (error) {
      console.error(error)
      setEntries([])
      return
    }
    setEntries((data ?? []) as HistoryEntry[])
  }, [consultationId])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleSave = async () => {
    const text = input.trim()
    if (!text) return
    setSaving(true)
    const { error } = await supabase.from('consultation_messages').insert({
      consultation_id: consultationId,
      sender_id: 'staff',
      content: text,
      message_type: 'TEXT',
    })
    setSaving(false)
    if (error) {
      toast.error('저장에 실패했습니다.')
      return
    }
    setInput('')
    toast.success('히스토리에 기록되었습니다.')
    loadEntries()
    onSaved?.()
  }

  const handleImageUploadSuccess = useCallback(
    async (result: ImageAssetUploadFormSuccessResult) => {
      const { error } = await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'staff',
        content: result.file_name,
        message_type: 'FILE',
        file_url: result.thumbnail_url,
        file_name: result.file_name,
        metadata: {
          public_id: result.public_id,
          cloud_name: result.cloud_name,
          image_asset_id: result.id,
        },
      })
      if (error) {
        toast.error('히스토리 참조 링크 저장에 실패했습니다.')
        return
      }
      loadEntries()
      onSaved?.()
    },
    [consultationId, loadEntries, onSaved]
  )

  const handlePdfUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file || !consultationId) return
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
      const path = `${consultationId}/${crypto.randomUUID()}${ext}`
      const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, { upsert: false })
      if (error) {
        toast.error('파일 업로드에 실패했습니다.')
        return
      }
      const { error: insertErr } = await supabase.from('consultation_messages').insert({
        consultation_id: consultationId,
        sender_id: 'staff',
        content: file.name,
        message_type: 'FILE',
        file_url: path,
        file_name: file.name,
      })
      if (insertErr) {
        toast.error('메시지 저장에 실패했습니다.')
        return
      }
      toast.success('파일이 히스토리에 추가되었습니다.')
      loadEntries()
      onSaved?.()
    },
    [consultationId, loadEntries, onSaved]
  )

  const handleDeleteEntry = useCallback(
    async (entry: HistoryEntry) => {
      if (!confirm('이 항목을 삭제할까요?')) return
      const meta = entry.metadata as { image_asset_id?: string } | null | undefined
      const { error: msgError } = await supabase.from('consultation_messages').delete().eq('id', entry.id)
      if (msgError) {
        toast.error('삭제에 실패했습니다.')
        return
      }
      if (meta?.image_asset_id) {
        await supabase.from('image_assets').delete().eq('id', meta.image_asset_id)
      }
      if (entry.message_type === 'FILE' && entry.file_url && !entry.file_url.startsWith('http')) {
        await supabase.storage.from(CHAT_MEDIA_BUCKET).remove([entry.file_url])
      }
      toast.success('삭제되었습니다.')
      loadEntries()
      onSaved?.()
    },
    [loadEntries, onSaved]
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 입력창 고정 — 동일연락처와 상담 히스토리 중간에 항상 노출, 카드 열면 바로 타이핑 가능 */}
      <div className="shrink-0 border border-border rounded-lg bg-background p-3 mb-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="상담 내용을 요약해서 입력하세요. (예: OO일 견적 발송 예정, 다음 주 실측 진행)"
          className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSave()
            }
          }}
        />
        <div className="flex items-center gap-2 mt-2">
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handlePdfUpload}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setUploadFormOpen(true)}
            title="이미지 자산 관리 업로드 폼 열기 (업체명·프로젝트 자동 입력)"
          >
            <ImagePlus className="h-4 w-4" />
            이미지 추가
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => pdfInputRef.current?.click()}
          >
            PDF 추가
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            onClick={handleSave}
            disabled={!input.trim() || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            기록하기
          </Button>
        </div>
      </div>

      <Dialog open={uploadFormOpen} onOpenChange={setUploadFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이미지 추가 (이미지 자산 관리)</DialogTitle>
          </DialogHeader>
          <ImageAssetUploadForm
            variant="embedded"
            prefill={{
              site_name: projectName || '',
              project_id: consultationId,
            }}
            onSuccess={handleImageUploadSuccess}
            onClose={() => setUploadFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 상담 히스토리 — 이 영역만 스크롤, 과거→현재 순(위에서 아래) */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            불러오는 중…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">기록된 히스토리가 없습니다. 위에서 상담 내용을 입력해 주세요.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm relative group">
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">
                  {format(new Date(e.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                  {e.sender_id === 'staff' && (
                    <span className="ml-2 text-primary/80">{e.message_type === 'FILE' ? '직원 (파일)' : '직원'}</span>
                  )}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-70 hover:opacity-100 hover:text-destructive"
                  onClick={() => handleDeleteEntry(e)}
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {e.message_type === 'FILE' && e.file_url ? (
                <HistoryFileEntry
                  path={e.file_url}
                  fileName={e.file_name ?? e.content}
                  metadata={e.metadata ?? undefined}
                />
              ) : (
                <p className="whitespace-pre-wrap text-foreground">{e.content}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/** 히스토리 목록에서 파일 메시지 표시. Cloudinary(metadata)면 썸네일+클릭 시 확대 뷰어(이미지자산과 동일), 아니면 Storage Signed URL */
function HistoryFileEntry({
  path,
  fileName,
  metadata,
}: {
  path: string
  fileName: string
  metadata?: { public_id?: string; cloud_name?: string } | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const isImage = /\.(jpe?g|png|gif|webp)$/i.test(fileName) || !!metadata?.public_id
  const isCloudinary = !!metadata?.public_id

  useEffect(() => {
    if (isCloudinary) {
      setUrl(null)
      return
    }
    if (path.startsWith('http')) {
      setUrl(path)
      return
    }
    supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null))
  }, [path, isCloudinary])

  if (isCloudinary) {
    const thumbUrl = buildCloudinaryUrlWithTransformation(
      metadata.public_id!,
      CLOUDINARY_CHAT_THUMB,
      metadata.cloud_name
    )
    const highResUrl = buildCloudinaryUrl(metadata.public_id!, 'marketing')
    return (
      <>
        <button
          type="button"
          onClick={() => setViewerOpen(true)}
          className="block text-left focus:outline-none focus:ring-2 focus:ring-ring rounded"
        >
          <img
            src={thumbUrl}
            alt={fileName}
            className="max-w-[200px] max-h-[160px] rounded object-cover border border-border cursor-pointer hover:opacity-90"
          />
          <span className="text-xs text-muted-foreground mt-1 block truncate">{fileName}</span>
        </button>
        {viewerOpen && (
          <MediaViewer
            urls={[highResUrl]}
            currentIndex={0}
            onClose={() => setViewerOpen(false)}
            fileNames={[fileName]}
          />
        )}
      </>
    )
  }

  if (!url) return <p className="text-muted-foreground text-xs">로딩 중…</p>
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={fileName} className="max-w-[200px] max-h-[160px] rounded object-cover border border-border" />
        <span className="text-xs text-muted-foreground mt-1 block truncate">{fileName}</span>
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm">
      📎 {fileName}
    </a>
  )
}
