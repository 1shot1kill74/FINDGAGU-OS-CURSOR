/**
 * 이미지 자산 업로드 폼 — ImageAssetUpload 페이지와 상담카드에서 공통 사용
 * - prefill: 상담카드에서 호출 시 업체명·상담 ID 자동 입력
 * - onSuccess: 업로드 성공 시 콜백 (상담 히스토리 참조 링크용)
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { readExifFromFile } from '@/lib/exifUtil'
import { uploadEngine } from '@/lib/uploadEngine'
import {
  getExistingImageFingerprints,
  insertImageAsset,
  getExistingSiteNames,
} from '@/lib/imageAssetUploadService'
import { buildBroadExternalDisplayName, buildExternalDisplayName, isCloudinaryConfigured } from '@/lib/imageAssetService'
import { getCloudinaryCloudName } from '@/lib/config'
import { buildOpenShowroomDisplayName, buildOpenShowroomWatermarkedUrls } from '@/lib/openShowroomWatermark'
import { toast } from 'sonner'
import { X, Check } from 'lucide-react'
import {
  EMPTY_IMAGE_ASSET_COMMON_META,
  ImageAssetCommonMetaFields,
  type ImageAssetCommonMetaValue,
} from '@/components/image/ImageAssetCommonMetaFields'

type UploadStatus = 'pending' | 'uploading' | 'done'

interface PendingItem {
  id: string
  file: File
  preview: string
  is_main: boolean
  status: UploadStatus
}

function generateId(): string {
  return `pending_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export interface ImageAssetUploadFormPrefill {
  site_name: string
  consultation_id: string
}

export interface ImageAssetUploadFormSuccessResult {
  id: string
  thumbnail_url: string
  file_name: string
  public_id: string
  cloud_name: string
}

export interface ImageAssetUploadFormProps {
  /** 상담카드에서 호출 시 업체명·상담 ID 자동 입력 */
  prefill?: ImageAssetUploadFormPrefill
  /** 업로드 성공 시 호출 (상담 히스토리 참조 링크용) */
  onSuccess?: (result: ImageAssetUploadFormSuccessResult) => void
  /** embedded 모드: 페이지 헤더·목록 링크 숨김 (Dialog 내부용) */
  variant?: 'standalone' | 'embedded'
  /** embedded 모드에서 닫기 버튼 클릭 시 */
  onClose?: () => void
}

