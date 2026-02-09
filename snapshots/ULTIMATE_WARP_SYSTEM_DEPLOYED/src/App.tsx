import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { Toaster } from 'sonner'
import ConsultationManagement from '@/pages/ConsultationManagement'
import ImageAssetViewer from '@/pages/ImageAssetViewer'
import MeasurementArchive from '@/pages/MeasurementArchive'
import MeasurementUpload from '@/pages/MeasurementUpload'
import './App.css'

function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-foreground">FINDGAGU OS</h1>
      <p className="text-muted-foreground">Vite + React + TypeScript</p>
      <div className="flex flex-wrap gap-4 justify-center">
        <Link to="/consultation" className="text-primary underline underline-offset-4 font-medium">상담 관리</Link>
        <Link to="/measurement" className="text-primary underline underline-offset-4 font-medium">실측 관리</Link>
        <Link to="/assets" className="text-primary underline underline-offset-4 font-medium">이미지 자산 뷰어</Link>
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
        <Route path="/assets" element={<ImageAssetViewer />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
