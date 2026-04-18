import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { X, Copy, CheckCircle, AlertCircle, Search, Link2, ImageIcon, ChevronLeft, ChevronRight, Upload, Users, Images } from 'lucide-react'
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
  toMarkdownImageLine,
  getBaseAltText,
  buildImageExportPayload,
  ensureCanDelete,
  ensureCanUpdate,
  rowToProjectAsset,
  fetchAllProjectAssets,
  fetchImageAssetsByBusinessType,
  incrementImageAssetViewCount,
  incrementImageAssetShareCount,
  updateProjectAsset,
  updateProjectAssets,
  updateImageAssetBeforeAfter,
  updateImageAssetConsultation,
  updateImageAssetIndustry,
  updateImageAssetLocation,
  updateImageAssetTagColor,
  backfillImageAssetSpaceMetadata,
  backfillImageAssetBroadExternalDisplayNames,
} from '@/lib/imageAssetService'
import { setImageAssetMain } from '@/lib/imageAssetUploadService'
import { updateInternalScoreForAsset, updateInternalScoresBatch } from '@/lib/imageScoringService'
import { isValidUUID } from '@/lib/uuid'
import { toProductTagsArray } from '@/lib/utils'
import { shareGalleryKakao } from '@/lib/kakaoShare'
import { createSharedGallery, snapshotProjectImageAsset } from '@/lib/sharedGalleryService'
import { useColorChips } from '@/hooks/useColorChips'
import type { ProjectImageAsset } from '@/types/projectImage'
import { USAGE_TYPES, REVIEW_STATUSES, getUsageLabel, getUsageTooltip, type UsageType, type ReviewStatus } from '@/types/projectImage'
import {
  COLOR_QUICK,
  SWIPE_THRESHOLD_PX,
  SECTOR_OPTIONS,
  PAGE_SIZE,
  SYNC_LABEL,
} from '@/pages/imageAssetViewer/imageAssetViewerConstants'
import type { SortKey, GroupMode, SiteOption, AssetGroup } from '@/pages/imageAssetViewer/imageAssetViewerTypes'
import {
  legacyRowToAsset,
  filterByUnifiedSearch,
  getAssetSpaceId,
  getAssetSiteLabel,
  getAssetSiteFilterValue,
  getAssetSiteDisplayLabel,
} from '@/pages/imageAssetViewer/imageAssetViewerUtils'
import { useImageAssetViewerPageMode } from '@/pages/imageAssetViewer/useImageAssetViewerPageMode'

