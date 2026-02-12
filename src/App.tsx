import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from 'sonner'
import ConsultationManagement from '@/pages/ConsultationManagement'
import ImageAssetViewer from '@/pages/ImageAssetViewer'
import ImageAssetUpload from '@/pages/ImageAssetUpload'
import PortfolioBank from '@/pages/PortfolioBank'
import MeasurementArchive from '@/pages/MeasurementArchive'
import MeasurementUpload from '@/pages/MeasurementUpload'
import ProductSitesPage from '@/pages/ProductSitesPage'
import PublicProposalView from '@/pages/PublicProposalView'
import ShareGalleryPage from '@/pages/ShareGalleryPage'
import PublicGalleryView from '@/pages/PublicGalleryView'
import ShareRedirect from '@/pages/ShareRedirect'
import ShowroomPage from '@/pages/ShowroomPage'
import ContactPage from '@/pages/ContactPage'
import MigrationPage from '@/pages/admin/MigrationPage'
import ArchivePage from '@/pages/admin/ArchivePage'
import TestConsole from '@/pages/admin/TestConsole'
import './App.css'

function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-foreground">FINDGAGU OS</h1>
      <p className="text-muted-foreground">Vite + React + TypeScript</p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link to="/consultation" className="text-primary underline underline-offset-4 font-medium">상담 관리</Link>
        <Link to="/measurement" className="text-primary underline underline-offset-4 font-medium">실측 관리</Link>
        <Link to="/products-sites" className="text-primary underline underline-offset-4 font-medium">제품별 시공 현장</Link>
        <Link to="/image-assets" className="text-primary underline underline-offset-4 font-medium">이미지 자산 관리</Link>
        <Link to="/portfolio" className="text-primary underline underline-offset-4 font-medium">시공 사례 뱅크</Link>
        <Link to="/showroom" className="text-primary underline underline-offset-4 font-medium">시공사례 쇼룸</Link>
        <Link to="/admin/migration" className="text-primary underline underline-offset-4 font-medium">데이터 통합 마이그레이션</Link>
        <Link to="/admin/archive" className="text-primary underline underline-offset-4 font-medium">숨긴 상담 아카이브</Link>
        <Link to="/admin/test-console" className="text-primary underline underline-offset-4 font-medium">채널톡 시뮬레이터</Link>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/consultation" element={<ConsultationManagement />} />
        <Route path="/measurement" element={<MeasurementArchive />} />
        <Route path="/measurement/upload" element={<MeasurementUpload />} />
        <Route path="/products-sites" element={<ProductSitesPage />} />
        <Route path="/image-assets" element={<ImageAssetViewer />} />
        <Route path="/image-assets/upload" element={<ImageAssetUpload />} />
        <Route path="/portfolio" element={<PortfolioBank />} />
        <Route path="/assets" element={<PortfolioBank />} />
        <Route path="/p/estimate/:id" element={<PublicProposalView />} />
        <Route path="/share" element={<ShareRedirect />} />
        <Route path="/share/gallery" element={<ShareGalleryPage />} />
        <Route path="/public/share" element={<PublicGalleryView />} />
        <Route path="/showroom" element={<ShowroomPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/admin/migration" element={<MigrationPage />} />
        <Route path="/admin/archive" element={<ArchivePage />} />
        <Route path="/admin/test-console" element={<TestConsole />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