export function ImageAssetUploadForm({
  prefill,
  onSuccess,
  variant = 'standalone',
  onClose,
}: ImageAssetUploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [pending, setPending] = useState<PendingItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recentUploads, setRecentUploads] = useState<{ id: string; thumbnail_url: string }[]>([])

  const [meta, setMeta] = useState<ImageAssetCommonMetaValue>(() => ({
    ...EMPTY_IMAGE_ASSET_COMMON_META,
    site_name: prefill?.site_name ?? '',
  }))

  const patchMeta = useCallback((patch: Partial<ImageAssetCommonMetaValue>) => {
    setMeta((prev) => ({ ...prev, ...patch }))
  }, [])

  useEffect(() => {
    if (prefill?.site_name) patchMeta({ site_name: prefill.site_name })
  }, [prefill?.site_name, patchMeta])

  useEffect(() => {
    if (!prefill?.consultation_id) return
    void getExistingSiteNames().then((options) => {
      const matched = options.find((option) => option.consultation_id === prefill.consultation_id)
      if (matched) {
        setMeta((prev) => {
          if (prev.selectedSpaceOption?.consultation_id === prefill.consultation_id) return prev
          return { ...prev, selectedSpaceOption: matched, site_name: matched.display_name || prev.site_name }
        })
      }
    })
  }, [prefill?.consultation_id])

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) {
      toast.error('이미지 파일만 선택할 수 있습니다.')
      return
    }
    const existing = await getExistingImageFingerprints()
    const set = new Set(existing.map((e) => `${e.original_name}\t${e.file_size}`))
    const toAdd: File[] = []
    let duplicateCount = 0
    for (const file of list) {
      const key = `${file.name}\t${file.size}`
      if (set.has(key)) duplicateCount++
      else toAdd.push(file)
    }
    if (duplicateCount > 0) {
      toast.warning(`${duplicateCount}장은 이미 등록된 파일(이름·크기 동일)이라 제외했습니다.`)
    }
    if (toAdd.length === 0) return
    const next: PendingItem[] = toAdd.map((file) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      is_main: false,
      status: 'pending' as UploadStatus,
    }))
    setPending((prev) => [...prev, ...next])
    if (toAdd.length > 0) {
      try {
        const exif = await readExifFromFile(toAdd[0])
        setMeta((prev) => ({
          ...prev,
          photo_date: prev.photo_date.trim() ? prev.photo_date : exif.photo_date || prev.photo_date,
          location: prev.location.trim() ? prev.location : exif.location || prev.location,
        }))
      } catch {
        // EXIF 자동 입력 실패 시 수동 입력 유지
      }
    }
    if (toAdd.length > 0) toast.success(`${toAdd.length}장 추가됨`)
  }, [])

  const removePending = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const setMain = useCallback((id: string) => {
    setPending((prev) =>
      prev.map((p) => ({
        ...p,
        is_main: p.id === id ? !p.is_main : false,
      }))
    )
  }, [])

  const selectedMainCount = pending.filter((p) => p.is_main).length
  const selectedPendingCount = pending.filter((p) => p.status === 'pending').length
  const doneCount = pending.filter((p) => p.status === 'done').length

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files?.length) addFiles(files)
      e.target.value = ''
    },
    [addFiles]
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [addFiles]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const loadExifFromFirst = useCallback(async () => {
    if (pending.length === 0) return
    try {
      const exif = await readExifFromFile(pending[0].file)
      patchMeta({
        photo_date: exif.photo_date || meta.photo_date,
        location: exif.location || meta.location,
      })
      toast.success('첫 번째 사진에서 촬영일·위치를 불러왔습니다.')
    } catch {
      toast.error('EXIF를 읽을 수 없습니다.')
    }
  }, [pending, patchMeta, meta.photo_date, meta.location])

  const resetUploadFields = useCallback((mode: 'keep-site' | 'new-site') => {
    setPending((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.preview)
      return []
    })
    setMeta((prev) => {
      const keepSite = mode === 'keep-site' || !!prefill?.site_name
      return {
        ...EMPTY_IMAGE_ASSET_COMMON_META,
        site_name: keepSite ? prev.site_name : (prefill?.site_name ?? ''),
        selectedSpaceOption: keepSite ? prev.selectedSpaceOption : null,
      }
    })
  }, [prefill])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const toUpload = pending.filter((p) => p.status !== 'done')
      if (toUpload.length === 0) {
        toast.error('사진을 선택해 주세요.')
        return
      }
      const siteTrim = meta.site_name.trim()
      if (!siteTrim) {
        toast.error('현장명을 입력해 주세요. 같은 현장명으로 올리면 하나의 시공 사례로 묶입니다.')
        return
      }
      if (!isCloudinaryConfigured()) {
        toast.error('Cloudinary 설정이 없습니다. .env를 확인해 주세요.')
        return
      }
      setUploading(true)
      let success = 0
      let fail = 0
      const consultationId = prefill?.consultation_id ?? meta.selectedSpaceOption?.consultation_id ?? ''
      const selectedSpaceId = meta.selectedSpaceOption?.space_id ?? null
      const uploadSource = prefill ? 'consultation_card' : 'image_asset_upload'
      const common = {
        site_name: siteTrim || null,
        photo_date: meta.photo_date.trim() || null,
        location: meta.location.trim() || null,
        business_type: meta.business_type.trim() || null,
        category: meta.category.trim() || '책상',
        product_name: meta.product_name.trim() || null,
        color_name: meta.color_name.trim() || null,
        memo: meta.memo.trim() || null,
      }
      for (const item of toUpload) {
        setPending((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading' as UploadStatus } : p))
        )
        try {
          const externalDisplayName = meta.selectedSpaceOption
            ? buildExternalDisplayName({
                requestDate: meta.selectedSpaceOption.request_date,
                startDate: meta.selectedSpaceOption.start_date,
                createdAt: meta.selectedSpaceOption.created_at,
                region: meta.location.trim() || null,
                siteName: siteTrim,
                industry: meta.business_type.trim() || null,
                customerPhone: meta.selectedSpaceOption.customer_phone,
              })
            : null
          const broadExternalDisplayName = buildBroadExternalDisplayName(externalDisplayName)
          const uploadMeta = {
            customer_name: siteTrim,
            project_id: consultationId,
            space_id: selectedSpaceId,
            category: meta.category.trim() || '책상',
            upload_date: meta.photo_date.trim() || new Date().toISOString().slice(0, 10),
            source: uploadSource,
            before_after_role: meta.beforeAfterRole,
          }
          const uploadResult = await uploadEngine(item.file, uploadMeta)
          const { cloudinary_url, thumbnail_url, public_id, storage_type, storage_path } = uploadResult
          const publicDisplayName = buildOpenShowroomDisplayName({
            siteName: siteTrim,
            externalDisplayName: externalDisplayName || null,
            broadExternalDisplayName: broadExternalDisplayName || null,
            location: meta.location.trim() || null,
            businessType: meta.business_type.trim() || null,
            createdAt: meta.photo_date.trim() || new Date().toISOString(),
          })
          const publicWatermark = buildOpenShowroomWatermarkedUrls({
            sourceUrl: cloudinary_url,
            thumbnailUrl: thumbnail_url,
            displayName: publicDisplayName,
          })
          const result = await insertImageAsset({
            cloudinary_url,
            thumbnail_url,
            public_watermarked_url: publicWatermark.fullUrl,
            public_watermarked_thumbnail_url: publicWatermark.thumbnailUrl,
            public_watermark_status: storage_type === 'cloudinary' ? publicWatermark.status : 'skipped',
            public_watermark_version: storage_type === 'cloudinary' ? publicWatermark.version : null,
            public_watermark_updated_at: storage_type === 'cloudinary' ? new Date().toISOString() : null,
            storage_type: storage_type ?? 'cloudinary',
            storage_path: storage_path ?? null,
            ...common,
            is_main: item.is_main,
            is_consultation: true,
            metadata: {
              original_name: item.file.name,
              file_size: item.file.size,
              source: uploadSource,
              consultation_id: consultationId || undefined,
              space_id: selectedSpaceId || undefined,
              space_display_name: siteTrim,
              external_display_name: externalDisplayName || undefined,
              broad_external_display_name: broadExternalDisplayName || undefined,
              public_id: public_id ?? undefined,
              before_after_role: meta.beforeAfterRole,
            },
          })
          if ('error' in result) {
            fail++
            toast.error(`${item.file.name}: ${result.error.message}`)
            setPending((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, status: 'pending' as UploadStatus } : p))
            )
          } else {
            success++
            setPending((prev) =>
              prev.map((p) => (p.id === item.id ? { ...p, status: 'done' as UploadStatus } : p))
            )
            setRecentUploads((prev) =>
              [{ id: result.id, thumbnail_url: thumbnail_url! }, ...prev].slice(0, 5)
            )
            onSuccess?.({
              id: result.id,
              thumbnail_url: thumbnail_url!,
              file_name: item.file.name,
              public_id: public_id ?? '',
              cloud_name: getCloudinaryCloudName(),
            })
          }
        } catch (err) {
          fail++
          toast.error(`${item.file.name}: ${(err as Error).message}`)
          setPending((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, status: 'pending' as UploadStatus } : p))
          )
        }
      }
      setUploading(false)
      if (success > 0) {
        toast.success(`${success}건 저장되었습니다.${fail > 0 ? ` (실패 ${fail}건)` : ''}`)
      }
    },
    [pending, meta, prefill, onSuccess]
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {variant === 'standalone' && (
        <div className="flex items-center gap-4 mb-6">
          <Link to="/image-assets">
            <Button variant="ghost" size="sm">← 이미지 자산 목록</Button>
          </Link>
          <h1 className="text-xl font-semibold">현장 상담컷 일괄 업로드</h1>
        </div>
      )}

      {!isCloudinaryConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
          Cloudinary가 설정되지 않았습니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET을 넣어 주세요.
        </div>
      )}

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm font-medium text-foreground">업로드 규칙</p>
        <p className="text-xs text-muted-foreground mt-1">
          이 폼으로 올리는 사진은 모두 상담컷으로 저장됩니다. 대표 이미지는 업로드 묶음 안에서 1장만 선택할 수 있으며,
          대표를 선택한 경우에만 같은 현장의 기존 대표 이미지가 자동 해제됩니다.
        </p>
      </div>

      <ImageAssetCommonMetaFields
        value={meta}
        onChange={patchMeta}
        siteNameReadOnly={!!prefill?.site_name}
        parts={['site']}
      />

      <div>
        <label className="block text-sm font-medium mb-2">사진 추가 (여러 장 선택 또는 드래그 앤 드롭)</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onInputChange}
          className="hidden"
        />
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/30'
          }`}
        >
          <p className="text-sm text-muted-foreground">클릭하거나 이미지를 여기에 놓으세요</p>
          <p className="text-xs text-muted-foreground mt-1">여러 장 동시 선택 가능</p>
        </div>
      </div>

      {variant === 'standalone' && recentUploads.length > 0 && (
        <div className="rounded-lg border border-border p-3 bg-muted/20">
          <h3 className="text-sm font-semibold mb-2">최근 성공적으로 등록된 이미지</h3>
          <div className="flex gap-2 flex-wrap">
            {recentUploads.map((u) => (
              <a
                key={u.id}
                href={u.thumbnail_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-16 h-16 rounded border border-border overflow-hidden shrink-0 hover:opacity-90"
              >
                <img src={u.thumbnail_url} alt="" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              업로드 대기 ({selectedPendingCount}장)
              {doneCount > 0 && ` · 완료 ${doneCount}장`}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={loadExifFromFirst}>
              첫 번째 사진에서 촬영일·위치 불러오기
            </Button>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">대표 이미지는 선택 사항입니다. 현재 {selectedMainCount}장 선택됨, 선택한 경우에만 기존 대표가 교체됩니다.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {pending.map((item) => (
              <div
                key={item.id}
                className="relative rounded-lg border border-border overflow-hidden bg-muted/20 group"
              >
                <img
                  src={item.preview}
                  alt=""
                  className="w-full aspect-square object-cover"
                />
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 transition-opacity ${
                    item.status === 'done' ? 'bg-green-900/50 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {item.status === 'pending' && (
                    <>
                      <span className="text-white text-xs font-medium">대기 중</span>
                      <label className="flex items-center gap-2 text-white text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.is_main}
                          onChange={() => setMain(item.id)}
                          className="rounded border-input"
                        />
                        대표 이미지 (1장)
                      </label>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          removePending(item.id)
                          URL.revokeObjectURL(item.preview)
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        제거
                      </Button>
                    </>
                  )}
                  {item.status === 'uploading' && (
                    <span className="text-white text-xs font-medium animate-pulse">업로드 중…</span>
                  )}
                  {item.status === 'done' && (
                    <span className="flex items-center gap-1 text-white text-xs font-medium">
                      <Check className="h-5 w-5" />
                      완료
                    </span>
                  )}
                </div>
                {item.status !== 'pending' && (
                  <span
                    className={`absolute top-1 right-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      item.status === 'uploading'
                        ? 'bg-amber-600 text-white'
                        : 'bg-green-600 text-white'
                    }`}
                  >
                    {item.status === 'uploading' ? '업로드 중' : '완료'}
                  </span>
                )}
                {item.is_main && (
                  <span className="absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground">
                    대표
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <ImageAssetCommonMetaFields
        value={meta}
        onChange={patchMeta}
        siteNameReadOnly={!!prefill?.site_name}
        parts={['attributes']}
      />

      <div className="flex gap-2 pt-2">
        <Button
          type="submit"
          disabled={pending.filter((p) => p.status === 'pending').length === 0 || uploading}
        >
          {uploading
            ? '업로드 중…'
            : `${pending.filter((p) => p.status === 'pending').length}장 업로드 및 DB 저장`}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => resetUploadFields('keep-site')}
          disabled={uploading && pending.length === 0}
          title="현장명은 유지하고 파일과 공통 속성을 초기화합니다."
        >
          추가 업로드
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => resetUploadFields('new-site')}
          disabled={uploading && pending.length === 0}
          title="현장명 선택까지 포함해 전체 입력값을 초기화합니다."
        >
          새 업로드
        </Button>
        {variant === 'standalone' && (
          <Link to="/image-assets">
            <Button type="button" variant="outline">취소</Button>
          </Link>
        )}
        {variant === 'embedded' && onClose && (
          <Button type="button" variant="outline" onClick={onClose}>
            닫기
          </Button>
        )}
      </div>
    </form>
  )
}
