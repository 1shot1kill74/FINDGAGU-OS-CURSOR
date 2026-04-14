import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, FileText, Loader2, RefreshCw, Trash2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  deleteShowroomBasicShortsDraft,
  buildShowroomBasicShortsPublishPackage,
  ensureShowroomBasicShortsTargets,
  getShowroomBasicShortsRenderStatus,
  listRequestedShowroomBasicShortsDrafts,
  listShowroomBasicShortsTargets,
  resetShowroomBasicShortsTargetLaunchState,
  requestShowroomBasicShortsPublishPrepare,
  requestShowroomBasicShortsPublishLaunch,
  type ShowroomBasicShortsChannel,
  type ShowroomBasicShortsDraftRecord,
  type ShowroomBasicShortsTargetRecord,
  updateShowroomBasicShortsTargetPreparation,
} from '@/lib/showroomBasicShortsDrafts'

function formatDateTime(value: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString('ko-KR')
}

function getRenderStatusLabel(status: string) {
  if (status === 'queued') return '대기 중'
  if (status === 'processing') return '렌더링 중'
  if (status === 'completed') return '완료'
  if (status === 'failed') return '실패'
  if (status === 'render_queued') return '대기 중'
  if (status === 'render_processing') return '렌더링 중'
  if (status === 'render_completed') return '완료'
  if (status === 'render_failed') return '실패'
  if (status === 'requested') return '요청 접수'
  return status || '-'
}

function getPublishStatusGuide(status: string) {
  if (status === 'ready') return '렌더 완료 후 자동 준비를 시작할 수 있습니다.'
  if (status === 'preparing') return '채널별 업로드 준비가 자동으로 진행 중입니다.'
  if (status === 'launch_ready') return '업로드 준비가 끝났습니다. 패키지를 확인한 뒤 게시하세요.'
  if (status === 'approved') return '게시 승인 완료 상태입니다.'
  if (status === 'publishing') return '실제 퍼블리싱 중입니다.'
  if (status === 'published') return '게시가 완료되었습니다.'
  if (status === 'failed') return '준비 또는 게시 단계에서 실패했습니다.'
  return `현재 상태: ${status}`
}

function getChannelLabel(channel: ShowroomBasicShortsChannel) {
  if (channel === 'youtube') return 'YouTube'
  if (channel === 'facebook') return 'Facebook'
  return 'Instagram'
}

