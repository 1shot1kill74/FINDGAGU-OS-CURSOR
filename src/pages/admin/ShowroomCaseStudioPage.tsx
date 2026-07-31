import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Download, Eye, Hash, Loader2, Send, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  collectConsultationImagesForSiteRow,
  fetchShowroomImageAssets,
  getShowroomImagePreviewUrl,
} from '@/lib/imageAssetService'
import {
  buildShowroomCaseCardNewsPackage,
  buildShowroomCaseN8nImageContext,
  buildShowroomCaseN8nPayload,
  formatShowroomAssetPickerLabel,
  getShowroomCasePublicDisplayName,
} from '@/lib/showroomCaseContentPackage'
import { requestDeployHookTrigger } from '@/lib/triggerVercelDeployHook'
import {
  buildNaverBlogPackage,
  downloadNaverPackageAsZip,
  type NaverBlogPackage,
} from '@/lib/naverBlogPackageBuilder'
import {
  buildCanonicalBlogPostFromN8nBlogResponse,
  repairCanonicalBlogBodyHtmlForPreview,
  renderCanonicalBlogPostHtml,
  type ShowroomCaseCanonicalBlogPost,
} from '@/lib/showroomCaseCanonicalBlog'
import {
  fetchShowroomCaseProfileDrafts,
  saveShowroomCaseCanonicalBlogPost,
  saveShowroomCaseGenerationState,
  saveShowroomCaseProfileDraft,
} from '@/lib/showroomCaseProfileService'
import { supabase } from '@/lib/supabase'
import {
  createIdleBriefReviewState,
  requestShowroomCaseBriefDraft,
  type ShowroomCaseBriefReviewState,
} from '@/lib/showroomCaseBriefDraft'
import type { CaseDraftSeedRow, CaseDraftState } from '@/pages/admin/showroomCaseStudio/showroomCaseStudioTypes'
import {
  buildStudioContentSeed,
  deriveStudioSeedFromSlides,
  formatGenerationTimestamp,
  getGenerationStatusLabel,
  getGenerationStatusTone,
  groupBeforeAfter,
  studioSlidesFromResponse,
} from '@/pages/admin/showroomCaseStudio/showroomCaseStudioUtils'
import { INDUSTRY_PREFERRED_ORDER } from '@/pages/showroom/showroomPageConstants'
import { getPrimaryIndustryLabel } from '@/pages/showroom/showroomPageGrouping'
import {
  BLOG_BATCH_MAX,
  BLOG_QUEUE_FILTERS,
  getBlogQueueStatus,
  mapPool,
  type BlogQueueFilter,
} from '@/pages/admin/showroomCaseStudio/showroomCaseStudioQueue'

function caseStudioIndustryChipClass(selected: boolean): string {
  return selected
    ? 'border-slate-900 bg-slate-900 text-white'
    : 'border-slate-200 bg-slate-50 text-slate-600'
}

