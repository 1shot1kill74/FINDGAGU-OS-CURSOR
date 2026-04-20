import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useParams, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import ProtectedRoute from '@/auth/ProtectedRoute'
import { describeInternalRoute } from '@/lib/internalRouteLabel'
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
const PublicShowroomCardNewsPage = lazy(() => import('@/pages/PublicShowroomCardNewsPage'))
const ShowroomCaseApproachPage = lazy(() => import('@/pages/ShowroomCaseApproachPage'))
const ShowroomPage = lazy(() => import('@/pages/ShowroomPage'))
const OriginalShowroomPage = lazy(() => import('@/pages/OriginalShowroomPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const HomepageConceptPage = lazy(() => import('@/pages/HomepageConceptPage'))
const MigrationPage = lazy(() => import('@/pages/admin/MigrationPage'))
const ArchivePage = lazy(() => import('@/pages/admin/ArchivePage'))
const ShowroomCaseStudioPage = lazy(() => import('@/pages/admin/ShowroomCaseStudioPage'))
const ShowroomShortsPage = lazy(() => import('@/pages/admin/ShowroomShortsPage'))
const ShowroomBasicShortsQueuePage = lazy(() => import('@/pages/admin/ShowroomBasicShortsQueuePage'))
const ShowroomAdsDashboardPage = lazy(() => import('@/pages/admin/ShowroomAdsDashboardPage'))
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
  return <Navigate replace to={`/public/showroom/cardnews/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
}

function LegacyOpenShowroomCaseDetailRedirect() {
  const location = useLocation()
  const { siteKey = '' } = useParams<{ siteKey: string }>()
  return <Navigate replace to={`/public/showroom/case/${encodeURIComponent(siteKey)}${location.search}${location.hash}`} />
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors closeButton />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/estimate/:id" element={<PublicProposalView />} />
          <Route path="/share" element={<ShareRedirect />} />
          <Route path="/share/gallery" element={<ShareGalleryPage />} />
          <Route path="/public/share" element={<PublicGalleryView />} />
          <Route path="/public/showroom/cardnews/:siteKey" element={<ShowroomCaseApproachPage mode="public" entry="cardnews" />} />
          <Route path="/public/showroom/cardnews" element={<PublicShowroomCardNewsPage />} />
          <Route path="/public/showroom/case/:siteKey" element={<ShowroomCaseApproachPage mode="public" />} />
          <Route path="/public/showroom" element={<PublicShowroomPage />} />
          <Route path="/public/showroom/original" element={<OriginalShowroomPage mode="public" />} />
          <Route path="/open-showroom/cardnews/:siteKey" element={<LegacyOpenShowroomCardNewsDetailRedirect />} />
          <Route path="/open-showroom/cardnews" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom/cardnews" />} />
          <Route path="/open-showroom/case/:siteKey" element={<LegacyOpenShowroomCaseDetailRedirect />} />
          <Route path="/open-showroom" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom" />} />
          <Route path="/open-showroom/original" element={<LegacyOpenShowroomRedirect targetPath="/public/showroom/original" />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/consultation" element={<ConsultationManagement />} />
            <Route path="/measurement" element={<MeasurementArchive />} />
            <Route path="/measurement/upload" element={<MeasurementUpload />} />
            <Route path="/image-assets" element={<ImageAssetViewer />} />
            <Route path="/image-assets/upload" element={<ImageAssetUpload />} />
            <Route path="/showroom" element={<ShowroomPage />} />
            <Route path="/showroom/original" element={<OriginalShowroomPage />} />
            <Route path="/homepage-concept" element={<HomepageConceptPage />} />
            <Route path="/admin/migration" element={<MigrationPage />} />
            <Route path="/admin/archive" element={<ArchivePage />} />
            <Route path="/admin/showroom-case-studio" element={<ShowroomCaseStudioPage />} />
            <Route path="/admin/showroom-case-studio/:siteKey" element={<ShowroomCaseApproachPage mode="internal" />} />
            <Route path="/admin/showroom-shorts" element={<ShowroomShortsPage />} />
            <Route path="/admin/showroom-basic-shorts" element={<ShowroomBasicShortsQueuePage />} />
            <Route path="/admin/showroom-ads" element={<ShowroomAdsDashboardPage />} />
            <Route path="/admin/test-console" element={<TestConsole />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
