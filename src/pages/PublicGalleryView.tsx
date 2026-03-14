/**
 * [이부장] 공유 시스템 — 공개 갤러리 뷰
 * /public/share?ids=uuid1,uuid2,... (로그인 없이 접근)
 * 보안: 사진·제품명(product_tags)·색상(color)만 노출. 원가/마진/내부 ID 등 민감 정보 배제.
 * 성능: 썸네일 우선 로딩, 클릭 시 고화질(marketing) 전환.
 */
import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getAssetUrl, incrementImageAssetViewCount } from '@/lib/imageAssetService'
import { updateInternalScoreForAsset } from '@/lib/imageScoringService'

const BUCKET = 'construction-assets'

export interface PublicGalleryAsset {
  id: string
  url: string
  thumbnailUrl: string
  projectTitle: string | null
  productTags: string[]
  color: string | null
  isConsultation?: boolean
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
      const [projRes, assetRes] = await Promise.all([
        supabase
          .from('project_images')
          .select('id, cloudinary_public_id, storage_path, thumbnail_path, project_title, product_tags, color')
          .in('id', ids)
          .eq('status', 'approved'),
        supabase
          .from('image_assets')
          .select('id, cloudinary_url, thumbnail_url, site_name, product_name, color_name, is_consultation')
          .in('id', ids),
      ])
      if (cancelled) return

      const fromProject: PublicGalleryAsset[] = (projRes.data ?? []).map((r: {
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

      const fromAssets: PublicGalleryAsset[] = (assetRes.data ?? []).map((r: {
        id: string
        cloudinary_url: string
        thumbnail_url: string | null
        site_name: string | null
        product_name: string | null
        color_name: string | null
        is_consultation?: boolean | null
      }) => {
        const url = r.cloudinary_url?.trim() || ''
        const thumbnailUrl = r.thumbnail_url?.trim() || url
        const productTags = r.product_name?.trim() ? [r.product_name.trim()] : []
        return {
          id: r.id,
          url,
          thumbnailUrl,
          projectTitle: r.site_name?.trim() || null,
          productTags,
          color: r.color_name?.trim() || null,
          isConsultation: r.is_consultation === true,
        }
      })

      const byId = new Map<string, PublicGalleryAsset>()
      fromProject.forEach((a) => byId.set(a.id, a))
      fromAssets.forEach((a) => byId.set(a.id, a))
      const list = ids.map((id) => byId.get(id)).filter((a): a is PublicGalleryAsset => a != null)
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
        <h1 className="text-lg font-semibold text-foreground mb-2">선별 시공 사례</h1>
        <p className="text-sm text-muted-foreground">
          {ids.length === 0 ? '공유할 사진이 선택되지 않았습니다.' : '선별된 사진을 불러올 수 없습니다.'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <h1 className="text-lg font-bold text-foreground">선별 시공 사례</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          담당자가 고른 참고 사진 {assets.length}장
        </p>
      </header>

      <main className="p-3 pb-8">
        <div className="max-w-lg mx-auto mb-3 rounded-xl border border-border bg-muted/20 px-3 py-2">
          <p className="text-sm font-medium text-foreground">안내받은 사진만 모아둔 페이지입니다.</p>
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
                incrementImageAssetViewCount(asset.id)
                  .then(() => updateInternalScoreForAsset(asset.id))
                  .catch(() => {})
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
