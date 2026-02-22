import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { X, Copy, CheckCircle, AlertCircle, Search, Link2, ImageIcon, ChevronLeft, ChevronRight, ChevronDown, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  getAssetUrl,
  getSyncStatus,
  toMarkdownImageLine,
  getBaseAltText,
  buildImageExportPayload,
  ensureCanDelete,
  ensureCanUpdate,
  rowToProjectAsset,
  fetchAllProjectAssets,
  fetchApprovedProjectAssets,
  fetchImageAssetTreeData,
  incrementImageAssetViewCount,
  incrementImageAssetShareCount,
  updateProjectAsset,
  updateProjectAssets,
  updateImageAssetConsultation,
} from '@/lib/imageAssetService'
import type { ImageAssetTreeMeta } from '@/lib/imageAssetService'
import { setImageAssetMain } from '@/lib/imageAssetUploadService'
import { updateInternalScoreForAsset, updateInternalScoresBatch } from '@/lib/imageScoringService'
import { isValidUUID } from '@/lib/uuid'
import { toProductTagsArray } from '@/lib/utils'
import { shareGalleryKakao } from '@/lib/kakaoShare'
import { useColorChips } from '@/hooks/useColorChips'
import type { ProjectImageAsset, SyncStatus } from '@/types/projectImage'
import { USAGE_TYPES, REVIEW_STATUSES, getUsageLabel, getUsageTooltip, type UsageType, type ReviewStatus } from '@/types/projectImage'

/** 자주 쓰는 색상 퀵 태깅 */
const COLOR_QUICK = ['화이트', '오크', '블랙', '그레이', '네이비', '월넛'] as const

/** 업종(Sector/Industry) 필터 기본 옵션 */
const SECTOR_OPTIONS = ['학원', '관리형', '스터디카페', '학교', '아파트', '기타'] as const

const BUCKET = 'construction-assets'
const PAGE_SIZE = 24
type SortKey = 'latest' | 'industry' | 'popular' | 'ai' | 'internal'

/** 지능형 필터: 현장별 / 제품군별 / 색상별 */
type FilterMode = 'all' | 'by_site' | 'by_product' | 'by_color'

const SYNC_LABEL: Record<SyncStatus, string> = {
  synced: 'Cloudinary 연동',
  cloudinary_only: 'Cloudinary만',
  storage_only: 'Storage만',
  missing: '미연동',
}

/** construction_images 레거시 행 → ProjectImageAsset (cloudinary 없으면 storage_only) */
function legacyRowToAsset(row: {
  id: string
  storage_path: string
  thumbnail_path: string | null
  consultation_id: string | null
  project_title: string | null
  industry: string | null
  is_marketing_ready: boolean
  view_count: number
  created_at: string
}): ProjectImageAsset {
  const storagePath = row.storage_path?.trim() || null
  const cloudinaryPublicId = '' // 레거시: Cloudinary ID 없음
  const usageType: UsageType = row.is_marketing_ready ? 'Marketing' : 'Archive'
  const url = storagePath
    ? supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
    : ''
  return {
    id: row.id,
    cloudinaryPublicId: cloudinaryPublicId,
    usageType,
    displayName: null,
    url,
    thumbnailUrl: row.thumbnail_path
      ? supabase.storage.from(BUCKET).getPublicUrl(row.thumbnail_path).data.publicUrl
      : url,
    storagePath,
    consultationId: row.consultation_id,
    projectTitle: row.project_title,
    industry: row.industry,
    viewCount: Number(row.view_count ?? 0),
    createdAt: row.created_at,
    syncStatus: getSyncStatus({ cloudinaryPublicId, storagePath, usageType }),
  }
}

/** 통합 검색: 검색어를 공백으로 나눈 각 단어가 모두 포함된 자산만 노출 (제품명·색상·현장명 동시 검색) */
function filterByUnifiedSearch(assets: ProjectImageAsset[], query: string): ProjectImageAsset[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return assets
  return assets.filter((a) => {
    const searchableTags = (a.productTags ?? []).map((t) => t.toLowerCase())
    const searchableColor = (a.color ?? '').toLowerCase()
    const searchableSite = (a.projectTitle ?? '').toLowerCase()
    const match = (term: string) =>
      searchableTags.some((t) => t.includes(term)) ||
      searchableColor.includes(term) ||
      searchableSite.includes(term)
    return terms.every(match)
  })
}

/** 경로별 역할: /image-assets = 관리자 창고(이미지 자산 관리), /portfolio·/assets = 영업 전시관(시공 사례 뱅크) */
function usePageMode() {
  const { pathname } = useLocation()
  const isBank = pathname === '/portfolio' || pathname === '/assets'
  return {
    pageTitle: isBank ? '시공 사례 뱅크' : '이미지 자산 관리',
    isBankView: isBank,
  }
}