export default function ShowroomCaseStudioPage() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [requestingKey, setRequestingKey] = useState<string | null>(null)
  const [rows, setRows] = useState<CaseDraftState[]>([])
  const [approvingBlogSite, setApprovingBlogSite] = useState<string | null>(null)
  const [briefDraftingSite, setBriefDraftingSite] = useState<string | null>(null)
  const [briefReviewBySite, setBriefReviewBySite] = useState<Record<string, ShowroomCaseBriefReviewState>>({})
  /** null = 전체. 케이스 카드 목록 업종 필터 */
  const [industryFilter, setIndustryFilter] = useState<string | null>(null)
  const [blogQueueFilter, setBlogQueueFilter] = useState<BlogQueueFilter>('all')
  const [selectedSiteNames, setSelectedSiteNames] = useState<string[]>([])
  const [batchBusy, setBatchBusy] = useState<null | 'brief' | 'blog'>(null)
  const [blogViewer, setBlogViewer] = useState<{ displayLabel: string; post: ShowroomCaseCanonicalBlogPost; html: string } | null>(null)
  const [naverPackageState, setNaverPackageState] = useState<{
    displayLabel: string
    siteName: string
    pkg: NaverBlogPackage
  } | null>(null)
  const [naverZipDownloading, setNaverZipDownloading] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const studioPanelRefs = useRef<Record<string, HTMLElement | null>>({})
  const lastAutoFocusKeyRef = useRef('')
  const focusedSiteName = searchParams.get('site')?.trim() ?? ''
  const focusedContent = searchParams.get('focus')?.trim() ?? ''


  function openNaverPackageDialog(row: CaseDraftState) {
    if (!row.canonicalBlogPost) {
      toast.error('아직 블로그 정본이 없습니다. 먼저 블로그 만들기를 진행해주세요.')
      return
    }
    if (!row.canonicalBlogPost.bodyMarkdown?.trim()) {
      toast.error('정본 본문(마크다운)이 비어 있어 네이버용으로 변환할 수 없습니다.')
      return
    }
    const displayLabel = getShowroomCasePublicDisplayName(deriveStudioSeedFromSlides(row))
    const pkg = buildNaverBlogPackage({
      post: row.canonicalBlogPost,
      displayLabel,
      industryLabel: row.industry || null,
      problemLabel: row.problemFrameLabel || null,
      solutionLabel: row.solutionFrameLabel || null,
    })
    setNaverPackageState({ displayLabel, siteName: row.siteName, pkg })
  }

  async function copyToClipboardSafely(text: string, label: string) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      toast.success(`${label} 복사 완료`)
    } catch (err) {
      console.warn('clipboard failed', err)
      toast.error(`${label} 복사 실패`)
    }
  }

  async function handleDownloadNaverZip() {
    if (!naverPackageState) return
    setNaverZipDownloading(true)
    try {
      const safeSite = naverPackageState.siteName.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'naver'
      const zipName = `naver_${safeSite}.zip`
      const result = await downloadNaverPackageAsZip(naverPackageState.pkg, zipName)
      if (result.skipped.length > 0) {
        toast.message(
          `이미지 ${result.downloaded}/${result.totalImages} 다운로드 완료. ${result.skipped.length}장은 권한/네트워크 문제로 건너뛰었습니다.`,
        )
      } else {
        toast.success(`이미지 ${result.downloaded}장과 본문이 zip으로 저장되었습니다.`)
      }
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'zip 다운로드에 실패했습니다.')
    } finally {
      setNaverZipDownloading(false)
    }
  }

  function buildBlogPreviewHtmlForRow(row: CaseDraftState): string {
    if (!row.canonicalBlogPost) return ''
    if (row.canonicalBlogPost.bodyMarkdown?.trim()) {
      return renderCanonicalBlogPostHtml(row.canonicalBlogPost)
    }
    const previewFigures = [
      ...row.canonicalBlogPost.images.map((img) => ({ url: img.url, alt: img.alt })),
      ...row.projectImages.map((img) => ({
        url: getShowroomImagePreviewUrl(img),
        alt: formatShowroomAssetPickerLabel(img),
      })),
    ]
    return repairCanonicalBlogBodyHtmlForPreview(row.canonicalBlogPost.bodyHtml, previewFigures)
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const assets = await fetchShowroomImageAssets()
        const groups = groupBeforeAfter(assets)
        const drafts = await fetchShowroomCaseProfileDrafts(groups.map((group) => group.siteName))
        const draftMap = new Map(drafts.map((draft) => [draft.siteName, draft]))
        const blogBackfillTargets: Array<{ siteName: string; post: ShowroomCaseCanonicalBlogPost }> = []

        const nextRows = groups.map((group) => {
          const saved = draftMap.get(group.siteName)
          const consultationDraft = saved?.consultationCardDraft
          const seedRow: CaseDraftSeedRow = {
            siteName: group.siteName,
            industry: group.industry,
            externalLabel: group.externalLabel,
            headlineHook: consultationDraft?.headlineHook ?? saved?.headlineHook ?? '',
            problemCode: consultationDraft?.problemCode ?? saved?.problemCode ?? '',
            solutionCode: consultationDraft?.solutionCode ?? saved?.solutionCode ?? '',
            problemFrameLabel: consultationDraft?.problemFrameLabel ?? saved?.problemFrameLabel ?? '',
            solutionFrameLabel: consultationDraft?.solutionFrameLabel ?? saved?.solutionFrameLabel ?? '',
            problemDetail: consultationDraft?.problemDetail ?? saved?.problemDetail ?? '',
            solutionDetail: consultationDraft?.solutionDetail ?? saved?.solutionDetail ?? '',
            evidencePoints: consultationDraft?.evidencePoints?.join('\n') ?? saved?.evidencePoints?.join('\n') ?? '',
            beforeUrl: group.before?.thumbnail_url || group.before?.cloudinary_url || '',
            afterUrl: group.after?.thumbnail_url || group.after?.cloudinary_url || '',
            projectImages: collectConsultationImagesForSiteRow(group.siteName, group.before ?? group.after, assets),
            cardNewsGeneration: saved?.cardNewsGeneration ?? {
              status: 'idle',
              requestedAt: null,
              completedAt: null,
              errorMessage: null,
              response: null,
            },
            blogGeneration: saved?.blogGeneration ?? {
              status: 'idle',
              requestedAt: null,
              completedAt: null,
              errorMessage: null,
              response: null,
            },
            cardNewsPublication: saved?.cardNewsPublication ?? {
              isPublished: false,
              publishedAt: null,
              slug: null,
              siteKey: group.siteName,
            },
            canonicalBlogPost: saved?.canonicalBlogPost ?? null,
          }
          if (
            saved?.canonicalBlogPost &&
            !saved.canonicalBlogPost.bodyMarkdown?.trim() &&
            seedRow.canonicalBlogPost?.bodyMarkdown?.trim()
          ) {
            blogBackfillTargets.push({
              siteName: seedRow.siteName,
              post: seedRow.canonicalBlogPost,
            })
          }
          const pkg = buildShowroomCaseCardNewsPackage(buildStudioContentSeed(seedRow))
          const projectImages = seedRow.projectImages
          const consultationDraftSlideResponse = consultationDraft
            ? {
                cardNews: {
                  master: {
                    slides: consultationDraft.cardNewsSlides.map((slide, index) => ({
                      slide: index + 1,
                      role: slide.key,
                      title: slide.title,
                      text: slide.body,
                      imageRef: slide.imageRef,
                      imageUrl: slide.imageUrl,
                    })),
                  },
                },
              }
            : null
          return {
            ...seedRow,
            cardNewsSlides: studioSlidesFromResponse(consultationDraftSlideResponse ?? saved?.cardNewsGeneration?.response ?? null, pkg, projectImages, {
              problemFrameLabel: seedRow.problemFrameLabel,
              solutionFrameLabel: seedRow.solutionFrameLabel,
            }),
          }
        })

        if (!cancelled) setRows(nextRows)
        if (blogBackfillTargets.length > 0) {
          void (async () => {
            for (const target of blogBackfillTargets) {
              const { error } = await saveShowroomCaseCanonicalBlogPost(target)
              if (error) {
                console.warn('canonical blog markdown backfill failed', target.siteName, error)
              }
            }
          })()
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : '케이스 작업실을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const focusKey = `${focusedSiteName}:${focusedContent}`
    if (!focusedSiteName || loading || rows.length === 0 || lastAutoFocusKeyRef.current === focusKey) return
    const section = sectionRefs.current[focusedSiteName]
    if (!section) return
    const wantsStudioPanel = focusedContent === 'blog'
    const panel = studioPanelRefs.current[focusedSiteName]
    const scrollTarget = wantsStudioPanel ? panel ?? section : section
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: wantsStudioPanel ? 'nearest' : 'start' })
    lastAutoFocusKeyRef.current = focusKey
  }, [focusedContent, focusedSiteName, loading, rows.length])

  const count = rows.length
  const showInitialLoader = loading && rows.length === 0

  const updateRow = (siteName: string, field: keyof CaseDraftState, value: string) => {
    setRows((prev) => prev.map((row) => (row.siteName === siteName ? { ...row, [field]: value } : row)))
    const briefFields: Array<keyof CaseDraftState> = [
      'problemDetail',
      'solutionDetail',
      'headlineHook',
      'evidencePoints',
    ]
    if (briefFields.includes(field)) {
      setBriefReviewBySite((prev) => {
        const current = prev[siteName]
        if (!current || current.status === 'idle') return prev
        if (current.status === 'draft') return prev
        return {
          ...prev,
          [siteName]: {
            ...current,
            status: 'draft',
          },
        }
      })
    }
  }

  const getBriefReview = (siteName: string): ShowroomCaseBriefReviewState =>
    briefReviewBySite[siteName] ?? createIdleBriefReviewState()

  const requestBriefDraftForRow = async (
    row: CaseDraftState,
    options?: { silent?: boolean; autoApprove?: boolean },
  ): Promise<boolean> => {
    if (!row.projectImages.length) {
      if (!options?.silent) toast.error('분석할 BA 이미지가 없습니다.')
      return false
    }
    setBriefDraftingSite(row.siteName)
    try {
      const draft = await requestShowroomCaseBriefDraft({
        siteName: row.siteName,
        displayName: getShowroomCasePublicDisplayName(deriveStudioSeedFromSlides(row)),
        industry: row.industry,
        projectImages: row.projectImages,
      })
      setRows((prev) =>
        prev.map((item) =>
          item.siteName === row.siteName
            ? {
                ...item,
                problemDetail: draft.problemDetail,
                solutionDetail: draft.solutionDetail,
                headlineHook: draft.headlineHook || item.headlineHook,
                evidencePoints: draft.evidencePoints.join('\n'),
              }
            : item
        )
      )
      setBriefReviewBySite((prev) => ({
        ...prev,
        [row.siteName]: {
          status: options?.autoApprove ? 'approved' : 'draft',
          confidence: draft.confidence,
          notes: draft.notes,
          uncertainClaims: draft.uncertainClaims,
          generatedAt: new Date().toISOString(),
        },
      }))
      if (!options?.silent) {
        toast.success(
          options?.autoApprove
            ? `AI 브리프 초안을 채우고 승인했습니다 (${draft.imageCount}장).`
            : `AI 브리프 초안을 채웠습니다 (${draft.imageCount}장 분석). 검토 후 승인해 주세요.`,
        )
      }
      return true
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : '브리프 초안 생성에 실패했습니다.')
      }
      return false
    } finally {
      setBriefDraftingSite(null)
    }
  }

  const approveBriefForRow = (siteName: string, options?: { silent?: boolean }) => {
    setBriefReviewBySite((prev) => {
      const current = prev[siteName] ?? createIdleBriefReviewState()
      return {
        ...prev,
        [siteName]: {
          ...current,
          status: 'approved',
        },
      }
    })
    if (!options?.silent) {
      toast.success('브리프를 승인했습니다. 이제 블로그 만들기를 진행할 수 있습니다.')
    }
  }

  const requestContentGeneration = async (params: {
    row: CaseDraftState
    payload: ReturnType<typeof buildShowroomCaseN8nPayload>
    silent?: boolean
  }): Promise<boolean> => {
    const requestKey = `${params.row.siteName}:blog`
    setRequestingKey(requestKey)

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error('로그인 세션을 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.')
      }

      setRows((prev) =>
        prev.map((row) =>
          row.siteName === params.row.siteName
            ? {
                ...row,
                blogGeneration: {
                  ...row.blogGeneration,
                  status: 'processing',
                  requestedAt: new Date().toISOString(),
                  completedAt: null,
                  errorMessage: null,
                },
              }
            : row
        )
      )
      {
        const { error } = await saveShowroomCaseGenerationState({
          siteName: params.row.siteName,
          channel: 'blog',
          status: 'processing',
        })
        if (error) throw error
      }

      const response = await fetch('/api/showroom-case-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          ...params.payload,
          channel: 'blog',
        }),
      })

      const rawText = await response.text()
      let parsed: unknown = null
      try {
        parsed = rawText ? JSON.parse(rawText) : null
      } catch {
        parsed = rawText
      }

      if (!response.ok) {
        const message =
          parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string'
            ? parsed.message
            : '블로그 생성 요청에 실패했습니다.'
        throw new Error(message)
      }

      {
        const { error } = await saveShowroomCaseGenerationState({
          siteName: params.row.siteName,
          channel: 'blog',
          status: 'completed',
          response: parsed,
        })
        if (error) throw error
      }

      const savedCanonicalBlog = buildCanonicalBlogPostFromN8nBlogResponse({
        siteName: params.row.siteName,
        n8nResponse: parsed,
        beforeImageUrl: params.row.beforeUrl,
        afterImageUrl: params.row.afterUrl,
        imageContext: buildShowroomCaseN8nImageContext(params.row.projectImages),
        existingCreatedAt: params.row.canonicalBlogPost?.createdAt ?? null,
      })
      if (savedCanonicalBlog) {
        const { error: canonError } = await saveShowroomCaseCanonicalBlogPost({
          siteName: params.row.siteName,
          post: savedCanonicalBlog,
        })
        if (canonError) {
          toast.warning(`블로그 정본 저장에 실패했습니다: ${canonError.message}`)
        }
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.siteName !== params.row.siteName) return row
          return {
            ...row,
            blogGeneration: {
              ...row.blogGeneration,
              status: 'completed',
              completedAt: new Date().toISOString(),
              errorMessage: null,
              response: parsed,
            },
            canonicalBlogPost: savedCanonicalBlog ?? row.canonicalBlogPost,
          }
        })
      )

      if (!params.silent) {
        toast.success('블로그 생성 요청을 보냈습니다.')
      }
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : '콘텐츠 생성 요청에 실패했습니다.'
      void saveShowroomCaseGenerationState({
        siteName: params.row.siteName,
        channel: 'blog',
        status: 'failed',
        errorMessage: message,
      })
      setRows((prev) =>
        prev.map((row) =>
          row.siteName === params.row.siteName
            ? {
                ...row,
                blogGeneration: {
                  ...row.blogGeneration,
                  status: 'failed',
                  completedAt: new Date().toISOString(),
                  errorMessage: message,
                },
              }
            : row
        )
      )
      if (!params.silent) {
        toast.error(error instanceof Error ? error.message : '콘텐츠 생성 요청에 실패했습니다.')
      }
      return false
    } finally {
      setRequestingKey(null)
    }
  }

  async function handleApproveCanonicalBlog(row: CaseDraftState) {
    if (!row.canonicalBlogPost) {
      toast.error('승인할 블로그 정본이 없습니다.')
      return
    }
    setApprovingBlogSite(row.siteName)
    try {
      const now = new Date().toISOString()
      const next: ShowroomCaseCanonicalBlogPost = {
        ...row.canonicalBlogPost,
        status: 'approved',
        scheduledAt: null,
        updatedAt: now,
        approvedAt: now,
        approvedBy: 'showroom-case-studio',
      }
      const { error } = await saveShowroomCaseCanonicalBlogPost({
        siteName: row.siteName,
        post: next,
      })
      if (error) throw error
      setRows((prev) =>
        prev.map((r) => (r.siteName === row.siteName ? { ...r, canonicalBlogPost: next } : r)),
      )
      requestDeployHookTrigger(`blog-approved:${row.siteName}`)
      toast.success('사례 블로그를 공개했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '승인 저장에 실패했습니다.')
    } finally {
      setApprovingBlogSite(null)
    }
  }

  const industryRows = useMemo(() => {
    if (!industryFilter) return rows
    return rows.filter((row) => {
      if (focusedSiteName && row.siteName === focusedSiteName) return true
      return getPrimaryIndustryLabel([row.industry]) === industryFilter
    })
  }, [focusedSiteName, industryFilter, rows])

  const queueCounts = useMemo(() => {
    const counts: Record<BlogQueueFilter, number> = {
      all: industryRows.length,
      missing: 0,
      draft: 0,
      approved: 0,
    }
    for (const row of industryRows) {
      counts[getBlogQueueStatus(row)] += 1
    }
    return counts
  }, [industryRows])

  const cards = useMemo(() => {
    return industryRows.filter((row) => {
      if (focusedSiteName && row.siteName === focusedSiteName) return true
      if (blogQueueFilter === 'all') return true
      return getBlogQueueStatus(row) === blogQueueFilter
    })
  }, [blogQueueFilter, focusedSiteName, industryRows])

  const selectedRows = useMemo(() => {
    const selected = new Set(selectedSiteNames)
    return cards.filter((row) => selected.has(row.siteName)).slice(0, BLOG_BATCH_MAX)
  }, [cards, selectedSiteNames])

  const toggleSiteSelected = (siteName: string) => {
    setSelectedSiteNames((prev) =>
      prev.includes(siteName) ? prev.filter((name) => name !== siteName) : [...prev, siteName],
    )
  }

  const toggleSelectVisible = () => {
    const visibleNames = cards.slice(0, BLOG_BATCH_MAX).map((row) => row.siteName)
    const allSelected = visibleNames.every((name) => selectedSiteNames.includes(name))
    setSelectedSiteNames(allSelected ? [] : visibleNames)
  }

  const runBatchBriefDraft = async () => {
    if (selectedRows.length === 0) {
      toast.message('배치할 케이스를 선택해 주세요.')
      return
    }
    setBatchBusy('brief')
    let ok = 0
    let failed = 0
    try {
      await mapPool(selectedRows, 2, async (row) => {
        const success = await requestBriefDraftForRow(row, { silent: true, autoApprove: true })
        if (success) ok += 1
        else failed += 1
      })
      toast.success(`브리프 초안 ${ok}건 완료${failed ? ` · 실패 ${failed}` : ''} (일괄 승인됨)`)
    } finally {
      setBatchBusy(null)
    }
  }

  const runBatchBlogGenerate = async () => {
    if (selectedRows.length === 0) {
      toast.message('배치할 케이스를 선택해 주세요.')
      return
    }
    setBatchBusy('blog')
    let ok = 0
    let failed = 0
    try {
      // 최신 브리프 텍스트를 쓰기 위해 rows 스냅샷을 다시 읽음
      const latestByName = new Map(rows.map((row) => [row.siteName, row]))
      for (const selected of selectedRows) {
        const row = latestByName.get(selected.siteName) ?? selected
        approveBriefForRow(row.siteName, { silent: true })
        const generationSeed = deriveStudioSeedFromSlides(row)
        const payload = buildShowroomCaseN8nPayload(generationSeed, {
          cardNewsPackage: buildShowroomCaseCardNewsPackage(deriveStudioSeedFromSlides(row)),
          projectImages: row.projectImages,
        })
        const success = await requestContentGeneration({
          row,
          payload,
          silent: true,
        })
        if (success) ok += 1
        else failed += 1
      }
      toast.success(`블로그 초안 ${ok}건 생성${failed ? ` · 실패 ${failed}` : ''}`)
    } finally {
      setBatchBusy(null)
    }
  }

  if (showInitialLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          비포어/애프터 케이스 작업실을 불러오는 중...
        </div>
      </div>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      {loading ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          케이스 목록을 갱신하는 중…
        </div>
      ) : null}
      <section className="mb-8 rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Case Content Studio</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">비포어/애프터 케이스 작업실</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          BA 사례를 초안 만든 뒤 바로 공개합니다. 목표는 정독 글이 아니라{' '}
          <span className="font-medium text-slate-800">“정리된 회사” 에비던스 URL</span>을 쌓는 것입니다.
        </p>
        <div className="mt-4">
          <Link to="/dashboard">
            <Button type="button" variant="outline" className="gap-2">
              대시보드
            </Button>
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIndustryFilter(null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${caseStudioIndustryChipClass(!industryFilter)}`}
          >
            업종 전체
          </button>
          {INDUSTRY_PREFERRED_ORDER.map((industry) => (
            <button
              key={`case-studio-industry-${industry}`}
              type="button"
              onClick={() => setIndustryFilter(industry)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${caseStudioIndustryChipClass(industryFilter === industry)}`}
            >
              {industry}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {BLOG_QUEUE_FILTERS.map((filter) => (
            <button
              key={`case-studio-queue-${filter.id}`}
              type="button"
              onClick={() => setBlogQueueFilter(filter.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${caseStudioIndustryChipClass(blogQueueFilter === filter.id)}`}
            >
              {filter.label}
              <span className="ml-1 opacity-70">{queueCounts[filter.id]}</span>
            </button>
          ))}
          <span className="text-xs text-slate-500">
            표시 {cards.length} / 업종 {industryRows.length} / 전체 {count}
          </span>
        </div>
        <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={toggleSelectVisible}>
              표시분 선택(최대 {BLOG_BATCH_MAX})
            </Button>
            <span className="text-xs text-slate-600">선택 {selectedRows.length}건</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={Boolean(batchBusy) || selectedRows.length === 0}
              onClick={() => void runBatchBriefDraft()}
            >
              {batchBusy === 'brief' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              선택 브리프 초안
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={Boolean(batchBusy) || selectedRows.length === 0}
              onClick={() => void runBatchBlogGenerate()}
            >
              {batchBusy === 'blog' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              선택 블로그 만들기
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={blogViewer !== null} onOpenChange={(open) => !open && setBlogViewer(null)}>
        <DialogContent className="flex max-h-[min(92vh,880px)] w-[min(100vw-1.5rem,42rem)] flex-col gap-0 overflow-hidden border-0 p-0 shadow-xl sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">블로그 화면 미리보기</DialogTitle>
            <p className="mt-1 text-xs text-slate-500">
              {blogViewer?.displayLabel ? (
                <>
                  <span className="font-medium text-slate-700">{blogViewer.displayLabel}</span>
                  <span className="text-slate-400"> · </span>
                </>
              ) : null}
              승인 후 공개 사례 페이지와 비슷한 레이아웃으로 봅니다. (이미지·본문 모두 포함)
            </p>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-slate-100/90 to-slate-50 px-4 py-6 sm:px-6">
            {blogViewer ? (
              <article className="mx-auto max-w-prose rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-10">
                <header className="border-b border-slate-100 pb-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">쇼룸 사례 블로그</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.65rem] sm:leading-snug">
                    {blogViewer.post.seo.title}
                  </h1>
                  {blogViewer.post.structured?.featuredAnswer ? (
                    <p className="mt-4 text-sm leading-relaxed text-slate-600">{blogViewer.post.structured.featuredAnswer}</p>
                  ) : null}
                </header>
                <div
                  className="showroom-canonical-blog-viewer mt-8 max-w-none text-[15px] leading-[1.7] text-slate-800 [&_article]:max-w-none [&_figure]:my-6 [&_figure]:mx-auto [&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_img]:max-h-[min(28rem,70vh)] [&_img]:w-full [&_img]:rounded-xl [&_img]:object-cover [&_p]:mb-4 [&_p]:leading-[1.7]"
                  dangerouslySetInnerHTML={{ __html: blogViewer.html }}
                />
              </article>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={naverPackageState !== null} onOpenChange={(open) => !open && setNaverPackageState(null)}>
        <DialogContent className="flex max-h-[min(92vh,900px)] w-[min(100vw-1.5rem,52rem)] flex-col gap-0 overflow-hidden border-0 p-0 shadow-xl sm:max-w-3xl">
          <DialogHeader className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-4 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">네이버 블로그 발행 패키지</DialogTitle>
            <p className="mt-1 text-xs text-slate-500">
              {naverPackageState?.displayLabel ? (
                <>
                  <span className="font-medium text-slate-700">{naverPackageState.displayLabel}</span>
                  <span className="text-slate-400"> · </span>
                </>
              ) : null}
              본문·해시태그·사진을 한 번에 챙겨서 네이버 에디터에 붙여 넣기만 하면 끝입니다. 본문 끝에는 자가 사이트 사례 페이지로의 백링크가 자동 포함됩니다.
            </p>
          </DialogHeader>
          {naverPackageState ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_320px]">
              <div className="min-h-0 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-slate-800">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void copyToClipboardSafely(naverPackageState.pkg.bodyHtml, '네이버 본문 HTML')}
                  >
                    <Copy className="h-4 w-4" /> HTML 복사
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void copyToClipboardSafely(naverPackageState.pkg.bodyMarkdown, '네이버 본문 마크다운')}
                  >
                    <Copy className="h-4 w-4" /> 마크다운 복사
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => void copyToClipboardSafely(naverPackageState.pkg.hashtags.join(' '), '해시태그')}
                  >
                    <Hash className="h-4 w-4" /> 해시태그 복사
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={naverZipDownloading}
                    onClick={() => void handleDownloadNaverZip()}
                  >
                    {naverZipDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    이미지+본문 zip 다운로드
                  </Button>
                </div>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">제목 후보</p>
                  <ul className="mt-2 space-y-1.5">
                    {naverPackageState.pkg.titleCandidates.map((t) => (
                      <li key={t} className="flex items-start justify-between gap-3">
                        <span className="text-sm text-slate-800">{t}</span>
                        <button
                          type="button"
                          className="shrink-0 text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
                          onClick={() => void copyToClipboardSafely(t, '제목')}
                        >
                          복사
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">본문 미리보기 (HTML 렌더링)</p>
                  <div
                    className="mt-3 max-w-none text-[15px] leading-[1.7] text-slate-800 [&_blockquote]:my-3 [&_h1]:mb-3 [&_h1]:mt-0 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold [&_p]:mb-3"
                    dangerouslySetInnerHTML={{ __html: naverPackageState.pkg.bodyHtml }}
                  />
                </section>

                <section className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">이미지 (zip에 같은 순서로 들어갑니다)</p>
                  <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {naverPackageState.pkg.images.map((img) => (
                      <li key={`${img.index}-${img.url}`} className="overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        <div className="relative aspect-[4/3] bg-slate-200">
                          <img src={img.url} alt={img.alt} className="h-full w-full object-cover" loading="lazy" />
                          <span
                            className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white ${
                              img.label === 'before' ? 'bg-slate-900/80' : img.label === 'after' ? 'bg-emerald-700/85' : 'bg-slate-700/80'
                            }`}
                          >
                            {img.label === 'before' ? `Before · [이미지 ${img.index}]` : img.label === 'after' ? `After · [이미지 ${img.index}]` : `[이미지 ${img.index}]`}
                          </span>
                        </div>
                        <p className="px-2 py-1.5 text-[11px] text-slate-600">{img.filename}</p>
                      </li>
                    ))}
                  </ul>
                  {naverPackageState.pkg.images.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">정본에 이미지가 없습니다. 이미지 없이 본문만 발행하거나, 정본을 다시 만들어주세요.</p>
                  ) : null}
                </section>
              </div>

              <aside className="border-t border-slate-200 bg-slate-50 px-5 py-5 text-xs text-slate-700 md:max-h-full md:overflow-y-auto md:border-l md:border-t-0">
                <div className="mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">백링크 (본문 끝에 자동 포함)</p>
                  <a
                    href={naverPackageState.pkg.canonicalSourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block break-all text-[12px] font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {naverPackageState.pkg.canonicalSourceUrl}
                  </a>
                </div>
                <div className="mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">추천 해시태그</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {naverPackageState.pkg.hashtags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-slate-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">발행 체크리스트</p>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[12px] leading-relaxed text-slate-700">
                    {naverPackageState.pkg.publishingChecklist.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </div>
              </aside>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {cards.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            이 필터에 해당하는 케이스가 없습니다. 업종·발행 상태 칩을 바꿔 보세요.
          </p>
        ) : null}
        {cards.map((row) => (
          <section
            key={row.siteName}
            ref={(node) => {
              sectionRefs.current[row.siteName] = node
            }}
            className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${
              focusedSiteName === row.siteName ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-2">
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={selectedSiteNames.includes(row.siteName)}
                  onChange={() => toggleSiteSelected(row.siteName)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                배치 선택 · {{
                  missing: '미제작',
                  draft: '초안',
                  approved: '공개',
                }[getBlogQueueStatus(row)]}
              </label>
            </div>
            <div className="grid gap-0 lg:grid-cols-[340px_1fr]">
              <div className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-2">
                  <div className="relative aspect-[4/3] bg-slate-200">
                    {row.beforeUrl ? <img src={row.beforeUrl} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[11px] font-semibold text-white">Before</span>
                  </div>
                  <div className="relative aspect-[4/3] bg-slate-200">
                    {row.afterUrl ? <img src={row.afterUrl} alt="" className="h-full w-full object-cover" /> : null}
                    <span className="absolute left-2 top-2 rounded-full bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">After</span>
                  </div>
                </div>
                <div className="px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">현장명</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{row.siteName}</h2>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">업종</p>
                  <p className="mt-1 text-sm text-slate-500">{row.industry}</p>
                </div>
              </div>

              <div className="p-4 md:p-5">
                {(() => {
                  const projectImages = row.projectImages ?? []
                  const generationSeed = deriveStudioSeedFromSlides(row)
                  const blogGenerationPayload = buildShowroomCaseN8nPayload(generationSeed, {
                    cardNewsPackage: buildShowroomCaseCardNewsPackage(generationSeed),
                    projectImages,
                  })
                  const briefReview = getBriefReview(row.siteName)
                  const blogBlockedByBriefDraft = briefReview.status === 'draft'
                  return (
                    <div className="grid gap-3">
                      <div
                        ref={(node) => {
                          studioPanelRefs.current[row.siteName] = node
                        }}
                        className={`rounded-2xl border bg-white p-4 md:p-5 ${
                          focusedSiteName === row.siteName && focusedContent === 'blog'
                            ? 'border-emerald-400 ring-2 ring-emerald-100'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">LLM·n8n 자동 작성</p>
                            <p className="mt-1 text-sm text-slate-500">
                              BA 사진으로 AI 브리프 초안을 받은 뒤 검토·승인하면, 아래 브리프로 블로그를 만듭니다. 이미지·현장 메타는 함께 실립니다.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full px-2.5 py-1 font-medium ${getGenerationStatusTone(row.blogGeneration.status)}`}>
                                블로그 제작 {getGenerationStatusLabel(row.blogGeneration.status)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${
                                row.canonicalBlogPost?.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                블로그{' '}
                                {row.canonicalBlogPost?.status === 'approved'
                                  ? '공개'
                                  : row.canonicalBlogPost
                                    ? '초안'
                                    : '미제작'}
                              </span>
                            </div>
                            {row.blogGeneration.errorMessage ? (
                              <p className="mt-2 text-xs text-rose-600">
                                {row.blogGeneration.errorMessage}
                              </p>
                            ) : null}
                            {row.blogGeneration.completedAt ? (
                              <p className="mt-2 text-xs text-slate-500">
                                블로그 {formatGenerationTimestamp(row.blogGeneration.completedAt)}
                              </p>
                            ) : null}
                            {row.canonicalBlogPost?.status === 'approved' && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                                <span>사례 블로그 공개 링크 준비됨</span>
                                <Link
                                  to={`/public/showroom/case/${encodeURIComponent(row.siteName)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium underline underline-offset-2"
                                >
                                  블로그 열기
                                </Link>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={requestingKey === `${row.siteName}:blog` || blogBlockedByBriefDraft}
                              title={
                                blogBlockedByBriefDraft
                                  ? 'AI 브리프 초안을 검토한 뒤 「브리프 승인」을 눌러 주세요.'
                                  : undefined
                              }
                              onClick={() => {
                                if (blogBlockedByBriefDraft) {
                                  toast.message('AI 브리프 초안을 검토한 뒤 「브리프 승인」을 먼저 눌러 주세요.')
                                  return
                                }
                                void requestContentGeneration({
                                  row,
                                  payload: blogGenerationPayload,
                                })
                              }}
                            >
                              {requestingKey === `${row.siteName}:blog` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              블로그 만들기
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={!row.canonicalBlogPost}
                              onClick={() => {
                                if (!row.canonicalBlogPost) return
                                setBlogViewer({
                                  displayLabel: getShowroomCasePublicDisplayName(deriveStudioSeedFromSlides(row)),
                                  post: row.canonicalBlogPost,
                                  html: buildBlogPreviewHtmlForRow(row),
                                })
                              }}
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                              블로그 확인
                            </Button>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="gap-2"
                              disabled={
                                !row.canonicalBlogPost
                                || row.canonicalBlogPost.status === 'approved'
                                || approvingBlogSite === row.siteName
                              }
                              onClick={() => void handleApproveCanonicalBlog(row)}
                            >
                              {approvingBlogSite === row.siteName ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              지금 발행
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={!row.canonicalBlogPost?.bodyMarkdown?.trim()}
                              onClick={() => openNaverPackageDialog(row)}
                              title="네이버 블로그에 수기 발행할 본문/이미지/해시태그 패키지를 만듭니다."
                            >
                              <Send className="h-4 w-4" aria-hidden />
                              네이버 패키지
                            </Button>
                          </div>
                        </div>

                        <div className="mb-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 md:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">자동 작성용 브리프</p>
                              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                BA 사진을 AI가 읽고 초안을 채웁니다. 수정·승인 후에만 블로그 만들기가 열립니다. 직접 입력만 한 경우에는 승인 없이 진행할 수 있습니다.
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 border-emerald-300 bg-white"
                                disabled={briefDraftingSite === row.siteName || !row.projectImages.length}
                                onClick={() => void requestBriefDraftForRow(row)}
                              >
                                {briefDraftingSite === row.siteName ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Sparkles className="h-4 w-4" aria-hidden />
                                )}
                                사진으로 브리프 초안
                              </Button>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                disabled={briefReview.status !== 'draft'}
                                onClick={() => approveBriefForRow(row.siteName)}
                              >
                                브리프 승인
                              </Button>
                            </div>
                          </div>
                          {briefReview.status !== 'idle' ? (
                            <div
                              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                                briefReview.status === 'approved'
                                  ? 'border-emerald-300 bg-emerald-100/70 text-emerald-900'
                                  : 'border-amber-300 bg-amber-50 text-amber-950'
                              }`}
                            >
                              <p className="font-medium">
                                {briefReview.status === 'approved'
                                  ? '브리프 승인됨 · 블로그 만들기 가능'
                                  : 'AI 초안 · 검토 후 「브리프 승인」 필요'}
                                {briefReview.confidence ? ` · 신뢰도 ${briefReview.confidence}` : ''}
                              </p>
                              {briefReview.notes ? <p className="mt-1 opacity-90">{briefReview.notes}</p> : null}
                              {briefReview.uncertainClaims.length > 0 ? (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 opacity-90">
                                  {briefReview.uncertainClaims.map((claim) => (
                                    <li key={claim}>추정: {claim}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          ) : null}
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="text-xs font-medium text-slate-800" htmlFor={`brief-problem-${row.siteName}`}>
                                현장 핵심 문제 / 과제
                              </label>
                              <textarea
                                id={`brief-problem-${row.siteName}`}
                                value={row.problemDetail}
                                onChange={(event) => updateRow(row.siteName, 'problemDetail', event.target.value)}
                                rows={4}
                                placeholder="예: 동선 혼잡·수납 부족 등 가장 시급했던 점 (사실 중심)"
                                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-slate-800" htmlFor={`brief-solution-${row.siteName}`}>
                                우리의 해결 / 접근 (사실만)
                              </label>
                              <textarea
                                id={`brief-solution-${row.siteName}`}
                                value={row.solutionDetail}
                                onChange={(event) => updateRow(row.siteName, 'solutionDetail', event.target.value)}
                                rows={4}
                                placeholder="예: 어떤 제품·구성으로 어떻게 풀었는지 요지만"
                                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-800" htmlFor={`brief-hook-${row.siteName}`}>
                              한 줄 훅 (선택)
                            </label>
                            <input
                              id={`brief-hook-${row.siteName}`}
                              value={row.headlineHook}
                              onChange={(event) => updateRow(row.siteName, 'headlineHook', event.target.value)}
                              placeholder="비우면 브리프 내용 기반으로 자동 제안"
                              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-slate-800" htmlFor={`brief-evidence-${row.siteName}`}>
                              변화·근거 포인트 (줄바꿈으로 구분, 선택)
                            </label>
                            <textarea
                              id={`brief-evidence-${row.siteName}`}
                              value={row.evidencePoints}
                              onChange={(event) => updateRow(row.siteName, 'evidencePoints', event.target.value)}
                              rows={3}
                              placeholder={'실측 기반 재배치\n교사 피드백 반영'}
                              className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-800 shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
