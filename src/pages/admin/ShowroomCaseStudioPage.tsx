import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Copy, Download, Eye, Hash, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  collectConsultationImagesForSiteRow,
  fetchShowroomImageAssets,
  getShowroomImagePreviewUrl,
  type ShowroomImageAsset,
} from '@/lib/imageAssetService'
import type {
  CardNewsSlideImageRef,
  ShowroomCaseCardNewsPackage,
  ShowroomCaseCardNewsSlide,
} from '@/lib/showroomCaseContentPackage'
import {
  buildDefaultCardNewsImageRefs,
  buildLocalCardNewsMasterResponse,
  buildShowroomAssetUrlByIdMap,
  buildShowroomCaseCardNewsPackage,
  buildShowroomCaseN8nImageContext,
  buildShowroomCaseN8nPayload,
  formatShowroomCardTextForDisplay,
  formatShowroomAssetPickerLabel,
  getShowroomCasePublicDisplayName,
  makeCardNewsAssetImageRef,
  resolveCardNewsSlideImageUrl,
} from '@/lib/showroomCaseContentPackage'
import {
  createFrameTemplateId,
  loadShowroomCaseFrameTemplates,
  saveShowroomCaseFrameTemplates,
  type ShowroomCaseFrameTemplate,
} from '@/lib/showroomCaseFrameTemplates'
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
  saveShowroomCaseCardNewsPublication,
  saveShowroomCaseGenerationState,
  saveShowroomCaseProfileDraft,
  type ShowroomCaseCardNewsPublication,
  type ShowroomCaseProfileDraft,
} from '@/lib/showroomCaseProfileService'
import { SLIDE_KEY_OPTIONS } from '@/pages/admin/showroomCaseStudio/showroomCaseStudioConstants'
import type { CaseDraftSeedRow, CaseDraftState, FrameTemplateEditorState, StudioCardNewsSlide } from '@/pages/admin/showroomCaseStudio/showroomCaseStudioTypes'
import {
  buildPublicCardNewsPath,
  buildStudioContentSeed,
  buildTemplatedStudioSlides,
  deriveStudioSeedFromSlides,
  formatGenerationTimestamp,
  getGenerationStatusLabel,
  getGenerationStatusTone,
  groupBeforeAfter,
  studioRowToCardPackage,
  studioSlidesFromResponse,
} from '@/pages/admin/showroomCaseStudio/showroomCaseStudioUtils'

