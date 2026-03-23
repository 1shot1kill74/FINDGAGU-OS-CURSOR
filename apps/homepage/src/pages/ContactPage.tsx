import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { submitPublicContact } from '@/lib/publicData'

const DEFAULT_MESSAGE = (siteName: string) => `[현장명: ${siteName}]와 비슷한 방향으로 문의드립니다.`

export default function ContactPage() {
  const [searchParams] = useSearchParams()
  const siteName = searchParams.get('site_name') ?? ''
  const category = searchParams.get('category') ?? '홈페이지 상담'
  const imageUrl = searchParams.get('image_url') ?? ''
  const showroomContext = searchParams.get('showroom_context') ?? ''
  const showroomEntryLabel = searchParams.get('showroom_entry_label') ?? ''

  const [companyName, setCompanyName] = useState('')
  const [managerName, setManagerName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [preferredTime, setPreferredTime] = useState('')
  const [website, setWebsite] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  useEffect(() => {
    if (showroomContext.trim()) {
      const prefix = showroomEntryLabel.trim() ? `[${showroomEntryLabel.trim()}] ` : ''
      setMessage(`${prefix}${showroomContext.trim()} 관련 상담을 요청합니다.`)
      return
    }
    setMessage(siteName ? DEFAULT_MESSAGE(siteName) : '')
  }, [showroomContext, showroomEntryLabel, siteName])

  const title = useMemo(() => {
    if (siteName) return `${siteName} 사례 관련 문의`
    return category
  }, [category, siteName])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (website.trim()) {
      setSubmitMessage('접수에 실패했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }
    if (!managerName.trim() || !contact.trim()) {
      setSubmitMessage('성함과 연락처를 입력해 주세요.')
      return
    }

    setSubmitting(true)
    setSubmitMessage(null)
    try {
      await submitPublicContact({
        companyName,
        managerName,
        contact,
        message: preferredTime.trim() ? `${message.trim()}\n\n연락 가능 시간: ${preferredTime.trim()}` : message,
        category,
        siteName,
        imageUrl,
        showroomContext,
        showroomEntryLabel,
      })
      setSubmitMessage('문의가 접수되었습니다. 담당자가 확인 후 연락드리겠습니다.')
      setCompanyName('')
      setManagerName('')
      setContact('')
      setPreferredTime('')
      setMessage(siteName ? DEFAULT_MESSAGE(siteName) : '')
    } catch {
      setSubmitMessage('접수에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <div className="rounded-[32px] border border-white/10 bg-[#181412] p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Contact</p>
            <h1 className="mt-2 text-3xl font-semibold text-white">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-300">
                사례 맥락을 함께 전달해, 담당자가 비슷한 현장과 기준을 빠르게 안내할 수 있도록 구성한 문의 폼입니다.
            </p>
          </div>
          <Link to="/showroom" className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10">
            쇼룸으로 돌아가기
          </Link>
        </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-stone-400">응답 방식</p>
              <p className="mt-2 text-sm font-medium text-white">전화 또는 문자</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-stone-400">확인 시간</p>
              <p className="mt-2 text-sm font-medium text-white">영업일 기준 순차 확인</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-stone-400">안내 방식</p>
              <p className="mt-2 text-sm font-medium text-white">비슷한 사례와 함께 설명</p>
            </div>
          </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-200">업체명</span>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="예: OO학원"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-stone-200">성함 *</span>
              <input
                value={managerName}
                onChange={(event) => setManagerName(event.target.value)}
                placeholder="담당자 성함"
                className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-200">연락처 *</span>
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder="010-0000-0000"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-200">연락 가능 시간</span>
            <input
              value={preferredTime}
              onChange={(event) => setPreferredTime(event.target.value)}
              placeholder="예: 평일 오후 2시 이후"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-stone-200">문의 내용</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-stone-500 focus:border-white/20 focus:outline-none"
              placeholder={DEFAULT_MESSAGE(siteName || '대표 사례')}
            />
          </label>

          <label className="hidden" aria-hidden>
            <span>웹사이트</span>
            <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
          </label>

          {(siteName || category) && (
            <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-xs leading-6 text-stone-400">
              <p>유입 카테고리: {category}</p>
              {siteName && <p>선택 사례: {siteName}</p>}
            </div>
          )}

          {submitMessage && (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-stone-200">
              {submitMessage}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-black/15 p-4 text-xs leading-6 text-stone-400">
            남겨주신 정보는 상담 연락과 사례 안내 용도로만 사용합니다. 빠른 비교 견적보다 현재 상황에 맞는 방향을 먼저 안내드리는 방식으로 확인합니다.
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-xl bg-amber-400 px-5 py-3.5 text-sm font-semibold text-stone-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? '접수 중…' : '문의 접수하기'}
          </button>
        </form>
      </div>
    </div>
  )
}
