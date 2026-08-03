import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { captureShowroomAbmAttribution } from '@/lib/showroomAbmTraffic'
import './App.css'

const PublicShowroomPage = lazy(() => import('@/pages/PublicShowroomPage'))
const PublicShowroomShortsLandingPage = lazy(() => import('@/pages/PublicShowroomShortsLandingPage'))
const PublicManagedStudyCafeFurnitureGuidePage = lazy(
  () => import('@/pages/PublicManagedStudyCafeFurnitureGuidePage'),
)
const ShowroomCaseApproachPage = lazy(() => import('@/pages/ShowroomCaseApproachPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))

const SNS_CHANNEL_ALIASES: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  instagram: 'instagram',
  fb: 'facebook',
  facebook: 'facebook',
  kakao: 'kakao',
  kakaotalk: 'kakao',
  blog: 'blog',
  naver: 'blog',
  youtube: 'youtube',
  yt: 'youtube',
  shorts: 'shorts',
  reel: 'shorts',
  reels: 'shorts',
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

function getSnsMedium(channel: string, entry: 'domain' | 'sns' | 'shorts'): string {
  if (entry === 'shorts') return 'shorts'
  if (entry === 'domain') return 'organic'
  if (channel === 'blog') return 'content'
  return 'social'
}

function buildShowroomSearchParams(
  search: string,
  entry: 'domain' | 'sns' | 'shorts',
  channel?: string,
) {
  const params = new URLSearchParams(search)
  if (entry === 'sns' || entry === 'shorts') {
    const normalizedChannel = normalizeSnsChannel(channel)
    if (!params.get('utm_source')) params.set('utm_source', normalizedChannel)
    if (!params.get('utm_medium')) params.set('utm_medium', getSnsMedium(normalizedChannel, entry))
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

function SnsShowroomRedirect(props: { entry?: 'sns' | 'shorts' }) {
  const entry = props.entry ?? 'sns'
  const location = useLocation()
  const { channel, jobId } = useParams<{ channel?: string; jobId?: string }>()
  const params = buildShowroomSearchParams(location.search, entry, channel)
  const trimmedJobId = jobId?.trim()

  useEffect(() => {
    captureShowroomAbmAttribution({
      pathname: location.pathname,
      search: location.search,
      jobId: trimmedJobId,
    })
  }, [location.pathname, location.search, trimmedJobId])

  if (entry === 'shorts' && trimmedJobId) {
    if (!params.get('jobId')) params.set('jobId', trimmedJobId)
    return (
      <Navigate
        replace
        to={`/public/showroom/shorts/${encodeURIComponent(trimmedJobId)}?${params.toString()}${location.hash}`}
      />
    )
  }
  return <Navigate replace to={`/public/showroom?${params.toString()}${location.hash}`} />
}

function LegacyOpenShowroomRedirect(props: { targetPath: string }) {
  const location = useLocation()
  return <Navigate replace to={`${props.targetPath}${location.search}${location.hash}`} />
}

function LegacyOpenShowroomCardNewsDetailRedirect() {
  const location = useLocation()
  const { siteKey = '' } = useParams<{ siteKey: string }>()
  return <Navigate replace to={`/public/showroom/case/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
}

function LegacyPublicShowroomCardNewsListRedirect() {
  const location = useLocation()
  return <Navigate replace to={`/public/showroom${location.search}${location.hash}`} />
}

function LegacyPublicShowroomCardNewsDetailRedirect() {
  const location = useLocation()
  const { siteKey = '' } = useParams<{ siteKey: string }>()
  return <Navigate replace to={`/public/showroom/case/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
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
          <Route path="/public/showroom/cardnews/:siteKey" element={<LegacyPublicShowroomCardNewsDetailRedirect />} />
          <Route path="/public/showroom/cardnews" element={<LegacyPublicShowroomCardNewsListRedirect />} />
          <Route path="/public/showroom/case/:siteKey" element={<ShowroomCaseApproachPage mode="public" />} />
          <Route path="/public/showroom/shorts/:jobId" element={<PublicShowroomShortsLandingPage />} />
          <Route
            path="/public/showroom/guide/managed-study-cafe-furniture"
            element={<PublicManagedStudyCafeFurnitureGuidePage />}
          />
          <Route path="/public/showroom" element={<PublicShowroomPage />} />
          <Route path="/open-showroom/cardnews/:siteKey" element={<LegacyOpenShowroomCardNewsDetailRedirect />} />
          <Route path="/open-showroom/cardnews" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/open-showroom/case/:siteKey" element={<LegacyOpenShowroomCaseDetailRedirect />} />
          <Route path="/open-showroom" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/sns" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/sns/:channel" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/s/:channel" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/r/:channel/:jobId" element={<SnsShowroomRedirect entry="shorts" />} />
          <Route path="/r/:channel" element={<SnsShowroomRedirect entry="shorts" />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