export default function ShowroomCaseStudioPage() {
  const showroomCaseContentWebhookUrl = (import.meta.env.VITE_SHOWROOM_CASE_CONTENT_WEBHOOK_URL as string | undefined)?.trim() ?? ''
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [publicationSavingId, setPublicationSavingId] = useState<string | null>(null)
  const [requestingKey, setRequestingKey] = useState<string | null>(null)
  const [studioDrag, setStudioDrag] = useState<{ siteName: string; index: number } | null>(null)
  const [previewSiteName, setPreviewSiteName] = useState<string | null>(null)
  const [previewSlideIndex, setPreviewSlideIndex] = useState(0)
  const [problemTemplates, setProblemTemplates] = useState<ShowroomCaseFrameTemplate[]>([])
  const [specificProblemTemplates, setSpecificProblemTemplates] = useState<ShowroomCaseFrameTemplate[]>([])
  const [solutionTemplates, setSolutionTemplates] = useState<ShowroomCaseFrameTemplate[]>([])
  const [evidenceTemplates, setEvidenceTemplates] = useState<ShowroomCaseFrameTemplate[]>([])
  const [templateManagerOpen, setTemplateManagerOpen] = useState(false)
  const [problemTemplateDrafts, setProblemTemplateDrafts] = useState<FrameTemplateEditorState[]>([])
  const [specificProblemTemplateDrafts, setSpecificProblemTemplateDrafts] = useState<FrameTemplateEditorState[]>([])
  const [solutionTemplateDrafts, setSolutionTemplateDrafts] = useState<FrameTemplateEditorState[]>([])
  const [evidenceTemplateDrafts, setEvidenceTemplateDrafts] = useState<FrameTemplateEditorState[]>([])
  const [rows, setRows] = useState<CaseDraftState[]>([])
  const [cardEditorOpenBySite, setCardEditorOpenBySite] = useState<Record<string, boolean>>({})
  const [approvingBlogSite, setApprovingBlogSite] = useState<string | null>(null)
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

  useEffect(() => {
    setProblemTemplates(loadShowroomCaseFrameTemplates('problem'))
    setSpecificProblemTemplates(loadShowroomCaseFrameTemplates('specific-problem'))
    setSolutionTemplates(loadShowroomCaseFrameTemplates('solution'))
    setEvidenceTemplates(loadShowroomCaseFrameTemplates('evidence'))
  }, [])

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
    const wantsStudioPanel = focusedContent === 'cardnews' || focusedContent === 'blog'
    const panel = studioPanelRefs.current[focusedSiteName]
    const scrollTarget = wantsStudioPanel ? panel ?? section : section
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: wantsStudioPanel ? 'nearest' : 'start' })
    lastAutoFocusKeyRef.current = focusKey
  }, [focusedContent, focusedSiteName, loading, rows.length])

  const count = rows.length

  const updateRow = (siteName: string, field: keyof CaseDraftState, value: string) => {
    setRows((prev) => prev.map((row) => (row.siteName === siteName ? { ...row, [field]: value } : row)))
  }

  const patchCardNewsSlide = (
    siteName: string,
    slideId: string,
    partial: Partial<Pick<StudioCardNewsSlide, 'title' | 'body' | 'imageRef' | 'key' | 'imageUrl'>>,
  ) => {
    setRows((prev) =>
      prev.map((row) =>
        row.siteName !== siteName
          ? row
          : {
              ...row,
              cardNewsSlides: row.cardNewsSlides.map((s) =>
                s.id === slideId
                  ? {
                      ...s,
                      ...partial,
                      ...(partial.imageRef !== undefined ? { imageUrl: undefined } : {}),
                    }
                  : s
              ),
            }
      )
    )
  }

  const applyFrameTemplateToSlide = (
    siteName: string,
    key: 'problem' | 'specific-problem' | 'solution',
    template: { label: string; body: string },
  ) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        return {
          ...row,
          ...(key === 'problem'
            ? {
                problemFrameLabel: template.label,
                problemDetail: template.body,
              }
            : key === 'specific-problem'
              ? {
                  problemDetail: template.body,
                }
            : {
                solutionFrameLabel: template.label,
                solutionDetail: template.body,
              }),
          cardNewsSlides: row.cardNewsSlides.map((slide) =>
            slide.key !== key
              ? slide
              : {
                  ...slide,
                  title: template.label,
                  body: template.body,
                }
          ),
        }
      })
    )
  }

  const openTemplateManager = () => {
    setProblemTemplateDrafts(problemTemplates.map((item) => ({ ...item })))
    setSpecificProblemTemplateDrafts(specificProblemTemplates.map((item) => ({ ...item })))
    setSolutionTemplateDrafts(solutionTemplates.map((item) => ({ ...item })))
    setEvidenceTemplateDrafts(evidenceTemplates.map((item) => ({ ...item })))
    setTemplateManagerOpen(true)
  }

  const patchTemplateDraft = (
    type: 'problem' | 'specific-problem' | 'solution' | 'evidence',
    id: string,
    field: 'label' | 'body',
    value: string,
  ) => {
    const setter =
      type === 'problem'
        ? setProblemTemplateDrafts
        : type === 'specific-problem'
          ? setSpecificProblemTemplateDrafts
        : type === 'solution'
          ? setSolutionTemplateDrafts
          : setEvidenceTemplateDrafts
    setter((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }

  const addTemplateDraft = (type: 'problem' | 'specific-problem' | 'solution' | 'evidence') => {
    const setter =
      type === 'problem'
        ? setProblemTemplateDrafts
        : type === 'specific-problem'
          ? setSpecificProblemTemplateDrafts
        : type === 'solution'
          ? setSolutionTemplateDrafts
          : setEvidenceTemplateDrafts
    setter((prev) => [...prev, { id: createFrameTemplateId(type), label: '', body: '' }])
  }

  const removeTemplateDraft = (type: 'problem' | 'specific-problem' | 'solution' | 'evidence', id: string) => {
    const setter =
      type === 'problem'
        ? setProblemTemplateDrafts
        : type === 'specific-problem'
          ? setSpecificProblemTemplateDrafts
        : type === 'solution'
          ? setSolutionTemplateDrafts
          : setEvidenceTemplateDrafts
    setter((prev) => prev.filter((item) => item.id !== id))
  }

  const saveTemplateManager = () => {
    const normalize = (items: FrameTemplateEditorState[]) =>
      items
        .map((item) => ({
          id: item.id.trim(),
          label: item.label.trim(),
          body: item.body.trim(),
        }))
        .filter((item) => item.id && item.label)

    const nextProblem = normalize(problemTemplateDrafts)
    const nextSpecificProblem = normalize(specificProblemTemplateDrafts)
    const nextSolution = normalize(solutionTemplateDrafts)
    const nextEvidence = normalize(evidenceTemplateDrafts)
    saveShowroomCaseFrameTemplates('problem', nextProblem)
    saveShowroomCaseFrameTemplates('specific-problem', nextSpecificProblem)
    saveShowroomCaseFrameTemplates('solution', nextSolution)
    saveShowroomCaseFrameTemplates('evidence', nextEvidence)
    setProblemTemplates(nextProblem)
    setSpecificProblemTemplates(nextSpecificProblem)
    setSolutionTemplates(nextSolution)
    setEvidenceTemplates(nextEvidence)
    setTemplateManagerOpen(false)
    toast.success('프레임 템플릿을 저장했습니다.')
  }

  const reorderCardNewsSlides = (siteName: string, from: number, to: number) => {
    if (from === to) return
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        const list = [...row.cardNewsSlides]
        const [item] = list.splice(from, 1)
        list.splice(to, 0, item)
        return { ...row, cardNewsSlides: list }
      })
    )
  }

  const regenerateCardSlidesFromTemplate = (siteName: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        return {
          ...row,
          cardNewsSlides: buildTemplatedStudioSlides(row),
        }
      })
    )
  }

  const resetCardSlidesToTemplate = (siteName: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        return {
          ...row,
          headlineHook: '',
          problemDetail: '',
          solutionDetail: '',
          evidencePoints: '',
          cardNewsSlides: buildTemplatedStudioSlides({
            ...row,
            headlineHook: '',
            problemDetail: '',
            solutionDetail: '',
            evidencePoints: '',
          }),
        }
      })
    )
  }

  const requestContentGeneration = async (params: {
    row: CaseDraftState
    channel: 'cardnews' | 'blog'
    payload: ReturnType<typeof buildShowroomCaseN8nPayload>
  }) => {
    if (!showroomCaseContentWebhookUrl) {
      toast.error('VITE_SHOWROOM_CASE_CONTENT_WEBHOOK_URL 환경변수가 필요합니다.')
      return
    }

    const requestKey = `${params.row.siteName}:${params.channel}`
    setRequestingKey(requestKey)

    try {
      setRows((prev) =>
        prev.map((row) =>
          row.siteName === params.row.siteName
            ? {
                ...row,
                ...(params.channel === 'cardnews'
                  ? {
                      cardNewsGeneration: {
                        ...row.cardNewsGeneration,
                        status: 'processing',
                        requestedAt: new Date().toISOString(),
                        completedAt: null,
                        errorMessage: null,
                      },
                    }
                  : {
                      blogGeneration: {
                        ...row.blogGeneration,
                        status: 'processing',
                        requestedAt: new Date().toISOString(),
                        completedAt: null,
                        errorMessage: null,
                      },
                    }),
              }
            : row
        )
      )
      {
        const { error } = await saveShowroomCaseGenerationState({
          siteName: params.row.siteName,
          channel: params.channel,
          status: 'processing',
        })
        if (error) throw error
      }

      const response = await fetch(showroomCaseContentWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...params.payload,
          channel: params.channel,
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
            : `${params.channel === 'cardnews' ? '카드뉴스' : '블로그'} 생성 요청에 실패했습니다.`
        throw new Error(message)
      }

      {
        const { error } = await saveShowroomCaseGenerationState({
          siteName: params.row.siteName,
          channel: params.channel,
          status: 'completed',
          response: parsed,
        })
        if (error) throw error
      }

      let savedCanonicalBlog: ShowroomCaseCanonicalBlogPost | null = null
      if (params.channel === 'blog') {
        savedCanonicalBlog = buildCanonicalBlogPostFromN8nBlogResponse({
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
      }

      setRows((prev) =>
        prev.map((row) => {
          if (row.siteName !== params.row.siteName) return row
          if (params.channel === 'cardnews') {
            const fallbackPkg = buildShowroomCaseCardNewsPackage(deriveStudioSeedFromSlides(row))
            return {
              ...row,
              cardNewsGeneration: {
                ...row.cardNewsGeneration,
                status: 'completed',
                completedAt: new Date().toISOString(),
                errorMessage: null,
                response: parsed,
              },
              cardNewsSlides: studioSlidesFromResponse(parsed, fallbackPkg, row.projectImages, {
                problemFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'problem')?.title ?? row.problemFrameLabel,
                solutionFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'solution')?.title ?? row.solutionFrameLabel,
              }),
            }
          }
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

      if (params.channel === 'cardnews') {
        toast.success('카드뉴스 생성 요청을 보냈습니다.')
      } else {
        toast.success('블로그 생성 요청을 보냈습니다.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '콘텐츠 생성 요청에 실패했습니다.'
      void saveShowroomCaseGenerationState({
        siteName: params.row.siteName,
        channel: params.channel,
        status: 'failed',
        errorMessage: message,
      })
      setRows((prev) =>
        prev.map((row) =>
          row.siteName === params.row.siteName
            ? {
                ...row,
                ...(params.channel === 'cardnews'
                  ? {
                      cardNewsGeneration: {
                        ...row.cardNewsGeneration,
                        status: 'failed',
                        completedAt: new Date().toISOString(),
                        errorMessage: message,
                      },
                    }
                  : {
                      blogGeneration: {
                        ...row.blogGeneration,
                        status: 'failed',
                        completedAt: new Date().toISOString(),
                        errorMessage: message,
                      },
                    }),
              }
            : row
        )
      )
      toast.error(error instanceof Error ? error.message : '콘텐츠 생성 요청에 실패했습니다.')
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
      toast.success('블로그 정본을 공개 카드뉴스 상세에서 볼 수 있도록 승인했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '승인 저장에 실패했습니다.')
    } finally {
      setApprovingBlogSite(null)
    }
  }

  const persistStudioCardNews = async (row: CaseDraftState) => {
    const response = buildLocalCardNewsMasterResponse(studioRowToCardPackage(row))
    const derived = deriveStudioSeedFromSlides(row)
    const { error: draftError } = await saveShowroomCaseProfileDraft({
      siteName: row.siteName,
      canonicalSiteName: row.siteName || null,
      industry: row.industry,
      problemCode: row.problemCode || null,
      solutionCode: row.solutionCode || null,
      problemFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'problem')?.title?.trim() || row.problemFrameLabel || null,
      solutionFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'solution')?.title?.trim() || row.solutionFrameLabel || null,
      headlineHook: derived.headlineHook?.trim() || null,
      painPoint: derived.painPoint?.trim() || null,
      problemDetail: derived.problemDetail?.trim() || null,
      solutionPoint: derived.solutionPoint?.trim() || null,
      solutionDetail: derived.solutionDetail?.trim() || null,
      evidencePoints: derived.evidencePoints,
    })
    if (draftError) throw draftError

    const { error } = await saveShowroomCaseGenerationState({
      siteName: row.siteName,
      channel: 'cardnews',
      status: 'completed',
      response,
    })
    if (error) throw error

    return { response, derived }
  }

  const publishCardNews = async (row: CaseDraftState) => {
    setPublicationSavingId(row.siteName)
    try {
      const { response, derived } = await persistStudioCardNews(row)
      const { error, publication } = await saveShowroomCaseCardNewsPublication({
        siteName: row.siteName,
        isPublished: true,
        siteKey: row.cardNewsPublication.siteKey || row.siteName,
      })
      if (error) throw error
      if (!publication) throw new Error('공개 발행 상태를 저장하지 못했습니다.')

      setRows((prev) =>
        prev.map((item) =>
          item.siteName === row.siteName
            ? {
                ...item,
                problemFrameLabel: item.cardNewsSlides.find((slide) => slide.key === 'problem')?.title ?? item.problemFrameLabel,
                solutionFrameLabel: item.cardNewsSlides.find((slide) => slide.key === 'solution')?.title ?? item.solutionFrameLabel,
                headlineHook: derived.headlineHook ?? '',
                problemDetail: derived.problemDetail ?? '',
                solutionDetail: derived.solutionDetail ?? '',
                evidencePoints: (derived.evidencePoints ?? []).join('\n'),
                cardNewsGeneration: {
                  ...item.cardNewsGeneration,
                  status: 'completed',
                  requestedAt: new Date().toISOString(),
                  completedAt: new Date().toISOString(),
                  errorMessage: null,
                  response,
                },
                cardNewsPublication: publication,
              }
            : item
        )
      )
      requestDeployHookTrigger(`cardnews-published:${row.siteName}`)
      toast.success('카드뉴스를 공개 발행했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공개 발행에 실패했습니다.')
    } finally {
      setPublicationSavingId(null)
    }
  }

  const unpublishCardNews = async (row: CaseDraftState) => {
    setPublicationSavingId(row.siteName)
    try {
      const { error, publication } = await saveShowroomCaseCardNewsPublication({
        siteName: row.siteName,
        isPublished: false,
        siteKey: row.cardNewsPublication.siteKey || row.siteName,
      })
      if (error) throw error
      if (!publication) throw new Error('공개 중지 상태를 저장하지 못했습니다.')

      setRows((prev) =>
        prev.map((item) =>
          item.siteName === row.siteName
            ? {
                ...item,
                cardNewsPublication: publication,
              }
            : item
        )
      )
      requestDeployHookTrigger(`cardnews-unpublished:${row.siteName}`)
      toast.success('카드뉴스 공개를 중지했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공개 중지에 실패했습니다.')
    } finally {
      setPublicationSavingId(null)
    }
  }

  const cards = useMemo(() => rows, [rows])

  if (loading) {
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
      <section className="mb-8 rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Case Content Studio</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 md:text-3xl">비포어/애프터 케이스 작업실</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          비포어/애프터 현장별로{' '}
          <span className="font-medium text-slate-800">핵심 문제·해결 브리프만 적고 LLM·n8n으로 카드뉴스·블로그 초안을 받은 뒤</span>, 필요하면 6장 카드만 손보는 흐름입니다.
          상담용 쇼룸 화면과 분리되어 있습니다.
        </p>
        <div className="mt-4">
          <Link to="/showroom#showroom-before-after-section">
            <Button type="button" variant="outline" className="gap-2">
              내부 쇼룸으로 이동
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">{count}개 케이스</span>
        </div>
      </section>

      <Dialog open={templateManagerOpen} onOpenChange={setTemplateManagerOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>카드 템플릿 관리</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">문제 인식 템플릿</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addTemplateDraft('problem')}>
                  새 템플릿 추가
                </Button>
              </div>
              {problemTemplateDrafts.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <input
                    value={item.label}
                    onChange={(event) => patchTemplateDraft('problem', item.id, 'label', event.target.value)}
                    placeholder="프레임 제목"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                  <textarea
                    value={item.body}
                    onChange={(event) => patchTemplateDraft('problem', item.id, 'body', event.target.value)}
                    rows={4}
                    placeholder="기본 설명"
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-800"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => removeTemplateDraft('problem', item.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">구체 문제 템플릿</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addTemplateDraft('specific-problem')}>
                  새 템플릿 추가
                </Button>
              </div>
              {specificProblemTemplateDrafts.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <input
                    value={item.label}
                    onChange={(event) => patchTemplateDraft('specific-problem', item.id, 'label', event.target.value)}
                    placeholder="구체 문제 제목"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                  <textarea
                    value={item.body}
                    onChange={(event) => patchTemplateDraft('specific-problem', item.id, 'body', event.target.value)}
                    rows={4}
                    placeholder="구체 문제 설명"
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-800"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => removeTemplateDraft('specific-problem', item.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">해결 접근 템플릿</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addTemplateDraft('solution')}>
                  새 템플릿 추가
                </Button>
              </div>
              {solutionTemplateDrafts.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <input
                    value={item.label}
                    onChange={(event) => patchTemplateDraft('solution', item.id, 'label', event.target.value)}
                    placeholder="프레임 제목"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                  <textarea
                    value={item.body}
                    onChange={(event) => patchTemplateDraft('solution', item.id, 'body', event.target.value)}
                    rows={4}
                    placeholder="기본 설명"
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-800"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => removeTemplateDraft('solution', item.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">변화 포인트 템플릿</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => addTemplateDraft('evidence')}>
                  새 템플릿 추가
                </Button>
              </div>
              {evidenceTemplateDrafts.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <input
                    value={item.label}
                    onChange={(event) => patchTemplateDraft('evidence', item.id, 'label', event.target.value)}
                    placeholder="변화 포인트 항목"
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
                  />
                  <textarea
                    value={item.body}
                    onChange={(event) => patchTemplateDraft('evidence', item.id, 'body', event.target.value)}
                    rows={4}
                    placeholder="설명 메모"
                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-800"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => removeTemplateDraft('evidence', item.id)}>
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTemplateManagerOpen(false)}>
              닫기
            </Button>
            <Button type="button" onClick={saveTemplateManager}>
              템플릿 저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              승인 후 공개 카드뉴스 상세와 비슷한 레이아웃으로 봅니다. (이미지·본문 모두 포함)
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
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">익스터널라벨</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">{row.externalLabel || row.siteName}</h2>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {row.externalLabel ? '내부 현장명' : '업종'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{row.externalLabel ? row.siteName : row.industry}</p>
                </div>
              </div>

              <div className="p-4 md:p-5">
                {(() => {
                  const projectImages = row.projectImages ?? []
                  const defaults = buildDefaultCardNewsImageRefs(projectImages)
                  const assetMap = buildShowroomAssetUrlByIdMap(projectImages)
                  const previewSlides = row.cardNewsSlides.map((slide) => {
                    const effectiveRef = slide.imageRef === 'auto' ? defaults[slide.key] : slide.imageRef
                    const previewUrl = resolveCardNewsSlideImageUrl({
                      role: slide.key,
                      imageRef: effectiveRef,
                      beforeUrl: row.beforeUrl,
                      afterUrl: row.afterUrl,
                      assetUrlById: assetMap,
                      imageUrl: slide.imageUrl,
                    })
                    return {
                      ...slide,
                      effectiveRef,
                      previewUrl,
                    }
                  })
                  const activePreviewSlide = previewSlides[previewSlideIndex] ?? previewSlides[0] ?? null
                  const generationSeed = deriveStudioSeedFromSlides(row)
                  const cardNewsGenerationPayload = buildShowroomCaseN8nPayload(generationSeed, {
                    // 새 카드뉴스 생성은 현재 편집 슬라이드보다 "한줄 훅"과 시드값을 우선한다.
                    cardNewsPackage: buildShowroomCaseCardNewsPackage(generationSeed),
                    projectImages,
                  })
                  const blogGenerationPayload = buildShowroomCaseN8nPayload(generationSeed, {
                    cardNewsPackage: studioRowToCardPackage(row),
                    projectImages,
                  })
                  return (
                    <div className="grid gap-3">
                      <div
                        ref={(node) => {
                          studioPanelRefs.current[row.siteName] = node
                        }}
                        className={`rounded-2xl border bg-white p-4 md:p-5 ${
                          focusedSiteName === row.siteName &&
                          (focusedContent === 'cardnews' || focusedContent === 'blog')
                            ? 'border-emerald-400 ring-2 ring-emerald-100'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">LLM·n8n 자동 작성</p>
                            <p className="mt-1 text-sm text-slate-500">
                              아래 <span className="font-medium text-slate-700">자동 작성용 브리프</span>만 채워도 요청 페이로드에 반영됩니다. 이미지·현장 메타는 함께 실립니다.
                              카드 6장은 초안 생성 후 필요할 때 펼쳐서 고치면 됩니다.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full px-2.5 py-1 font-medium ${getGenerationStatusTone(row.cardNewsGeneration.status)}`}>
                                카드뉴스 제작 {getGenerationStatusLabel(row.cardNewsGeneration.status)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${getGenerationStatusTone(row.blogGeneration.status)}`}>
                                블로그 제작 {getGenerationStatusLabel(row.blogGeneration.status)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${
                                row.cardNewsPublication.isPublished
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                카드뉴스 발행 {row.cardNewsPublication.isPublished ? '완료' : '대기'}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${
                                row.canonicalBlogPost?.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                블로그 발행 {row.canonicalBlogPost?.status === 'approved' ? '완료' : '대기'}
                              </span>
                            </div>
                            {row.cardNewsGeneration.errorMessage || row.blogGeneration.errorMessage ? (
                              <p className="mt-2 text-xs text-rose-600">
                                {row.cardNewsGeneration.errorMessage || row.blogGeneration.errorMessage}
                              </p>
                            ) : null}
                            {row.cardNewsGeneration.completedAt || row.blogGeneration.completedAt ? (
                              <p className="mt-2 text-xs text-slate-500">
                                {row.cardNewsGeneration.completedAt
                                  ? `카드뉴스 ${formatGenerationTimestamp(row.cardNewsGeneration.completedAt)}`
                                  : row.blogGeneration.completedAt
                                    ? `블로그 ${formatGenerationTimestamp(row.blogGeneration.completedAt)}`
                                    : ''}
                              </p>
                            ) : null}
                            {(row.cardNewsPublication.isPublished || row.canonicalBlogPost?.status === 'approved') && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                                {row.cardNewsPublication.isPublished && (
                                  <>
                                    <span>카드뉴스 공개 링크 준비됨</span>
                                    <Link
                                      to={buildPublicCardNewsPath(row.cardNewsPublication.siteKey || row.siteName)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium underline underline-offset-2"
                                    >
                                      카드뉴스 열기
                                    </Link>
                                  </>
                                )}
                                {row.canonicalBlogPost?.status === 'approved' && (
                                  <>
                                    <span>블로그 공개 링크 준비됨</span>
                                    <Link
                                      to={`/public/showroom/case/${encodeURIComponent(row.externalLabel || row.siteName)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-medium underline underline-offset-2"
                                    >
                                      블로그 열기
                                    </Link>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="gap-2"
                              disabled={requestingKey === `${row.siteName}:cardnews`}
                              onClick={() => {
                                void requestContentGeneration({
                                  row,
                                  channel: 'cardnews',
                                  payload: cardNewsGenerationPayload,
                                })
                              }}
                            >
                              {requestingKey === `${row.siteName}:cardnews` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              카드뉴스 만들기
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPreviewSiteName(row.siteName)
                                setPreviewSlideIndex(0)
                              }}
                            >
                              카드뉴스 확인
                            </Button>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              disabled={publicationSavingId === row.siteName}
                              onClick={() => void publishCardNews(row)}
                            >
                              {publicationSavingId === row.siteName
                                ? '발행 중…'
                                : row.cardNewsPublication.isPublished
                                  ? '카드뉴스 다시 발행'
                                  : '카드뉴스 발행'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={requestingKey === `${row.siteName}:blog`}
                              onClick={() => {
                                void requestContentGeneration({
                                  row,
                                  channel: 'blog',
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
                              disabled={!row.canonicalBlogPost || row.canonicalBlogPost.status === 'approved' || approvingBlogSite === row.siteName}
                              onClick={() => void handleApproveCanonicalBlog(row)}
                            >
                              {approvingBlogSite === row.siteName ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : null}
                              블로그 발행
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
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">자동 작성용 브리프</p>
                          <p className="text-xs leading-relaxed text-slate-600">
                            여기 내용과 이미지·현장 메타가 n8n 페이로드로 나갑니다. 웹훅 응답으로 6장·블로그 초안을 채운 뒤, 필요하면 아래 접는 영역에서만 수정하세요.
                          </p>
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
                              placeholder="비우면 브리프·카드 내용 기반으로 자동 제안"
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

                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/40">
                          <button
                            type="button"
                            onClick={() =>
                              setCardEditorOpenBySite((prev) => ({
                                ...prev,
                                [row.siteName]: !(
                                  prev[row.siteName]
                                  ?? (focusedSiteName === row.siteName && focusedContent === 'cardnews')
                                ),
                              }))
                            }
                            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-100/80"
                          >
                            <span>6장 카드 직접 편집</span>
                            {(cardEditorOpenBySite[row.siteName]
                              ?? (focusedSiteName === row.siteName && focusedContent === 'cardnews')) ? (
                              <ChevronUp className="h-4 w-4 text-slate-500" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-500" />
                            )}
                          </button>
                          {(cardEditorOpenBySite[row.siteName]
                            ?? (focusedSiteName === row.siteName && focusedContent === 'cardnews')) && (
                          <div className="border-t border-slate-200 p-4">
                            <div className="space-y-3">
                          {previewSlides.map((slide, index) => {
                            const isDraggingHere = studioDrag?.siteName === row.siteName && studioDrag.index === index
                            return (
                              <div
                                key={slide.id}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.effectAllowed = 'move'
                                  setStudioDrag({ siteName: row.siteName, index })
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.dataTransfer.dropEffect = 'move'
                                }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  if (!studioDrag || studioDrag.siteName !== row.siteName) return
                                  if (studioDrag.index !== index) {
                                    reorderCardNewsSlides(row.siteName, studioDrag.index, index)
                                  }
                                  setStudioDrag(null)
                                }}
                                onDragEnd={() => setStudioDrag(null)}
                                title="줄을 드래그하면 순서를 바꿀 수 있습니다"
                                className={`flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition md:flex-row md:items-stretch md:gap-4 ${
                                  isDraggingHere ? 'opacity-60 ring-2 ring-emerald-300' : ''
                                }`}
                              >
                                <div className="flex w-full shrink-0 flex-col gap-2 md:w-[9.5rem]">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">사진</p>
                                  <div className="relative aspect-square w-full max-w-[11rem] overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:max-w-none">
                                    {slide.previewUrl ? (
                                      <img src={slide.previewUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full min-h-[96px] items-center justify-center px-2 text-center text-[11px] text-slate-500">
                                        없음
                                      </div>
                                    )}
                                  </div>
                                  <select
                                    value={slide.imageRef}
                                    onChange={(event) =>
                                      patchCardNewsSlide(row.siteName, slide.id, {
                                        imageRef: event.target.value as CardNewsSlideImageRef,
                                      })
                                    }
                                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800"
                                  >
                                    <option value="auto">자동 (역할별 권장 컷)</option>
                                    <option value="before">대표 Before만</option>
                                    <option value="after">대표 After만</option>
                                    <option value="signature">브랜드 시그니처</option>
                                    {(row.projectImages ?? []).length > 0 ? (
                                      <optgroup label="현장 사진 전체">
                                        {(row.projectImages ?? []).map((asset) => (
                                          <option key={asset.id} value={makeCardNewsAssetImageRef(asset.id)}>
                                            {formatShowroomAssetPickerLabel(asset)}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ) : null}
                                  </select>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-medium text-slate-400">{index + 1}/6</span>
                                    <label className="sr-only" htmlFor={`slide-role-${slide.id}`}>
                                      카드 역할
                                    </label>
                                    <select
                                      id={`slide-role-${slide.id}`}
                                      value={slide.key}
                                      onChange={(event) =>
                                        patchCardNewsSlide(row.siteName, slide.id, {
                                          key: event.target.value as ShowroomCaseCardNewsSlide['key'],
                                        })
                                      }
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                                    >
                                      {SLIDE_KEY_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <input
                                    value={slide.title}
                                    onChange={(event) => patchCardNewsSlide(row.siteName, slide.id, { title: event.target.value })}
                                    placeholder="제목"
                                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-900"
                                  />
                                  {slide.key === 'problem' ? (
                                    <select
                                      value=""
                                      onChange={(event) => {
                                        const label = event.target.value
                                        const template = problemTemplates.find((item) => item.label === label)
                                        if (template) applyFrameTemplateToSlide(row.siteName, 'problem', template)
                                        event.currentTarget.value = ''
                                      }}
                                      className="mb-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700"
                                    >
                                      <option value="">문제 인식 템플릿 불러오기</option>
                                      {problemTemplates.map((template) => (
                                        <option key={template.label} value={template.label}>
                                          {template.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}
                                  {slide.key === 'solution' ? (
                                    <select
                                      value=""
                                      onChange={(event) => {
                                        const label = event.target.value
                                        const template = solutionTemplates.find((item) => item.label === label)
                                        if (template) applyFrameTemplateToSlide(row.siteName, 'solution', template)
                                        event.currentTarget.value = ''
                                      }}
                                      className="mb-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700"
                                    >
                                      <option value="">해결 접근 템플릿 불러오기</option>
                                      {solutionTemplates.map((template) => (
                                        <option key={template.label} value={template.label}>
                                          {template.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : null}
                                  <textarea
                                    value={slide.body}
                                    onChange={(event) => patchCardNewsSlide(row.siteName, slide.id, { body: event.target.value })}
                                    rows={4}
                                    placeholder="본문"
                                    className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed text-slate-800"
                                  />
                                </div>
                              </div>
                            )
                          })}
                            </div>
                          </div>
                          )}
                        </div>
                        <Dialog open={previewSiteName === row.siteName} onOpenChange={(open) => {
                          if (!open) {
                            setPreviewSiteName(null)
                            setPreviewSlideIndex(0)
                          }
                        }}>
                          <DialogContent className="max-w-4xl overflow-hidden border-0 bg-transparent p-0 shadow-none">
                            <DialogHeader className="sr-only">
                              <DialogTitle>카드뉴스 미리보기</DialogTitle>
                            </DialogHeader>
                            <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
                              <div className="relative aspect-[16/10] bg-slate-950">
                                {activePreviewSlide?.previewUrl ? (
                                  <img src={activePreviewSlide.previewUrl} alt="" className="h-full w-full object-cover" />
                                ) : null}
                                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
                                <button
                                  type="button"
                                  onClick={() => setPreviewSlideIndex((prev) => (prev - 1 + previewSlides.length) % previewSlides.length)}
                                  className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
                                  aria-label="이전 카드"
                                  disabled={previewSlides.length === 0}
                                >
                                  <ChevronLeft className="h-5 w-5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPreviewSlideIndex((prev) => (prev + 1) % previewSlides.length)}
                                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
                                  aria-label="다음 카드"
                                  disabled={previewSlides.length === 0}
                                >
                                  <ChevronRight className="h-5 w-5" />
                                </button>
                                <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                                      카드뉴스 {Math.min(previewSlideIndex + 1, previewSlides.length)}/{previewSlides.length}
                                    </span>
                                    <span className="inline-flex rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                                      {activePreviewSlide?.key === 'problem'
                                        ? 'Before'
                                        : activePreviewSlide?.effectiveRef === 'signature'
                                          ? 'Signature'
                                          : 'After'}
                                    </span>
                                  </div>
                                  <div className="mt-3 max-w-2xl rounded-2xl bg-black/45 px-4 py-3 backdrop-blur-[3px]">
                                    <p
                                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"
                                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 1px rgba(0,0,0,0.6)' }}
                                    >
                                      {activePreviewSlide?.title ?? ''}
                                    </p>
                                    <p
                                      className="mt-2 whitespace-pre-wrap text-lg font-semibold leading-relaxed text-white md:text-[1.6rem]"
                                      style={{ textShadow: '0 1px 4px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)' }}
                                    >
                                      {formatShowroomCardTextForDisplay({
                                        text: activePreviewSlide?.body ?? '',
                                        role: activePreviewSlide?.key,
                                      })}
                                    </p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-t border-slate-200 bg-white px-4 py-4 md:px-5">
                                <div className="flex flex-wrap gap-2">
                                  {previewSlides.map((slide, index) => (
                                    <button
                                      key={`${slide.id}-preview-${index}`}
                                      type="button"
                                      onClick={() => setPreviewSlideIndex(index)}
                                      className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                        index === previewSlideIndex
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      {index + 1}장 {SLIDE_KEY_OPTIONS.find((opt) => opt.value === slide.key)?.label ?? slide.key}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <div className="text-xs text-slate-500">
                          {row.cardNewsPublication.isPublished ? (
                            <span>
                              발행 완료.{' '}
                              <Link
                                to={buildPublicCardNewsPath(row.cardNewsPublication.siteKey || row.siteName)}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-emerald-700 underline underline-offset-2"
                              >
                                고객 페이지 열기
                              </Link>
                            </span>
                          ) : (
                            <span>카드뉴스 확인 후 공개 발행하면 고객 페이지에 바로 반영됩니다.</span>
                          )}
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
