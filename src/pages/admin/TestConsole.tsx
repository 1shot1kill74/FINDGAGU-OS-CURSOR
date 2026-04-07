/**
 * 채널톡 자동화 가상 테스트 환경
 * - 채널톡 시뮬레이터: 이름·연락처·문의내용·업종 입력 후 서버로 전송
 * - AI 파싱 결과(지역, 페인포인트 등) 검증
 * - 발송 예정 메시지(마케팅 블로그 링크) 타임라인 기록, is_test: true 적용
 */
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Send, Loader2, CheckCircle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  processSimulatedIncoming,
  type ChannelTalkSimulatorPayload,
  type ProcessSimulatedResult,
} from '@/lib/channelTalkService'
import { CONSULTATION_INDUSTRY_OPTIONS } from '@/data/referenceCases'

export default function TestConsole() {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [inquiry, setInquiry] = useState('')
  const [industry, setIndustry] = useState('학원')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ProcessSimulatedResult | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    const payload: ChannelTalkSimulatorPayload = {
      name: name.trim() || '(이름 없음)',
      contact: contact.trim() || '000-0000-0000',
      inquiry: inquiry.trim() || '(문의 없음)',
      industry: industry || '기타',
    }
    try {
      const res = await processSimulatedIncoming(supabase, payload)
      setResult(res)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('시뮬레이션 완료. 상담이 생성되었고 발송 예정 메시지가 타임라인에 기록되었습니다.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '시뮬레이션 실패')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground text-sm">← 홈</Link>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            채널톡 시뮬레이터
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          채널톡에서 들어올 법한 데이터를 입력하면, AI 파싱 후 Consultations에 저장되고 업종별 마케팅 링크가 타임라인에 "발송 예정 메시지"로 기록됩니다. 생성 데이터는 <strong>is_test: true</strong>로 저장되어 일괄 삭제 가능합니다.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
          <label className="block text-sm font-medium">
            이름 (업체/담당자)
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 목동학원 김담당"
              className="mt-1 h-9"
            />
          </label>
          <label className="block text-sm font-medium">
            연락처
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="예: 010-1234-5678"
              className="mt-1 h-9"
            />
          </label>
          <label className="block text-sm font-medium">
            업종
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CONSULTATION_INDUSTRY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            문의 내용 (비정형 텍스트 — AI 파싱 테스트용)
            <textarea
              value={inquiry}
              onChange={(e) => setInquiry(e.target.value)}
              placeholder="예: 서울 강남 쪽 학원인데요, 20평 정도 강의실 책상 의자 견적 부탁드립니다."
              className="mt-1 w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={4}
            />
          </label>
          <Button type="submit" disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            시뮬레이션 전송
          </Button>
        </form>

        {result && !result.error && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              결과
            </h2>
            <div className="text-sm space-y-2">
              <p>
                <span className="text-muted-foreground">상담 ID:</span>{' '}
                <code className="bg-muted px-1 rounded">{result.consultationId}</code>
                <Link
                  to={`/consultation?focus=${result.consultationId}`}
                  className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  상담에서 보기 <ExternalLink className="h-3 w-3" />
                </Link>
              </p>
              <p>
                <span className="text-muted-foreground">AI 파싱:</span>{' '}
                지역={result.parsed.region ?? '—'}, 페인포인트={result.parsed.pain_point ? `${result.parsed.pain_point.slice(0, 80)}…` : '—'}
              </p>
              <div>
                <span className="text-muted-foreground block mb-1">타임라인에 기록된 발송 예정 메시지:</span>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                  {result.sentMessages.map((msg, i) => (
                    <li key={i} className="text-xs break-all">{msg}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {result?.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {result.error}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          데이터 통합 관리 또는 아카이브에서 <strong>is_test: true</strong> 데이터를 일괄 삭제할 수 있습니다.
        </p>
      </div>
    </div>
  )
}
