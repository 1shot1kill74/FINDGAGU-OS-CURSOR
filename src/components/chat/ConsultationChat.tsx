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
import { Send, Paperclip, FileText, Loader2, MessageCircle, Layers, FileSpreadsheet, Presentation, File, Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { MediaViewer } from './MediaViewer'
import { cn } from '@/lib/utils'
import { isValidUUID } from '@/lib/uuid'
import {
  buildCloudinaryUrl,
  buildCloudinaryUrlWithTransformation,
  CLOUDINARY_CHAT_THUMB,
} from '@/lib/imageAssetService'

const CHAT_MEDIA_BUCKET = 'chat-media'
const PAGE_SIZE = 20
const SIGNED_URL_EXPIRES = 3600

/** 상담 식별자 배지 — 연보라색 스타일 통일 (현재/과거 이력 동일) */
const IDENTIFIER_BADGE_CLASS = 'text-[11px] tracking-tighter font-bold px-2 py-0.5 rounded border shadow-none bg-violet-500/20 border-violet-500/40 text-violet-900'

function senderDisplay(senderId: string): { name: string; initial: string } {
  if (senderId === 'staff') return { name: '직원', initial: '직' }
  if (senderId === 'google_chat') return { name: '구글챗', initial: '구' }
  return { name: '고객', initial: '고' }
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
  message_type: 'TEXT' | 'FILE' | 'SYSTEM' | 'USER'
  file_url: string | null
  file_name: string | null
  created_at: string
  metadata?: (SystemLogMetadata & { edited_at?: string; deleted_at?: string }) | null
  /** false면 일반 사용자에게 숨김. 관리자는 연하게 보이고 다시 보이기 가능 */
  is_visible?: boolean
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
  /** true일 때만 시스템 메시지에 영구 삭제 버튼 노출 (admin 권한) */
  isAdmin?: boolean
  /** 변경 시 메시지 재조회 (마이그레이션 동기화 등) */
  refreshKey?: number
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
  isAdmin = false,
  refreshKey = 0,
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingSystemId, setDeletingSystemId] = useState<string | null>(null)
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null)
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
      .eq('is_visible', true)
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
        const { data: cons } = await supabase.from('consultations').select('id, company_name, contact, created_at, metadata').eq('is_visible', true).in('id', ids)
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
        .select('id, consultation_id, sender_id, content, message_type, file_url, file_name, created_at, metadata, is_visible')
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
  }, [consultationId, showAllCustomer, refreshKey])

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
    if (!isValidUUID(consultationId)) {
      toast.error('유효한 상담 ID가 아닙니다.')
      return
    }
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
    setInputText('')
  }, [inputText, consultationId, companyName, googleChatWebhookUrl, loadMessages])

  const uploadFile = useCallback(
    async (file: File) => {
      if (!isValidUUID(consultationId)) {
        toast.error('유효한 상담 ID가 아닙니다.')
        return
      }
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
      await loadMessages()
    },
    [consultationId, loadMessages]
  )

  /** Storage 경로면 Signed URL 발급, 이미 http(s) 절대 URL(예: 구글챗 카드·Cloudinary)이면 그대로 반환 */
  const getSignedUrl = useCallback(async (path: string): Promise<string> => {
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    const { data } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRES)
    return data?.signedUrl ?? path
  }, [])

  /** 메시지 소프트 삭제: Row는 유지, 내용을 삭제 문구로 교체 + deleted_at 기록 */
  const handleDeleteMessage = useCallback(
    async (message: ConsultationMessage) => {
      if (!window.confirm('이 메시지를 삭제된 상태로 표시할까요?')) return
      setDeletingId(message.id)
      try {
        const placeholder = message.message_type === 'FILE' ? '[이 파일은 삭제되었습니다]' : '[삭제된 메시지입니다]'
        const meta = (message.metadata ?? {}) as Record<string, unknown>
        const { error } = await supabase
          .from('consultation_messages')
          .update({
            content: placeholder,
            metadata: { ...meta, deleted_at: new Date().toISOString() },
          })
          .eq('id', message.id)
        if (error) throw error
        toast.success('삭제된 상태로 표시했습니다.')
        await loadMessages()
      } catch (e) {
        console.error(e)
        toast.error('삭제 처리에 실패했습니다.')
      } finally {
        setDeletingId(null)
      }
    },
    [loadMessages]
  )

  /** 메시지 숨기기/다시 보이기 — is_visible 업데이트 후 로컬 상태 반영 */
  const handleSetVisible = useCallback(
    async (message: ConsultationMessage, visible: boolean) => {
      setTogglingVisibilityId(message.id)
      try {
        const { error } = await supabase
          .from('consultation_messages')
          .update({ is_visible: visible })
          .eq('id', message.id)
        if (error) throw error
        setMessages((prev) =>
          prev.map((msg) => (msg.id === message.id ? { ...msg, is_visible: visible } : msg))
        )
        toast.success(visible ? '다시 보이기 처리했습니다.' : '타임라인에서 숨겼습니다.')
      } catch (e) {
        console.error(e)
        toast.error('처리에 실패했습니다.')
      } finally {
        setTogglingVisibilityId(null)
      }
    },
    []
  )

  /** 시스템 메시지 영구 삭제 (admin 전용) — consultation_messages에서 DELETE 후 화면에서 제거 */
  const handleDeleteSystemMessage = useCallback(
    async (message: ConsultationMessage) => {
      if (!window.confirm('이 기록을 삭제하시겠습니까? 데이터베이스에서도 영구 삭제됩니다.')) return
      setDeletingSystemId(message.id)
      try {
        const { error } = await supabase.from('consultation_messages').delete().eq('id', message.id)
        if (error) throw error
        setMessages((prev) => prev.filter((m) => m.id !== message.id))
        toast.success('기록이 삭제되었습니다.')
      } catch (e) {
        console.error(e)
        toast.error('삭제에 실패했습니다.')
      } finally {
        setDeletingSystemId(null)
      }
    },
    []
  )

  /** 텍스트 메시지 수정 저장 */
  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      const trimmed = editDraft.trim()
      if (trimmed === '') return
      const prev = messages.find((x) => x.id === messageId)
      if (prev?.content === trimmed) {
        setEditingMessageId(null)
        setEditDraft('')
        return
      }
      try {
        const meta = (prev?.metadata ?? {}) as Record<string, unknown>
        const { error } = await supabase
          .from('consultation_messages')
          .update({
            content: trimmed,
            metadata: { ...meta, edited_at: new Date().toISOString() },
          })
          .eq('id', messageId)
        if (error) throw error
        toast.success('수정되었습니다.')
        setEditingMessageId(null)
        setEditDraft('')
        await loadMessages()
      } catch (e) {
        console.error(e)
        toast.error('수정에 실패했습니다.')
      }
    },
    [editDraft, messages, loadMessages]
  )

  const isImage = (fileName: string) => /\.(jpe?g|png|gif|webp)$/i.test(fileName)
  const isPdf = (fileName: string) => /\.pdf$/i.test(fileName)

  /** is_visible === true만 노출(관리자는 전부 노출). 절대 시간 순 오름차순. */
  const displayMessages = useMemo(() => {
    const list = isAdmin ? messages : messages.filter((m) => m.is_visible !== false)
    return [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [messages, isAdmin])

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
        className="relative flex-1 overflow-y-auto min-h-[200px] space-y-3 py-3 pl-6 pr-2 bg-slate-100"
      >
        {/* 타임라인 수직 가이드라인 — 왼쪽 정렬된 아이콘/아바타 흐름 */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-300/80 pointer-events-none" aria-hidden />
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
              const isHidden = m.is_visible === false
              return (
                <div
                  key={m.id}
                  className={cn('group flex items-start gap-2 my-2 -ml-2', isHidden && isAdmin && 'opacity-60')}
                  ref={highlightMessageId === m.id ? highlightRef : undefined}
                >
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-300/90 flex items-center justify-center text-slate-600" aria-hidden>
                    <MessageCircle className="w-3.5 h-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => canNavigate && onSystemLogClick(m)}
                    className={cn(
                      'rounded-lg px-4 py-2.5 text-xs text-left max-w-[min(92%,420px)] text-slate-900 bg-white border border-slate-200 shadow-sm flex-1 min-w-0',
                      canNavigate && 'cursor-pointer hover:bg-slate-50 transition-colors'
                    )}
                  >
                    {m.content}
                  </button>
                  <div className="shrink-0 min-w-[56px] flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {isHidden && isAdmin ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSetVisible(m, true) }}
                        disabled={togglingVisibilityId === m.id}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                        title="다시 보이기"
                      >
                        {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleSetVisible(m, false) }}
                        disabled={togglingVisibilityId === m.id}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                        title="숨기기"
                      >
                        {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteSystemMessage(m) }}
                        disabled={deletingSystemId === m.id}
                        className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 active:text-slate-900 disabled:opacity-50"
                        title="기록 영구 삭제"
                      >
                        {deletingSystemId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              )
            }
            const isStaff = m.sender_id === 'staff'
            const meta = m.metadata as { edited_at?: string; deleted_at?: string } | undefined
            const isDeleted = !!meta?.deleted_at
            const isHiddenMsg = m.is_visible === false
            const sender = senderDisplay(m.sender_id)
            const isOtherConsultation = showAllCustomer && m.consultation_id !== consultationId
            const label = showAllCustomer && consultationLabels[m.consultation_id] ? consultationLabels[m.consultation_id] : null
            const imageMessages = displayMessages.filter((x) => x.message_type === 'FILE' && x.file_url && isImage(x.file_name ?? x.content))
            const imageIndex = imageMessages.findIndex((x) => x.id === m.id)
            const openAtImage = imageIndex >= 0 ? () => {
              Promise.all(
                imageMessages.map((img) => {
                  const meta = img.metadata as { public_id?: string; cloud_name?: string } | undefined
                  if (meta?.public_id) return Promise.resolve(buildCloudinaryUrl(meta.public_id, 'marketing'))
                  return getSignedUrl(img.file_url!)
                })
              ).then((urls) => {
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
                  isOtherConsultation && 'border-l-4 border-violet-400 pl-2 ml-0.5',
                  isHiddenMsg && isAdmin && 'opacity-60'
                )}
              >
                {/* 직원=왼쪽(flex-row), 고객/기타=오른쪽(flex-row-reverse) */}
                <div
                  className={cn('group flex gap-2', isStaff ? 'flex-row' : 'flex-row-reverse', highlightMessageId === m.id ? 'ring-2 ring-slate-400 rounded-lg' : '')}
                  ref={highlightMessageId === m.id ? highlightRef : undefined}
                >
                  <div className={cn('shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold', isStaff ? 'bg-slate-600 text-white' : 'bg-slate-200 text-slate-800')} title={sender.name}>
                    {sender.initial}
                  </div>
                  <div className={cn('flex flex-col min-w-0 max-w-[min(92%,420px)]', isStaff ? 'items-start' : 'items-end')}>
                    <div className={cn('flex items-center gap-2 mb-0.5 w-full min-w-0 flex-wrap', isStaff ? 'justify-start' : 'justify-end')}>
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
                    {/* 말풍선 + hover 시 수정/삭제 (직원 메시지만, 삭제된 메시지 제외) */}
                    <div className="relative">
                      {isStaff && !isDeleted && (m.message_type === 'TEXT' || m.message_type === 'FILE') && (
                        <div className="absolute -top-1 right-0 z-10 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          {m.message_type === 'TEXT' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingMessageId(m.id)
                                setEditDraft(m.content)
                              }}
                              className="rounded p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
                              title="수정"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteMessage(m)
                            }}
                            disabled={deletingId === m.id}
                            className="rounded p-1 text-slate-500 hover:bg-red-100 hover:text-red-600 disabled:opacity-50"
                            title="삭제"
                          >
                            {deletingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                          {isHiddenMsg && isAdmin ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSetVisible(m, true) }}
                              disabled={togglingVisibilityId === m.id}
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                              title="다시 보이기"
                            >
                              {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSetVisible(m, false) }}
                              disabled={togglingVisibilityId === m.id}
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                              title="숨기기"
                            >
                              {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      )}
                      {/* 고객 메시지에도 숨기기/다시 보이기 (hover 시) */}
                      {!isStaff && (
                        <div className="absolute -top-1 right-0 z-10 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          {isHiddenMsg && isAdmin ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSetVisible(m, true) }}
                              disabled={togglingVisibilityId === m.id}
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                              title="다시 보이기"
                            >
                              {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleSetVisible(m, false) }}
                              disabled={togglingVisibilityId === m.id}
                              className="rounded p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 disabled:opacity-50"
                              title="숨기기"
                            >
                              {togglingVisibilityId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                      )}
                      <div className={cn(
                        'rounded-2xl px-4 py-2.5 text-sm border shadow-sm text-left transition-opacity',
                        isStaff
                          ? 'rounded-bl-md border-slate-200 bg-slate-50 text-slate-900'
                          : 'rounded-br-md border-slate-200 bg-white text-slate-900',
                        isDeleted && 'opacity-60 bg-slate-100/80 border-slate-100 dark:bg-slate-800/30 dark:border-slate-700'
                      )}>
                        {editingMessageId === m.id && m.message_type === 'TEXT' && !isDeleted ? (
                          <div className="space-y-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  setEditingMessageId(null)
                                  setEditDraft('')
                                }
                              }}
                              className="min-h-[60px] w-full resize-y rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => { setEditingMessageId(null); setEditDraft('') }}
                              >
                                취소
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => handleSaveEdit(m.id)}
                                disabled={!editDraft.trim()}
                              >
                                저장
                              </Button>
                            </div>
                          </div>
                        ) : isDeleted ? (
                          <p className="whitespace-pre-wrap break-words text-slate-500 italic">{m.content}</p>
                        ) : m.message_type === 'TEXT' ? (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        ) : (
                          <FileMessage
                            fileUrl={m.file_url}
                            fileName={m.file_name ?? m.content ?? ''}
                            metadata={m.metadata as { public_id?: string; cloud_name?: string } | undefined}
                            getSignedUrl={getSignedUrl}
                            onImageClick={openAtImage}
                          />
                        )}
                        <p className="text-[10px] opacity-80 mt-1 text-slate-600 flex items-center gap-1.5 flex-wrap">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ko })}
                          {meta?.edited_at && !isDeleted && (
                            <span className="text-slate-400">(수정됨)</span>
                          )}
                          {meta?.deleted_at && (
                            <span className="text-slate-400">
                              삭제됨 {formatDistanceToNow(new Date(meta.deleted_at), { addSuffix: true, locale: ko })}
                            </span>
                          )}
                        </p>
                      </div>
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
          onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (e.nativeEvent.isComposing) return
                e.preventDefault()
                sendText()
              }
            }}
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
  metadata,
  getSignedUrl,
  onImageClick,
}: {
  fileUrl: string | null
  fileName: string
  metadata?: { public_id?: string; cloud_name?: string } | null
  getSignedUrl: (path: string) => Promise<string>
  onImageClick?: () => void
}) {
  const cloudThumb = metadata?.public_id
    ? buildCloudinaryUrlWithTransformation(
        metadata.public_id,
        CLOUDINARY_CHAT_THUMB,
        metadata.cloud_name
      )
    : null
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!fileUrl && !cloudThumb)
  useEffect(() => {
    if (cloudThumb || !fileUrl) return
    getSignedUrl(fileUrl).then((signed) => {
      setUrl(signed)
      setLoading(false)
    })
  }, [fileUrl, getSignedUrl, cloudThumb])
  const displayUrl = cloudThumb || url
  if (!fileUrl && !cloudThumb) return <span className="text-slate-900">{fileName}</span>
  if (loading) return <span className="text-xs text-slate-500">로딩 중…</span>

  const kind = getFileKind(fileName)
  const isImg = kind === 'image'

  // 이미지: Cloudinary 변환(w_200,h_200,c_fill) 썸네일 또는 Signed URL, 클릭 시 MediaViewer(이미지 자산 상세와 동일 포맷)
  if (isImg && displayUrl) {
    return (
      <button type="button" className="block text-left" onClick={() => onImageClick?.()}>
        <img src={displayUrl} alt={fileName} className="max-w-[320px] max-h-[240px] rounded-lg object-cover shadow-sm" />
      </button>
    )
  }

  // 문서/기타: 확장자별 아이콘 + 파일명 + 클릭 시 새 탭에서 열기/다운로드
  const DocIcon =
    kind === 'pdf' || kind === 'doc'
      ? FileText
      : kind === 'sheet'
        ? FileSpreadsheet
        : kind === 'presentation'
          ? Presentation
          : File
  const typeLabel = getFileKindLabel(kind)

  return (
    <a
      href={url ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName}
      className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/80 p-2.5 text-left transition-colors hover:bg-slate-50 hover:border-slate-300"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
        <DocIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900" title={fileName}>
          {fileName}
        </p>
        <p className="text-xs text-slate-500">{typeLabel}</p>
      </div>
    </a>
  )
}

function isImage(fileName: string): boolean {
  return /\.(jpe?g|png|gif|webp)$/i.test(fileName)
}
function isPdf(fileName: string): boolean {
  return /\.pdf$/i.test(fileName)
}

/** 파일 확장자로 종류 판별 — 아이콘·라벨용 */
type FileKind = 'image' | 'pdf' | 'doc' | 'sheet' | 'presentation' | 'other'
function getFileKind(fileName: string): FileKind {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase()
  if (/^(jpe?g|png|gif|webp)$/.test(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (/^(xls|xlsx|csv)$/.test(ext)) return 'sheet'
  if (/^(ppt|pptx)$/.test(ext)) return 'presentation'
  if (/^(doc|docx|hwp|txt|rtf)$/.test(ext)) return 'doc'
  return 'other'
}

/** 파일 종류별 라벨 (문서 미리보기용) */
function getFileKindLabel(kind: FileKind): string {
  const labels: Record<FileKind, string> = {
    image: '이미지',
    pdf: 'PDF',
    doc: '문서',
    sheet: '스프레드시트',
    presentation: '프레젠테이션',
    other: '파일',
  }
  return labels[kind]
}

export default ConsultationChat
