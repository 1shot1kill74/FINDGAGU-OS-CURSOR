/**
 * [이부장] 공유 시스템 — 공개 갤러리 뷰
 * /public/share?ids=uuid1,uuid2,... (로그인 없이 접근)
 * 보안: 사진·제품명(product_tags)·색상(color)만 노출. 원가/마진/내부 ID 등 민감 정보 배제.
 * 성능: 썸네일 우선 로딩, 클릭 시 고화질(marketing) 전환.
 */
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getAssetUrl } from '@/lib/imageAssetService'

const BUCKET = 'construction-assets'

export interface PublicGalleryAsset {
  id: string
  url: string
  thumbnailUrl: string
  projectTitle: string | null
  productTags: string[]
  color: string | null
}

function parseIds(searchParams: URLSearchParams): string[] {
  const idsParam = searchParams.get('ids')
  if (!idsParam?.trim()) return []
  return idsParam.split(',').map((s) => s.trim()).filter(Boolean)
}

export default function PublicGalleryView() {
  const [searchParams] = useSearchParams()
  const ids = useMemo(() => parseIds(searchParams), [searchParams])
  const [assets, setAssets] = useState<PublicGalleryAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  useEffect(() => {
    if (ids.length === 0) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const { data: rows, error } = await supabase
        .from('project_images')
        .select('id, cloudinary_public_id, storage_path, thumbnail_path, project_title, product_tags, color')
        .in('id', ids)
        .eq('status', 'approved')
      if (cancelled) return
      if (error || !rows?.length) {
        setAssets([])
        setLoading(false)
        return
      }
      const list: PublicGalleryAsset[] = rows.map((r: {
        id: string
        cloudinary_public_id: string
        storage_path: string | null
        thumbnail_path: string | null
        project_title: string | null
        product_tags: unknown
        color: string | null
      }) => {
        const storagePath = r.storage_path?.trim() || null
        const thumbPath = r.thumbnail_path?.trim() || r.storage_path?.trim() || null
        const thumbnailUrl = thumbPath
          ? supabase.storage.from(BUCKET).getPublicUrl(thumbPath).data.publicUrl
          : getAssetUrl(
              { cloudinaryPublicId: r.cloudinary_public_id, storagePath },
              'mobile'
            )
        const productTags = Array.isArray(r.product_tags) ? (r.product_tags as string[]) : []
        return {
          id: r.id,
          url: getAssetUrl(
            { cloudinaryPublicId: r.cloudinary_public_id, storagePath },
            'marketing'
          ),
          thumbnailUrl,
          projectTitle: r.project_title?.trim() || null,
          productTags,
          color: r.color?.trim() || null,
        }
      })
      setAssets(list)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [ids.join(',')])

  const lightboxAsset = lightboxId ? assets.find((a) => a.id === lightboxId) : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      </div>
    )
  }

  if (ids.length === 0 || assets.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-lg font-semibold text-foreground mb-2">시공 사례 갤러리</h1>
        <p className="text-sm text-muted-foreground">
          {ids.length === 0 ? '공유할 사진이 선택되지 않았습니다.' : '해당 사진을 불러올 수 없습니다.'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <h1 className="text-lg font-bold text-foreground">시공 사례</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{assets.length}장</p>
      </header>

      <main className="p-3 pb-8">
        <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => setLightboxId(asset.id)}
              className="relative rounded-xl overflow-hidden border border-border bg-muted/30 aspect-[4/3] block w-full text-left"
            >
              <img
                src={asset.thumbnailUrl}
                alt={asset.projectTitle || asset.productTags[0] || '시공 사진'}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] line-clamp-2">
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
              {lightboxAsset.productTags.length > 0 && <p>{lightboxAsset.productTags.join(', ')}</p>}
              {lightboxAsset.color && <p className="text-white/80">{lightboxAsset.color}</p>}
            </div>
          </div>
        </button>
      )}
    </div>
  )
}
