/**
 * 가구 시공사례 이미지 자산 — 공통 속성 기반 일괄 업로드
 * - 여러 장 동시 선택(multiple) 또는 드래그 앤 드롭
 * - [지역, 업종, 컬러칩, 제품명 등] 한 번 입력 → 모든 사진에 공통 적용
 * - 그리드 미리보기 + 장당 대표 이미지(is_main) 체크
 * - 저장 시 순차 Cloudinary 업로드 → 성공 시마다 Supabase 행 추가 (Cloudinary 자동 ID)
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useColorChips } from '@/hooks/useColorChips'
import { readExifFromFile } from '@/lib/exifUtil'
import { uploadImageToCloudinary, insertImageAsset, getExistingImageFingerprints, getExistingSiteNames } from '@/lib/imageAssetUploadService'
import { isCloudinaryConfigured } from '@/lib/imageAssetService'
import { toast } from 'sonner'
import { X, Check } from 'lucide-react'

const CATEGORY_OPTIONS = ['책상', '의자', '책장', '사물함', '기타']
const BUSINESS_TYPE_OPTIONS = ['학원', '관리형', '스터디카페', '학교', '아파트', '기타']

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

export default function ImageAssetUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { chips: colorChips, isLoading: colorLoading } = useColorChips()
  const colorByGroup = colorChips.reduce<Record<string, string[]>>(
    (acc, c) => {
      if (!acc[c.color_type]) acc[c.color_type] = []
      acc[c.color_type].push(c.color_name)
      return acc
    },
    {}
  )

  const [pending, setPending] = useState<PendingItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [recentUploads, setRecentUploads] = useState<{ id: string; thumbnail_url: string }[]>([])

  const [site_name, setSite_name] = useState('')
  const [siteNameSuggestions, setSiteNameSuggestions] = useState<string[]>([])
  const [siteNameOptions, setSiteNameOptions] = useState<string[]>([])
  const [siteNameOpen, setSiteNameOpen] = useState(false)
  const siteNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getExistingSiteNames().then(setSiteNameOptions)
  }, [])

  const [photo_date, setPhoto_date] = useState('')
  const [location, setLocation] = useState('')
  const [business_type, setBusiness_type] = useState('')
  const [category, setCategory] = useState('')
  const [product_name, setProduct_name] = useState('')
  const [color_name, setColor_name] = useState('')
  const [memo, setMemo] = useState('')

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
    const next: PendingItem[] = toAdd.map((file, i) => ({
      id: generateId(),
      file,
      preview: URL.createObjectURL(file),
      is_main: i === 0,
      status: 'pending' as UploadStatus,
    }))
    setPending((prev) => {
      const combined = [...prev, ...next]
      if (combined.length > 0 && !combined.some((x) => x.is_main)) combined[0].is_main = true
      return combined
    })
    if (toAdd.length > 0) toast.success(`${toAdd.length}장 추가됨`)
  }, [])

  const removePending = useCallback((id: string) => {
    setPending((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (next.length > 0 && !next.some((x) => x.is_main)) next[0].is_main = true
      return next
    })
  }, [])

  const setMain = useCallback((id: string) => {
    setPending((prev) =>
      prev.map((p) => ({ ...p, is_main: p.id === id }))
    )
  }, [])

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
      if (exif.photo_date) setPhoto_date(exif.photo_date)
      if (exif.location) setLocation(exif.location)
      toast.success('첫 번째 사진에서 촬영일·위치를 불러왔습니다.')
    } catch {
      toast.error('EXIF를 읽을 수 없습니다.')
    }
  }, [pending])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const toUpload = pending.filter((p) => p.status !== 'done')
      if (toUpload.length === 0) {
        toast.error('사진을 선택해 주세요.')
        return
      }
      const siteTrim = site_name.trim()
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
      const common = {
        site_name: siteTrim || null,
        photo_date: photo_date.trim() || null,
        location: location.trim() || null,
        business_type: business_type.trim() || null,
        category: category.trim() || null,
        product_name: product_name.trim() || null,
        color_name: color_name.trim() || null,
        memo: memo.trim() || null,
      }
      for (const item of toUpload) {
        setPending((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, status: 'uploading' as UploadStatus } : p))
        )
        try {
          const { cloudinary_url, thumbnail_url } = await uploadImageToCloudinary(item.file)
          const result = await insertImageAsset({
            cloudinary_url,
            thumbnail_url,
            ...common,
            is_main: item.is_main,
            metadata: {
              original_name: item.file.name,
              file_size: item.file.size,
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
        const stillPending = pending.filter((p) => p.status === 'pending' || p.status === 'uploading')
        if (stillPending.length === 0) {
          setPending([])
          setPhoto_date('')
          setLocation('')
          setBusiness_type('')
          setCategory('')
          setProduct_name('')
          setColor_name('')
          setMemo('')
        }
      }
    },
    [
      pending,
      site_name,
      photo_date,
      location,
      business_type,
      category,
      product_name,
      color_name,
      memo,
    ]
  )

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/image-assets">
          <Button variant="ghost" size="sm">← 이미지 자산 목록</Button>
        </Link>
        <h1 className="text-xl font-semibold">시공사례 일괄 업로드</h1>
      </div>

      {!isCloudinaryConfigured() && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
          Cloudinary가 설정되지 않았습니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET을 넣어 주세요.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-border p-4 bg-muted/20">
          <label className="block text-sm font-medium mb-2">현장명 (프로젝트명) *</label>
          <p className="text-xs text-muted-foreground mb-2">같은 현장명으로 올린 사진은 하나의 시공 사례로 묶입니다. 기존 현장명을 선택하면 오타로 갈라지지 않습니다.</p>
          <div className="relative">
            <Input
              ref={siteNameInputRef}
              type="text"
              value={site_name}
              onChange={(e) => {
                const v = e.target.value
                setSite_name(v)
                const q = v.trim().toLowerCase()
                setSiteNameSuggestions(
                  q
                    ? siteNameOptions.filter((n) => n.toLowerCase().includes(q))
                    : siteNameOptions.slice(0, 20)
                )
                setSiteNameOpen(true)
              }}
              onFocus={() => {
                const q = site_name.trim().toLowerCase()
                setSiteNameSuggestions(
                  q
                    ? siteNameOptions.filter((n) => n.toLowerCase().includes(q))
                    : siteNameOptions.slice(0, 20)
                )
                setSiteNameOpen(true)
              }}
              onBlur={() => {
                setTimeout(() => setSiteNameOpen(false), 180)
              }}
              placeholder="예: 강남 테헤란로 오피스"
              className="w-full"
              autoComplete="off"
            />
            {siteNameOpen && siteNameSuggestions.length > 0 && (
              <ul
                className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md max-h-48 overflow-auto"
                role="listbox"
              >
                {siteNameSuggestions.map((name) => (
                  <li
                    key={name}
                    role="option"
                    className="px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      setSite_name(name)
                      setSiteNameSuggestions([])
                      setSiteNameOpen(false)
                    }}
                  >
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

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

        {recentUploads.length > 0 && (
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
                업로드 대기 ({pending.filter((p) => p.status === 'pending').length}장)
                {pending.some((p) => p.status === 'done') && ` · 완료 ${pending.filter((p) => p.status === 'done').length}장`}
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={loadExifFromFirst}>
                첫 번째 사진에서 촬영일·위치 불러오기
              </Button>
            </div>
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
                          대표 이미지
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

        <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/20">
          <h2 className="text-sm font-semibold">공통 속성 (선택한 모든 사진에 적용)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">촬영일</label>
              <Input
                type="date"
                value={photo_date}
                onChange={(e) => setPhoto_date(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">지역</label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="위도, 경도 또는 지역명"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">업종</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={business_type}
              onChange={(e) => setBusiness_type(e.target.value)}
            >
              <option value="">선택</option>
              {BUSINESS_TYPE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">제품 카테고리</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">선택</option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">제품명</label>
            <Input
              value={product_name}
              onChange={(e) => setProduct_name(e.target.value)}
              placeholder="예: 스마트A 책상"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">색상 (공식 컬러칩)</label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={color_name}
              onChange={(e) => setColor_name(e.target.value)}
              disabled={colorLoading}
            >
              <option value="">선택</option>
              {colorByGroup.Standard?.length ? (
                <optgroup label="기본 컬러 (Standard)">
                  {colorByGroup.Standard.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </optgroup>
              ) : null}
              {colorByGroup.Special?.length ? (
                <optgroup label="스페셜 컬러 (Special)">
                  {colorByGroup.Special.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </optgroup>
              ) : null}
              {colorByGroup.Other?.length ? (
                <optgroup label="기타">
                  {colorByGroup.Other.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">메모</label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="기타 메모"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            disabled={pending.filter((p) => p.status === 'pending').length === 0 || uploading}
          >
            {uploading
              ? '업로드 중…'
              : `${pending.filter((p) => p.status === 'pending').length}장 업로드 및 DB 저장`}
          </Button>
          <Link to="/image-assets">
            <Button type="button" variant="outline">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
