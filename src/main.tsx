import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { installShareGalleryKakao } from '@/lib/kakaoShare'
import './index.css'
import App from './App'

installShareGalleryKakao()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
