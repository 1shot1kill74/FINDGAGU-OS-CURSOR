import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import ProtectedRoute from '@/auth/ProtectedRoute'
import ConsultationManagement from '@/pages/ConsultationManagement'
import ImageAssetViewer from '@/pages/ImageAssetViewer'
import ImageAssetUpload from '@/pages/ImageAssetUpload'
import MeasurementArchive from '@/pages/MeasurementArchive'
import MeasurementUpload from '@/pages/MeasurementUpload'
import PublicProposalView from '@/pages/PublicProposalView'
import ShareGalleryPage from '@/pages/ShareGalleryPage'
import PublicGalleryView from '@/pages/PublicGalleryView'
import ShareRedirect from '@/pages/ShareRedirect'
import ShowroomPage from '@/pages/ShowroomPage'
import ContactPage from '@/pages/ContactPage'
import HomepageConceptPage from '@/pages/HomepageConceptPage'
import DashboardPage from '@/pages/DashboardPage'
import LoginPage from '@/pages/LoginPage'
import MigrationPage from '@/pages/admin/MigrationPage'
import ArchivePage from '@/pages/admin/ArchivePage'
import TestConsole from '@/pages/admin/TestConsole'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/p/estimate/:id" element={<PublicProposalView />} />
        <Route path="/share" element={<ShareRedirect />} />
        <Route path="/share/gallery" element={<ShareGalleryPage />} />
        <Route path="/public/share" element={<PublicGalleryView />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/consultation" element={<ConsultationManagement />} />
          <Route path="/measurement" element={<MeasurementArchive />} />
          <Route path="/measurement/upload" element={<MeasurementUpload />} />
          <Route path="/image-assets" element={<ImageAssetViewer />} />
          <Route path="/image-assets/upload" element={<ImageAssetUpload />} />
          <Route path="/showroom" element={<ShowroomPage />} />
          <Route path="/homepage-concept" element={<HomepageConceptPage />} />
          <Route path="/admin/migration" element={<MigrationPage />} />
          <Route path="/admin/archive" element={<ArchivePage />} />
          <Route path="/admin/test-console" element={<TestConsole />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
