/**
 * 상담 히스토리 로그 — 기록형 상황판
 * - 직원이 직접 상담 요약을 입력·저장
 * - 저장된 내용을 시간순 리스트로 표시 (과거 상담 한눈에)
 * - 실시간 채팅 아님. 상담 후 '누가, 어디에, 무엇을, 언제' 결론 기록용
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, Send } from 'lucide-react'

interface HistoryEntry {
  id: string
  content: string
  created_at: string
  sender_id: string
  message_type: string
}

interface ConsultationHistoryLogProps {
  consultationId: string
  onSaved?: () => void
}

export function ConsultationHistoryLog({ consultationId, onSaved }: ConsultationHistoryLogProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)

  const loadEntries = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('consultation_messages')
      .select('id, content, created_at, sender_id, message_type')
      .eq('consultation_id', consultationId)
      .in('message_type', ['TEXT', 'SYSTEM'])
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 히스토리 리스트 — 시간순 (위=과거, 아래=최근) */}
      <div className="flex-1 overflow-y-auto min-h-[120px] space-y-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            불러오는 중…
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">기록된 히스토리가 없습니다. 아래에 상담 내용을 입력해 주세요.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">
                {format(new Date(e.created_at), 'yyyy.MM.dd HH:mm', { locale: ko })}
                {e.sender_id === 'staff' && e.message_type === 'TEXT' && (
                  <span className="ml-2 text-primary/80">직원</span>
                )}
              </p>
              <p className="whitespace-pre-wrap text-foreground">{e.content}</p>
            </div>
          ))
        )}
      </div>

      {/* 입력 영역 */}
      <div className="shrink-0 border-t border-border pt-3 mt-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="상담 내용을 요약해서 입력하세요. (예: OO일 견적 발송 예정, 다음 주 실측 진행)"
          className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSave()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="mt-2 gap-1.5"
          onClick={handleSave}
          disabled={!input.trim() || saving}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          기록하기
        </Button>
      </div>
    </div>
  )
}
