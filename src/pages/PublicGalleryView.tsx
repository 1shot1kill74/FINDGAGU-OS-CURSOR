/**
 * [이부장] 공유 시스템 — 공개 갤러리 뷰
 * /public/share?t=token (로그인 없이 접근)
 * 보안: 토큰에 저장된 공개용 스냅샷만 렌더링한다. 원가/마진/내부 ID 등 민감 정보 배제.
 */
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { incrementImageAssetViewCount } from '@/lib/imageAssetService'
import { updateInternalScoreForAsset } from '@/lib/imageScoringService'
import { resolveSharedGallery } from '@/lib/sharedGalleryService'

export interface PublicGalleryAsset {
  id: string
  sourceTable: 'project_images' | 'image_assets'
  url: string
  thumbnailUrl: string
  projectTitle: string | null
  productTags: string[]
  color: string | null
  isConsultation?: boolean
}

function parseShareToken(searchParams: URLSearchParams): string {
  return searchParams.get('t')?.trim() || ''
}

export default function PublicGalleryView() {
  const [searchParams] = useSearchParams()
  const shareToken = useMemo(() => parseShareToken(searchParams), [searchParams])
  const [assets, setAssets] = useState<PublicGalleryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [galleryTitle, setGalleryTitle] = useState('선별 시공 사례')
  const [galleryDescription, setGalleryDescription] = useState('담당자가 고른 참고 사진입니다.')

  useEffect(() => {
    if (!shareToken) {
      setLoading(false)
      setAssets([])
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const shared = await resolveSharedGallery(shareToken)
      if (cancelled) return
      const list: PublicGalleryAsset[] = (shared?.items ?? []).map((item) => ({
        ...item,
        sourceTable: item.sourceTable,
      }))
      setGalleryTitle(shared?.title || '선별 시공 사례')
      setGalleryDescription(shared?.description || '담당자가 고른 참고 사진입니다.')
      setAssets(list)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [shareToken])

  const lightboxAsset = lightboxId ? assets.find((a) => a.id === lightboxId) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    )
  }

  if (!shareToken || assets.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">{galleryTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {!shareToken ? '유효한 공유 토큰이 없습니다.' : '선별된 사진을 불러올 수 없습니다.'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <h1 className="text-lg font-bold text-foreground">{galleryTitle}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          담당자가 고른 참고 사진 {assets.length}장
        </p>
      </header>

      <main className="p-3 pb-8">
        <div className="max-w-lg mx-auto mb-3 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <p className="text-sm font-medium text-foreground">{galleryDescription}</p>
          <p className="text-xs text-muted-foreground mt-1">
            상담 중 공유받은 참고 사례만 확인하실 수 있으며, 화면을 눌러 크게 볼 수 있습니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                setLightboxId(asset.id)
                if (asset.sourceTable === 'image_assets') {
                  incrementImageAssetViewCount(asset.id)
                    .then(() => updateInternalScoreForAsset(asset.id))
                    .catch(() => {})
                }
              }}
              className={`relative rounded-xl overflow-hidden border aspect-[4/3] block w-full text-left ${
                asset.isConsultation ? 'border-primary ring-2 ring-primary/50 bg-primary/5' : 'border-border bg-muted/30'
              }`}
            >
              {asset.isConsultation && (
                <span className="absolute top-1.5 left-1.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground shadow">
                  상담용
                </span>
              )}
              <img
                src={asset.thumbnailUrl}
                alt={asset.projectTitle || asset.productTags[0] || '시공 사진'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] line-clamp-2">
                {asset.projectTitle && <div className="font-medium">{asset.projectTitle}</div>}
                {asset.productTags.length > 0 && <span>{asset.productTags.join(', ')}</span>}
                {asset.color && <span className="opacity-90"> · {asset.color}</span>}
              </div>
            </button>
          ))}
        </div>
      </main>

      {lightboxAsset && (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxId(null)}
          aria-label="닫기"
        >
          <div className="max-w-full max-h-full flex flex-col items-center">
            <img
              src={lightboxAsset.url}
              alt={lightboxAsset.projectTitle || lightboxAsset.productTags[0] || '시공 사진'}
              className="max-w-full max-h-[80vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="mt-2 text-white text-sm text-center max-w-md">
              {lightboxAsset.projectTitle && <p className="font-medium">{lightboxAsset.projectTitle}</p>}
              {lightboxAsset.productTags.length > 0 && <p>{lightboxAsset.productTags.join(', ')}</p>}
              {lightboxAsset.color && <p className="text-white/80">{lightboxAsset.color}</p>}
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