function pickPreparationString(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

export default function ShowroomBasicShortsQueuePage() {
  const [items, setItems] = useState<ShowroomBasicShortsDraftRecord[]>([])
  const [renderStatuses, setRenderStatuses] = useState<Record<string, { status: string; finalVideoUrl: string | null; error: string | null }>>({})
  const [targetsByDraftId, setTargetsByDraftId] = useState<Record<string, ShowroomBasicShortsTargetRecord[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ShowroomBasicShortsDraftRecord | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actingDraftId, setActingDraftId] = useState<string | null>(null)
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [autoPreparingDraftIds, setAutoPreparingDraftIds] = useState<string[]>([])

  const load = async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setRefreshing(true)
    try {
      const nextItems = await listRequestedShowroomBasicShortsDrafts()
      setItems(nextItems)
      const statusEntries = await Promise.all(
        nextItems.map(async (item) => {
          try {
            const status = await getShowroomBasicShortsRenderStatus(item.id)
            return [
              item.id,
              {
                status: status.status,
                finalVideoUrl: status.finalVideoUrl ?? item.finalVideoUrl,
                error: status.error ?? item.renderError ?? null,
              },
            ] as const
          } catch {
            return [
              item.id,
              {
                status: item.status,
                finalVideoUrl: item.finalVideoUrl,
                error: item.renderError,
              },
            ] as const
          }
        }),
      )
      setRenderStatuses(Object.fromEntries(statusEntries))
      const targetEntries = await Promise.all(
        nextItems.map(async (item) => {
          try {
            const targets = await listShowroomBasicShortsTargets(item.id)
            return [item.id, targets] as const
          } catch {
            return [item.id, []] as const
          }
        })
      )
      setTargetsByDraftId(Object.fromEntries(targetEntries))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '기본 쇼츠 작업대기를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load(true)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load()
    }, 5000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const handleDelete = async (item: ShowroomBasicShortsDraftRecord) => {
    const confirmed = window.confirm('잘못 요청한 기본 쇼츠 작업을 삭제할까요? requested 상태의 대기건만 삭제됩니다.')
    if (!confirmed) return

    setDeletingId(item.id)
    try {
      await deleteShowroomBasicShortsDraft(item.id)
      if (selectedItem?.id === item.id) {
        setSelectedItem(null)
      }
      toast.success('기본 쇼츠 작업 요청을 삭제했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '기본 쇼츠 작업 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleLaunchTarget = async (target: ShowroomBasicShortsTargetRecord) => {
    const confirmed = window.confirm(`${getChannelLabel(target.channel)} 채널에 실제 게시를 시작할까요?`)
    if (!confirmed) return

    setActingDraftId(target.basicShortsDraftId)
    try {
      const result = await requestShowroomBasicShortsPublishLaunch(target.id)
      toast.success(result.message ?? 'n8n 게이트로 게시 요청을 전달했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시 요청에 실패했습니다.')
    } finally {
      setActingDraftId(null)
    }
  }

  const handleResetTarget = async (target: ShowroomBasicShortsTargetRecord) => {
    const confirmed = window.confirm(`${getChannelLabel(target.channel)} 채널의 게시 상태를 복구할까요? 게시 가능 상태로 되돌립니다.`)
    if (!confirmed) return

    setActingDraftId(target.basicShortsDraftId)
    try {
      await resetShowroomBasicShortsTargetLaunchState(target.id)
      toast.success('게시 상태를 복구했습니다.')
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '게시 상태 복구에 실패했습니다.')
    } finally {
      setActingDraftId(null)
    }
  }

  const handleStartEditPackage = (target: ShowroomBasicShortsTargetRecord) => {
    const prepared = buildShowroomBasicShortsPublishPackage(target)
    setEditingTargetId(target.id)
    setEditTitle(prepared.title)
    setEditBody(prepared.caption)
  }

  const handleCancelEditPackage = () => {
    setEditingTargetId(null)
    setEditTitle('')
    setEditBody('')
  }

  const handleSaveEditPackage = async (target: ShowroomBasicShortsTargetRecord) => {
    if (!editTitle.trim()) {
      toast.error('제목을 입력해주세요.')
      return
    }

    setEditSaving(true)
    setActingDraftId(target.basicShortsDraftId)
    try {
      await updateShowroomBasicShortsTargetPreparation(target.id, {
        title: editTitle.trim(),
        caption: editBody.trim(),
      })
      toast.success('업로드 준비 내용을 수정했습니다.')
      handleCancelEditPackage()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '내용 수정에 실패했습니다.')
    } finally {
      setEditSaving(false)
      setActingDraftId(null)
    }
  }

  useEffect(() => {
    const completedItems = items.filter((item) => (renderStatuses[item.id]?.status ?? item.status) === 'completed')
    const pendingDraftIds = completedItems
      .filter((item) => {
        const targets = targetsByDraftId[item.id] ?? []
        if (targets.length === 0) return true
        return targets.some((target) => ['ready', 'failed'].includes(target.publishStatus))
      })
      .map((item) => item.id)
      .filter((id) => !autoPreparingDraftIds.includes(id))

    if (pendingDraftIds.length === 0) return

    let cancelled = false
    setAutoPreparingDraftIds((prev) => [...prev, ...pendingDraftIds])

    void Promise.all(
      pendingDraftIds.map(async (draftId) => {
        const item = items.find((candidate) => candidate.id === draftId)
        if (!item) return
        const ensuredTargets = await ensureShowroomBasicShortsTargets(item)
        await Promise.all(
          ensuredTargets
            .filter((target) => ['ready', 'failed'].includes(target.publishStatus))
            .map((target) => requestShowroomBasicShortsPublishPrepare(target.id))
        )
      })
    )
      .then(async () => {
        if (cancelled) return
        await load()
      })
      .catch((error) => {
        if (cancelled) return
        console.error('[showroom-basic-shorts] auto prepare failed', error)
        toast.error(error instanceof Error ? error.message : '기본 쇼츠 자동 업로드 준비에 실패했습니다.')
      })
      .finally(() => {
        if (cancelled) return
        setAutoPreparingDraftIds((prev) => prev.filter((id) => !pendingDraftIds.includes(id)))
      })

    return () => {
      cancelled = true
    }
  }, [items, renderStatuses, targetsByDraftId, autoPreparingDraftIds])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-10 md:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm text-neutral-500">기본 쇼츠 작업대기를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-10 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">기본 쇼츠 작업대기</h1>
            <p className="text-sm text-neutral-600">
              내부 쇼룸에서 `제작 요청`으로 넘어온 기본 쇼츠 대기건 목록입니다. 렌더 완료 후 YouTube, Facebook, Instagram 업로드 준비까지 자동 연결됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/showroom">
              <Button type="button" variant="outline" className="gap-2">
                내부 쇼룸으로 돌아가기
              </Button>
            </Link>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void load()} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          `제작 요청`을 누르면 자동 렌더링이 바로 시작됩니다. 렌더 완료 후에는 3채널 업로드 준비가 자동으로 연결되고, 이 화면에서는 패키지 확인 후 최종 게시만 진행하면 됩니다.
        </div>

        {autoPreparingDraftIds.length > 0 ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            렌더 완료된 기본 쇼츠에 대해 채널별 업로드 준비를 자동 진행 중입니다.
          </div>
        ) : null}

        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-neutral-900">대기 중인 기본 쇼츠 요청이 없습니다.</p>
            <p className="mt-2 text-sm text-neutral-500">내부 쇼룸에서 이미지 선택 후 기본 쇼츠 {'>'} 제작 요청을 누르면 이곳에 쌓입니다.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <section key={item.id} className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                      렌더 상태:{' '}
                      <span className="font-semibold text-neutral-950">
                        {getRenderStatusLabel(renderStatuses[item.id]?.status ?? item.status)}
                      </span>
                      {renderStatuses[item.id]?.error ? (
                        <span className="ml-2 text-rose-600">오류: {renderStatuses[item.id]?.error}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-neutral-950">{item.displayName}</h2>
                      <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white">
                        {item.status}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm text-neutral-600 md:grid-cols-2">
                      <p>길이: {item.durationSeconds}초</p>
                      <p>선택 이미지: {item.selectedImageIds.length}장</p>
                      <p>업종: {item.industry || '-'}</p>
                      <p>주요 색상: {item.colorSummary || '-'}</p>
                      <p>생성: {formatDateTime(item.createdAt)}</p>
                      <p>최근 수정: {formatDateTime(item.updatedAt)}</p>
                    </div>
                    <div className="grid gap-2 text-sm text-neutral-700 md:grid-cols-2">
                      <p className="rounded-xl bg-neutral-50 px-3 py-2">첫 문장: {item.script.heroLine || '-'}</p>
                      <p className="rounded-xl bg-neutral-50 px-3 py-2">두번째 문장 1: {item.script.detailLine || '-'}</p>
                      <p className="rounded-xl bg-neutral-50 px-3 py-2">두번째 문장 2: {item.script.detailLine2 || '-'}</p>
                      <p className="rounded-xl bg-neutral-50 px-3 py-2">마지막 문장: {item.script.closingLine || '-'}</p>
                      <p className="rounded-xl bg-neutral-50 px-3 py-2">브랜드 엔딩: {item.script.endingTitle || '-'} / {item.script.endingSubtitle || '-'}</p>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {renderStatuses[item.id]?.finalVideoUrl ? (
                      <a href={renderStatuses[item.id]?.finalVideoUrl ?? '#'} target="_blank" rel="noreferrer">
                        <Button type="button" variant="outline" className="gap-2">
                          <Video className="h-4 w-4" />
                          결과 영상 열기
                        </Button>
                      </a>
                    ) : null}
                    <Button type="button" variant="outline" className="gap-2" onClick={() => setSelectedItem(item)}>
                      <FileText className="h-4 w-4" />
                      패키지 보기
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2 text-rose-600 hover:text-rose-700"
                      onClick={() => void handleDelete(item)}
                      disabled={deletingId === item.id}
                    >
                      <Trash2 className="h-4 w-4" />
                      삭제
                    </Button>
                    <Link to={`/showroom?basicShortsDraftId=${encodeURIComponent(item.id)}`}>
                      <Button type="button" variant="outline" className="gap-2">
                        <ExternalLink className="h-4 w-4" />
                        수정 화면으로 이동
                      </Button>
                    </Link>
                  </div>
                </div>

                {renderStatuses[item.id]?.finalVideoUrl ? (
                  <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">채널별 론칭</p>
                        <p className="mt-1 text-xs text-neutral-500">렌더 완료 후 자동 준비된 3채널 게시 패키지를 검수하고 최종 게시하세요.</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-3">
                      {(targetsByDraftId[item.id] ?? []).map((target) => {
                        const prepared = buildShowroomBasicShortsPublishPackage(target)
                        const canLaunch = ['launch_ready', 'approved'].includes(target.publishStatus)
                        const canEditPackage = !['preparing', 'publishing'].includes(target.publishStatus)
                        const canReset = ['publishing', 'published', 'failed'].includes(target.publishStatus)
                        const isEditing = editingTargetId === target.id

                        return (
                          <div key={target.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-neutral-900">{getChannelLabel(target.channel)}</p>
                              <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-white">
                                {target.publishStatus}
                              </span>
                            </div>

                            <p className="mt-3 text-xs leading-5 text-neutral-500">{getPublishStatusGuide(target.publishStatus)}</p>

                            <div className="mt-3 space-y-2 text-sm text-neutral-700">
                              <p className="rounded-xl bg-neutral-50 px-3 py-2">{prepared.title || '-'}</p>
                              <p className="rounded-xl bg-neutral-50 px-3 py-2 whitespace-pre-wrap break-words">{prepared.caption || '-'}</p>
                              {target.externalPostUrl ? (
                                <a href={target.externalPostUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
                                  게시 링크 열기
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              ) : null}
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={!canEditPackage || actingDraftId === item.id}
                                onClick={() => handleStartEditPackage(target)}
                              >
                                패키지 수정
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                disabled={!canLaunch || actingDraftId === item.id}
                                onClick={() => void handleLaunchTarget(target)}
                              >
                                {actingDraftId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                게시
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!canReset || actingDraftId === item.id}
                                onClick={() => void handleResetTarget(target)}
                              >
                                복구
                              </Button>
                            </div>

                            {isEditing ? (
                              <div className="mt-4 space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                                <label className="block space-y-1 text-xs text-neutral-600">
                                  <span>제목</span>
                                  <Input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="bg-white" />
                                </label>
                                <label className="block space-y-1 text-xs text-neutral-600">
                                  <span>캡션</span>
                                  <textarea
                                    value={editBody}
                                    onChange={(event) => setEditBody(event.target.value)}
                                    rows={5}
                                    className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                                  />
                                </label>
                                <div className="flex flex-wrap gap-2">
                                  <Button type="button" size="sm" disabled={editSaving} onClick={() => void handleSaveEditPackage(target)}>
                                    {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    저장
                                  </Button>
                                  <Button type="button" size="sm" variant="outline" onClick={handleCancelEditPackage}>
                                    취소
                                  </Button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </div>

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>기본 쇼츠 제작 패키지</DialogTitle>
            <DialogDescription>
              현재 대기 중인 기본 쇼츠 요청의 확정 패키지입니다.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-neutral-800">
              {selectedItem?.packageText || '패키지 내용이 없습니다.'}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
