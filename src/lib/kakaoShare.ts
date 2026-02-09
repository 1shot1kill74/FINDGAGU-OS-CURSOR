/**
 * 카카오톡 공유 — 갤러리 링크를 카톡 카드 형태로 공유 (선택)
 * VITE_KAKAO_JS_KEY가 설정된 경우에만 SDK 로드 및 공유 활성화
 */

declare global {
  interface Window {
    shareGalleryKakao?: (url: string, title?: string, description?: string) => void
    Kakao?: {
      init: (key: string) => void
      isInitialized: () => boolean
      Share: {
        sendDefault: (options: {
          objectType: 'feed'
          content: { title: string; description: string; imageUrl?: string; link: { webUrl: string; mobileWebUrl: string } }
        }) => Promise<unknown>
      }
    }
  }
}

const KAKAO_SDK = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js'

function getKakaoKey(): string | null {
  const key = import.meta.env.VITE_KAKAO_JS_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}

let scriptLoaded = false

export function loadKakaoScript(): Promise<boolean> {
  if (scriptLoaded) return Promise.resolve(!!window.Kakao?.isInitialized?.())
  const key = getKakaoKey()
  if (!key) return Promise.resolve(false)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = KAKAO_SDK
    script.crossOrigin = 'anonymous'
    script.async = true
    script.onload = () => {
      scriptLoaded = true
      if (window.Kakao && !window.Kakao.isInitialized()) window.Kakao.init(key)
      resolve(true)
    }
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
}

/**
 * 갤러리 URL을 카카오톡으로 공유. SDK 미사용 시 복사만 수행하고 onCopied 콜백 호출
 */
export function shareGalleryKakao(
  url: string,
  title: string = '시공 사례 갤러리',
  description: string = '파인드가구 시공 사례를 확인해 보세요.',
  onCopied?: () => void
): void {
  if (!url?.trim()) return
  const doCopy = () => {
    void navigator.clipboard.writeText(url).then(() => onCopied?.())
  }
  const Kakao = window.Kakao
  if (Kakao?.isInitialized?.() && typeof Kakao.Share?.sendDefault === 'function') {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title,
        description,
        link: { webUrl: url, mobileWebUrl: url },
      },
    }).catch(() => doCopy())
  } else {
    doCopy()
  }
}

export function installShareGalleryKakao(): void {
  loadKakaoScript().then(() => {
    window.shareGalleryKakao = shareGalleryKakao
  })
}
