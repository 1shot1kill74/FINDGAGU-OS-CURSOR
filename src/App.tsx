import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useParams, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import ProtectedRoute from '@/auth/ProtectedRoute'
import InternalAdminRoute from '@/auth/InternalAdminRoute'
import { describeInternalRoute } from '@/lib/internalRouteLabel'
import { captureShowroomAbmAttribution, isPublicShowroomLandingHost } from '@/lib/showroomAbmTraffic'
import PublicShowroomLayout from '@/components/showroom/PublicShowroomLayout'
import './App.css'

const ConsultationManagement = lazy(() => import('@/pages/ConsultationManagement'))
const ImageAssetViewer = lazy(() => import('@/pages/ImageAssetViewer'))
const ImageAssetUpload = lazy(() => import('@/pages/ImageAssetUpload'))
const MeasurementArchive = lazy(() => import('@/pages/MeasurementArchive'))
const MeasurementUpload = lazy(() => import('@/pages/MeasurementUpload'))
const PublicProposalView = lazy(() => import('@/pages/PublicProposalView'))
const ShareGalleryPage = lazy(() => import('@/pages/ShareGalleryPage'))
const PublicGalleryView = lazy(() => import('@/pages/PublicGalleryView'))
const ShareRedirect = lazy(() => import('@/pages/ShareRedirect'))
const PublicShowroomPage = lazy(() => import('@/pages/PublicShowroomPage'))
const PublicShowroomGalleryPage = lazy(() => import('@/pages/PublicShowroomGalleryPage'))
const PublicManagedStudyCafeFurnitureGuidePage = lazy(
  () => import('@/pages/PublicManagedStudyCafeFurnitureGuidePage'),
)
const PublicShowroomShortsLandingPage = lazy(() => import('@/pages/PublicShowroomShortsLandingPage'))
const ShowroomCaseApproachPage = lazy(() => import('@/pages/ShowroomCaseApproachPage'))
const InternalShowroomPage = lazy(() => import('@/pages/InternalShowroomPage'))
const OriginalShowroomPage = lazy(() => import('@/pages/OriginalShowroomPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const PublicCustomerReviewSamplePage = lazy(() => import('@/pages/PublicCustomerReviewSamplePage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const HomepageConceptPage = lazy(() => import('@/pages/HomepageConceptPage'))
const MigrationPage = lazy(() => import('@/pages/admin/MigrationPage'))
const ArchivePage = lazy(() => import('@/pages/admin/ArchivePage'))
const ShowroomCaseStudioPage = lazy(() => import('@/pages/admin/ShowroomCaseStudioPage'))
const AdInboxStudioPage = lazy(() => import('@/pages/admin/AdInboxStudioPage'))
const ShowroomShortsPage = lazy(() => import('@/pages/admin/ShowroomShortsPage'))
const ShowroomBasicShortsQueuePage = lazy(() => import('@/pages/admin/ShowroomBasicShortsQueuePage'))
const ShowroomAdsDashboardPage = lazy(() => import('@/pages/admin/ShowroomAdsDashboardPage'))
const ShowroomAbmDashboardPage = lazy(() => import('@/pages/admin/ShowroomAbmDashboardPage'))
const CompetitorMonitorPage = lazy(() => import('@/pages/admin/CompetitorMonitorPage'))
const EduOutreachQueuePage = lazy(() => import('@/pages/admin/EduOutreachQueuePage'))
const TestConsole = lazy(() => import('@/pages/admin/TestConsole'))

function RouteFallback() {
  const location = useLocation()
  const routeLabel = describeInternalRoute(location.pathname)
  const routePath = `${location.pathname}${location.search}${location.hash}`

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-3xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-500 shadow-sm">
        <p className="font-medium text-slate-900">화면을 불러오는 중...</p>
        <p className="mt-2 leading-6">
          이동 대상 <span className="font-semibold text-slate-900">{routeLabel}</span>
          {' '}· <span className="font-mono text-[11px]">{routePath}</span>
        </p>
      </div>
    </div>
  )
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
  clip: 'naver_clip',
  naverclip: 'naver_clip',
  naver_clip: 'naver_clip',
}

function normalizeSnsChannel(value: string | undefined): string {
  const normalized = (value ?? 'sns').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return SNS_CHANNEL_ALIASES[normalized] ?? (normalized || 'sns')
}

function getSnsMedium(channel: string, entry: 'sns' | 'shorts'): string {
  if (entry === 'shorts') return 'shorts'
  if (channel === 'blog') return 'content'
  return 'social'
}

function SnsShowroomRedirect(props: { entry?: 'sns' | 'shorts' }) {
  const entry = props.entry ?? 'sns'
  const location = useLocation()
  const { channel, jobId } = useParams<{ channel?: string; jobId?: string }>()
  const normalizedChannel = normalizeSnsChannel(channel)
  const params = new URLSearchParams(location.search)

  if (!params.get('utm_source')) params.set('utm_source', normalizedChannel)
  if (!params.get('utm_medium')) params.set('utm_medium', getSnsMedium(normalizedChannel, entry))
  if (!params.get('utm_campaign')) params.set('utm_campaign', 'showroom_abm_202606')
  params.set('entry', entry)

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

function RootRedirect() {
  const location = useLocation()

  if (isPublicShowroomLandingHost(window.location.hostname)) {
    const params = new URLSearchParams(location.search)
    if (!params.get('utm_source')) params.set('utm_source', 'direct')
    if (!params.get('utm_medium')) params.set('utm_medium', 'direct')
    if (!params.get('utm_campaign')) params.set('utm_campaign', 'showroom_abm_202606')
    if (!params.get('entry')) params.set('entry', 'domain')

    const query = params.toString()
    return (
      <Navigate
        replace
        to={`/public/showroom${query ? `?${query}` : ''}${location.hash}`}
      />
    )
  }

  return <Navigate replace to={`/dashboard${location.search}${location.hash}`} />
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/estimate/:id" element={<PublicProposalView />} />
          <Route path="/share" element={<ShareRedirect />} />
          <Route path="/share/gallery" element={<ShareGalleryPage />} />
          <Route path="/public/share" element={<PublicGalleryView />} />
          <Route element={<PublicShowroomLayout />}>
            <Route path="/public/showroom/cardnews/:siteKey" element={<LegacyPublicShowroomCardNewsDetailRedirect />} />
            <Route path="/public/showroom/cardnews" element={<LegacyPublicShowroomCardNewsListRedirect />} />
            <Route path="/public/showroom/case/:siteKey" element={<ShowroomCaseApproachPage mode="public" />} />
            <Route path="/public/showroom/shorts/:jobId" element={<PublicShowroomShortsLandingPage />} />
            <Route
              path="/public/showroom/guide/managed-study-cafe-furniture"
              element={<PublicManagedStudyCafeFurnitureGuidePage />}
            />
            <Route path="/public/showroom/gallery" element={<PublicShowroomGalleryPage />} />
            <Route path="/public/showroom" element={<PublicShowroomPage />} />
            <Route path="/public/showroom/original" element={<OriginalShowroomPage mode="public" />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>
          <Route path="/open-showroom/cardnews/:siteKey" element={<LegacyOpenShowroomCardNewsDetailRedirect />} />
          <Route path="/open-showroom/cardnews" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/open-showroom/case/:siteKey" element={<LegacyOpenShowroomCaseDetailRedirect />} />
          <Route path="/open-showroom" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/open-showroom/original" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom/original" />} />
          <Route path="/sns" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/sns/:channel" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/s/:channel" element={<SnsShowroomRedirect entry="sns" />} />
          <Route path="/r/:channel/:jobId" element={<SnsShowroomRedirect entry="shorts" />} />
          <Route path="/r/:channel" element={<SnsShowroomRedirect entry="shorts" />} />
          <Route path="/review/sample" element={<PublicCustomerReviewSamplePage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/consultation" element={<ConsultationManagement />} />
            <Route path="/measurement" element={<MeasurementArchive />} />
            <Route path="/measurement/upload" element={<MeasurementUpload />} />
            <Route path="/image-assets" element={<ImageAssetViewer />} />
            <Route path="/image-assets/upload" element={<ImageAssetUpload />} />
            <Route path="/showroom" element={<InternalShowroomPage />} />
            <Route path="/showroom/original" element={<OriginalShowroomPage />} />
            <Route path="/homepage-concept" element={<HomepageConceptPage />} />
            <Route path="/admin/migration" element={<MigrationPage />} />
            <Route path="/admin/archive" element={<ArchivePage />} />
            <Route path="/admin/showroom-case-studio" element={<ShowroomCaseStudioPage />} />
            <Route path="/admin/showroom-case-studio/:siteKey" element={<ShowroomCaseApproachPage mode="internal" />} />
            <Route path="/admin/ad-inbox" element={<AdInboxStudioPage />} />
            <Route path="/admin/showroom-shorts" element={<ShowroomShortsPage />} />
            <Route path="/admin/showroom-basic-shorts" element={<ShowroomBasicShortsQueuePage />} />
            <Route path="/admin/showroom-ads" element={<ShowroomAdsDashboardPage />} />
            <Route path="/admin/showroom-abm" element={<ShowroomAbmDashboardPage />} />
            <Route path="/admin/competitor-monitor" element={<CompetitorMonitorPage />} />
            <Route path="/admin/test-console" element={<TestConsole />} />
            <Route element={<InternalAdminRoute />}>
              <Route path="/admin/edu-outreach" element={<EduOutreachQueuePage />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
