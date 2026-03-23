import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ShowroomPage from '@/pages/ShowroomPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <main className="min-h-screen">
          <Routes>
            <Route path="/" element={<ShowroomPage />} />
            <Route path="/showroom" element={<ShowroomPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
