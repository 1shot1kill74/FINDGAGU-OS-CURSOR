import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
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
const ShowroomPage = lazy(() => import('@/pages/ShowroomPage'))
const ContactPage = lazy(() => import('@/pages/ContactPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const HomepageConceptPage = lazy(() => import('@/pages/HomepageConceptPage'))
const ShowroomHomepagePage = lazy(() => import('@/pages/ShowroomHomepagePage'))
const MigrationPage = lazy(() => import('@/pages/admin/MigrationPage'))
const ArchivePage = lazy(() => import('@/pages/admin/ArchivePage'))
const TestConsole = lazy(() => import('@/pages/admin/TestConsole'))
const ContentQueuePage = lazy(() => import('@/pages/content/ContentQueuePage'))
const ContentDetailPage = lazy(() => import('@/pages/content/ContentDetailPage'))
const ContentDistributionPage = lazy(() => import('@/pages/content/ContentDistributionPage'))
const ContentAutomationPage = lazy(() => import('@/pages/content/ContentAutomationPage'))
const ContentTemplatesPage = lazy(() => import('@/pages/content/ContentTemplatesPage'))

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

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<ShowroomHomepagePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/estimate/:id" element={<PublicProposalView />} />
          <Route path="/share" element={<ShareRedirect />} />
          <Route path="/share/gallery" element={<ShareGalleryPage />} />
          <Route path="/public/share" element={<PublicGalleryView />} />
          <Route path="/public/showroom" element={<PublicShowroomPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/consultation" element={<ConsultationManagement />} />
            <Route path="/measurement" element={<MeasurementArchive />} />
            <Route path="/measurement/upload" element={<MeasurementUpload />} />
            <Route path="/image-assets" element={<ImageAssetViewer />} />
            <Route path="/image-assets/upload" element={<ImageAssetUpload />} />
            <Route path="/showroom" element={<ShowroomPage />} />
            <Route path="/content" element={<ContentQueuePage />} />
            <Route path="/content/distribution" element={<ContentDistributionPage />} />
            <Route path="/content/automation" element={<ContentAutomationPage />} />
            <Route path="/content/templates" element={<ContentTemplatesPage />} />
            <Route path="/content/:id" element={<ContentDetailPage />} />
            <Route path="/homepage-concept" element={<HomepageConceptPage />} />
            <Route path="/admin/migration" element={<MigrationPage />} />
            <Route path="/admin/archive" element={<ArchivePage />} />
            <Route path="/admin/test-console" element={<TestConsole />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