export default function ImageAssetViewer() {
  const navigate = useNavigate()
  const { pageTitle, isBankView } = usePageMode()
  const [assets, setAssets] = useState<ProjectImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('latest')
  const [page, setPage] = useState(0)
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [colorFilter, setColorFilter] = useState<string | null>(null)
  const [productFilter, setProductFilter] = useState<string | null>(null)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [usageFilter, setUsageFilter] = useState<UsageType | 'all'>('all')
  const [lightboxAsset, setLightboxAsset] = useState<ProjectImageAsset | null>(null)
  /** 이미지 자산 관리 전용: 전체 | 검수 대기 사진 */
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending'>('all')
  /** 이미지 자산 관리 전용: 상담용 사진만 보기 */
  const [consultationOnlyFilter, setConsultationOnlyFilter] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
  const [bulkTagsText, setBulkTagsText] = useState('')
  const [bulkColor, setBulkColor] = useState('')
  /** 시공 사례 뱅크 전용: 원클릭 공유용 장바구니 (선택된 사진 ID) */
  const [shareCartIds, setShareCartIds] = useState<Set<string>>(new Set())
  /** 이미지 자산 관리: 인라인 태그 편집 (클릭한 카드 ID) */
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null)
  const [editingTagsText, setEditingTagsText] = useState('')
  const [editingColor, setEditingColor] = useState('')
  /** 태그 드래그 복사: 드래그 중인 소스 페이로드, 드롭 대상 카드 ID */
  const [dragPayload, setDragPayload] = useState<{ productTags: string[]; color: string | null } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  /** 시공 사례 뱅크 전용: 현장별(그룹) / 사진별(평탄 그리드) 보기 모드 */
  const [bankViewMode, setBankViewMode] = useState<'by_site' | 'by_photo'>('by_photo')
  /** 라이트박스에서 앞뒤 넘기기용 인덱스 (현재 보기 목록 기준) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollToSiteKeyRef = useRef<string | null>(null)
  /** 이미지 자산 관리 2컬럼: 트리 데이터·선택(현장/업종/제품)·펼침 상태 */
  const [treeData, setTreeData] = useState<ImageAssetTreeMeta>({ years: [], industries: [], products: [] })
  const [selectedSite, setSelectedSite] = useState<string | null>(null)
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set())
  const [expandedRegionKeys, setExpandedRegionKeys] = useState<Set<string>>(new Set())
  const [expandedIndustries, setExpandedIndustries] = useState(false)
  const [expandedProducts, setExpandedProducts] = useState(false)
  const toggleYear = useCallback((year: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }, [])
  const toggleRegion = useCallback((year: string, region: string) => {
    const key = `${year}|${region}`
    setExpandedRegionKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const selectSite = useCallback((site: string | null) => {
    setSelectedSite(site)
    setSelectedIndustry(null)
    setSelectedProduct(null)
  }, [])
  const selectIndustry = useCallback((industry: string | null) => {
    setSelectedIndustry(industry)
    setSelectedSite(null)
    setSelectedProduct(null)
  }, [])
  const selectProduct = useCallback((product: string | null) => {
    setSelectedProduct(product)
    setSelectedSite(null)
    setSelectedIndustry(null)
  }, [])
  const { chips: colorChips } = useColorChips()
  const isAdmin = useMemo(() => {
    if (typeof localStorage === 'undefined') return false
    if (localStorage.getItem('findgagu-role') === 'admin') return true
    if (new URLSearchParams(window.location.search).get('admin') === '1') return true
    return false
  }, [])
  const [backfillLoading, setBackfillLoading] = useState(false)
  const colorByGroup = useMemo(() => {
    const g: Record<string, string[]> = { Standard: [], Special: [], Other: [] }
    colorChips.forEach((c) => {
      if (g[c.color_type]) g[c.color_type].push(c.color_name)
    })
    return g
  }, [colorChips])
  const colorChipNames = useMemo(() => new Set(colorChips.map((c) => c.color_name)), [colorChips])

  /** imageAssetService 심장: forBank면 뱅크용(approved만), 아니면 관리용(전체). 수정 시 뱅크·견적에 즉시 반영. */
  const fetchFromDb = useCallback(async (forBank: boolean) => {
    try {
      const list = forBank ? await fetchApprovedProjectAssets() : await fetchAllProjectAssets()
      if (list.length > 0) return list
      if (forBank) return []
      const { data: legacyData, error: legacyError } = await (supabase as any)
        .from('construction_images')
        .select('*')
        .order('created_at', { ascending: false })
      if (!legacyError && legacyData?.length > 0) {
        return legacyData.map((r: Parameters<typeof legacyRowToAsset>[0]) => legacyRowToAsset(r))
      }
      return []
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchFromDb(isBankView).then((list) => {
      if (cancelled) return
      if (list.length > 0) setAssets(list)
      else setAssets([])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchFromDb, isBankView])

  /** 이미지 자산 관리: 트리 데이터 로드. 첫 연도 자동 펼침 */
  useEffect(() => {
    if (isBankView) return
    let cancelled = false
    fetchImageAssetTreeData().then((data) => {
      if (cancelled) return
      setTreeData(data)
      if (data.years.length > 0) {
        setExpandedYears((prev) => new Set([...prev, data.years[0].year]))
      }
    })
    return () => { cancelled = true }
  }, [isBankView])

  /** 뱅크 라이트박스에서 [관리 페이지에서 수정하기] 클릭 시 /image-assets 진입 + 해당 카드 포커스 */
  const location = useLocation()
  const focusHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isBankView && location.pathname === '/image-assets' && assets.length > 0) {
      const focusId = (location.state as { focusAssetId?: string } | null)?.focusAssetId
      if (focusId && typeof focusId === 'string' && focusHandledRef.current !== focusId) {
        focusHandledRef.current = focusId
        const asset = assets.find((a) => a.id === focusId)
        if (asset) {
          setEditingAssetId(focusId)
          setEditingTagsText((asset.productTags ?? []).join(', '))
          setEditingColor(asset.color ?? '')
        }
        setTimeout(() => {
          const el = document.querySelector(`[data-asset-id="${focusId}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 400)
      }
    }
  }, [isBankView, location.pathname, location.state, assets])

  const saveInlineTag = useCallback(
    async (assetId: string, productTags: string[], color: string) => {
      if (!isValidUUID(assetId)) {
        toast.error('유효하지 않은 항목 ID입니다. DB에 있는 항목만 저장할 수 있습니다.')
        return
      }
      const tags = toProductTagsArray(productTags.map((s) => s.trim()).filter(Boolean)) ?? null
      const { error } = await updateProjectAsset(assetId, {
        product_tags: tags,
        color: color.trim() || null,
      })
      if (error) {
        toast.error((error as { message?: string }).message ?? '저장 실패')
        return
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? { ...a, productTags: tags ?? undefined, color: color.trim() || undefined }
            : a
        )
      )
      setEditingAssetId(null)
      toast.success('태그가 저장되었습니다. 시공 사례 뱅크·견적에 반영됩니다.')
    },
    []
  )

  const pasteTagsToAsset = useCallback(
    async (targetId: string, payload: { productTags: string[]; color: string | null }) => {
      if (!isValidUUID(targetId)) {
        toast.error('유효하지 않은 대상 ID입니다. DB에 있는 항목에만 붙여넣을 수 있습니다.')
        return
      }
      const tagsForDb = toProductTagsArray(payload.productTags) ?? null
      const { error } = await updateProjectAsset(targetId, {
        product_tags: tagsForDb,
        color: payload.color?.trim() || null,
      })
      if (error) {
        toast.error((error as { message?: string }).message ?? '붙여넣기 실패')
        return
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.id === targetId
            ? {
                ...a,
                productTags: tagsForDb ?? undefined,
                color: payload.color?.trim() || undefined,
              }
            : a
        )
      )
      setDropTargetId(null)
      setDragPayload(null)
      toast.success('태그를 붙여넣었습니다.')
    },
    []
  )

  /** 이미지 자산 관리: 트리에서 현장/업종/제품 선택 시 필터 */
  const siteFiltered = useMemo(() => {
    if (isBankView) return assets
    if (selectedSite) {
      return assets.filter(
        (a) => a.sourceTable === 'image_assets' && (a.projectTitle ?? '').trim() === selectedSite
      )
    }
    if (selectedIndustry) {
      return assets.filter((a) => (a.industry ?? '').trim() === selectedIndustry)
    }
    if (selectedProduct) {
      return assets.filter((a) => (a.productTags ?? []).some((t) => t.trim() === selectedProduct))
    }
    return assets
  }, [assets, isBankView, selectedSite, selectedIndustry, selectedProduct])

  /** 이미지 자산 관리: 검수 대기만 보기 */
  const statusFiltered = useMemo(() => {
    if (isBankView) return siteFiltered
    if (reviewFilter === 'pending') return siteFiltered.filter((a) => a.status === 'pending')
    return siteFiltered
  }, [siteFiltered, isBankView, reviewFilter])

  /** 이미지 자산 관리: 상담용 사진만 보기 (is_consultation true인 image_assets만) */
  const consultationFiltered = useMemo(() => {
    if (isBankView || !consultationOnlyFilter) return statusFiltered
    return statusFiltered.filter((a) => a.sourceTable === 'image_assets' && a.isConsultation === true)
  }, [statusFiltered, isBankView, consultationOnlyFilter])

  const searchFiltered = useMemo(
    () => filterByUnifiedSearch(consultationFiltered, searchQuery),
    [consultationFiltered, searchQuery]
  )

  const usageFiltered = useMemo(() => {
    if (usageFilter === 'all') return searchFiltered
    return searchFiltered.filter((a) => a.usageType === usageFilter)
  }, [searchFiltered, usageFilter])

  const sectorFiltered = useMemo(() => {
    if (!sectorFilter) return usageFiltered
    return usageFiltered.filter((a) => (a.industry ?? '').trim() === sectorFilter)
  }, [usageFiltered, sectorFilter])

  const productFiltered = useMemo(() => {
    if (!productFilter) return sectorFiltered
    return sectorFiltered.filter((a) =>
      (a.productTags ?? []).some((t) => (t ?? '').trim() === productFilter)
    )
  }, [sectorFiltered, productFilter])

  const colorFiltered = useMemo(() => {
    if (!colorFilter) return productFiltered
    return productFiltered.filter((a) => (a.color ?? '').trim().toLowerCase() === colorFilter.toLowerCase())
  }, [productFiltered, colorFilter])

  const sorted = useMemo(() => {
    const arr = [...colorFiltered]
    if (sort === 'latest') arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    else if (sort === 'industry') arr.sort((a, b) => (a.industry || '').localeCompare(b.industry || '') || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    else if (sort === 'ai') arr.sort((a, b) => (b.aiScore ?? -1) - (a.aiScore ?? -1))
    else if (sort === 'internal') arr.sort((a, b) => (b.internalScore ?? -1) - (a.internalScore ?? -1))
    else arr.sort((a, b) => b.viewCount - a.viewCount)
    return arr
  }, [colorFiltered, sort])

  const distinctProducts = useMemo(() => {
    const set = new Set<string>()
    statusFiltered.forEach((a) => {
      (a.productTags ?? []).forEach((t) => {
        const v = (t ?? '').trim()
        if (v) set.add(v)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [statusFiltered])

  const distinctColors = useMemo(() => {
    const set = new Set<string>()
    statusFiltered.forEach((a) => {
      const c = (a.color ?? '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [statusFiltered])

  const pendingCount = useMemo(() => assets.filter((a) => a.status === 'pending').length, [assets])

  /** 지능형 필터: 현장별 / 제품군별 / 색상별 그룹 */
  const grouped = useMemo(() => {
    if (filterMode === 'all') return null
    const map = new Map<string, ProjectImageAsset[]>()
    for (const a of sorted) {
      let key: string
      if (filterMode === 'by_site') {
        key = (a.projectTitle || a.consultationId || '미분류').trim() || '미분류'
      } else if (filterMode === 'by_product') {
        const tags = a.productTags?.length ? a.productTags : null
        key = tags ? tags[0] : '미분류'
      } else {
        key = (a.color?.trim() || '미분류').trim() || '미분류'
      }
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))
    return entries
  }, [sorted, filterMode])

  const flatForPaging = useMemo(() => {
    if (!grouped) return sorted
    return grouped.flatMap(([, list]) => list)
  }, [grouped, sorted])

  /** 시공 사례 뱅크: 현장별일 때만 project_title로 그룹, 사진별이면 null(평탄) */
  const bankGrouped = useMemo(() => {
    if (bankViewMode !== 'by_site') return null
    const map = new Map<string, ProjectImageAsset[]>()
    for (const a of sorted) {
      const key = (a.projectTitle || a.consultationId || '미분류').trim() || '미분류'
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ko'))
  }, [sorted, bankViewMode])

  /** 뱅크에서 사용하는 평탄 목록(라이트박스 prev/next용)·그룹 여부 */
  const bankFlatForPaging = useMemo(() => {
    if (bankGrouped) return bankGrouped.flatMap(([, list]) => list)
    return sorted
  }, [bankGrouped, sorted])

  const paginated = useMemo(() => flatForPaging.slice(0, (page + 1) * PAGE_SIZE), [flatForPaging, page])
  const hasMore = paginated.length < flatForPaging.length

  /** 뱅크일 때 실제로 쓰는 그리드 데이터: 현장별면 bankGrouped, 사진별면 평탄 목록 */
  const bankPaginated = useMemo(
    () => bankFlatForPaging.slice(0, (page + 1) * PAGE_SIZE),
    [bankFlatForPaging, page]
  )
  const bankHasMore = bankPaginated.length < bankFlatForPaging.length
  const bankDisplayGrouped = isBankView ? bankGrouped : null
  const bankDisplayFlat = isBankView ? bankFlatForPaging : flatForPaging
  const bankDisplayPaginated = isBankView ? bankPaginated : paginated
  const bankDisplayHasMore = isBankView ? bankHasMore : hasMore

  /** 라이트박스에서 "이 현장 앨범 보기" 클릭 후 현장별 모드로 전환되면 해당 섹션으로 스크롤 */
  useEffect(() => {
    const key = scrollToSiteKeyRef.current
    if (!key || !isBankView || bankViewMode !== 'by_site') return
    scrollToSiteKeyRef.current = null
    const el = document.querySelector(`[data-site-key="${key}"]`)
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }, [isBankView, bankViewMode, bankDisplayGrouped])

  const loadMore = useCallback(() => setPage((p) => p + 1), [])

  /** 라이트박스 열기 + 현재 보기 목록 기준 인덱스 설정 (앞뒤 넘기기용) */
  const openLightboxAt = useCallback(
    (asset: ProjectImageAsset) => {
      const list = isBankView ? bankFlatForPaging : flatForPaging
      const idx = list.findIndex((a) => a.id === asset.id)
      setLightboxAsset(asset)
      setLightboxIndex(idx >= 0 ? idx : null)
      if (asset.sourceTable === 'image_assets') {
        incrementImageAssetViewCount(asset.id)
          .then(() => updateInternalScoreForAsset(asset.id))
          .catch(() => {})
      }
    },
    [isBankView, bankFlatForPaging, flatForPaging]
  )

  const copyAllMarkdown = useCallback(() => {
    const lines = assets.map((a) => toMarkdownImageLine(a))
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      toast.success('블로그용 마크다운(Cloudinary URL)을 클립보드에 복사했습니다.')
    })
  }, [assets])

  const copyCurrentMarkdown = useCallback(() => {
    if (!lightboxAsset) return
    const line = toMarkdownImageLine(lightboxAsset)
    void navigator.clipboard.writeText(line).then(() => {
      toast.success('현재 이미지 마크다운(Cloudinary URL)을 복사했습니다.')
    })
  }, [lightboxAsset])

  const copyExportJson = useCallback(() => {
    const payload = buildImageExportPayload(assets)
    void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      toast.success('외부 자동화용 JSON(base_alt_text·프롬프트 가이드 포함)을 복사했습니다.')
    })
  }, [assets])

  const copyImageUrl = useCallback(() => {
    if (!lightboxAsset) return
    const url = lightboxAsset.url
    void navigator.clipboard.writeText(url).then(() => toast.success('이미지 주소를 복사했습니다.'))
  }, [lightboxAsset])

  const copySiteLink = useCallback(() => {
    if (!lightboxAsset?.consultationId) {
      toast.error('연결된 상담이 없어 링크를 만들 수 없습니다.')
      return
    }
    const url = `${window.location.origin}/consultation?focus=${lightboxAsset.consultationId}`
    void navigator.clipboard.writeText(url).then(() => toast.success('현장(상담) 링크를 복사했습니다.'))
  }, [lightboxAsset])

  const goToEstimateWithProduct = useCallback(
    (productName: string) => {
      const name = typeof productName === 'string' ? productName.trim() : ''
      if (!name) return
      const consultationId = lightboxAsset?.consultationId ?? undefined
      setLightboxAsset(null)
      navigate('/consultation', {
        state: {
          ...(consultationId != null && consultationId !== '' ? { focusConsultationId: consultationId } : {}),
          addEstimateProductName: name,
        },
      })
    },
    [navigate, lightboxAsset]
  )

  /** 카드에서 라이트박스 없이 견적에 담기 */
  const goToEstimateFromAsset = useCallback(
    (asset: ProjectImageAsset) => {
      const name = (asset.productTags?.[0] ?? asset.displayName ?? '').trim()
      if (!name) {
        toast.error('제품명이 없어 견적에 담을 수 없습니다.')
        return
      }
      navigate('/consultation', {
        state: {
          ...(asset.consultationId ? { focusConsultationId: asset.consultationId } : {}),
          addEstimateProductName: name,
        },
      })
    },
    [navigate]
  )

  /** 카드에서 URL 복사 (라이트박스 없이) */
  const copyAssetUrl = useCallback((asset: ProjectImageAsset) => {
    void navigator.clipboard.writeText(asset.url).then(() => toast.success('이미지 주소를 복사했습니다.'))
  }, [])

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** 시공 사례 뱅크: 공유용 장바구니 토글 */
  const toggleShareCart = useCallback((id: string) => {
    setShareCartIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const shareGalleryUrl = useMemo(() => {
    if (shareCartIds.size === 0) return ''
    const sorted = Array.from(shareCartIds).sort((a, b) => {
      const ac = assets.find((x) => x.id === a)?.isConsultation ? 1 : 0
      const bc = assets.find((x) => x.id === b)?.isConsultation ? 1 : 0
      return bc - ac
    })
    const ids = sorted.join(',')
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/share?ids=${encodeURIComponent(ids)}`
  }, [shareCartIds, assets])

  const copyShareLink = useCallback(() => {
    if (!shareGalleryUrl) {
      toast.error('공유할 사진을 먼저 선택하세요.')
      return
    }
    void navigator.clipboard.writeText(shareGalleryUrl).then(() => {
      toast.success('갤러리 링크가 클립보드에 복사되었습니다.')
      shareCartIds.forEach((id) => {
        const asset = assets.find((a) => a.id === id)
        if (asset?.sourceTable === 'image_assets') {
          incrementImageAssetShareCount(id)
            .then(() => updateInternalScoreForAsset(id))
            .catch(() => {})
        }
      })
    })
  }, [shareGalleryUrl, shareCartIds, assets])

  const handleBulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    const { error } = await updateProjectAssets(ids, { status: 'approved' })
    if (error) {
      toast.error((error as { message?: string }).message ?? '승인 처리 실패')
      return
    }
    toast.success(`${ids.length}건 승인되었습니다. 시공 사례 뱅크에 노출됩니다.`)
    setSelectedIds(new Set())
    fetchFromDb(false).then((list) => list.length > 0 && setAssets(list))
  }, [selectedIds, fetchFromDb])

  const handleBulkEditSave = useCallback(
    async (productTags: string[], color: string) => {
      const ids = Array.from(selectedIds)
      if (ids.length === 0) return
      const tagsForDb = toProductTagsArray(productTags) ?? null
      const { error } = await updateProjectAssets(ids, {
        product_tags: tagsForDb,
        color: color.trim() || null,
      })
      if (error) {
        toast.error((error as { message?: string }).message ?? '저장 실패')
        return
      }
      toast.success(`${ids.length}건 태그·색상이 수정되었습니다. 시공 사례 뱅크·견적에 반영됩니다.`)
      setBulkEditOpen(false)
      setSelectedIds(new Set())
      fetchFromDb(false).then((list) => list.length > 0 && setAssets(list))
    },
    [selectedIds, fetchFromDb]
  )

  /** image_assets 전용: 이 이미지를 해당 현장의 대표 이미지로 지정 */
  const setAsMain = useCallback(
    async (asset: ProjectImageAsset) => {
      if (asset.sourceTable !== 'image_assets' || !asset.projectTitle?.trim()) return
      const { error } = await setImageAssetMain(asset.id, asset.projectTitle)
      if (error) {
        toast.error(error.message)
        return
      }
      toast.success('대표 이미지로 지정했습니다.')
      updateInternalScoreForAsset(asset.id).catch(() => {})
      fetchFromDb(false).then((list) => list.length > 0 && setAssets(list))
    },
    [fetchFromDb]
  )

  /** image_assets 전용: 상담용 토글 — DB 업데이트 후 로컬 상태 반영 */
  const toggleConsultation = useCallback(async (asset: ProjectImageAsset) => {
    if (asset.sourceTable !== 'image_assets') return
    const next = !asset.isConsultation
    const { error } = await updateImageAssetConsultation(asset.id, next)
    if (error) {
      toast.error('저장에 실패했습니다.')
      return
    }
    setAssets((prev) =>
      prev.map((a) => (a.id === asset.id ? { ...a, isConsultation: next } : a))
    )
    toast.success(next ? '상담용으로 표시했습니다.' : '상담용 표시를 해제했습니다.')
  }, [])

  const showBulkActions = !isBankView && reviewFilter === 'pending' && selectedIds.size > 0

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Link to="/consultation" className="text-sm text-muted-foreground hover:text-foreground">
              ← 상담 관리
            </Link>
            <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
            {isBankView && (
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => { setBankViewMode('by_site'); setPage(0) }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    bankViewMode === 'by_site' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  현장별
                </button>
                <button
                  type="button"
                  onClick={() => { setBankViewMode('by_photo'); setPage(0) }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    bankViewMode === 'by_photo' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  사진별
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isBankView && (
            <>
              <span className="text-xs text-muted-foreground mr-1">지능형 필터:</span>
              {(
                [
                  { value: 'all' as FilterMode, label: '전체' },
                  { value: 'by_site' as FilterMode, label: '현장별' },
                  { value: 'by_product' as FilterMode, label: '제품군별' },
                  { value: 'by_color' as FilterMode, label: '색상별' },
                ] as const
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilterMode(value)
                    setPage(0)
                  }}
                  className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                    filterMode === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="latest">최신순</option>
            {!isBankView && <option value="ai">AI 추천순</option>}
            {!isBankView && <option value="internal">내부 스코어순</option>}
            <option value="industry">업종별</option>
            <option value="popular">인기순</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyAllMarkdown}>
            <Copy className="h-3.5 w-3.5" />
            블로그용 Markdown 복사
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyExportJson} title="n8n·Python 등에서 base_alt_text와 프롬프트 가이드 사용">
            <Copy className="h-3.5 w-3.5" />
            Export JSON (n8n)
          </Button>
          {!isBankView && (
            <Link to="/image-assets/upload">
              <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" title="EXIF·AI 제안·컬러칩 스마트 업로드 (image_assets)">
                <Upload className="h-4 w-4" />
                일괄 업로드
              </Button>
            </Link>
          )}
          {!isBankView && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-9 text-sm"
              title="기술·활동 점수 + Gemini AI 품질(최대 8건)으로 internal_score·ai_score 일괄 갱신"
              disabled={backfillLoading}
              onClick={async () => {
                setBackfillLoading(true)
                try {
                  const { updated, total, aiApplied } = await updateInternalScoresBatch(200, { aiLimit: 8 })
                  const msg = aiApplied > 0
                    ? `내부 스코어 갱신: ${updated}건 (AI ${aiApplied}건 포함, ${total}건 처리)`
                    : `내부 스코어 갱신: ${updated}건 (${total}건 처리)`
                  toast.success(msg)
                  fetchFromDb(false).then((list) => { if (list.length > 0) setAssets(list) })
                } catch (e: any) {
                  toast.error(e?.message ?? '스코어 갱신 실패')
                } finally {
                  setBackfillLoading(false)
                }
              }}
            >
              {backfillLoading ? '갱신 중…' : '스코어 갱신'}
            </Button>
          )}
          </div>
        </div>
        {/* 통합 검색 + 업로드 진입 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative max-w-xl flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="제품명, 색상, 현장명(고객명) 검색 — 예: 스마트A 화이트"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(0)
              }}
              className="pl-9 h-10 text-sm"
            />
          </div>
          {!isBankView && (
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                id="consultation-only"
                checked={consultationOnlyFilter}
                onCheckedChange={(checked) => {
                  setConsultationOnlyFilter(checked)
                  setPage(0)
                }}
              />
              <label htmlFor="consultation-only" className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                상담용 사진만 보기
              </label>
            </div>
          )}
        </div>
        {/* 시공 사례 뱅크: 용도 필터 (한글 라벨) */}
        {isBankView && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">용도:</span>
            <button
              type="button"
              onClick={() => { setUsageFilter('all'); setPage(0) }}
              className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                usageFilter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
              }`}
              title="전체 용도"
            >
              전체
            </button>
            {USAGE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setUsageFilter(t); setPage(0) }}
                className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                  usageFilter === t ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
                }`}
                title={getUsageTooltip(t)}
              >
                {getUsageLabel(t)}
              </button>
            ))}
          </div>
        )}
        {/* 이미지 자산 관리 전용: 검수 대기 필터 */}
        {!isBankView && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">검수:</span>
            <button
              type="button"
              onClick={() => { setReviewFilter('all'); setPage(0) }}
              className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                reviewFilter === 'all' ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
              }`}
            >
              전체
            </button>
            <button
              type="button"
              onClick={() => { setReviewFilter('pending'); setPage(0); setSelectedIds(new Set()) }}
              className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                reviewFilter === 'pending' ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
              }`}
            >
              검수 대기 사진 ({pendingCount})
            </button>
          </div>
        )}
        {/* 업종(Sector) 필터 — Select 박스 */}
        {!isBankView && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">업종:</span>
            <select
              value={sectorFilter ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                setSectorFilter(v)
                setPage(0)
              }}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">전체</option>
              {SECTOR_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        {/* 제품명 퀵필터 */}
        {!isBankView && distinctProducts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">제품명:</span>
            {distinctProducts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setProductFilter(productFilter === p ? null : p)
                  setPage(0)
                }}
                className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                  productFilter === p ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        {/* 색상 퀵필터 (DB color 기반) */}
        {distinctColors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">색상:</span>
            {distinctColors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColorFilter(colorFilter === c ? null : c)
                  setPage(0)
                }}
                className={`rounded-md px-3 py-1.5 text-sm border transition-colors ${
                  colorFilter === c ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* 시공 사례 뱅크: 공유용 장바구니 액션 바 */}
      {isBankView && shareCartIds.size > 0 && (
        <div className="sticky top-[var(--header-height,0)] z-10 border-b border-border bg-primary/10 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">{shareCartIds.size}장 선택 · 공유</span>
          <Button variant="default" size="sm" className="gap-1.5" onClick={copyShareLink}>
            <Link2 className="h-4 w-4" />
            {shareCartIds.size}장 공유 링크 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              shareGalleryKakao(shareGalleryUrl, '시공 사례 갤러리', '파인드가구 시공 사례를 확인해 보세요.', () =>
                toast.success('링크가 복사되었습니다. 카톡에 붙여 넣어 공유하세요.')
              )
            }
          >
            카톡으로 공유
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShareCartIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {showBulkActions && (
        <div className="sticky top-[var(--header-height,0)] z-10 border-b border-border bg-muted/80 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">{selectedIds.size}건 선택</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const first = assets.find((a) => selectedIds.has(a.id))
              setBulkTagsText(first?.productTags?.join(', ') ?? '')
              setBulkColor(first?.color ?? '')
              setBulkEditOpen(true)
            }}
          >
            선택 항목 태그 수정
          </Button>
          <Button variant="default" size="sm" onClick={handleBulkApprove}>
            선택 항목 승인 (뱅크 노출)
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {/* 이미지 자산 관리: 공유 장바구니 하단 플로팅 바 */}
      {!isBankView && shareCartIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/95 backdrop-blur shadow-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <span className="text-sm font-medium text-foreground">{shareCartIds.size}장의 사진 선택됨</span>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" className="gap-1.5" onClick={copyShareLink}>
              <Link2 className="h-4 w-4" />
              공유 URL 복사
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShareCartIds(new Set())}>
              선택 해제
            </Button>
          </div>
        </div>
      )}

      <main className={`p-4 ${!isBankView ? 'flex gap-4' : ''} ${!isBankView && shareCartIds.size > 0 ? 'pb-24' : ''}`}>
        {/* 이미지 자산 관리: 좌측 트리 사이드바 [연도 > 지역 > 현장명] */}
        {!isBankView && (
          <aside className="w-64 shrink-0 border-r border-border pr-4">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <h3 className="text-sm font-semibold text-foreground mb-2">현장 트리</h3>
              <button
                type="button"
                onClick={() => { selectSite(null); selectIndustry(null); selectProduct(null) }}
                className={`w-full text-left px-2 py-1.5 rounded text-sm mb-1 ${
                  !selectedSite && !selectedIndustry && !selectedProduct ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                전체 사진
              </button>
              {treeData.years.length === 0 && treeData.industries.length === 0 && treeData.products.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">로딩 중…</p>
              ) : (
                <div className="space-y-0.5">
                  {treeData.years.map(({ year, regions }) => (
                    <div key={year}>
                      <button
                        type="button"
                        onClick={() => toggleYear(year)}
                        className="w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
                      >
                        {expandedYears.has(year) ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="font-medium">{year}년</span>
                      </button>
                      {expandedYears.has(year) && (
                        <div className="ml-3 pl-2 border-l border-border space-y-0.5">
                          {regions.map(({ region, sites }) => (
                            <div key={`${year}-${region}`}>
                              <button
                                type="button"
                                onClick={() => toggleRegion(year, region)}
                                className="w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
                              >
                                {expandedRegionKeys.has(`${year}|${region}`) ? (
                                  <ChevronDown className="h-3 w-3 shrink-0" />
                                ) : (
                                  <ChevronRight className="h-3 w-3 shrink-0" />
                                )}
                                <span className="text-muted-foreground">{region}</span>
                              </button>
                              {expandedRegionKeys.has(`${year}|${region}`) && (
                                <div className="ml-3 pl-2 border-l border-border space-y-0.5">
                                  {sites.map(({ site, count }) => (
                                    <button
                                      key={`${year}-${region}-${site}`}
                                      type="button"
                                      onClick={() => selectSite(site)}
                                      className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                                        selectedSite === site ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground hover:text-foreground'
                                      }`}
                                    >
                                      <span className="truncate">{site}</span>
                                      <span className="text-xs text-muted-foreground shrink-0">({count})</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {/* 업종 */}
                  {treeData.industries.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setExpandedIndustries((b) => !b)}
                        className="w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
                      >
                        {expandedIndustries ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium">업종</span>
                      </button>
                      {expandedIndustries && (
                        <div className="ml-3 pl-2 border-l border-border space-y-0.5 mt-1">
                          {treeData.industries.map(({ name, count }) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => selectIndustry(name)}
                              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                                selectedIndustry === name ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground hover:text-foreground'
                              }`}
                            >
                              <span className="truncate">{name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">({count})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {/* 제품명 */}
                  {treeData.products.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <button
                        type="button"
                        onClick={() => setExpandedProducts((b) => !b)}
                        className="w-full flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
                      >
                        {expandedProducts ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium">제품명</span>
                      </button>
                      {expandedProducts && (
                        <div className="ml-3 pl-2 border-l border-border space-y-0.5 mt-1">
                          {treeData.products.map(({ name, count }) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => selectProduct(name)}
                              className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between gap-2 ${
                                selectedProduct === name ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-foreground hover:text-foreground'
                              }`}
                            >
                              <span className="truncate">{name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">({count})</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        <div className={!isBankView ? 'flex-1 min-w-0' : ''}>
        {/* 이미지 자산 관리: 갤러리 상단 타이틀 */}
        {!isBankView && !loading && (
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {selectedSite
              ? `현장: ${selectedSite}`
              : selectedIndustry
                ? `업종: ${selectedIndustry}`
                : selectedProduct
                  ? `제품: ${selectedProduct}`
                  : '전체 사진 (최근 업로드)'}
          </h2>
        )}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground mb-4">새로운 상담 사진을 업로드해주세요</p>
            <Link to="/image-assets/upload">
              <Button variant="default" size="sm" className="gap-2">
                <Upload className="h-4 w-4" />
                사진 업로드
              </Button>
            </Link>
          </div>
        ) : (isBankView ? bankDisplayGrouped : grouped) ? (
          <>
            {(isBankView ? bankDisplayGrouped : grouped)!.map(([groupKey, list]) => (
              <section key={groupKey} className="mb-8" data-site-key={groupKey}>
                <h2 className="text-sm font-semibold text-foreground mb-3 px-1 flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5">{groupKey}</span>
                  <span className="text-muted-foreground font-normal">({list.length}건)</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {list.map((asset) => (
                    <div
                      key={asset.id}
                      data-asset-id={!isBankView ? asset.id : undefined}
                      className={`relative rounded-lg border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors ${
                        dropTargetId === asset.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                      }`}
                    >
                      {(isBankView || !isBankView) && (
                        <div
                          className="absolute top-1 left-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90"
                          onClick={(e) => { e.stopPropagation(); toggleShareCart(asset.id) }}
                          role="button"
                          aria-label="선택"
                        >
                          <input
                            type="checkbox"
                            checked={shareCartIds.has(asset.id)}
                            onChange={() => toggleShareCart(asset.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4"
                          />
                        </div>
                      )}
                      {!isBankView && reviewFilter === 'pending' && (
                        <div
                          className="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90"
                          onClick={(e) => { e.stopPropagation(); toggleSelection(asset.id) }}
                          role="button"
                          aria-label="검수 선택"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(asset.id)}
                            onChange={() => toggleSelection(asset.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openLightboxAt(asset)}
                        className="w-full text-left"
                      >
                      <div className="aspect-[4/3] relative bg-muted">
                        <img
                          src={asset.thumbnailUrl || asset.url}
                          alt={getBaseAltText(asset)}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {asset.isMain && (
                          <span className="absolute top-1 left-1 rounded bg-amber-500 text-white text-[10px] px-1.5 py-0.5 font-medium" title="현장 대표 이미지">
                            대표
                          </span>
                        )}
                        <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                          {asset.sourceTable === 'image_assets' && asset.isConsultation && (
                            <span className="rounded bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5" title="상담용">
                              상담용
                            </span>
                          )}
                        </div>
                        <span
                          className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            asset.syncStatus === 'synced'
                              ? 'bg-emerald-500/90 text-white'
                              : asset.syncStatus === 'cloudinary_only'
                                ? 'bg-blue-500/90 text-white'
                                : asset.syncStatus === 'storage_only'
                                  ? 'bg-amber-500/90 text-white'
                                  : 'bg-red-500/90 text-white'
                          }`}
                          title={SYNC_LABEL[asset.syncStatus]}
                        >
                          {asset.syncStatus === 'synced' && <CheckCircle className="h-2.5 w-2.5" />}
                          {asset.syncStatus === 'missing' && <AlertCircle className="h-2.5 w-2.5" />}
                          {SYNC_LABEL[asset.syncStatus]}
                        </span>
                      </div>
                      <div className="p-1.5">
                        <p className="text-xs font-medium truncate">{asset.projectTitle || '—'}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{asset.industry || '—'}</p>
                      </div>
                      </button>
                      {!isBankView && (
                        <div
                          className="border-t border-border bg-muted/50 px-1.5 py-1 min-h-[2rem]"
                          onDragOver={(e) => {
                            e.preventDefault()
                            if (dragPayload) setDropTargetId(asset.id)
                          }}
                          onDragLeave={() => setDropTargetId((id) => (id === asset.id ? null : id))}
                          onDrop={(e) => {
                            e.preventDefault()
                            if (dropTargetId !== asset.id) return
                            try {
                              const raw = e.dataTransfer.getData('application/json')
                              const payload = raw ? (JSON.parse(raw) as { productTags: string[]; color: string | null }) : dragPayload
                              if (payload) pasteTagsToAsset(asset.id, { productTags: Array.isArray(payload.productTags) ? payload.productTags : [], color: payload.color ?? null })
                            } catch {
                              if (dragPayload) pasteTagsToAsset(asset.id, dragPayload)
                            }
                          }}
                        >
                          {editingAssetId === asset.id ? (
                            <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                              <Input
                                value={editingTagsText}
                                onChange={(e) => setEditingTagsText(e.target.value)}
                                placeholder="제품 태그 (쉼표 구분)"
                                className="h-7 text-xs"
                              />
                              <div className="flex flex-wrap items-center gap-1">
                                <select
                                  className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs max-w-[100px]"
                                  value={colorChipNames.has(editingColor) ? editingColor : (editingColor ? '기타' : '')}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    if (v === '기타') setEditingColor('')
                                    else setEditingColor(v)
                                  }}
                                >
                                  <option value="">색상 선택</option>
                                  {colorByGroup.Standard?.length ? (
                                    <optgroup label="기본 컬러">
                                      {colorByGroup.Standard.map((name) => (
                                        <option key={name} value={name}>{name}</option>
                                      ))}
                                    </optgroup>
                                  ) : null}
                                  {colorByGroup.Special?.length ? (
                                    <optgroup label="스페셜 컬러">
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
                                {(!editingColor || !colorChipNames.has(editingColor)) && (
                                  <Input
                                    value={editingColor}
                                    onChange={(e) => setEditingColor(e.target.value)}
                                    placeholder="기타 직접입력"
                                    className="h-7 flex-1 min-w-0 text-xs"
                                  />
                                )}
                              </div>
                              <div className="flex gap-1">
                                <Button type="button" size="sm" className="h-6 text-xs flex-1" onClick={() => saveInlineTag(asset.id, editingTagsText.split(',').map((s) => s.trim()).filter(Boolean), editingColor)}>
                                  저장
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => setEditingAssetId(null)}>취소</Button>
                              </div>
                            </div>
                          ) : (
                            <div
                              role="button"
                              tabIndex={0}
                              className="text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 truncate"
                              title="클릭하면 수정, 드래그하면 다른 사진에 붙여넣기"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingAssetId(asset.id)
                                setEditingTagsText((asset.productTags ?? []).join(', '))
                                setEditingColor(asset.color ?? '')
                              }}
                              onDragStart={(e) => {
                                e.stopPropagation()
                                setDragPayload({ productTags: asset.productTags ?? [], color: asset.color ?? null })
                                e.dataTransfer.setData('application/json', JSON.stringify({ productTags: asset.productTags ?? [], color: asset.color ?? null }))
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onDragEnd={() => setDragPayload(null)}
                            >
                              제품명: {(asset.productTags ?? []).length ? (asset.productTags ?? []).join(', ') : '—'} · 제품카테고리: {asset.category ?? '—'} · 색상: {asset.color || '—'}
                            </div>
                          )}
                          {asset.sourceTable === 'image_assets' && (
                            <div className="mt-1 pt-1 border-t border-border/50 flex gap-1 flex-wrap">
                              <Button
                                type="button"
                                variant={asset.isConsultation ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-6 text-[10px] shrink-0"
                                onClick={(e) => { e.stopPropagation(); toggleConsultation(asset) }}
                              >
                                상담용
                              </Button>
                              {asset.projectTitle?.trim() && (
                                <>
                                  <Button
                                    type="button"
                                    variant={asset.isMain ? 'secondary' : 'outline'}
                                    size="sm"
                                    className="h-6 text-[10px] flex-1 min-w-0"
                                    disabled={asset.isMain}
                                    onClick={(e) => { e.stopPropagation(); setAsMain(asset) }}
                                  >
                                    {asset.isMain ? '대표' : '대표지정'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] flex-1 min-w-0"
                                    onClick={(e) => { e.stopPropagation(); copyAssetUrl(asset) }}
                                  >
                                    URL복사
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] flex-1 min-w-0"
                                    disabled={!(asset.productTags?.length || asset.displayName)}
                                    onClick={(e) => { e.stopPropagation(); goToEstimateFromAsset(asset) }}
                                  >
                                    견적담기
                                  </Button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {(isBankView ? bankDisplayPaginated : paginated).map((asset) => (
                <div
                  key={asset.id}
                  data-asset-id={!isBankView ? asset.id : undefined}
                  className={`relative rounded-lg border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors ${
                    dropTargetId === asset.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {(isBankView || !isBankView) && (
                    <div
                      className="absolute top-1 left-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90"
                      onClick={(e) => { e.stopPropagation(); toggleShareCart(asset.id) }}
                      role="button"
                      aria-label="선택"
                    >
                      <input
                        type="checkbox"
                        checked={shareCartIds.has(asset.id)}
                        onChange={() => toggleShareCart(asset.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4"
                      />
                    </div>
                  )}
                  {!isBankView && reviewFilter === 'pending' && (
                    <div
                      className="absolute top-1 right-1 z-10 flex items-center justify-center w-6 h-6 rounded border bg-background/90"
                      onClick={(e) => { e.stopPropagation(); toggleSelection(asset.id) }}
                      role="button"
                      aria-label="검수 선택"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(asset.id)}
                        onChange={() => toggleSelection(asset.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => openLightboxAt(asset)}
                    className="w-full text-left"
                  >
                  <div className="aspect-[4/3] relative bg-muted">
                    <img
                      src={asset.thumbnailUrl || asset.url}
                      alt={getBaseAltText(asset)}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {asset.isMain && (
                      <span className="absolute top-1 left-1 rounded bg-amber-500 text-white text-[10px] px-1.5 py-0.5 font-medium" title="현장 대표 이미지">
                        대표
                      </span>
                    )}
                    <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                      {asset.sourceTable === 'image_assets' && asset.isConsultation && (
                        <span className="rounded bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5" title="상담용">
                          상담용
                        </span>
                      )}
                    </div>
                    <span
                      className={`absolute bottom-1 left-1 right-1 flex items-center justify-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        asset.syncStatus === 'synced'
                          ? 'bg-emerald-500/90 text-white'
                          : asset.syncStatus === 'cloudinary_only'
                            ? 'bg-blue-500/90 text-white'
                            : asset.syncStatus === 'storage_only'
                              ? 'bg-amber-500/90 text-white'
                              : 'bg-red-500/90 text-white'
                      }`}
                      title={SYNC_LABEL[asset.syncStatus]}
                    >
                      {asset.syncStatus === 'synced' && <CheckCircle className="h-2.5 w-2.5" />}
                      {asset.syncStatus === 'missing' && <AlertCircle className="h-2.5 w-2.5" />}
                      {SYNC_LABEL[asset.syncStatus]}
                    </span>
                  </div>
                  <div className="p-1.5">
                    <p className="text-xs font-medium truncate">{asset.projectTitle || '—'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{asset.industry || '—'}</p>
                  </div>
                  </button>
                  {!isBankView && (
                    <div
                      className="border-t border-border bg-muted/50 px-1.5 py-1 min-h-[2rem]"
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (dragPayload && e.currentTarget.closest('[data-asset-id]')) setDropTargetId(asset.id)
                      }}
                      onDragLeave={() => setDropTargetId((id) => (id === asset.id ? null : id))}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (dropTargetId !== asset.id) return
                        try {
                          const raw = e.dataTransfer.getData('application/json')
                          const payload = raw ? (JSON.parse(raw) as { productTags: string[]; color: string | null }) : dragPayload
                          if (payload) pasteTagsToAsset(asset.id, { productTags: Array.isArray(payload.productTags) ? payload.productTags : [], color: payload.color ?? null })
                        } catch {
                          if (dragPayload) pasteTagsToAsset(asset.id, dragPayload)
                        }
                      }}
                    >
                      {editingAssetId === asset.id ? (
                        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={editingTagsText}
                            onChange={(e) => setEditingTagsText(e.target.value)}
                            placeholder="제품 태그 (쉼표 구분)"
                            className="h-7 text-xs"
                          />
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs max-w-[100px]"
                              value={colorChipNames.has(editingColor) ? editingColor : (editingColor ? '기타' : '')}
                              onChange={(e) => {
                                const v = e.target.value
                                if (v === '기타') setEditingColor('')
                                else setEditingColor(v)
                              }}
                            >
                              <option value="">색상 선택</option>
                              {colorByGroup.Standard?.length ? (
                                <optgroup label="기본 컬러">
                                  {colorByGroup.Standard.map((name) => (
                                    <option key={name} value={name}>{name}</option>
                                  ))}
                                </optgroup>
                              ) : null}
                              {colorByGroup.Special?.length ? (
                                <optgroup label="스페셜 컬러">
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
                            {(!editingColor || !colorChipNames.has(editingColor)) && (
                              <Input
                                value={editingColor}
                                onChange={(e) => setEditingColor(e.target.value)}
                                placeholder="기타 직접입력"
                                className="h-7 flex-1 min-w-0 text-xs"
                              />
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button type="button" size="sm" className="h-6 text-xs flex-1" onClick={() => saveInlineTag(asset.id, editingTagsText.split(',').map((s) => s.trim()).filter(Boolean), editingColor)}>
                              저장
                            </Button>
                            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => setEditingAssetId(null)}>취소</Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          className="text-[10px] text-muted-foreground cursor-pointer hover:bg-muted/80 rounded px-1 py-0.5 truncate"
                          title="클릭하면 수정, 드래그하면 다른 사진에 붙여넣기"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingAssetId(asset.id)
                            setEditingTagsText((asset.productTags ?? []).join(', '))
                            setEditingColor(asset.color ?? '')
                          }}
                          onDragStart={(e) => {
                            e.stopPropagation()
                            setDragPayload({ productTags: asset.productTags ?? [], color: asset.color ?? null })
                            e.dataTransfer.setData('application/json', JSON.stringify({ productTags: asset.productTags ?? [], color: asset.color ?? null }))
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onDragEnd={() => setDragPayload(null)}
                        >
                          제품명: {(asset.productTags ?? []).length ? (asset.productTags ?? []).join(', ') : '—'} · 제품카테고리: {asset.category ?? '—'} · 색상: {asset.color || '—'}
                        </div>
                      )}
                      {asset.sourceTable === 'image_assets' && (
                        <div className="mt-1 pt-1 border-t border-border/50 flex gap-1 flex-wrap">
                          <Button
                            type="button"
                            variant={asset.isConsultation ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] shrink-0"
                            onClick={(e) => { e.stopPropagation(); toggleConsultation(asset) }}
                          >
                            상담용
                          </Button>
                          {asset.projectTitle?.trim() && (
                            <>
                              <Button
                                type="button"
                                variant={asset.isMain ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-6 text-[10px] flex-1 min-w-0"
                                disabled={asset.isMain}
                                onClick={(e) => { e.stopPropagation(); setAsMain(asset) }}
                              >
                                {asset.isMain ? '대표' : '대표지정'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] flex-1 min-w-0"
                                onClick={(e) => { e.stopPropagation(); copyAssetUrl(asset) }}
                              >
                                URL복사
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] flex-1 min-w-0"
                                disabled={!(asset.productTags?.length || asset.displayName)}
                                onClick={(e) => { e.stopPropagation(); goToEstimateFromAsset(asset) }}
                              >
                                견적담기
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {(isBankView ? bankDisplayHasMore : hasMore) && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore}>더 보기</Button>
              </div>
            )}
          </>
        )}
        </div>
      </main>

      {/* 라이트박스 */}
      <Dialog
        open={!!lightboxAsset}
        onOpenChange={(open) => {
          if (!open) {
            setLightboxAsset(null)
            setLightboxIndex(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {lightboxAsset && (() => {
            const lightboxList = isBankView ? bankFlatForPaging : flatForPaging
            const idx = lightboxIndex ?? (lightboxList.findIndex((a) => a.id === lightboxAsset.id) ?? -1)
            const prevAsset = idx > 0 ? lightboxList[idx - 1] : null
            const nextAsset = idx >= 0 && idx < lightboxList.length - 1 ? lightboxList[idx + 1] : null
            const sameSiteCount = isBankView && lightboxAsset.projectTitle
              ? bankFlatForPaging.filter((a) => (a.projectTitle || '').trim() === (lightboxAsset.projectTitle || '').trim()).length
              : 0
            return (
            <>
              <DialogHeader className="px-4 py-2 border-b shrink-0 flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-1 min-w-0">
                  {prevAsset && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => { setLightboxAsset(prevAsset); setLightboxIndex(idx - 1) }}
                      aria-label="이전 사진"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <DialogTitle className="text-sm truncate">{lightboxAsset.projectTitle || '시공 이미지'}</DialogTitle>
                  {nextAsset && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => { setLightboxAsset(nextAsset); setLightboxIndex(idx + 1) }}
                      aria-label="다음 사진"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setLightboxAsset(null); setLightboxIndex(null) }}><X className="h-4 w-4" /></Button>
              </DialogHeader>
              <div className="flex-1 min-h-0 flex items-center justify-center p-4 bg-muted/30 relative">
                <img
                  src={lightboxAsset.url}
                  alt={getBaseAltText(lightboxAsset)}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              </div>
              <div className="px-4 py-3 border-t shrink-0 space-y-3">
                {/* 공유 최적화: 눈에 띄게 배치 */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="default" size="sm" className="gap-1.5 h-9" onClick={copyImageUrl} title="고화질 이미지 URL 복사">
                    <ImageIcon className="h-4 w-4" />
                    이미지 주소 복사
                  </Button>
                  {lightboxAsset.consultationId && (
                    <Button variant="default" size="sm" className="gap-1.5 h-9" onClick={copySiteLink} title="현장(상담) 링크 복사">
                      <Link2 className="h-4 w-4" />
                      현장 링크 공유
                    </Button>
                  )}
                  {lightboxAsset.sourceTable === 'image_assets' && lightboxAsset.projectTitle?.trim() && (
                    <Button
                      variant={lightboxAsset.isMain ? 'secondary' : 'default'}
                      size="sm"
                      className="gap-1.5 h-9"
                      disabled={lightboxAsset.isMain}
                      onClick={() => setAsMain(lightboxAsset)}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {lightboxAsset.isMain ? '대표 이미지' : '대표로 지정'}
                    </Button>
                  )}
                </div>
                {/* 역방향 견적: product_tags 클릭 시 견적서 화면으로 이동 + 해당 제품 담기 */}
                {(lightboxAsset.productTags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">견적에 담기:</span>
                    {lightboxAsset.productTags!.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => goToEstimateWithProduct(tag)}
                        className="rounded-md px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
                      >
                        {tag} →
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Sync: {SYNC_LABEL[lightboxAsset.syncStatus]}</span>
                  {lightboxAsset.industry && <span>업종: {lightboxAsset.industry}</span>}
                  <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={copyCurrentMarkdown}>
                    <Copy className="h-3 w-3" />
                    Markdown 복사
                  </Button>
                  {lightboxAsset.consultationId && (
                    <Link to="/consultation" state={{ focusConsultationId: lightboxAsset.consultationId }} className="text-primary font-medium hover:underline">
                      이 상담 건 보기 →
                    </Link>
                  )}
                  <Link
                    to="/image-assets"
                    state={{ focusAssetId: lightboxAsset.id }}
                    className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                    onClick={() => { setLightboxAsset(null); setLightboxIndex(null) }}
                  >
                    관리 페이지에서 수정하기 →
                  </Link>
                  {isBankView && lightboxAsset.projectTitle && sameSiteCount > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        scrollToSiteKeyRef.current = (lightboxAsset.projectTitle || '').trim() || null
                        setLightboxAsset(null)
                        setLightboxIndex(null)
                        setBankViewMode('by_site')
                        setPage(0)
                      }}
                    >
                      이 현장 앨범 보기 ({sameSiteCount}장)
                    </Button>
                  )}
                  {(() => {
                    const del = ensureCanDelete(lightboxAsset)
                    const upd = ensureCanUpdate(lightboxAsset, {})
                    return (
                      <span className="text-[10px] ml-auto" title={`삭제: ${del.ok ? '가능' : del.reason}, 수정: ${upd.ok ? '가능' : upd.reason}`}>
                        {del.ok && upd.ok ? '✓ 안전' : '⚠ 제한'}
                      </span>
                    )
                  })()}
                </div>
              </div>
            </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* 검수 대기 — 선택 항목 태그 일괄 수정 */}
      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>선택 항목 태그·색상 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-sm font-medium block mb-1">제품 태그 (쉼표 구분)</label>
              <Input
                value={bulkTagsText}
                onChange={(e) => setBulkTagsText(e.target.value)}
                placeholder="예: 스마트A, 모번"
                className="h-10"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">색상</label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-10 min-w-[140px] rounded border border-input bg-background px-3 text-sm"
                  value={colorChipNames.has(bulkColor) ? bulkColor : (bulkColor ? '기타' : '')}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '기타') setBulkColor('')
                    else setBulkColor(v)
                  }}
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
                {(!bulkColor || !colorChipNames.has(bulkColor)) && (
                  <Input
                    value={bulkColor}
                    onChange={(e) => setBulkColor(e.target.value)}
                    placeholder="기타 직접입력"
                    className="h-10 flex-1 min-w-0"
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setBulkEditOpen(false)}>
                취소
              </Button>
              <Button
                onClick={() => {
                  const tags = bulkTagsText.split(',').map((s) => s.trim()).filter(Boolean)
                  handleBulkEditSave(tags, bulkColor)
                }}
              >
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
