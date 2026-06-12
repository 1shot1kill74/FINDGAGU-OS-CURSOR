import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ClipboardCopy, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  CUSTOMER_REVIEW_CONSENT_TEXT,
  CUSTOMER_REVIEW_QUESTIONS,
  buildFollowUpKakaoReviewMessage,
  buildManualKakaoReviewMessage,
  buildThankYouKakaoReviewMessage,
} from '@/lib/customerReviewQuestionnaire'

type ReviewAnswers = Record<(typeof CUSTOMER_REVIEW_QUESTIONS)[number]['id'], string>

const EMPTY_ANSWERS: ReviewAnswers = {
  worry_before: '',
  change_after: '',
  recommend_line: '',
}

export default function PublicCustomerReviewSamplePage() {
  const [searchParams] = useSearchParams()
  const siteName = searchParams.get('site')?.trim() || ''
  const customerName = searchParams.get('name')?.trim() || ''
  const showStaffTools = searchParams.get('staff') === '1'
  const [answers, setAnswers] = useState<ReviewAnswers>(EMPTY_ANSWERS)
  const [consent, setConsent] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const reviewUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/review/sample'
    const url = new URL(window.location.href)
    return url.toString()
  }, [])

  const kakaoMessage = useMemo(
    () =>
      buildManualKakaoReviewMessage({
        customerName,
        siteName,
        reviewUrl,
      }),
    [customerName, reviewUrl, siteName]
  )

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(successMessage)
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!answers.worry_before.trim() || !answers.change_after.trim()) {
      toast.error('필수 문항 2개를 입력해 주세요.')
      return
    }
    if (!consent) {
      toast.error('사례 활용 동의에 체크해 주세요.')
      return
    }
    setSubmitted(true)
    toast.message('샘플 모드입니다. 실제 저장은 아직 연결되지 않았습니다.')
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-10">
        <div className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">후기가 접수되었습니다</h1>
              <p className="mt-1 text-sm text-neutral-600">샘플 화면입니다. 실제 고객 DB에는 아직 저장되지 않습니다.</p>
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-neutral-50 p-4 text-sm leading-7 text-neutral-700">
            <p className="font-medium text-neutral-900">입력하신 내용 미리보기</p>
            <p className="mt-3">시공 전 걱정: {answers.worry_before}</p>
            <p className="mt-2">시공 후 변화: {answers.change_after}</p>
            {answers.recommend_line.trim() ? (
              <p className="mt-2">원장님 한 마디: {answers.recommend_line}</p>
            ) : null}
          </div>
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-neutral-900">직원용: 고객에게 보낼 감사 카톡</p>
            <pre className="whitespace-pre-wrap rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm leading-6 text-neutral-700">
              {buildThankYouKakaoReviewMessage({ customerName })}
            </pre>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => copyText(buildThankYouKakaoReviewMessage({ customerName }), '감사 카톡 문구를 복사했습니다.')}
            >
              <ClipboardCopy className="h-4 w-4" />
              감사 카톡 문구 복사
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            {showStaffTools ? 'Staff Preview' : 'Findgagu'}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">시공 후기 남기기</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            약 1분 · 3문항 · 한 줄 위주로 적어주시면 됩니다.
          </p>
          {siteName ? (
            <p className="mt-3 inline-flex rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
              현장: {siteName}
            </p>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid max-w-xl gap-6 px-4 py-6">
        {showStaffTools ? (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">직원용 샘플 안내</p>
            <p className="mt-2 text-sm leading-6 text-amber-950">
              아래 「카톡 문구 복사」로 고객에게 먼저 보내고, 링크로 이 페이지를 열게 하면 됩니다.
              반응이 좋으면 이후 알림톡 템플릿으로 옮깁니다.
            </p>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-amber-200 bg-white p-4 text-sm leading-6 text-neutral-700">
              {kakaoMessage}
            </pre>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="gap-2 bg-white"
                onClick={() => copyText(kakaoMessage, '1차 카톡 문구를 복사했습니다.')}
              >
                <ClipboardCopy className="h-4 w-4" />
                카톡 문구 복사
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2 bg-white"
                onClick={() =>
                  copyText(
                    buildFollowUpKakaoReviewMessage({ customerName, reviewUrl }),
                    '리마인드 카톡 문구를 복사했습니다.'
                  )
                }
              >
                <MessageCircle className="h-4 w-4" />
                리마인드 문구 복사
              </Button>
            </div>
          </section>
        ) : null}

        <form onSubmit={handleSubmit} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="space-y-5">
            <div>
              {customerName ? (
                <>
                  <label className="mb-1.5 block text-sm font-medium text-neutral-700">담당자</label>
                  <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm text-neutral-800">
                    {customerName}
                  </p>
                </>
              ) : null}
            </div>

            {CUSTOMER_REVIEW_QUESTIONS.map((question) => (
              <div key={question.id}>
                <label className="mb-1.5 block text-sm font-medium text-neutral-700">
                  {question.label}
                  {question.required ? ' *' : ' (선택)'}
                </label>
                <textarea
                  value={answers[question.id]}
                  onChange={(event) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: event.target.value.slice(0, question.maxLength),
                    }))
                  }
                  placeholder={question.placeholder}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm leading-relaxed text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-300"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  {answers[question.id].length}/{question.maxLength}자
                </p>
              </div>
            ))}

            <label className="flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-sm leading-6 text-neutral-700">
                {CUSTOMER_REVIEW_CONSENT_TEXT}
                <span className="font-medium text-neutral-900"> (필수)</span>
              </span>
            </label>

            <Button type="submit" className="h-12 w-full text-base font-semibold">
              후기 보내기
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
