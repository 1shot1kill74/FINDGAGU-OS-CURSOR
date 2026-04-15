import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Copy, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  collectConsultationImagesForSiteRow,
  fetchShowroomImageAssets,
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
import {
  fetchShowroomCaseProfileDrafts,
  saveShowroomCaseCardNewsPublication,
  saveShowroomCaseConsultationCardDraft,
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
  const [savingId, setSavingId] = useState<string | null>(null)
  const [draftSavingId, setDraftSavingId] = useState<string | null>(null)
  const [publicationSavingId, setPublicationSavingId] = useState<string | null>(null)
  const [copiedPublicLinkId, setCopiedPublicLinkId] = useState<string | null>(null)
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
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const didAutoFocusSiteRef = useRef(false)
  const focusedSiteName = searchParams.get('site')?.trim() ?? ''

  useEffect(() => {
    setProblemTemplates(loadShowroomCaseFrameTemplates('problem'))
    setSpecificProblemTemplates(loadShowroomCaseFrameTemplates('specific-problem'))
    setSolutionTemplates(loadShowroomCaseFrameTemplates('solution'))
    setEvidenceTemplates(loadShowroomCaseFrameTemplates('evidence'))
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const assets = await fetchShowroomImageAssets()
        const groups = groupBeforeAfter(assets)
        const drafts = await fetchShowroomCaseProfileDrafts(groups.map((group) => group.siteName))
        const draftMap = new Map(drafts.map((draft) => [draft.siteName, draft]))

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
    if (!focusedSiteName || loading || rows.length === 0 || didAutoFocusSiteRef.current) return
    const target = sectionRefs.current[focusedSiteName]
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    didAutoFocusSiteRef.current = true
  }, [focusedSiteName, loading, rows.length])

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

  const applyEvidenceSelectionsToSlide = (siteName: string, labels: string[]) => {
    const picked = evidenceTemplates.filter((item) => labels.includes(item.label))
    const body = picked.map((item) => `- ${item.label}`).join('\n')
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        return {
          ...row,
          evidencePoints: body,
          cardNewsSlides: row.cardNewsSlides.map((slide) =>
            slide.key !== 'evidence'
              ? slide
              : {
                  ...slide,
                  body: body || slide.body,
                }
          ),
        }
      })
    )
  }

  const toggleSpecificProblemSelection = (siteName: string, label: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        const slide = row.cardNewsSlides.find((item) => item.key === 'specific-problem')
        const current = (slide?.body ?? '')
          .split('\n')
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter(Boolean)
        const next = current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label]
        const body = next.map((item) => `- ${item}`).join('\n')
        return {
          ...row,
          problemDetail: body,
          cardNewsSlides: row.cardNewsSlides.map((item) =>
            item.key !== 'specific-problem'
              ? item
              : {
                  ...item,
                  body,
                }
          ),
        }
      })
    )
  }

  const toggleEvidenceSelection = (siteName: string, label: string) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.siteName !== siteName) return row
        const slide = row.cardNewsSlides.find((item) => item.key === 'evidence')
        const current = (slide?.body ?? '')
          .split('\n')
          .map((line) => line.replace(/^-\s*/, '').trim())
          .filter(Boolean)
        const next = current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label]
        const body = next.map((item) => `- ${item}`).join('\n')
        return {
          ...row,
          evidencePoints: body,
          cardNewsSlides: row.cardNewsSlides.map((item) =>
            item.key !== 'evidence'
              ? item
              : {
                  ...item,
                  body,
                }
          ),
        }
      })
    )
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

  /** 프로필 저장 + 앱 카드뉴스 반영을 한 번에 처리합니다. */
  const saveCaseAndPublishCardNews = async (row: CaseDraftState) => {
    setSavingId(row.siteName)
    try {
      const { response, derived } = await persistStudioCardNews(row)
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
              }
            : item
        )
      )
      toast.success(`${row.siteName} 케이스를 저장하고 카드뉴스를 반영했습니다.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '저장·반영에 실패했습니다.')
    } finally {
      setSavingId(null)
    }
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
      toast.success('카드뉴스 공개를 중지했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공개 중지에 실패했습니다.')
    } finally {
      setPublicationSavingId(null)
    }
  }

  const copyPublicCardNewsLink = async (row: CaseDraftState) => {
    const path = buildPublicCardNewsPath(row.cardNewsPublication.siteKey || row.siteName)
    const url = `${window.location.origin}${path}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedPublicLinkId(row.siteName)
      window.setTimeout(() => {
        setCopiedPublicLinkId((prev) => (prev === row.siteName ? null : prev))
      }, 1500)
      toast.success('공개 링크를 복사했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '공개 링크 복사에 실패했습니다.')
    }
  }

  const saveConsultationCardDraft = async (row: CaseDraftState) => {
    setDraftSavingId(row.siteName)
    try {
      const { error } = await saveShowroomCaseConsultationCardDraft({
        siteName: row.siteName,
        headlineHook: row.headlineHook,
        problemCode: row.problemCode,
        solutionCode: row.solutionCode,
        problemFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'problem')?.title ?? row.problemFrameLabel,
        solutionFrameLabel: row.cardNewsSlides.find((slide) => slide.key === 'solution')?.title ?? row.solutionFrameLabel,
        problemDetail: row.problemDetail,
        solutionDetail: row.solutionDetail,
        evidencePoints: row.evidencePoints.split('\n').map((item) => item.trim()).filter(Boolean),
        cardNewsSlides: row.cardNewsSlides.map((slide) => ({
          key: slide.key,
          title: slide.title,
          body: slide.body,
          imageRef: slide.imageRef,
          imageUrl: slide.imageUrl ?? null,
        })),
      })
      if (error) throw error
      toast.success('상담카드 임시저장을 완료했습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '상담카드 임시저장에 실패했습니다.')
    } finally {
      setDraftSavingId(null)
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
          상담용 쇼룸과 분리된 콘텐츠 제작 화면입니다. 비포어/애프터가 완성된 현장만 골라 문제 제기, 해결 방식, 카드뉴스형 요약을 만듭니다.
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
          <Button type="button" variant="outline" size="sm" onClick={openTemplateManager}>
            카드 템플릿 관리
          </Button>
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
                  const n8nPayload = buildShowroomCaseN8nPayload(deriveStudioSeedFromSlides(row), {
                    cardNewsPackage: studioRowToCardPackage(row),
                  })
                  return (
                    <div className="grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">카드뉴스 6장</p>
                            <p className="mt-1 text-sm text-slate-500">
                              문제 인식, 해결 접근, 변화 포인트 모두 템플릿을 불러와 초안을 만들 수 있습니다. 각 카드에서 불러온 뒤 제목·본문을 계속 손편집할 수 있습니다.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs">
                              <span className={`rounded-full px-2.5 py-1 font-medium ${getGenerationStatusTone(row.cardNewsGeneration.status)}`}>
                                카드뉴스 {getGenerationStatusLabel(row.cardNewsGeneration.status)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${getGenerationStatusTone(row.blogGeneration.status)}`}>
                                블로그 {getGenerationStatusLabel(row.blogGeneration.status)}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 font-medium ${
                                row.cardNewsPublication.isPublished
                                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                공개 {row.cardNewsPublication.isPublished ? '발행 중' : '비공개'}
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
                            {row.cardNewsPublication.isPublished && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                                <span>공개 링크 준비됨</span>
                                <Link
                                  to={buildPublicCardNewsPath(row.cardNewsPublication.siteKey || row.siteName)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-medium underline underline-offset-2"
                                >
                                  고객 페이지 열기
                                </Link>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => regenerateCardSlidesFromTemplate(row.siteName)}
                            >
                              프레임으로 카드 다시 생성
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
                              카드뉴스 미리보기
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => resetCardSlidesToTemplate(row.siteName)}
                            >
                              기본 템플릿으로 카드 초기화
                            </Button>
                          </div>
                        </div>
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
                                  {slide.key === 'specific-problem' ? (
                                    <div className="mb-2">
                                      <p className="mb-1 text-[11px] font-medium text-amber-700">구체 문제 템플릿 선택</p>
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
                                        <div className="max-h-32 space-y-1 overflow-y-auto">
                                          {specificProblemTemplates.map((template) => {
                                            const selected = slide.body
                                              .split('\n')
                                              .map((line) => line.replace(/^-\s*/, '').trim())
                                              .filter(Boolean)
                                              .includes(template.label)
                                            return (
                                              <label key={template.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs text-amber-800 hover:bg-amber-100">
                                                <input
                                                  type="checkbox"
                                                  checked={selected}
                                                  onChange={() => toggleSpecificProblemSelection(row.siteName, template.label)}
                                                  className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-amber-600"
                                                />
                                                <span>{template.label}</span>
                                              </label>
                                            )
                                          })}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {slide.body
                                            .split('\n')
                                            .map((line) => line.replace(/^-\s*/, '').trim())
                                            .filter(Boolean)
                                            .map((label, selectedIndex) => (
                                              <span
                                                key={`${label}-${selectedIndex}`}
                                                className="inline-flex items-center rounded-full bg-white px-2 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200"
                                              >
                                                {selectedIndex + 1}. {label}
                                              </span>
                                            ))}
                                        </div>
                                      </div>
                                    </div>
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
                                  {slide.key === 'evidence' ? (
                                    <div className="mb-2">
                                      <p className="mb-1 text-[11px] font-medium text-violet-700">변화 포인트 템플릿 선택</p>
                                      <div className="rounded-lg border border-violet-200 bg-violet-50 p-2">
                                        <div className="max-h-32 space-y-1 overflow-y-auto">
                                          {evidenceTemplates.map((template) => {
                                            const selected = slide.body
                                              .split('\n')
                                              .map((line) => line.replace(/^-\s*/, '').trim())
                                              .filter(Boolean)
                                              .includes(template.label)
                                            return (
                                              <label key={template.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-xs text-violet-800 hover:bg-violet-100">
                                                <input
                                                  type="checkbox"
                                                  checked={selected}
                                                  onChange={() => toggleEvidenceSelection(row.siteName, template.label)}
                                                  className="mt-0.5 h-3.5 w-3.5 rounded border-violet-300 text-violet-600"
                                                />
                                                <span>{template.label}</span>
                                              </label>
                                            )
                                          })}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {slide.body
                                            .split('\n')
                                            .map((line) => line.replace(/^-\s*/, '').trim())
                                            .filter(Boolean)
                                            .map((label, selectedIndex) => (
                                              <span
                                                key={`${label}-${selectedIndex}`}
                                                className="inline-flex items-center rounded-full bg-white px-2 py-1 text-[11px] font-medium text-violet-700 ring-1 ring-violet-200"
                                              >
                                                {selectedIndex + 1}. {label}
                                              </span>
                                            ))}
                                        </div>
                                      </div>
                                    </div>
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
                        <details className="mt-4 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-sm">
                          <summary className="cursor-pointer list-none px-4 py-3.5 text-center text-sm font-semibold text-slate-800 hover:bg-slate-100">
                            외부 자동화 (n8n)·블로그
                          </summary>
                          <div className="border-t border-slate-200 px-4 py-3">
                          <p className="text-xs text-slate-500">
                            웹훅 URL이 설정된 경우에만 외부 생성 요청이 동작합니다. 앱만 쓸 때는 펼치지 않아도 됩니다.
                          </p>
                          <div className="mt-3 flex flex-wrap justify-center gap-2 md:justify-start">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                void navigator.clipboard.writeText(JSON.stringify(n8nPayload, null, 2)).then(
                                  () => toast.success('n8n 입력 JSON을 복사했습니다.'),
                                  (error) => toast.error(error instanceof Error ? error.message : 'n8n 입력 JSON 복사에 실패했습니다.')
                                )
                              }}
                            >
                              n8n 입력 복사
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={requestingKey === `${row.siteName}:cardnews`}
                              onClick={() => {
                                void requestContentGeneration({
                                  row,
                                  channel: 'cardnews',
                                  payload: n8nPayload,
                                })
                              }}
                            >
                              {requestingKey === `${row.siteName}:cardnews` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              카드뉴스 생성 요청
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
                                  payload: n8nPayload,
                                })
                              }}
                            >
                              {requestingKey === `${row.siteName}:blog` ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              블로그 생성 요청
                            </Button>
                          </div>
                          </div>
                        </details>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={draftSavingId === row.siteName}
                          onClick={() => void saveConsultationCardDraft(row)}
                        >
                          {draftSavingId === row.siteName ? '임시저장 중…' : '상담카드 임시저장'}
                        </Button>
                        <Button
                          type="button"
                          className="gap-2 bg-slate-900 text-white hover:bg-slate-800"
                          disabled={savingId === row.siteName}
                          onClick={() => void saveCaseAndPublishCardNews(row)}
                        >
                          {savingId === row.siteName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {savingId === row.siteName ? '저장 중…' : '카드뉴스 반영'}
                        </Button>
                        <Button
                          type="button"
                          variant={row.cardNewsPublication.isPublished ? 'outline' : 'default'}
                          disabled={publicationSavingId === row.siteName}
                          onClick={() => void publishCardNews(row)}
                        >
                          {publicationSavingId === row.siteName && row.cardNewsPublication.isPublished === false
                            ? '발행 중…'
                            : '공개 발행'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!row.cardNewsPublication.isPublished || publicationSavingId === row.siteName}
                          onClick={() => void unpublishCardNews(row)}
                        >
                          {publicationSavingId === row.siteName && row.cardNewsPublication.isPublished
                            ? '중지 중…'
                            : '공개 중지'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="gap-2"
                          disabled={!row.cardNewsPublication.isPublished}
                          onClick={() => void copyPublicCardNewsLink(row)}
                        >
                          <Copy className="h-4 w-4" />
                          {copiedPublicLinkId === row.siteName ? '링크 복사됨' : '공개 링크 복사'}
                        </Button>
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
