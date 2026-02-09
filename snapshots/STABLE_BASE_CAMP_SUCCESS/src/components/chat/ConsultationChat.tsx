/**
 * 프로젝트별 채팅형 히스토리 — 카톡 스타일 말풍선, 무한 스크롤, 미디어(이미지/PDF), 구글챗 브릿지
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Send, Paperclip, FileText, Loader2, MessageCircle, Layers } from 'lucide-react'
import { MediaViewer } from './MediaViewer'
import { insertSystemLog } from '@/lib/activityLog'
import { cn } from '@/lib/utils'

const CHAT_MEDIA_BUCKET = 'chat-media'
const PAGE_SIZE = 20
const SIGNED_URL_EXPIRES = 3600

/** 상담 식별자 배지 — 연보라색 스타일 통일 (현재/과거 이력 동일) */
const IDENTIFIER_BADGE_CLASS = 'text-[11px] tracking-tighter font-bold px-2 py-0.5 rounded border shadow-none bg-violet-500/20 border-violet-500/40 text-violet-900'

function senderDisplay(senderId: string): { name: string; initial: string } {
  return senderId === 'staff' ? { name: '직원', initial: '직' } : { name: '고객', initial: '고' }
}

/** 시스템 로그 메타데이터 — 딥링크용 */
export interface SystemLogMetadata {
  type: 'estimate_issued' | 'estimate_approved' | 'file_upload' | 'status_change'
  estimate_id?: string
  message_id?: string
  file_url?: string
  file_name?: string
  from_stage?: string
  to_stage?: string
  version?: number
}

export interface ConsultationMessage {
  id: string
  consultation_id: string
  sender_id: string
  content: string
  message_type: 'TEXT' | 'FILE' | 'SYSTEM'
  file_url: string | null
  file_name: string | null
  created_at: string
  metadata?: SystemLogMetadata | null
}

export interface ConsultationChatProps {
  consultationId: string
  contact: string
  companyName: string
  /** 구글챗 웹훅 (선택). 실패해도 DB 저장에는 영향 없음 */
  googleChatWebhookUrl?: string | null
  /** 시스템 로그 클릭 시 견적서/파일로 이동 (딥링크) */
  onSystemLogClick?: (message: ConsultationMessage) => void
  /** 스크롤/포커스할 메시지 id (딥링크 후 하이라이트용) */
  highlightMessageId?: string | null
  /** 식별자 배지 클릭 시 해당 상담 전용 뷰로 전환 (전체 이력 끄기 + 상담 선택) */
  onFocusConsultation?: (consultationId: string) => void
}

function normalizeContact(c: string): string {
  return (c || '').replace(/\D/g, '')
}

/** [YYMM] [상호] [뒷4자리] — 히스토리 칩용. metadata.display_name 없을 때 보정 */
function computeDisplayNameForLabel(companyName: string, contact: string, createdAt: string): string {
  const ref = createdAt ? new Date(createdAt) : new Date()
  const yymm = `${ref.getFullYear().toString().slice(-2)}${String(ref.getMonth() + 1).padStart(2, '0')}`
  const digits = (contact || '').replace(/\D/g, '')
  const last4 = digits.length >= 4 ? digits.slice(-4) : digits.padStart(4, '0').slice(-4) || '0000'
  const namePart = (companyName || '').trim() || '상담'
  return `${yymm} ${namePart} ${last4}`
}