export default function ImageAssetViewer() {
  const navigate = useNavigate()
  const { pageTitle, pageDescription, isBankView } = useImageAssetViewerPageMode()
  const [assets, setAssets] = useState<ProjectImageAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('latest')
  const [page, setPage] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [colorFilter, setColorFilter] = useState<string | null>(null)
  const [productFilter, setProductFilter] = useState<string | null>(null)
  const [sectorFilter, setSectorFilter] = useState<string | null>(null)
  const [siteFilter, setSiteFilter] = useState<string | null>(null)
  const [usageFilter, setUsageFilter] = useState<UsageType | 'all'>('all')
  const [lightboxAsset, setLightboxAsset] = useState<ProjectImageAsset | null>(null)
  /** 이미지 자산 관리 전용: 전체 | 검수 대기 사진 */
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending'>('all')
  /** 이미지 자산 관리 전용: 상담용 사진만 보기 */
  const [consultationOnlyFilter, setConsultationOnlyFilter] = useState(true)
  /** 이미지 자산 관리 전용: space_id 미매칭 건만 보기 */
  const [unmatchedOnlyFilter, setUnmatchedOnlyFilter] = useState(false)
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
  const [editingIndustry, setEditingIndustry] = useState('')
  const [editingLocation, setEditingLocation] = useState('')
  /** 태그 드래그 복사: 드래그 중인 소스 페이로드, 드롭 대상 카드 ID */
  const [dragPayload, setDragPayload] = useState<{ productTags: string[]; color: string | null } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  /** 시공 사례 뱅크 전용: 현장별(그룹) / 사진별(평탄 그리드) 보기 모드 */
  const [bankViewMode, setBankViewMode] = useState<'by_site' | 'by_photo'>('by_photo')
  /** 라이트박스에서 앞뒤 넘기기용 인덱스 (현재 보기 목록 기준) */
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const scrollToSiteKeyRef = useRef<string | null>(null)
  const [sectorAssetCache, setSectorAssetCache] = useState<Record<string, ProjectImageAsset[]>>({})
  const defaultSectorInitializedRef = useRef(false)
  const { chips: colorChips } = useColorChips()
  const isAdmin = useMemo(() => {
    if (typeof localStorage === 'undefined') return false
    if (localStorage.getItem('findgagu-role') === 'admin') return true
    if (new URLSearchParams(window.location.search).get('admin') === '1') return true
    return false
  }, [])
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [spaceMigrationLoading, setSpaceMigrationLoading] = useState(false)
  const colorByGroup = useMemo(() => {
    const g: Record<string, string[]> = { Standard: [], Special: [], Other: [] }
    colorChips.forEach((c) => {
      if (g[c.color_type]) g[c.color_type].push(c.color_name)
    })
    return g
  }, [colorChips])
  const colorChipNames = useMemo(() => new Set(colorChips.map((c) => c.color_name)), [colorChips])

  /** imageAssetService 심장: 현재는 관리자용 전체 자산만 조회 */
  const fetchFromDb = useCallback(async (forBank: boolean) => {
    try {
      const list = await fetchAllProjectAssets()
      if (list.length > 0) return list
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

  useEffect(() => {
    setEditingIndustry(lightboxAsset?.industry ?? '')
    setEditingLocation(lightboxAsset?.location ?? '')
  }, [lightboxAsset])

  /** 뱅크 라이트박스에서 [관리 페이지에서 수정하기] 클릭 시 /image-assets 진입 + 해당 카드 포커스 */
  const location = useLocation()
  const focusHandledRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isBankView && location.pathname === '/image-assets' && assets.length > 0) {
      const queryFocusId = new URLSearchParams(location.search).get('assetId')
      const stateFocusId = (location.state as { focusAssetId?: string } | null)?.focusAssetId
      const focusId = queryFocusId || stateFocusId
      if (focusId && typeof focusId === 'string' && focusHandledRef.current !== focusId) {
        focusHandledRef.current = focusId
        const asset = assets.find((a) => a.id === focusId)
        if (asset) {
          setConsultationOnlyFilter(false)
          setReviewFilter('all')
          setUnmatchedOnlyFilter(false)
          setSearchQuery('')
          setSectorFilter((asset.industry ?? '').trim() || null)
          setSiteFilter(getAssetSiteFilterValue(asset))
          setProductFilter(null)
          setColorFilter(null)
          setPage(0)
          setEditingAssetId(focusId)
          setEditingTagsText((asset.productTags ?? []).join(', '))
          setEditingColor(asset.color ?? '')
        } else {
          setConsultationOnlyFilter(false)
          setReviewFilter('all')
          setUnmatchedOnlyFilter(false)
          setSearchQuery(focusId)
          setPage(0)
        }
        setTimeout(() => {
          const el = document.querySelector(`[data-asset-id="${focusId}"]`)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 400)
      }
    }
  }, [isBankView, location.pathname, location.search, location.state, assets])

  const saveInlineTag = useCallback(
    async (
      assetId: string,
      sourceTable: ProjectImageAsset['sourceTable'],
      productTags: string[],
      color: string
    ) => {
      if (!isValidUUID(assetId)) {
        toast.error('유효하지 않은 항목 ID입니다. DB에 있는 항목만 저장할 수 있습니다.')
        return
      }
      const tags = toProductTagsArray(productTags.map((s) => s.trim()).filter(Boolean)) ?? null
      const { error } =
        sourceTable === 'image_assets'
          ? await updateImageAssetTagColor(assetId, {
              productName: tags?.[0] ?? null,
              colorName: color.trim() || null,
            })
          : await updateProjectAsset(assetId, {
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
    async (
      targetId: string,
      sourceTable: ProjectImageAsset['sourceTable'],
      payload: { productTags: string[]; color: string | null }
    ) => {
      if (!isValidUUID(targetId)) {
        toast.error('유효하지 않은 대상 ID입니다. DB에 있는 항목에만 붙여넣을 수 있습니다.')
        return
      }
      const tagsForDb = toProductTagsArray(payload.productTags) ?? null
      const { error } =
        sourceTable === 'image_assets'
          ? await updateImageAssetTagColor(targetId, {
              productName: tagsForDb?.[0] ?? null,
              colorName: payload.color?.trim() || null,
            })
          : await updateProjectAsset(targetId, {
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

  const saveImageAssetIndustryInline = useCallback(
    async (assetId: string) => {
      const nextIndustry = editingIndustry.trim() || null
      const { error } = await updateImageAssetIndustry(assetId, nextIndustry)
      if (error) {
        toast.error((error as { message?: string }).message ?? '업종 저장 실패')
        return
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? {
                ...a,
                industry: nextIndustry,
              }
            : a
        )
      )
      setLightboxAsset((prev) =>
        prev && prev.id === assetId
          ? {
              ...prev,
              industry: nextIndustry,
            }
          : prev
      )
      toast.success('업종을 수정했습니다.')
    },
    [editingIndustry]
  )

  const saveImageAssetLocationInline = useCallback(
    async (assetId: string) => {
      const nextLocation = editingLocation.trim() || null
      const { error } = await updateImageAssetLocation(assetId, nextLocation)
      if (error) {
        toast.error((error as { message?: string }).message ?? '지역 저장 실패')
        return
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? {
                ...a,
                location: nextLocation,
                projectTitle: a.siteName?.trim() || nextLocation,
              }
            : a
        )
      )
      setLightboxAsset((prev) =>
        prev && prev.id === assetId
          ? {
              ...prev,
              location: nextLocation,
              projectTitle: prev.siteName?.trim() || nextLocation,
            }
          : prev
      )
      toast.success('지역을 수정했습니다.')
    },
    [editingLocation]
  )

  /** 이미지 자산 관리: 검수 대기만 보기 */
  const statusFiltered = useMemo(() => {
    if (isBankView) return assets
    if (reviewFilter === 'pending') return assets.filter((a) => a.status === 'pending')
    return assets
  }, [assets, isBankView, reviewFilter])

  /** 이미지 자산 관리: 상담용 사진만 보기 (is_consultation true인 image_assets만) */
  const consultationFiltered = useMemo(() => {
    if (isBankView || !consultationOnlyFilter) return statusFiltered
    return statusFiltered.filter((a) => a.sourceTable === 'image_assets' && a.isConsultation === true)
  }, [statusFiltered, isBankView, consultationOnlyFilter])

  const unmatchedFiltered = useMemo(() => {
    if (isBankView || !unmatchedOnlyFilter) return consultationFiltered
    return consultationFiltered.filter((asset) => asset.sourceTable === 'image_assets' && !getAssetSpaceId(asset))
  }, [consultationFiltered, isBankView, unmatchedOnlyFilter])

  const searchFiltered = useMemo(
    () => filterByUnifiedSearch(unmatchedFiltered, searchQuery),
    [unmatchedFiltered, searchQuery]
  )

  const usageFiltered = useMemo(() => {
    if (usageFilter === 'all') return searchFiltered
    return searchFiltered.filter((a) => a.usageType === usageFilter)
  }, [searchFiltered, usageFilter])

  const sectorPreparedAssets = useMemo(() => {
    if (isBankView || !sectorFilter) return usageFiltered
    const cached = sectorAssetCache[sectorFilter]
    if (!cached) return usageFiltered

    const merged = new Map<string, ProjectImageAsset>()
    usageFiltered.forEach((asset) => {
      if (asset.sourceTable !== 'image_assets' && (asset.industry ?? '').trim() === sectorFilter) {
        merged.set(`${asset.sourceTable ?? 'unknown'}:${asset.id}`, asset)
      }
    })
    cached
      .filter((asset) => {
        if (!isBankView && reviewFilter === 'pending' && asset.status !== 'pending') return false
        if (!isBankView && consultationOnlyFilter && !(asset.sourceTable === 'image_assets' && asset.isConsultation === true)) return false
        if (!isBankView && unmatchedOnlyFilter && !(!getAssetSpaceId(asset) && asset.sourceTable === 'image_assets')) return false
        if (usageFilter !== 'all' && asset.usageType !== usageFilter) return false
        return true
      })
      .filter((asset) => filterByUnifiedSearch([asset], searchQuery).length > 0)
      .forEach((asset) => {
        merged.set(`${asset.sourceTable ?? 'unknown'}:${asset.id}`, asset)
      })
    return Array.from(merged.values())
  }, [isBankView, sectorFilter, sectorAssetCache, usageFiltered, reviewFilter, consultationOnlyFilter, unmatchedOnlyFilter, usageFilter, searchQuery])

  const distinctIndustries = useMemo(() => {
    const preferredOrder = ['관리형', '학원', '스터디카페', '학교', '아파트', '기타']
    const set = new Set<string>(preferredOrder)
    usageFiltered.forEach((a) => {
      const v = (a.industry ?? '').trim()
      if (v) set.add(v)
    })
    const list = Array.from(set)
    const preferred = preferredOrder.filter((name) => list.includes(name))
    const extras = list
      .filter((name) => !preferredOrder.includes(name))
      .sort((a, b) => a.localeCompare(b, 'ko'))
    return [...preferred, ...extras]
  }, [usageFiltered])

  const industryFiltered = useMemo(() => {
    if (!isBankView && !sectorFilter) return []
    const source = sectorFilter ? sectorPreparedAssets : usageFiltered
    if (!sectorFilter) return source
    return source.filter((a) => (a.industry ?? '').trim() === sectorFilter)
  }, [isBankView, usageFiltered, sectorPreparedAssets, sectorFilter])

  const distinctSiteOptions = useMemo<SiteOption[]>(() => {
    const map = new Map<string, SiteOption>()
    industryFiltered.forEach((asset) => {
      const value = getAssetSiteFilterValue(asset)
      if (map.has(value)) return
      map.set(value, {
        value,
        label: getAssetSiteDisplayLabel(asset),
        spaceId: getAssetSpaceId(asset),
      })
    })
    return Array.from(map.values()).sort((a, b) => {
      if (a.spaceId && !b.spaceId) return -1
      if (!a.spaceId && b.spaceId) return 1
      return a.label.localeCompare(b.label, 'ko')
    })
  }, [industryFiltered])

  const siteFiltered = useMemo(() => {
    if (!siteFilter) return industryFiltered
    return industryFiltered.filter((asset) => getAssetSiteFilterValue(asset) === siteFilter)
  }, [industryFiltered, siteFilter])

  const distinctProducts = useMemo(() => {
    const set = new Set<string>()
    siteFiltered.forEach((a) => {
      (a.productTags ?? []).forEach((t) => {
        const v = (t ?? '').trim()
        if (v) set.add(v)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [siteFiltered])

  const productFiltered = useMemo(() => {
    if (!productFilter) return siteFiltered
    return siteFiltered.filter((a) =>
      (a.productTags ?? []).some((t) => (t ?? '').trim() === productFilter)
    )
  }, [siteFiltered, productFilter])

  const distinctColors = useMemo(() => {
    const set = new Set<string>()
    productFiltered.forEach((a) => {
      const c = (a.color ?? '').trim()
      if (c) set.add(c)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [productFiltered])

  const pendingCount = useMemo(() => assets.filter((a) => a.status === 'pending').length, [assets])

  const hasActiveFilters = useMemo(
    () =>
      searchQuery.trim().length > 0 ||
      usageFilter !== 'all' ||
      reviewFilter !== 'all' ||
      consultationOnlyFilter ||
      unmatchedOnlyFilter ||
      sectorFilter !== null ||
      siteFilter !== null ||
      productFilter !== null ||
      colorFilter !== null,
    [
      searchQuery,
      usageFilter,
      reviewFilter,
      consultationOnlyFilter,
      unmatchedOnlyFilter,
      sectorFilter,
      siteFilter,
      productFilter,
      colorFilter,
    ]
  )

  const resetAllFilters = useCallback(() => {
    setSearchQuery('')
    setUsageFilter('all')
    setReviewFilter('all')
    setConsultationOnlyFilter(false)
    setUnmatchedOnlyFilter(false)
    setSectorFilter(null)
    setSiteFilter(null)
    setProductFilter(null)
    setColorFilter(null)
    setSelectedIds(new Set())
    setPage(0)
  }, [])

  useEffect(() => {
    if (sectorFilter && !distinctIndustries.includes(sectorFilter)) setSectorFilter(null)
  }, [distinctIndustries, sectorFilter])

  useEffect(() => {
    if (isBankView || defaultSectorInitializedRef.current) return
    if (sectorFilter) {
      defaultSectorInitializedRef.current = true
      return
    }
    if (!distinctIndustries.includes('관리형')) return
    defaultSectorInitializedRef.current = true
    setSectorFilter('관리형')
    setPage(0)
  }, [isBankView, distinctIndustries, sectorFilter])

  useEffect(() => {
    if (siteFilter && !distinctSiteOptions.some((option) => option.value === siteFilter)) setSiteFilter(null)
  }, [distinctSiteOptions, siteFilter])

  useEffect(() => {
    if (isBankView || !sectorFilter || sectorAssetCache[sectorFilter]) return

    let cancelled = false
    fetchImageAssetsByBusinessType(sectorFilter).then((list) => {
      if (cancelled) return
      setSectorAssetCache((prev) => (prev[sectorFilter] ? prev : { ...prev, [sectorFilter]: list }))
    })

    return () => { cancelled = true }
  }, [isBankView, sectorFilter, sectorAssetCache])

  useEffect(() => {
    if (productFilter && !distinctProducts.includes(productFilter)) setProductFilter(null)
  }, [distinctProducts, productFilter])

  useEffect(() => {
    if (colorFilter && !distinctColors.includes(colorFilter)) setColorFilter(null)
  }, [distinctColors, colorFilter])

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

  const currentGroupMode = useMemo<GroupMode>(() => {
    if (colorFilter) return 'by_color'
    if (productFilter) return 'by_product'
    if (siteFilter) return 'by_site'
    return 'by_industry'
  }, [colorFilter, productFilter, siteFilter])

  const grouped = useMemo<AssetGroup[] | null>(() => {
    if (isBankView) return null
    const map = new Map<string, AssetGroup>()
    for (const a of sorted) {
      let groupKey: string
      let label: string
      if (currentGroupMode === 'by_industry') {
        label = (a.industry?.trim() || '미분류').trim() || '미분류'
        groupKey = `industry:${label}`
      } else if (currentGroupMode === 'by_site') {
        groupKey = getAssetSiteFilterValue(a)
        label = getAssetSiteDisplayLabel(a)
      } else if (currentGroupMode === 'by_product') {
        const tags = a.productTags?.length ? a.productTags : null
        label = tags ? tags[0] : '미분류'
        groupKey = `product:${label}`
      } else {
        label = (a.color?.trim() || '미분류').trim() || '미분류'
        groupKey = `color:${label}`
      }
      const existing = map.get(groupKey)
      if (existing) {
        existing.items.push(a)
      } else {
        map.set(groupKey, { key: groupKey, label, items: [a] })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ko'))
  }, [sorted, currentGroupMode, isBankView])

  const flatForPaging = useMemo(() => {
    if (!grouped) return sorted
    return grouped.flatMap((group) => group.items)
  }, [grouped, sorted])

  const currentResultTitle = useMemo(() => {
    if (!isBankView && !sectorFilter) return '업종을 선택하면 해당 업종의 전체 사진이 표시됩니다.'
    if (unmatchedOnlyFilter) return '스페이스 ID 미매칭 사진'
    if (colorFilter) return `색상: ${colorFilter}`
    if (productFilter) return `제품: ${productFilter}`
    if (siteFilter) {
      const label = distinctSiteOptions.find((option) => option.value === siteFilter)?.label ?? siteFilter
      return `현장: ${label}`
    }
    if (sectorFilter) return `업종: ${sectorFilter}`
    return '전체 사진 (최근 업로드)'
  }, [unmatchedOnlyFilter, colorFilter, productFilter, siteFilter, sectorFilter, distinctSiteOptions])

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
  const displayHasResults = isBankView ? bankDisplayFlat.length > 0 : flatForPaging.length > 0
  const lightboxList = useMemo(
    () => (isBankView ? bankFlatForPaging : flatForPaging),
    [isBankView, bankFlatForPaging, flatForPaging]
  )
  const lightboxImageFrameRef = useRef<HTMLDivElement | null>(null)
  const lightboxAnimatedImageIdRef = useRef<string | null>(null)
  const lightboxTransitionDirectionRef = useRef<'next' | 'prev'>('next')
  const lightboxPointerStartRef = useRef<{ x: number; y: number } | null>(null)

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
      lightboxAnimatedImageIdRef.current = null
      lightboxTransitionDirectionRef.current = 'next'
      const idx = lightboxList.findIndex((a) => a.id === asset.id)
      setLightboxAsset(asset)
      setLightboxIndex(idx >= 0 ? idx : null)
      if (asset.sourceTable === 'image_assets') {
        incrementImageAssetViewCount(asset.id)
          .then(() => updateInternalScoreForAsset(asset.id))
          .catch(() => {})
      }
    },
    [lightboxList]
  )

  const goToPreviousLightboxAsset = useCallback(() => {
    if (!lightboxAsset) return
    const currentIndex = lightboxIndex ?? lightboxList.findIndex((asset) => asset.id === lightboxAsset.id)
    if (currentIndex <= 0) return
    const target = lightboxList[currentIndex - 1]
    if (!target) return
    lightboxTransitionDirectionRef.current = 'prev'
    setLightboxAsset(target)
    setLightboxIndex(currentIndex - 1)
  }, [lightboxAsset, lightboxIndex, lightboxList])

  const goToNextLightboxAsset = useCallback(() => {
    if (!lightboxAsset) return
    const currentIndex = lightboxIndex ?? lightboxList.findIndex((asset) => asset.id === lightboxAsset.id)
    if (currentIndex < 0 || currentIndex >= lightboxList.length - 1) return
    const target = lightboxList[currentIndex + 1]
    if (!target) return
    lightboxTransitionDirectionRef.current = 'next'
    setLightboxAsset(target)
    setLightboxIndex(currentIndex + 1)
  }, [lightboxAsset, lightboxIndex, lightboxList])

  const handleLightboxPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      lightboxPointerStartRef.current = null
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    lightboxPointerStartRef.current = { x: event.clientX, y: event.clientY }
  }, [])

  const handleLightboxPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const start = lightboxPointerStartRef.current
    lightboxPointerStartRef.current = null
    if (!start || lightboxList.length <= 1) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) goToNextLightboxAsset()
    else goToPreviousLightboxAsset()
  }, [lightboxList.length, goToNextLightboxAsset, goToPreviousLightboxAsset])
  const handleLightboxPointerCancel = useCallback(() => {
    lightboxPointerStartRef.current = null
  }, [])
  useEffect(() => {
    const currentImageId = lightboxAsset?.id ?? null
    if (!currentImageId) {
      lightboxAnimatedImageIdRef.current = null
      return
    }
    if (lightboxAnimatedImageIdRef.current === null) {
      lightboxAnimatedImageIdRef.current = currentImageId
      return
    }
    if (lightboxAnimatedImageIdRef.current === currentImageId) return
    lightboxAnimatedImageIdRef.current = currentImageId
    const frame = lightboxImageFrameRef.current
    if (!frame) return
    const offset = lightboxTransitionDirectionRef.current === 'next' ? 28 : -28
    frame.animate(
      [
        { opacity: 0.55, transform: `translateX(${offset}px) scale(0.985)` },
        { opacity: 1, transform: 'translateX(0) scale(1)' },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      }
    )
  }, [lightboxAsset])

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

  const createShareGalleryUrl = useCallback(async () => {
    if (shareCartIds.size === 0) {
      return ''
    }
    const sortedAssets = Array.from(shareCartIds)
      .map((id) => assets.find((asset) => asset.id === id))
      .filter((asset): asset is ProjectImageAsset => asset != null)
      .sort((a, b) => Number(b.isConsultation === true) - Number(a.isConsultation === true))

    const snapshots = sortedAssets.map(snapshotProjectImageAsset)
    if (snapshots.length === 0) {
      throw new Error('공유할 사진을 찾을 수 없습니다.')
    }

    const result = await createSharedGallery({
      items: snapshots,
      title: '선별 시공 사례',
      description: '담당자가 고른 시공 사례를 확인해 보세요.',
      source: 'image-asset-viewer',
    })
    return result.url
  }, [shareCartIds, assets])

  const copyShareLink = useCallback(async () => {
    if (shareCartIds.size === 0) {
      toast.error('공유할 사진을 먼저 선택하세요.')
      return
    }
    try {
      const shareGalleryUrl = await createShareGalleryUrl()
      await navigator.clipboard.writeText(shareGalleryUrl)
      toast.success('갤러리 링크가 클립보드에 복사되었습니다.')
      shareCartIds.forEach((id) => {
        const asset = assets.find((a) => a.id === id)
        if (asset?.sourceTable === 'image_assets') {
          incrementImageAssetShareCount(id)
            .then(() => updateInternalScoreForAsset(id))
            .catch(() => {})
        }
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
    }
  }, [createShareGalleryUrl, shareCartIds, assets])

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

  const setBeforeAfterRole = useCallback(
    async (asset: ProjectImageAsset, role: 'before' | 'after' | null) => {
      if (asset.sourceTable !== 'image_assets') return
      const groupId = role ? (getAssetSpaceId(asset) || (asset.projectTitle ?? '').trim() || asset.id) : null
      const { error } = await updateImageAssetBeforeAfter(asset.id, asset.metadata, { role, groupId })
      if (error) {
        toast.error('비포어/애프터 저장에 실패했습니다.')
        return
      }
      setAssets((prev) =>
        prev.map((a) =>
          a.id === asset.id
            ? {
                ...a,
                beforeAfterRole: role,
                beforeAfterGroupId: groupId,
                metadata: (() => {
                  const nextMeta = { ...(a.metadata ?? {}) }
                  if (role) {
                    nextMeta.before_after_role = role
                    nextMeta.before_after_group_id = groupId
                  } else {
                    delete nextMeta.before_after_role
                    delete nextMeta.before_after_group_id
                  }
                  return nextMeta
                })(),
              }
            : a
        )
      )
      if (!role) {
        toast.success('전후 비교 표시를 해제했습니다.')
        return
      }
      toast.success(role === 'before' ? '비포어로 표시했습니다.' : '애프터로 표시했습니다.')
    },
    []
  )

  const showBulkActions = !isBankView && reviewFilter === 'pending' && selectedIds.size > 0

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground">{pageTitle}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{pageDescription}</p>
            </div>
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
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/consultation">
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                <Users className="h-4 w-4" />
                상담 관리
              </Button>
            </Link>
            <Link to="/showroom">
              <Button type="button" variant="outline" className="h-9 gap-1.5 px-4 text-sm">
                <Images className="h-4 w-4" />
                시공사례 쇼룸
              </Button>
            </Link>
          </div>
        </div>
        {!isBankView && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] max-w-xl flex-1">
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
            <Link to="/image-assets/upload" className="ml-2">
              <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" title="EXIF·AI 제안·컬러칩 스마트 업로드 (image_assets)">
                <Upload className="h-4 w-4" />
                일괄 업로드
              </Button>
            </Link>
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
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                id="unmatched-only"
                checked={unmatchedOnlyFilter}
                onCheckedChange={(checked) => {
                  setUnmatchedOnlyFilter(checked)
                  setPage(0)
                }}
              />
              <label htmlFor="unmatched-only" className="text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
                미매칭 건만 보기
              </label>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/*
            숨김 처리:
            - 정렬 셀렉트(최신순 / AI 추천순 / 내부 스코어순 / 업종별 / 인기순)
            나중에 다시 사용할 수 있도록 코드만 주석으로 보존.
          */}
          {/*
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
          */}
          {/*
            숨김 처리:
            - 블로그용 Markdown 복사
            - Export JSON (n8n)
            나중에 다시 사용할 수 있도록 코드만 주석으로 보존.
          */}
          {/*
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyAllMarkdown}>
            <Copy className="h-3.5 w-3.5" />
            블로그용 Markdown 복사
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-9 text-sm" onClick={copyExportJson} title="n8n·Python 등에서 base_alt_text와 프롬프트 가이드 사용">
            <Copy className="h-3.5 w-3.5" />
            Export JSON (n8n)
          </Button>
          */}
          {!isBankView && isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 text-sm"
                title="기존 image_assets에 consultation_id · space_id · canonical_site_name · external_display_name을 백필합니다."
                disabled={spaceMigrationLoading}
                onClick={async () => {
                  setSpaceMigrationLoading(true)
                  try {
                    const result = await backfillImageAssetSpaceMetadata()
                    toast.success(
                      `스페이스 이관 완료: ${result.updated}건 갱신, 이름매칭 ${result.matchedByName}건, 미매칭 ${result.skippedUnmatched}건, 중복후보 ${result.skippedAmbiguous}건`
                    )
                    setSectorAssetCache({})
                    fetchFromDb(false).then((list) => setAssets(list))
                  } catch (e: any) {
                    toast.error(e?.message ?? '스페이스 이관 실패')
                  } finally {
                    setSpaceMigrationLoading(false)
                  }
                }}
              >
                {spaceMigrationLoading ? '이관 중…' : '스페이스/표시명 이관'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 text-sm"
                title="기존 image_assets에 broad_external_display_name을 일괄 백필합니다."
                disabled={spaceMigrationLoading}
                onClick={async () => {
                  setSpaceMigrationLoading(true)
                  try {
                    const result = await backfillImageAssetBroadExternalDisplayNames()
                    toast.success(`광역 익스터널 디스플레이 네임 백필 완료: ${result.updated}건 갱신`)
                    setSectorAssetCache({})
                    fetchFromDb(false).then((list) => setAssets(list))
                  } catch (e: any) {
                    toast.error(e?.message ?? '광역 익스터널 디스플레이 네임 백필 실패')
                  } finally {
                    setSpaceMigrationLoading(false)
                  }
                }}
              >
                {spaceMigrationLoading ? '백필 중…' : '광역 익스터널 표시명 백필'}
              </Button>
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
            </>
          )}
        </div>
        {/* 시공 사례 뱅크 전용 검색 */}
        {isBankView && (
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
          </div>
        )}
        {/*
          분리 안내 박스는 제거.
          이미지 자산 관리는 상단의 "사진 탐색·선별" 흐름으로 통합해 사용.
        */}
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
        {/*
          숨김 처리:
          - 검수 필터(전체 / 검수 대기 사진)
          나중에 다시 사용할 수 있도록 코드만 주석으로 보존.
        */}
        {/*
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
        */}
        {!isBankView && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sectorFilter ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                setSectorFilter(v)
                setPage(0)
              }}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">업종 선택</option>
              {distinctIndustries.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={siteFilter ?? ''}
              disabled={!sectorFilter}
              onChange={(e) => {
                setSiteFilter(e.target.value || null)
                setPage(0)
              }}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">현장 전체</option>
              {distinctSiteOptions.map((site) => (
                <option key={site.value} value={site.value}>{site.label}</option>
              ))}
            </select>
            <select
              value={productFilter ?? ''}
              disabled={!sectorFilter}
              onChange={(e) => {
                setProductFilter(e.target.value || null)
                setPage(0)
              }}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">제품 전체</option>
              {distinctProducts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={colorFilter ?? ''}
              disabled={!sectorFilter}
              onChange={(e) => {
                setColorFilter(e.target.value || null)
                setPage(0)
              }}
              className="rounded-md px-3 py-1.5 text-sm border border-input bg-background hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">색상 전체</option>
              {distinctColors.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="ml-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-sm"
                onClick={resetAllFilters}
                disabled={!hasActiveFilters}
              >
                필터 초기화
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* 시공 사례 뱅크: 공유용 장바구니 액션 바 */}
      {isBankView && shareCartIds.size > 0 && (
        <div className="sticky top-[var(--header-height,0)] z-30 border-b border-border bg-primary/10 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-foreground">{shareCartIds.size}장 선택 · 공유</span>
          <Button variant="default" size="sm" className="gap-1.5" onClick={copyShareLink}>
            <Link2 className="h-4 w-4" />
            {shareCartIds.size}장 공유 링크 복사
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              if (shareCartIds.size === 0) {
                toast.error('공유할 사진을 먼저 선택하세요.')
                return
              }
              try {
                const shareGalleryUrl = await createShareGalleryUrl()
                shareGalleryKakao(shareGalleryUrl, '시공 사례 갤러리', '파인드가구 시공 사례를 확인해 보세요.', () =>
                  toast.success('링크가 복사되었습니다. 카톡에 붙여 넣어 공유하세요.')
                )
              } catch (error) {
                toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
              }
            }}
          >
            카톡으로 공유
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShareCartIds(new Set())}>
            선택 해제
          </Button>
        </div>
      )}

      {showBulkActions && (
        <div className="sticky top-[var(--header-height,0)] z-30 border-b border-border bg-muted/80 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap">
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
          <div className="min-w-0">
            <span className="text-sm font-medium text-foreground">{shareCartIds.size}장의 사진 선택됨</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              이 링크는 고객이 로그인 없이 보는 선별 공유 페이지로 열립니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" className="gap-1.5" onClick={copyShareLink}>
              <Link2 className="h-4 w-4" />
              선별 공유 링크 복사
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                if (shareCartIds.size === 0) {
                  toast.error('공유할 사진을 먼저 선택하세요.')
                  return
                }
                try {
                  const shareGalleryUrl = await createShareGalleryUrl()
                  shareGalleryKakao(shareGalleryUrl, '선별 시공 사례', '담당자가 고른 시공 사례를 확인해 보세요.', () =>
                    toast.success('링크가 복사되었습니다. 카톡에 붙여 넣어 공유하세요.')
                  )
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
                }
              }}
            >
              카톡으로 공유
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (shareCartIds.size === 0) {
                  toast.error('공유할 사진을 먼저 선택하세요.')
                  return
                }
                try {
                  const shareGalleryUrl = await createShareGalleryUrl()
                  window.open(shareGalleryUrl, '_blank', 'noopener,noreferrer')
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : '공유 링크 생성에 실패했습니다.')
                }
              }}
            >
              미리보기
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShareCartIds(new Set())}>
              선택 해제
            </Button>
          </div>
        </div>
      )}

      <main className={`p-4 ${!isBankView && shareCartIds.size > 0 ? 'pb-24' : ''}`}>
        <div className={!isBankView ? 'min-w-0' : ''}>
        {/* 이미지 자산 관리: 갤러리 상단 타이틀 */}
        {!isBankView && !loading && (
          <h2 className="text-sm font-semibold text-foreground mb-4">
            {currentResultTitle}
          </h2>
        )}
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : !displayHasResults ? (
          <div className="py-16 text-center">
            {!isBankView && !sectorFilter ? (
              <p className="text-sm text-muted-foreground">업종을 먼저 선택하면 해당 업종의 전체 현장과 사진이 표시됩니다.</p>
            ) : assets.length === 0 ? (
              <>
                <p className="text-muted-foreground mb-4">새로운 상담 사진을 업로드해주세요</p>
                <Link to="/image-assets/upload">
                  <Button variant="default" size="sm" className="gap-2">
                    <Upload className="h-4 w-4" />
                    사진 업로드
                  </Button>
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">현재 필터 조건에 맞는 사진이 없습니다.</p>
            )}
          </div>
        ) : (isBankView ? bankDisplayGrouped : grouped) ? (
          <>
            {(isBankView ? bankDisplayGrouped : grouped)!.map((group) => {
              const groupKey = Array.isArray(group) ? group[0] : group.key
              const list = Array.isArray(group) ? group[1] : group.items
              const label = Array.isArray(group) ? group[0] : group.label
              return (
              <section
                key={groupKey}
                className="mb-8"
                data-site-key={groupKey}
              >
                <h2 className="text-sm font-semibold text-foreground mb-3 px-1 flex items-center gap-2">
                  <span className="rounded bg-muted px-2 py-0.5">{label}</span>
                  <span className="text-muted-foreground font-normal">({list.length}건)</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {list.map((asset) => {
                    return (
                    <div
                      key={asset.id}
                      data-asset-id={!isBankView ? asset.id : undefined}
                      className={`relative rounded-lg border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors ${
                        dropTargetId === asset.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                      }`}
                    >
                      {(isBankView || !isBankView) && (
                        <div
                          className="absolute top-1 left-1 z-[1] flex items-center justify-center w-6 h-6 rounded border bg-background/90"
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
                          className="absolute top-1 right-1 z-[1] flex items-center justify-center w-6 h-6 rounded border bg-background/90"
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
                      <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                        {asset.sourceTable === 'image_assets' && asset.beforeAfterRole && (
                          <span
                            className={`rounded text-[10px] px-1.5 py-0.5 text-white ${
                              asset.beforeAfterRole === 'before' ? 'bg-slate-700/90' : 'bg-emerald-600/90'
                            }`}
                            title={asset.beforeAfterGroupId ? `전후 비교 묶음: ${asset.beforeAfterGroupId}` : '전후 비교'}
                          >
                            {asset.beforeAfterRole === 'before' ? 'Before' : 'After'}
                          </span>
                        )}
                          {asset.sourceTable === 'image_assets' && asset.isConsultation && (
                            <span className="rounded bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5" title="상담용">
                              상담용
                            </span>
                          )}
                        {asset.isMain && (
                          <span className="rounded bg-amber-500 text-white text-[10px] px-1.5 py-0.5 font-bold" title="현장 대표 이미지">
                            대표
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
                              if (payload) pasteTagsToAsset(asset.id, asset.sourceTable, { productTags: Array.isArray(payload.productTags) ? payload.productTags : [], color: payload.color ?? null })
                            } catch {
                              if (dragPayload) pasteTagsToAsset(asset.id, asset.sourceTable, dragPayload)
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
                                <Button type="button" size="sm" className="h-6 text-xs flex-1" onClick={() => saveInlineTag(asset.id, asset.sourceTable, editingTagsText.split(',').map((s) => s.trim()).filter(Boolean), editingColor)}>
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
                          {asset.sourceTable === 'image_assets' && getAssetSpaceId(asset) && (
                            <div className="mt-1 text-[10px] text-muted-foreground px-1">
                              스페이스 ID: {getAssetSpaceId(asset)}
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
                              <Button
                                type="button"
                                variant={asset.beforeAfterRole === 'before' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-6 text-[10px] shrink-0"
                                onClick={(e) => { e.stopPropagation(); setBeforeAfterRole(asset, asset.beforeAfterRole === 'before' ? null : 'before') }}
                              >
                                비포어
                              </Button>
                              <Button
                                type="button"
                                variant={asset.beforeAfterRole === 'after' ? 'secondary' : 'outline'}
                                size="sm"
                                className="h-6 text-[10px] shrink-0"
                                onClick={(e) => { e.stopPropagation(); setBeforeAfterRole(asset, asset.beforeAfterRole === 'after' ? null : 'after') }}
                              >
                                애프터
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
                    )
                  })}
                </div>
              </section>
              )
            })}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {(isBankView ? bankDisplayPaginated : paginated).map((asset) => {
                return (
                <div
                  key={asset.id}
                  data-asset-id={!isBankView ? asset.id : undefined}
                  className={`relative rounded-lg border overflow-hidden bg-muted/30 hover:border-primary/50 hover:bg-muted/50 transition-colors ${
                    dropTargetId === asset.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'
                  }`}
                >
                  {(isBankView || !isBankView) && (
                    <div
                      className="absolute top-1 left-1 z-[1] flex items-center justify-center w-6 h-6 rounded border bg-background/90"
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
                      className="absolute top-1 right-1 z-[1] flex items-center justify-center w-6 h-6 rounded border bg-background/90"
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
                    <div className="absolute top-1 right-1 flex flex-col items-end gap-0.5">
                      {asset.sourceTable === 'image_assets' && asset.beforeAfterRole && (
                        <span
                          className={`rounded text-[10px] px-1.5 py-0.5 text-white ${
                            asset.beforeAfterRole === 'before' ? 'bg-slate-700/90' : 'bg-emerald-600/90'
                          }`}
                          title={asset.beforeAfterGroupId ? `전후 비교 묶음: ${asset.beforeAfterGroupId}` : '전후 비교'}
                        >
                          {asset.beforeAfterRole === 'before' ? 'Before' : 'After'}
                        </span>
                      )}
                      {asset.sourceTable === 'image_assets' && asset.isConsultation && (
                        <span className="rounded bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5" title="상담용">
                          상담용
                        </span>
                      )}
                      {asset.isMain && (
                        <span className="rounded bg-amber-500 text-white text-[10px] px-1.5 py-0.5 font-bold" title="현장 대표 이미지">
                          대표
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
                          if (payload) pasteTagsToAsset(asset.id, asset.sourceTable, { productTags: Array.isArray(payload.productTags) ? payload.productTags : [], color: payload.color ?? null })
                        } catch {
                          if (dragPayload) pasteTagsToAsset(asset.id, asset.sourceTable, dragPayload)
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
                            <Button type="button" size="sm" className="h-6 text-xs flex-1" onClick={() => saveInlineTag(asset.id, asset.sourceTable, editingTagsText.split(',').map((s) => s.trim()).filter(Boolean), editingColor)}>
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
                      {asset.sourceTable === 'image_assets' && getAssetSpaceId(asset) && (
                        <div className="mt-1 text-[10px] text-muted-foreground px-1">
                          스페이스 ID: {getAssetSpaceId(asset)}
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
                          <Button
                            type="button"
                            variant={asset.beforeAfterRole === 'before' ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] shrink-0"
                            onClick={(e) => { e.stopPropagation(); setBeforeAfterRole(asset, asset.beforeAfterRole === 'before' ? null : 'before') }}
                          >
                            비포어
                          </Button>
                          <Button
                            type="button"
                            variant={asset.beforeAfterRole === 'after' ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[10px] shrink-0"
                            onClick={(e) => { e.stopPropagation(); setBeforeAfterRole(asset, asset.beforeAfterRole === 'after' ? null : 'after') }}
                          >
                            애프터
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
                )
              })}
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
                      onClick={goToPreviousLightboxAsset}
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
                      onClick={goToNextLightboxAsset}
                      aria-label="다음 사진"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => { setLightboxAsset(null); setLightboxIndex(null) }}><X className="h-4 w-4" /></Button>
              </DialogHeader>
              <div
                className="flex-1 min-h-0 flex items-center justify-center p-4 bg-muted/30 relative"
                style={{ touchAction: 'pan-y' }}
              >
                {prevAsset && (
                  <button
                    type="button"
                    onClick={goToPreviousLightboxAsset}
                    className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-sm transition-colors hover:bg-black/70"
                    aria-label="이전 사진"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                <div
                  className="inline-block max-w-full cursor-grab active:cursor-grabbing"
                  onPointerDown={handleLightboxPointerDown}
                  onPointerUp={handleLightboxPointerUp}
                  onPointerCancel={handleLightboxPointerCancel}
                  style={{ touchAction: 'pan-y' }}
                  ref={lightboxImageFrameRef}
                >
                  <img
                    src={lightboxAsset.url}
                    alt={getBaseAltText(lightboxAsset)}
                    className="max-w-full max-h-[70vh] object-contain"
                    draggable={false}
                  />
                </div>
                {nextAsset && (
                  <button
                    type="button"
                    onClick={goToNextLightboxAsset}
                    className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-sm transition-colors hover:bg-black/70"
                    aria-label="다음 사진"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
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
                  {lightboxAsset.sourceTable === 'image_assets' && getAssetSpaceId(lightboxAsset) && (
                    <span>스페이스ID: {getAssetSpaceId(lightboxAsset)}</span>
                  )}
                  {lightboxAsset.sourceTable === 'image_assets' ? (
                    <>
                      <span className="flex items-center gap-2">
                        <span>지역:</span>
                        <Input
                          value={editingLocation}
                          onChange={(e) => setEditingLocation(e.target.value)}
                          placeholder="지역 입력"
                          className="h-8 w-36"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => saveImageAssetLocationInline(lightboxAsset.id)}
                        >
                          저장
                        </Button>
                      </span>
                      <span className="flex items-center gap-2">
                        <span>업종:</span>
                        <select
                          value={editingIndustry && SECTOR_OPTIONS.includes(editingIndustry as (typeof SECTOR_OPTIONS)[number]) ? editingIndustry : '기타'}
                          onChange={(e) => setEditingIndustry(e.target.value)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {SECTOR_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => saveImageAssetIndustryInline(lightboxAsset.id)}
                        >
                          저장
                        </Button>
                      </span>
                    </>
                  ) : (
                    lightboxAsset.industry && <span>업종: {lightboxAsset.industry}</span>
                  )}
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
