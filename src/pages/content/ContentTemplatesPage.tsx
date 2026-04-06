import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import ContentWorkspaceShell from '@/components/content/ContentWorkspaceShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getContentWorkspaceService } from '@/lib/contentWorkspaceService'
import { type MockTemplate } from './mockContentData'
import { readContentTemplatePrefs, writeContentTemplatePrefs } from './contentPrefs'

export default function ContentTemplatesPage() {
  const workspaceService = getContentWorkspaceService()
  const initialSnapshot = workspaceService.readSnapshot()
  const [query, setQuery] = useState(() => readContentTemplatePrefs().query)
  const [items, setItems] = useState<MockTemplate[]>(() => initialSnapshot.templates)
  const [selectedId, setSelectedId] = useState(
    () => readContentTemplatePrefs().selectedId || initialSnapshot.templates[0]?.id || ''
  )
  const [lastLoadedAt, setLastLoadedAt] = useState(() => workspaceService.now())
  const [draft, setDraft] = useState<MockTemplate | null>(null)
  const snapshot = workspaceService.readSnapshot()

  const loadTemplates = useCallback(async () => {
    const snapshot = await workspaceService.refreshSnapshot()
    const next = snapshot.templates
    setItems(next)
    setSelectedId((current) => current || next[0]?.id || '')
  }, [workspaceService])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    writeContentTemplatePrefs(query, selectedId)
  }, [query, selectedId])

  useEffect(() => {
    if (items.length === 0 && snapshot.templates.length > 0) {
      setItems(snapshot.templates)
      setSelectedId((current) => current || snapshot.templates[0]?.id || '')
    }
  }, [items.length, snapshot.templates])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      [item.name, item.description, item.templateType, item.performanceLabel].join(' ').toLowerCase().includes(normalized)
    )
  }, [items, query])
  const templateSummary = useMemo(() => {
    const stableCount = items.filter((item) => item.performanceLabel === '안정적').length
    const testingCount = items.filter((item) => item.performanceLabel === '테스트 확대').length
    const newCount = items.filter((item) => item.performanceLabel === '신규').length
    const attentionCount = items.filter((item) => item.performanceLabel === '보완 필요' || item.performanceLabel === '비활성').length
    return [
      { label: '전체 템플릿', value: `${items.length}개` },
      { label: '안정적', value: `${stableCount}개` },
      { label: '테스트 확대', value: `${testingCount}개` },
      { label: '신규', value: `${newCount}개` },
      { label: '보완/비활성', value: `${attentionCount}개` },
    ]
  }, [items])
  const lastPersistence = workspaceService.getLastPersistence()

  const selectedTemplate = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null
  const recommendedItems = useMemo(() => {
    if (!selectedTemplate) return []
    if (selectedTemplate.templateType === 'blog' || selectedTemplate.templateType === 'long_form') {
      return snapshot.items
        .filter((item) => item.blogTitle.trim() && item.seoDescription.trim())
        .slice(0, 4)
    }
    if (selectedTemplate.templateType === 'shorts_blog_service' || selectedTemplate.templateType === 'shorts_youtube_engine') {
      const targetType = selectedTemplate.templateType
      const matchingIds = new Set(
        snapshot.derivatives
          .filter((item) => item.type === targetType)
          .map((item) => item.contentItemId)
      )
      return snapshot.items.filter((item) => matchingIds.has(item.id)).slice(0, 4)
    }
    if (selectedTemplate.templateType === 'cta') {
      return snapshot.items.filter((item) => item.ctaText.trim()).slice(0, 4)
    }
    return snapshot.items.slice(0, 4)
  }, [selectedTemplate, snapshot.derivatives, snapshot.items])
  const templateOperationGuide = useMemo(() => {
    if (!selectedTemplate) return null
    const typeGuide =
      selectedTemplate.templateType === 'blog'
        ? '블로그 원문을 빠르게 구조화해야 할 때 우선 사용합니다.'
        : selectedTemplate.templateType === 'shorts_blog_service'
          ? '블로그를 요약해 릴스/페이스북 영상 스크립트와 발행 메모를 만들 때 적합합니다.'
          : selectedTemplate.templateType === 'shorts_youtube_engine'
          ? '짧은 후킹과 CTA를 빠르게 뽑아 쇼츠 대기열로 넘길 때 적합합니다.'
            : selectedTemplate.templateType === 'cta'
              ? '기존 원문/파생 초안의 CTA 문구를 통일할 때 사용합니다.'
              : '메인 원문을 확장해 롱폼 스크립트로 전개할 때 적합합니다.'
    const recommendedStage =
      selectedTemplate.performanceLabel === '안정적'
        ? '실운영 기본값으로 사용해도 됩니다.'
        : selectedTemplate.performanceLabel === '테스트 확대'
          ? '우선순위가 높은 후보 1~2건에서 먼저 검증하는 편이 좋습니다.'
          : selectedTemplate.performanceLabel === '보완 필요'
            ? '실운영 기본 템플릿으로 쓰기 전에 문구 구조를 먼저 다듬는 편이 좋습니다.'
            : selectedTemplate.performanceLabel === '비활성'
              ? '보관용으로만 두고 재활성 전까지는 신규 적용을 권장하지 않습니다.'
              : '신규 템플릿이므로 테스트성으로 제한 적용하는 편이 좋습니다.'
    const caution =
      selectedTemplate.templateType === 'shorts_blog_service'
      || selectedTemplate.templateType === 'shorts_youtube_engine'
      || selectedTemplate.templateType === 'cta'
        ? '후킹과 CTA가 비슷한 문구로 반복되지 않도록 최근 발행분과 비교가 필요합니다.'
        : '원문 길이가 길어질수록 핵심 질문과 CTA가 묻히지 않도록 FAQ/후킹과 함께 점검해야 합니다.'

    return { typeGuide, recommendedStage, caution }
  }, [selectedTemplate])
  const templateHealthChecks = useMemo(() => {
    if (!selectedTemplate) return []
    return [
      {
        label: '템플릿명',
        passed: Boolean(selectedTemplate.name.trim()),
        hint: selectedTemplate.name.trim() ? selectedTemplate.name : '템플릿명이 비어 있습니다.',
      },
      {
        label: '설명/구조',
        passed: Boolean(selectedTemplate.description.trim()) && selectedTemplate.description.trim().length >= 15,
        hint: selectedTemplate.description.trim() || '설명이 비어 있습니다.',
      },
      {
        label: '사용 이력',
        passed: selectedTemplate.usageCount > 0,
        hint: selectedTemplate.usageCount > 0 ? `${selectedTemplate.usageCount}회 사용됨` : '아직 사용 이력이 없습니다.',
      },
      {
        label: '적용 후보 콘텐츠',
        passed: recommendedItems.length > 0,
        hint: recommendedItems.length > 0 ? `${recommendedItems.length}개 후보 연결` : '바로 적용할 후보 콘텐츠가 없습니다.',
      },
    ]
  }, [recommendedItems.length, selectedTemplate])

  useEffect(() => {
    setDraft(selectedTemplate ? { ...selectedTemplate } : null)
  }, [selectedTemplate])

  async function handleRefresh() {
    await loadTemplates()
    setLastLoadedAt(workspaceService.now())
    toast.success('템플릿 데이터를 새로고침했습니다.')
  }

  async function handleSave() {
    if (!draft) return
    const result = await workspaceService.persistTemplate(draft)
    setItems(result.state.templates)
    setSelectedId(draft.id)
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success('템플릿을 Supabase에 저장했습니다.')
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 저장했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success('템플릿을 로컬 워크스페이스에 저장했습니다.')
    }
  }

  async function handleDuplicate() {
    if (!selectedTemplate) return
    const result = await workspaceService.duplicateWorkspaceTemplate(selectedTemplate.id)
    setItems(result.state.templates)
    if (result.entity) setSelectedId(result.entity.id)
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success('템플릿을 Supabase에 복제했습니다.')
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 복제했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success('템플릿을 로컬 워크스페이스에 복제했습니다.')
    }
  }

  async function handleCreateNew() {
    const next: MockTemplate = {
      id: `tpl-${Date.now()}`,
      templateType: 'blog',
      name: '새 템플릿',
      description: '새 템플릿 설명을 입력하세요.',
      usageCount: 0,
      performanceLabel: '신규',
    }
    const result = await workspaceService.persistTemplate(next)
    setItems(result.state.templates)
    setSelectedId(next.id)
    setLastLoadedAt(workspaceService.now())
    if (result.source === 'supabase') {
      toast.success('새 템플릿을 Supabase에 생성했습니다.')
    } else if (result.source === 'local_fallback') {
      toast.warning(`로컬에만 생성했습니다. ${result.remoteError ?? 'Supabase 저장 실패'}`)
    } else {
      toast.success('새 템플릿을 로컬 워크스페이스에 생성했습니다.')
    }
  }

  return (
    <ContentWorkspaceShell
      title="템플릿"
      description="반복 제작에 쓰는 블로그와 숏츠 템플릿을 관리하는 운영 화면입니다."
      actions={
        <>
          <Button variant="outline" onClick={() => void handleRefresh()}>
            <RefreshCw className="h-4 w-4" />
            데이터 새로고침
          </Button>
          <Button onClick={() => void handleCreateNew()}>
            <Sparkles className="h-4 w-4" />
            새 템플릿
          </Button>
        </>
      }
    >
      <section className="grid gap-4 md:grid-cols-5">
        {templateSummary.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">템플릿 목록</h2>
              <p className="mt-1 text-sm text-slate-500">사용 빈도와 운영 상태를 기준으로 정리합니다.</p>
              <p className="mt-2 text-xs text-slate-400">데이터 원천 {workspaceService.getRuntime().label}</p>
              {lastPersistence ? (
                <p className={`mt-2 text-xs ${lastPersistence.source === 'local_fallback' ? 'text-amber-700' : 'text-slate-400'}`}>
                  마지막 저장 {lastPersistence.source === 'supabase' ? 'Supabase' : lastPersistence.source === 'local_fallback' ? '로컬 fallback' : '로컬'} · {new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(lastPersistence.at))}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-400">마지막 데이터 갱신 {new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(lastLoadedAt))}</p>
            </div>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="템플릿명, 유형, 설명 검색"
              className="w-full lg:max-w-xs"
            />
          </div>

          <div className="mt-4 space-y-3">
            {filteredItems.map((item) => {
              const active = item.id === selectedTemplate?.id
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={[
                    'w-full rounded-2xl border p-4 text-left transition',
                    active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500">{item.templateType}</p>
                      <p className="mt-1 font-semibold text-slate-900">{item.name}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{item.performanceLabel}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                  <p className="mt-3 text-xs text-slate-400">사용 횟수 {item.usageCount}회</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">템플릿 상세</h2>
          {draft ? (
            <div className="mt-4 space-y-4">
              {templateOperationGuide ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">운영 가이드</p>
                  <p className="mt-2">{templateOperationGuide.typeGuide}</p>
                  <p className="mt-2">{templateOperationGuide.recommendedStage}</p>
                  <p className="mt-2 text-xs text-slate-500">주의 포인트 · {templateOperationGuide.caution}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">운영 체크</p>
                <div className="mt-3 space-y-2">
                  {templateHealthChecks.map((item) => (
                    <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-2">
                      <p className={`text-sm font-medium ${item.passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {item.passed ? '준비됨' : '확인 필요'} · {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm text-slate-500">선택 유형</p>
                <select
                  value={draft.templateType}
                  onChange={(event) => setDraft({ ...draft, templateType: event.target.value as MockTemplate['templateType'] })}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="blog">blog</option>
                  <option value="cta">cta</option>
                  <option value="shorts_blog_service">shorts_blog_service</option>
                  <option value="shorts_youtube_engine">shorts_youtube_engine</option>
                  <option value="long_form">long_form</option>
                </select>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="block text-sm text-slate-600">
                  템플릿명
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
                <label className="mt-4 block text-sm text-slate-600">
                  설명
                  <textarea
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-dashed border-slate-300 p-4">
                <p className="text-sm font-medium text-slate-900">추천 적용 후보</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {recommendedItems.length > 0 ? (
                    recommendedItems.map((item) => (
                      <Link
                        key={item.id}
                        to={buildTemplateCandidateHref(item.id, selectedTemplate.templateType)}
                        className="block rounded-xl bg-slate-50 p-3 hover:bg-slate-100"
                      >
                        <p className="font-medium text-slate-900">{item.siteName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.businessType} · {item.priorityReason} · 공개 수준 {item.revealLevel}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-600">{item.blogTitle}</p>
                      </Link>
                    ))
                  ) : (
                    <p>현재 연결해 볼 후보 콘텐츠가 없습니다.</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => void handleSave()}>템플릿 저장</Button>
                <Button variant="outline" onClick={() => void handleDuplicate()}>복제</Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">선택한 템플릿이 없습니다.</p>
          )}
        </div>
      </section>
    </ContentWorkspaceShell>
  )
}

function buildTemplateCandidateHref(contentItemId: string, templateType: MockTemplate['templateType']) {
  const tab =
    templateType === 'blog' || templateType === 'long_form'
      ? 'blog'
      : templateType === 'shorts_blog_service' || templateType === 'shorts_youtube_engine'
        ? 'derivatives'
        : 'basic'
  return `/content/${encodeURIComponent(contentItemId)}?tab=${encodeURIComponent(tab)}`
}
