import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installShareGalleryKakao } from '@/lib/kakaoShare'
import './index.css'
import PublicShowroomApp from './PublicShowroomApp'

installShareGalleryKakao()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicShowroomApp />
  </StrictMode>,
)
