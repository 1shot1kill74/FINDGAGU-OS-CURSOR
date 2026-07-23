import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eraser, Loader2, RefreshCw, Sparkles, Upload, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getShowroomImagePreviewUrl } from '@/lib/imageAssetShowroom'
import {
  cleanupPeopleFromAdInboxAsset,
  createAdInboxTimelapseJob,
  groupAdInboxBatches,
  listAdInboxAssets,
  updateAdInboxAssetRole,
  uploadAdInboxPhotos,
  type AdInboxAsset,
  type AdInboxBatch,
  type AdInboxRole,
} from '@/lib/adInboxStudio'
import {
  recommendAdInboxPair,
  resolveAssetsFromRecommendation,
  type AdInboxPairRecommendation,
} from '@/lib/adInboxPairRecommend'

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

export default function AdInboxStudioPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [assets, setAssets] = useState<AdInboxAsset[]>([])
  const [shortName, setShortName] = useState('')
  const [photoDate, setPhotoDate] = useState(todayYmd())
  const [uploadRole, setUploadRole] = useState<AdInboxRole>('unset')
  const [files, setFiles] = useState<File[]>([])
  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null)
  const [beforeId, setBeforeId] = useState<string | null>(null)
  const [afterId, setAfterId] = useState<string | null>(null)
  const [recommending, setRecommending] = useState(false)
  const [recommendation, setRecommendation] = useState<AdInboxPairRecommendation | null>(null)
  const [cleaningId, setCleaningId] = useState<string | null>(null)

  const batches = useMemo(() => groupAdInboxBatches(assets), [assets])
  const selectedBatch: AdInboxBatch | null =
    batches.find((b) => b.key === selectedBatchKey) ?? batches[0] ?? null

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listAdInboxAssets()
      setAssets(rows)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '대기실을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!selectedBatch) {
      setSelectedBatchKey(null)
      return
    }
    if (selectedBatchKey !== selectedBatch.key) {
      setSelectedBatchKey(selectedBatch.key)
    }
  }, [selectedBatch, selectedBatchKey])

  useEffect(() => {
    if (!selectedBatch) {
      setBeforeId(null)
      setAfterId(null)
      setRecommendation(null)
      return
    }
    const before = selectedBatch.assets.find((a) => a.before_after_role === 'before')
    const after = selectedBatch.assets.find((a) => a.before_after_role === 'after')
    setBeforeId(before?.id ?? null)
    setAfterId(after?.id ?? null)
    setRecommendation(null)
  }, [selectedBatch?.key])

  const handleRecommendPair = async () => {
    if (!selectedBatch) return
    setRecommending(true)
    try {
      const rec = await recommendAdInboxPair(selectedBatch)
      setRecommendation(rec)
      toast.success(rec.engine === 'ai' ? 'AI 매칭 추천이 준비됐습니다.' : '규칙 기반 추천이 준비됐습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '추천 실패')
    } finally {
      setRecommending(false)
    }
  }

  const handleApplyRecommendation = async () => {
    if (!selectedBatch || !recommendation) return
    const resolved = resolveAssetsFromRecommendation(selectedBatch, recommendation)
    if (!resolved) {
      toast.error('추천 사진을 찾지 못했습니다.')
      return
    }
    setBeforeId(resolved.before.id)
    setAfterId(resolved.after.id)
    try {
      await updateAdInboxAssetRole(resolved.before.id, 'before')
      await updateAdInboxAssetRole(resolved.after.id, 'after')
      await refresh()
      toast.success('추천 페어를 적용했습니다. 확인 후 타임랩스를 만드세요.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '적용 실패')
    }
  }

  const handleCleanupPeople = async (asset: AdInboxAsset) => {
    setCleaningId(asset.id)
    try {
      const { id } = await cleanupPeopleFromAdInboxAsset(asset)
      await refresh()
      setBeforeId(id)
      toast.success('사람 제거 보정본을 같은 배치에 추가했습니다. Before로 선택해 두었습니다.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '보정 실패')
    } finally {
      setCleaningId(null)
    }
  }

  const handleUpload = async () => {
    if (!files.length) {
      toast.error('사진을 선택하세요.')
      return
    }
    setUploading(true)
    try {
      const result = await uploadAdInboxPhotos({
        files,
        shortName,
        photoDate,
        role: uploadRole,
      })
      if (result.ok) {
        toast.success(`${result.ok}장 입고했습니다.`)
      }
      if (result.fail) {
        toast.error(`${result.fail}장 실패 · ${result.errors[0] ?? ''}`)
      }
      setFiles([])
      await refresh()
      setSelectedBatchKey(
        shortName.trim()
          ? `ad:${photoDate.trim() || todayYmd()}:${shortName.trim().toLowerCase()}`
          : null,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '입고에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleSetRole = async (asset: AdInboxAsset, role: AdInboxRole) => {
    try {
      await updateAdInboxAssetRole(asset.id, role)
      if (role === 'before') setBeforeId(asset.id)
      if (role === 'after') setAfterId(asset.id)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '태그 저장 실패')
    }
  }

  const handlePickForTimelapse = (asset: AdInboxAsset, slot: 'before' | 'after') => {
    if (slot === 'before') setBeforeId(asset.id)
    else setAfterId(asset.id)
    if (asset.before_after_role !== slot) {
      void handleSetRole(asset, slot)
    }
  }

  const beforeAsset = selectedBatch?.assets.find((a) => a.id === beforeId) ?? null
  const afterAsset = selectedBatch?.assets.find((a) => a.id === afterId) ?? null

  const handleCreateTimelapse = async () => {
    if (!beforeAsset || !afterAsset) {
      toast.error('Before 1장과 After 1장을 선택하세요.')
      return
    }
    setCreating(true)
    try {
      const { jobId } = await createAdInboxTimelapseJob({
        before: beforeAsset,
        after: afterAsset,
      })
      toast.success('클링 생성을 시작했습니다. 검수함으로 이동합니다.')
      navigate(`/admin/showroom-shorts?job=${encodeURIComponent(jobId)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '타임랩스 생성 실패')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to="/dashboard"
              className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
            >
              <ArrowLeft className="h-4 w-4" />
              대시보드
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">광고 대기실</h1>
            <p className="mt-1 max-w-2xl text-sm text-neutral-500">
              분류 전 사진을 날짜·짧은 이름으로만 모읍니다. 제품·색상·쇼룸 정리는 하지 않습니다.
              BA 두 장을 고르면 기존 클링 검수함으로 보냅니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
            <Button type="button" variant="outline" size="sm" asChild>
              <Link to="/admin/showroom-shorts">숏츠 검수함</Link>
            </Button>
          </div>
        </div>

        <section className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-4 w-4 text-neutral-700" />
            <h2 className="text-base font-semibold text-neutral-900">입고 입구</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">짧은 이름 (필수)</span>
              <Input
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="예: 평택스터디"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-neutral-600">날짜 (필수)</span>
              <Input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['unset', '태그 나중에'],
                ['before', 'Before로 입고'],
                ['after', 'After로 입고'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setUploadRole(value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  uploadRole === value
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 ? (
              <p className="mt-1 text-xs text-neutral-500">{files.length}장 선택됨</p>
            ) : null}
          </div>
          <div className="mt-4">
            <Button type="button" onClick={() => void handleUpload()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
              대기실에 넣기
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">대기실 · 배치</h2>
              <p className="text-xs text-neutral-500">날짜 + 짧은 이름으로 묶입니다. 현장 매칭은 나중에.</p>
            </div>
            {selectedBatch && beforeAsset && afterAsset ? (
              <Button type="button" onClick={() => void handleCreateTimelapse()} disabled={creating}>
                {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}
                타임랩스 만들기
              </Button>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : batches.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-500">아직 입고된 사진이 없습니다.</p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <div className="space-y-1">
                {batches.map((batch) => (
                  <button
                    key={batch.key}
                    type="button"
                    onClick={() => setSelectedBatchKey(batch.key)}
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                      selectedBatch?.key === batch.key
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-300'
                    }`}
                  >
                    <div className="font-medium">{batch.label}</div>
                    <div className={`mt-0.5 text-[11px] ${selectedBatch?.key === batch.key ? 'text-neutral-300' : 'text-neutral-500'}`}>
                      B{batch.beforeCount} · A{batch.afterCount}
                      {batch.unsetCount ? ` · ?${batch.unsetCount}` : ''} · {batch.assets.length}장
                    </div>
                  </button>
                ))}
              </div>

              {selectedBatch ? (
                <div>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
                      Before: {beforeAsset ? '선택됨' : '미선택'}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800">
                      After: {afterAsset ? '선택됨' : '미선택'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRecommendPair()}
                      disabled={recommending || selectedBatch.assets.length < 2}
                    >
                      {recommending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      매칭 추천
                    </Button>
                  </div>

                  {recommendation ? (
                    <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3 text-sm text-violet-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          추천 페어 · {recommendation.engine === 'ai' ? 'AI' : '규칙'} · 신뢰도{' '}
                          {recommendation.confidence}
                        </p>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={() => void handleApplyRecommendation()}>
                            적용
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setRecommendation(null)}
                          >
                            무시
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-violet-800">{recommendation.reason}</p>
                      <p className="mt-2 text-[11px] text-violet-700">
                        자동 실행하지 않습니다. 적용 후 눈으로 확인하고 타임랩스를 만드세요.
                      </p>
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {selectedBatch.assets.map((asset) => {
                      const preview = getShowroomImagePreviewUrl(asset)
                      const isBefore = beforeId === asset.id
                      const isAfter = afterId === asset.id
                      return (
                        <div
                          key={asset.id}
                          className={`overflow-hidden rounded-xl border bg-neutral-50 ${
                            isBefore
                              ? 'border-amber-500 ring-2 ring-amber-200'
                              : isAfter
                                ? 'border-emerald-500 ring-2 ring-emerald-200'
                                : 'border-neutral-200'
                          }`}
                        >
                          <div className="aspect-[4/3] bg-neutral-200">
                            {preview ? (
                              <img src={preview} alt="" className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="space-y-1.5 p-2">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                aria-pressed={isBefore}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                  isBefore
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-amber-50 hover:text-amber-900'
                                }`}
                                onClick={() => handlePickForTimelapse(asset, 'before')}
                              >
                                Before
                              </button>
                              <button
                                type="button"
                                aria-pressed={isAfter}
                                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                  isAfter
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-emerald-50 hover:text-emerald-900'
                                }`}
                                onClick={() => handlePickForTimelapse(asset, 'after')}
                              >
                                After
                              </button>
                              <button
                                type="button"
                                disabled={cleaningId === asset.id}
                                className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-900 disabled:opacity-50"
                                onClick={() => void handleCleanupPeople(asset)}
                              >
                                {cleaningId === asset.id ? '보정중…' : '사람제거'}
                              </button>
                            </div>
                            {!isBefore && !isAfter ? (
                              <p className="text-[10px] text-neutral-400">미선택 · 하나를 누르세요</p>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => beforeAsset && void handleCleanupPeople(beforeAsset)}
                      disabled={!beforeAsset || cleaningId === beforeAsset?.id}
                    >
                      {cleaningId && beforeAsset && cleaningId === beforeAsset.id ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Eraser className="mr-1.5 h-4 w-4" />
                      )}
                      Before 사람 제거 보정
                    </Button>
                    <Button
                      type="button"
                      onClick={() => void handleCreateTimelapse()}
                      disabled={creating || !beforeAsset || !afterAsset}
                    >
                      {creating ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Video className="mr-1.5 h-4 w-4" />
                      )}
                      타임랩스 만들기 → 검수함
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link to="/admin/showroom-shorts">검수함만 열기</Link>
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    사람이 찍힌 Before는 타임랩스 전에 「사람 제거 보정」→ 새 컷 확인 → 그다음 타임랩스.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