export function ConsultationChat({
  consultationId,
  contact,
  companyName,
  googleChatWebhookUrl,
  onSystemLogClick,
  highlightMessageId,
  onFocusConsultation,
}: ConsultationChatProps) {
  const STORAGE_KEY = 'findgagu-chat-showAllHistory'
  const [showAllCustomer, setShowAllCustomer] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const setShowAllCustomerPersisted = useCallback((value: boolean) => {
    setShowAllCustomer(value)
    try {
      sessionStorage.setItem(STORAGE_KEY, String(value))
    } catch {
      /* ignore */
    }
  }, [])
  const [messages, setMessages] = useState<ConsultationMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [inputText, setInputText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [lightboxFileNames, setLightboxFileNames] = useState<string[]>([])
  const [consultationLabels, setConsultationLabels] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const highlightRef = useRef<HTMLDivElement | null>(null)

  const fetchConsultationIdsByContact = useCallback(async (): Promise<string[]> => {
    if (!contact.trim()) return [consultationId]
    const normalized = normalizeContact(contact)
    if (!normalized) return [consultationId]
    const { data, error } = await supabase
      .from('consultations')
      .select('id, contact')
    if (error) return [consultationId]
    const rows = (data ?? []).filter(
      (row: { id: string; contact?: string }) => normalizeContact(row.contact ?? '') === normalized
    )
    const ids = rows.map((r: { id: string }) => r.id) as string[]
    return ids.length ? ids : [consultationId]
  }, [contact, consultationId])

  const loadMessages = useCallback(
    async (beforeCreatedAt?: string, append = false) => {
      const ids = showAllCustomer ? await fetchConsultationIdsByContact() : [consultationId]
      if (showAllCustomer && ids.length > 0) {
        const { data: cons } = await supabase.from('consultations').select('id, company_name, contact, created_at, metadata').in('id', ids)
        const map: Record<string, string> = {}
        ;(cons ?? []).forEach((r) => {
          const meta = r.metadata as { display_name?: string } | null | undefined
          const fromMeta = meta?.display_name && String(meta.display_name).trim()
          const company = r.company_name || '(업체명 없음)'
          const created = r.created_at ?? ''
          const contactStr = r.contact ?? ''
          map[r.id] = fromMeta || computeDisplayNameForLabel(company, contactStr, created) || company
        })
        setConsultationLabels(map)
      } else {
        setConsultationLabels({})
      }
      let query = supabase
        .from('consultation_messages')
        .select('id, consultation_id, sender_id, content, message_type, file_url, file_name, created_at, metadata')
        .in('consultation_id', ids)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt)
      const { data, error } = await query
      if (error) {
        console.error(error)
        if (!append) setMessages([])
        setHasMore(false)
        return
      }
      const list = (data ?? []) as ConsultationMessage[]
      if (!append) {
        setMessages(list)
      } else {
        setMessages((prev) => [...list, ...prev])
      }
      setHasMore(list.length === PAGE_SIZE)
    },
    [consultationId, showAllCustomer, fetchConsultationIdsByContact]
  )

  useEffect(() => {
    setLoading(true)
    setHasMore(true)
    loadMessages().finally(() => setLoading(false))
  }, [consultationId, showAllCustomer])

  useEffect(() => {
    if (highlightMessageId) highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightMessageId])

  /** 상담 전환 후(consultationId 변경) 또는 '현재 상담만' 전환 시 최하단(최신 메시지)으로 스크롤 */
  useEffect(() => {
    if (!showAllCustomer && scrollRef.current) {
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 400)
      return () => clearTimeout(t)
    }
  }, [consultationId, showAllCustomer])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || messages.length === 0) return
    const oldest = messages.reduce<ConsultationMessage | null>(
      (min, m) => (!min || m.created_at < min.created_at ? m : min),
      null
    )
    if (!oldest) return
    setLoadingMore(true)
    loadMessages(oldest.created_at, true).finally(() => setLoadingMore(false))
  }, [loadingMore, hasMore, messages, loadMessages])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || !hasMore || loadingMore) return
    if (el.scrollTop < 100) loadMore()
  }, [hasMore, loadingMore, loadMore])

  const sendText = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    const { error } = await supabase.from('consultation_messages').insert({
      consultation_id: consultationId,
      sender_id: 'staff',
      content: text,
      message_type: 'TEXT',
    })
    if (error) {
      toast.error('메시지 전송에 실패했습니다.')
      setInputText(text)
      return
    }
    await loadMessages()
    if (googleChatWebhookUrl) {
      fetch(googleChatWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[${companyName}] ${text}`,
          consultation_id: consultationId,
          company_name: companyName,
        }),
      }).catch(() => {})
    }
  }, [inputText, consultationId, companyName, googleChatWebhookUrl, loadMessages])

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadProgress(0)
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
      const path = `${consultationId}/${crypto.randomUUID()}${ext}`
      const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, file, { upsert: false })
      setUploadProgress(100)
      if (error) {
        toast.error('파일 업로드에 실패했습니다.')
        setUploading(false)
        return
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('consultation_messages')
        .insert({
          consultation_id: consultationId,
          sender_id: 'staff',
          content: file.name,
          message_type: 'FILE',
          file_url: path,
          file_name: file.name,
        })
        .select('id')
        .single()
      setUploading(false)
      if (insertErr) {
        toast.error('메시지 저장에 실패했습니다.')
        return
      }
      await insertSystemLog(supabase, {
        consultation_id: consultationId,
        event_type: 'file_upload',
        actor_name: '직원',
        detail: `${file.name} 파일이 업로드되었습니다`,
        metadata: { type: 'file_upload', message_id: inserted?.id, file_url: path, file_name: file.name },
      })
      await loadMessages()
    },
    [consultationId, loadMessages]
  )

  const getSignedUrl = useCallback(async (path: string): Promise<string> => {
    const { data } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRES)
    return data?.signedUrl ?? path
  }, [])

  const isImage = (fileName: string) => /\.(jpe?g|png|gif|webp)$/i.test(fileName)
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName)

  /** 절대 시간 순 오름차순(위→아래 시간 흐름). 그룹화 없이 단일 타임라인. 맨 아래 = 최신 메시지 */
  const displayMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  )

  /** 채팅 내 이미지 메시지에서 URL 목록 수집 (슬라이드용). Signed URL은 FileMessage에서 resolve되므로 클릭 시 콜백으로 수집 */
  const openLightbox = useCallback(
    (url: string, allImageUrls?: string[], allFileNames?: string[], currentIdx?: number) => {
      if (allImageUrls?.length) {
        setLightboxUrls(allImageUrls)
        setLightboxFileNames(allFileNames ?? [])
        setLightboxIndex(currentIdx ?? 0)
      } else {
        setLightboxUrls([url])
        setLightboxFileNames([])
        setLightboxIndex(0)
      }
      setLightboxOpen(true)
    },
    []
  )

  return (
    <div className="flex flex-col h-full min-h-0 rounded-lg bg-slate-100">
      {/* 세그먼트 — 우측 상단 타이트 배치, 리스트 영역 최대 확보 */}
      <div className="flex items-center justify-end shrink-0 mb-1.5 mt-0.5 pr-0.5">
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="히스토리 보기 범위">
          <button
            type="button"
            onClick={() => setShowAllCustomerPersisted(false)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors',
              !showAllCustomer
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            )}
            aria-pressed={!showAllCustomer}
          >
            <MessageCircle className="h-3 w-3 shrink-0" />
            현재 상담만
          </button>
          <button
            type="button"
            onClick={() => setShowAllCustomerPersisted(true)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium transition-colors',
              showAllCustomer
                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            )}
            aria-pressed={showAllCustomer}
          >
            <Layers className="h-3 w-3 shrink-0" />
            전체 이력 합쳐보기
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto min-h-[200px] space-y-2 py-2 bg-slate-100"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#64748b' }} />
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            불러오는 중…
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">대화가 없습니다. 메시지를 입력해 보세요.</div>
        ) : (
          displayMessages.map((m) => {
            if (m.message_type === 'SYSTEM') {
              const meta = m.metadata
              const canNavigate = onSystemLogClick && meta && (meta.estimate_id ?? meta.message_id)
              return (
                <div key={m.id} className="flex justify-center my-2" ref={highlightMessageId === m.id ? highlightRef : undefined}>
                  <button
                    type="button"
                    onClick={() => canNavigate && onSystemLogClick(m)}
                    className={cn(
                      'rounded-lg px-3 py-2 text-xs text-center max-w-[90%] text-slate-900 bg-white border border-slate-200 shadow-sm',
                      canNavigate && 'cursor-pointer hover:bg-slate-50 transition-colors'
                    )}
                  >
                    {m.content}
                  </button>
                </div>
              )
            }
            const isStaff = m.sender_id === 'staff'
            const sender = senderDisplay(m.sender_id)
            const isOtherConsultation = showAllCustomer && m.consultation_id !== consultationId
            const label = showAllCustomer && consultationLabels[m.consultation_id] ? consultationLabels[m.consultation_id] : null
            const imageMessages = displayMessages.filter((x) => x.message_type === 'FILE' && x.file_url && isImage(x.file_name ?? x.content))
            const imageIndex = imageMessages.findIndex((x) => x.id === m.id)
            const openAtImage = imageIndex >= 0 ? () => {
              Promise.all(imageMessages.map((img) => getSignedUrl(img.file_url!)))
                .then((urls) => {
                  setLightboxUrls(urls)
                  setLightboxFileNames(imageMessages.map((img) => img.file_name ?? img.content ?? ''))
                  setLightboxIndex(imageIndex)
                  setLightboxOpen(true)
                })
            } : undefined
            return (
              <div
                key={m.id}
                className={cn(
                  'rounded-lg transition-colors duration-200',
                  isOtherConsultation && 'border-l-4 border-violet-400 pl-2 ml-0.5'
                )}
              >
                <div
                  className={cn('flex gap-2', isStaff ? 'flex-row-reverse' : 'flex-row', highlightMessageId === m.id ? 'ring-2 ring-slate-400 rounded-lg' : '')}
                  ref={highlightMessageId === m.id ? highlightRef : undefined}
                >
                  <div className={cn('shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold', isStaff ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-800')} title={sender.name}>
                    {sender.initial}
                  </div>
                  <div className={cn('flex flex-col min-w-0 max-w-[85%]', isStaff ? 'items-end' : 'items-start')}>
                    <div className="flex items-center gap-2 mb-0.5 w-full justify-start min-w-0 flex-wrap">
                      <span className="text-xs font-medium shrink-0 text-slate-500">{sender.name}</span>
                      {label && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowAllCustomerPersisted(false)
                            onFocusConsultation?.(m.consultation_id)
                          }}
                          title="해당 상담 내용만 보기"
                          className={cn(
                            'shrink-0 cursor-pointer rounded border shadow-sm transition-all hover:brightness-110 hover:shadow',
                            IDENTIFIER_BADGE_CLASS
                          )}
                        >
                          {label}
                        </button>
                      )}
                    </div>
                    <div className={cn('rounded-2xl px-3 py-2 text-sm border border-slate-200 bg-white text-slate-900 shadow-sm', isStaff && 'rounded-br-md')}>
                    {m.message_type === 'TEXT' ? (
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    ) : (
                      <FileMessage
                        fileUrl={m.file_url}
                        fileName={m.file_name ?? m.content}
                        getSignedUrl={getSignedUrl}
                        onImageClick={openAtImage}
                      />
                    )}
                    <p className="text-[10px] opacity-80 mt-1 text-slate-600">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ko })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
          })
        )}
      </div>

      {uploading && (
        <div className="shrink-0 px-2 py-1.5 rounded text-xs flex items-center gap-2 bg-slate-200/90 text-slate-700">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-slate-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span>업로드 중…</span>
        </div>
      )}

      <div className="shrink-0 flex gap-1 pt-2 pb-[env(safe-area-inset-bottom)] border-t border-slate-200 bg-slate-100">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadFile(file)
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          className="flex-1 min-w-0"
          placeholder="메시지 입력..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
          onFocus={(e) => { e.target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }}
        />
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => sendText()} disabled={!inputText.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {lightboxOpen && (
        <MediaViewer
          urls={lightboxUrls}
          currentIndex={lightboxIndex}
          fileNames={lightboxFileNames}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  )
}

function FileMessage({
  fileUrl,
  fileName,
  getSignedUrl,
  onImageClick,
}: {
  fileUrl: string | null
  fileName: string
  getSignedUrl: (path: string) => Promise<string>
  onImageClick?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!fileUrl)
  useEffect(() => {
    if (!fileUrl) return
    getSignedUrl(fileUrl).then((signed) => {
      setUrl(signed)
      setLoading(false)
    })
  }, [fileUrl, getSignedUrl])
  if (!fileUrl) return <span className="text-slate-900">{fileName}</span>
  if (loading) return <span className="text-xs text-slate-500">로딩 중…</span>
  const img = isImage(fileName)
  const pdf = isPdf(fileName)
  if (img && url) {
    return (
      <button type="button" className="block text-left" onClick={() => onImageClick?.()}>
        <img src={url} alt={fileName} className="max-w-[200px] max-h-[160px] rounded object-cover" />
      </button>
    )
  }
  if (pdf && url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-slate-900">
        <FileText className="h-4 w-4 shrink-0" />
        <span className="truncate">{fileName}</span>
      </a>
    )
  }
  return (
    <a href={url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 underline text-slate-900">
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{fileName}</span>
    </a>
  )
}

function isImage(fileName: string): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(fileName)
}
function isPdf(fileName: string): boolean {
  return /\.pdf$/i.test(fileName)
}

export default ConsultationChat
