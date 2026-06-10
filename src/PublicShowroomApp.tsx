import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import './App.css'

const PublicShowroomPage = lazy(() => import('@/pages/PublicShowroomPage'))
const PublicShowroomCardNewsPage = lazy(() => import('@/pages/PublicShowroomCardNewsPage'))
const ShowroomCaseApproachPage = lazy(() => import('@/pages/ShowroomCaseApproachPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))

const SNS_CHANNEL_ALIASES: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  instagram: 'instagram',
  kakao: 'kakao',
  kakaotalk: 'kakao',
  blog: 'blog',
  naver: 'blog',
  youtube: 'youtube',
  yt: 'youtube',
}

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-500 shadow-sm">
        <p className="font-medium text-slate-900">화면을 불러오는 중...</p>
        <p className="mt-2 leading-6">파인드가구 공개 쇼룸을 준비하고 있습니다.</p>
      </div>
    </div>
  )
}

function normalizeSnsChannel(value: string | undefined): string {
  const normalized = (value ?? 'sns').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return SNS_CHANNEL_ALIASES[normalized] ?? (normalized || 'sns')
}

function getSnsMedium(channel: string): string {
  if (channel === 'blog') return 'content'
  return 'social'
}

function buildShowroomSearchParams(search: string, entry: 'domain' | 'sns', channel?: string) {
  const params = new URLSearchParams(search)
  if (entry === 'sns') {
    const normalizedChannel = normalizeSnsChannel(channel)
    if (!params.get('utm_source')) params.set('utm_source', normalizedChannel)
    if (!params.get('utm_medium')) params.set('utm_medium', getSnsMedium(normalizedChannel))
  } else {
    if (!params.get('utm_source')) params.set('utm_source', 'direct')
    if (!params.get('utm_medium')) params.set('utm_medium', 'organic')
  }
  if (!params.get('utm_campaign')) params.set('utm_campaign', 'showroom_abm_202606')
  if (!params.get('entry')) params.set('entry', entry)
  return params
}

function RootRedirect() {
  const location = useLocation()
  const params = buildShowroomSearchParams(location.search, 'domain')
  return <Navigate replace to={`/public/showroom?${params.toString()}${location.hash}`} />
}

function SnsShowroomRedirect() {
  const location = useLocation()
  const { channel } = useParams<{ channel?: string }>()
  const params = buildShowroomSearchParams(location.search, 'sns', channel)
  return <Navigate replace to={`/public/showroom?${params.toString()}${location.hash}`} />
}

function LegacyOpenShowroomRedirect(props: { targetPath: string }) {
  const location = useLocation()
  return <Navigate replace to={`${props.targetPath}${location.search}${location.hash}`} />
}

function LegacyOpenShowroomCardNewsDetailRedirect() {
  const location = useLocation()
  const { siteKey = '' } = useParams<{ siteKey: string }>()
  return <Navigate replace to={`/public/showroom/cardnews/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
}

function LegacyOpenShowroomCaseDetailRedirect() {
  const location = useLocation()
  const { siteKey = '' } = useParams<{ siteKey: string }>()
  return <Navigate replace to={`/public/showroom/case/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
}

export default function PublicShowroomApp() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/public/showroom/cardnews/:siteKey" element={<ShowroomCaseApproachPage mode="public" entry="cardnews" />} />
          <Route path="/public/showroom/cardnews" element={<PublicShowroomCardNewsPage />} />
          <Route path="/public/showroom/case/:siteKey" element={<ShowroomCaseApproachPage mode="public" />} />
          <Route path="/public/showroom" element={<PublicShowroomPage />} />
          <Route path="/open-showroom/cardnews/:siteKey" element={<LegacyOpenShowroomCardNewsDetailRedirect />} />
          <Route path="/open-showroom/cardnews" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom/cardnews" />} />
          <Route path="/open-showroom/case/:siteKey" element={<LegacyOpenShowroomCaseDetailRedirect />} />
          <Route path="/open-showroom" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/sns" element={<SnsShowroomRedirect />} />
          <Route path="/sns/:channel" element={<SnsShowroomRedirect />} />
          <Route path="/s/:channel" element={<SnsShowroomRedirect />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
