import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { differenceInCalendarDays, endOfMonth, formatDistanceToNow, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  ArrowRight,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Images,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  Sparkles,
  Target,
  TriangleAlert,
  Video,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { fetchShowroomImageAssets, type ShowroomImageAsset } from '@/lib/imageAssetService'
import { DEFAULT_PUBLIC_SHOWROOM_ORIGIN, DEFAULT_PUBLIC_SHOWROOM_PATH } from '@/lib/showroomShareService'
import { useConsultations } from '@/hooks/useConsultations'

const DASHBOARD_WORKFLOW_STAGES = ['상담접수', '견적중', '계약완료', '시공완료'] as const
type DashboardWorkflowStage = (typeof DASHBOARD_WORKFLOW_STAGES)[number]

const STATUS_TO_STAGE: Record<string, DashboardWorkflowStage> = {
  접수: '상담접수',
  견적: '견적중',
  진행: '계약완료',
  완료: '시공완료',
  AS: '시공완료',
  거절: '시공완료',
  무효: '시공완료',
  상담중: '상담접수',
  견적발송: '견적중',
  계약완료: '계약완료',
  휴식기: '시공완료',
  시공완료: '시공완료',
  AS_WAITING: '시공완료',
  신규: '상담접수',
}

function getDashboardShowroomGroupKey(asset: ShowroomImageAsset): string {
  const spaceId = asset.space_id?.trim()
  if (spaceId) return `space:${spaceId}`
  const beforeAfterGroupId = asset.before_after_group_id?.trim()
  if (beforeAfterGroupId) return `before-after:${beforeAfterGroupId}`
  const canonicalSiteName = asset.canonical_site_name?.trim()
  if (canonicalSiteName) return `site:${canonicalSiteName}`
  const siteName = asset.site_name?.trim()
  if (siteName) return `site:${siteName}`
  return 'site:미지정'
}

function getTimeAgoLabel(value: string | null | undefined): string {
  if (!value) return '날짜 없음'
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return '날짜 없음'
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ko })
}

function parseComparableDateValue(dateString: string | null | undefined, fallbackDate?: string | null | undefined): number | null {
  const source = typeof dateString === 'string' && dateString.trim()
    ? dateString.trim()
    : typeof fallbackDate === 'string' && fallbackDate.trim()
      ? fallbackDate.trim()
      : null
  if (!source) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(source) ? `${source}T12:00:00` : source
  const value = new Date(normalized).getTime()
  return Number.isFinite(value) ? value : null
}

function isWithinThisMonth(value: number | null, monthStart: number, monthEnd: number): boolean {
  return value != null && value >= monthStart && value <= monthEnd
}

function resolveWorkflowStage(status: string | null | undefined, metadata: Record<string, unknown> | null): DashboardWorkflowStage {
  const rawStage = metadata && typeof metadata.workflow_stage === 'string' ? metadata.workflow_stage.trim() : ''
  if (DASHBOARD_WORKFLOW_STAGES.includes(rawStage as DashboardWorkflowStage)) {
    return rawStage as DashboardWorkflowStage
  }
  if (rawStage === '현장실측') return '견적중'
  const rawStatus = typeof status === 'string' ? status.trim() : ''
  return STATUS_TO_STAGE[rawStatus] ?? '상담접수'
}

function parseEstimateHistoryAmounts(metadata: Record<string, unknown> | null): Array<{ issuedAt: string | null; amount: number }> {
  const raw = metadata?.estimate_history
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => item != null && typeof item === 'object')
    .map((item) => ({
      issuedAt: typeof item.issued_at === 'string' ? item.issued_at : null,
      amount:
        typeof item.amount === 'number'
          ? item.amount
          : Number(item.amount ?? 0),
    }))
    .filter((item) => item.amount > 0)
}

function formatCurrencySummary(value: number): string {
  if (value >= 100_000_000) {
    const uk = value / 100_000_000
    return `${uk.toLocaleString('ko-KR', { maximumFractionDigits: uk >= 10 ? 0 : 1 })}억`
  }
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

function getNeglectDaysLabel(value: string | null | undefined, fallback?: string | null | undefined): string {
  const timestamp = parseComparableDateValue(value, fallback)
  if (timestamp == null) return '기준일 없음'
  const days = Math.max(0, differenceInCalendarDays(new Date(), new Date(timestamp)))
  return `${days}일 방치`
}

const QUICK_NAV_COLLAPSED_KEY = 'dashboard-quick-nav-collapsed'

function readQuickNavCollapsed(): boolean {
  try {
    return localStorage.getItem(QUICK_NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function getOpenShowroomUrl() {
  const configured = (import.meta.env.VITE_PUBLIC_SHOWROOM_BASE_URL ?? '').toString().trim()
  if (configured) {
    try {
      const parsed = new URL(configured.includes('://') ? configured : `https://${configured}`)
      const normalizedPath = parsed.pathname.replace(/\/+$/, '')
      if (normalizedPath.endsWith(DEFAULT_PUBLIC_SHOWROOM_PATH)) return parsed.toString()
      if (!normalizedPath || normalizedPath === '/' || normalizedPath === '/showroom') {
        return `${parsed.origin}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
      }
      return `${parsed.origin}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
    } catch {
      return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
    }
  }

  return `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${DEFAULT_PUBLIC_SHOWROOM_PATH}`
}

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const { consultations, loading: consultationsLoading } = useConsultations(true)
  const [showroomAssets, setShowroomAssets] = useState<ShowroomImageAsset[]>([])
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [quickNavCollapsed, setQuickNavCollapsed] = useState(readQuickNavCollapsed)
  const openShowroomUrl = getOpenShowroomUrl()

  const toggleQuickNav = () => {
    setQuickNavCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(QUICK_NAV_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore storage errors
      }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    setAssetsLoading(true)
    fetchShowroomImageAssets()
      .then((list) => {
        if (!cancelled) setShowroomAssets(list)
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dashboardStats = useMemo(() => {
    const now = new Date()
    const monthStart = startOfMonth(now).getTime()
    const monthEnd = endOfMonth(now).getTime()
    const visibleConsultations = consultations.filter((item) => item.is_visible !== false && !item.is_test)

    const activeConsultationsThisMonth = visibleConsultations.filter((item) => {
      const workflowStage = resolveWorkflowStage(item.status, item.metadata)
      if (!['상담접수', '견적중', '계약완료'].includes(workflowStage)) return false
      const updatedAt = parseComparableDateValue(item.update_date, item.created_at)
      return isWithinThisMonth(updatedAt, monthStart, monthEnd)
    })

    const newConsultationsThisMonth = visibleConsultations.filter((item) => {
      const inboundAt = parseComparableDateValue(item.start_date, item.created_at)
      return isWithinThisMonth(inboundAt, monthStart, monthEnd)
    })

    const estimateAmountThisMonth = visibleConsultations.reduce((sum, item) => {
      const estimateHistory = parseEstimateHistoryAmounts(item.metadata)
      const hasEstimateUploadedThisMonth = estimateHistory.some((historyItem) =>
        isWithinThisMonth(parseComparableDateValue(historyItem.issuedAt), monthStart, monthEnd)
      )
      if (hasEstimateUploadedThisMonth) {
        return sum + Math.max(0, item.expected_revenue ?? 0)
      }
      if ((item.expected_revenue ?? 0) <= 0) return sum
      const updatedAt = parseComparableDateValue(item.update_date, item.created_at)
      return isWithinThisMonth(updatedAt, monthStart, monthEnd)
        ? sum + Math.max(0, item.expected_revenue ?? 0)
        : sum
    }, 0)

    const completedConsultationsThisMonth = visibleConsultations.filter((item) => {
      const workflowStage = resolveWorkflowStage(item.status, item.metadata)
      if (workflowStage !== '시공완료') return false
      if (item.status === '거절' || item.status === '무효' || item.status === 'AS') return false
      const updatedAt = parseComparableDateValue(item.update_date, item.created_at)
      return isWithinThisMonth(updatedAt, monthStart, monthEnd)
    })

    const showroomSiteAssets = showroomAssets.filter((asset) => asset.before_after_role !== 'before')
    const showroomSiteCount = new Set(showroomSiteAssets.map(getDashboardShowroomGroupKey)).size
    const missingDisplayNameCount = showroomAssets.filter((asset) => !(asset.external_display_name ?? '').trim()).length
    const unmatchedSpaceCount = showroomAssets.filter((asset) => !(asset.space_id ?? '').trim()).length

    const beforeAfterMap = new Map<string, { before: boolean; after: boolean }>()
    showroomAssets.forEach((asset) => {
      if (asset.before_after_role !== 'before' && asset.before_after_role !== 'after') return
      const key = getDashboardShowroomGroupKey(asset)
      const current = beforeAfterMap.get(key) ?? { before: false, after: false }
      if (asset.before_after_role === 'before') current.before = true
      if (asset.before_after_role === 'after') current.after = true
      beforeAfterMap.set(key, current)
    })
    const completedBeforeAfterCount = Array.from(beforeAfterMap.values()).filter((item) => item.before && item.after).length
    const incompleteBeforeAfterCount = Array.from(beforeAfterMap.values()).filter((item) => item.before !== item.after).length

    return {
      activeConsultationCount: activeConsultationsThisMonth.length,
      newConsultationCount: newConsultationsThisMonth.length,
      estimateAmountThisMonth,
      completedConsultationCount: completedConsultationsThisMonth.length,
      showroomSiteCount,
      completedBeforeAfterCount,
      incompleteBeforeAfterCount,
      missingDisplayNameCount,
      unmatchedSpaceCount,
    }
  }, [consultations, showroomAssets])

  const recentConsultations = useMemo(
    () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoTime = sevenDaysAgo.getTime()

      return consultations.filter((item) => {
        if (item.is_visible === false || item.is_test) return false
        const recentBaseDate = parseComparableDateValue(item.start_date, item.created_at)
        return recentBaseDate != null && recentBaseDate >= sevenDaysAgoTime
      })
    },
    [consultations]
  )

  const neglectedConsultations = useMemo(() => {
    return consultations
      .filter((item) => {
        if (item.is_visible === false || item.is_test) return false
        if (item.status === '거절') return false
        const workflowStage = resolveWorkflowStage(item.status, item.metadata)
        if (workflowStage !== '상담접수' && workflowStage !== '견적중') return false
        const updatedAt = parseComparableDateValue(item.update_date, item.created_at)
        if (updatedAt == null) return false
        const neglectDays = differenceInCalendarDays(new Date(), new Date(updatedAt))
        return neglectDays >= 8 && neglectDays <= 30
      })
      .map((item) => ({
        ...item,
        sortValue: parseComparableDateValue(item.update_date, item.created_at) ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => b.sortValue - a.sortValue)
  }, [consultations])

  const quickActions = [
    {
      title: '상담 관리',
      description: '상담 등록, 상태 변경, 고객 정보 정리를 바로 진행합니다.',
      to: '/consultation',
      icon: ClipboardList,
    },
    {
      title: '이미지 자산 관리',
      description: '상담용 사진, 태그, 색상, 외부 표시명을 관리합니다.',
      to: '/image-assets',
      icon: Images,
    },
    {
      title: '내부 쇼룸',
      description: '직원용 시공사례 쇼룸과 노출 순서를 점검합니다.',
      to: '/showroom',
      icon: MonitorCog,
    },
    {
      title: '오픈 쇼룸',
      description: '고객용 공개 쇼룸을 새 탭에서 확인합니다.',
      href: openShowroomUrl,
      external: true as const,
      icon: ExternalLink,
    },
    {
      title: '광고 대기실',
      description: '분류 전 BA 사진 입고 후 클링 타임랩스로 보냅니다.',
      to: '/admin/ad-inbox',
      icon: Video,
    },
    {
      title: '케이스 작업실',
      description: '사례 블로그 초안 생성과 즉시 공개를 관리합니다.',
      to: '/admin/showroom-case-studio',
      icon: Sparkles,
    },
    {
      title: '쇼룸 유입',
      description: '고민 카드·사례·상담 클릭까지 쇼룸 고객 행동을 실측합니다.',
      to: '/admin/showroom-abm',
      icon: BarChart3,
    },
    {
      title: '이미지 업로드',
      description: '새 상담용 이미지를 바로 올리고 분류합니다.',
      to: '/image-assets/upload',
      icon: ImagePlus,
    },
    {
      title: '경쟁사 모니터링',
      description: '완내스 유튜브·인스타·블로그·키워드 수집 현황을 확인합니다.',
      to: '/admin/competitor-monitor',
      icon: Target,
    },
    {
      title: '교육가구 아웃리치',
      description: '학원·학교·스터디 공개 시그널을 점수화하고 승인 후 제안합니다.',
      to: '/admin/edu-outreach',
      icon: Send,
    },
  ] as const

  const loading = consultationsLoading || assetsLoading

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="mx-auto flex max-w-7xl gap-4 px-4 py-8 md:gap-6 md:px-8">
        <aside
          className={`sticky top-8 hidden shrink-0 self-start overflow-visible transition-[width] duration-200 lg:block ${
            quickNavCollapsed ? 'w-[4.5rem]' : 'w-72'
          }`}
        >
          <div className="overflow-visible rounded-3xl border border-neutral-200 bg-white shadow-sm">
            <div
              className={`flex items-center border-b border-neutral-100 ${
                quickNavCollapsed ? 'justify-center px-2 py-3' : 'justify-between gap-2 px-4 py-3'
              }`}
            >
              {!quickNavCollapsed ? (
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-neutral-900">빠른 이동</h2>
                  <p className="mt-0.5 text-xs text-neutral-500">자주 쓰는 화면</p>
                </div>
              ) : null}
              <button
                type="button"
                onClick={toggleQuickNav}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-800"
                aria-label={quickNavCollapsed ? '빠른 이동 펼치기' : '빠른 이동 접기'}
                aria-expanded={!quickNavCollapsed}
              >
                {quickNavCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
            </div>
            <nav className={`space-y-1 ${quickNavCollapsed ? 'p-2' : 'p-3'}`}>
              {quickActions.map((item) => {
                const Icon = item.icon
                const className = `group relative flex items-center rounded-2xl border border-transparent text-neutral-700 transition-colors hover:border-neutral-200 hover:bg-neutral-50 ${
                  quickNavCollapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
                }`
                const content = (
                  <>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    {!quickNavCollapsed ? (
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900">{item.title}</span>
                        <span className="mt-0.5 block text-xs leading-4 text-neutral-500">{item.description}</span>
                      </span>
                    ) : (
                      <span className="pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 pl-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100">
                        <span className="block whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 shadow-md">
                          {item.title}
                        </span>
                      </span>
                    )}
                  </>
                )
                if ('href' in item) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {content}
                    </a>
                  )
                }
                return (
                  <Link key={item.to} to={item.to} className={className}>
                    {content}
                  </Link>
                )
              })}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1 space-y-8">
        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">빠른 이동</h2>
              <p className="mt-1 text-sm text-neutral-500">자주 쓰는 화면을 한 번에 엽니다.</p>
            </div>
            <button
              type="button"
              onClick={toggleQuickNav}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500"
              aria-label={quickNavCollapsed ? '빠른 이동 펼치기' : '빠른 이동 접기'}
              aria-expanded={!quickNavCollapsed}
            >
              {quickNavCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
          {!quickNavCollapsed ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {quickActions.map((item) => {
                const Icon = item.icon
                const className =
                  'group flex items-start gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-neutral-300 hover:bg-white'
                const content = (
                  <>
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-neutral-900">{item.title}</span>
                      <span className="mt-1 block text-sm leading-5 text-neutral-500">{item.description}</span>
                    </span>
                  </>
                )
                if ('href' in item) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {content}
                    </a>
                  )
                }
                return (
                  <Link key={item.to} to={item.to} className={className}>
                    {content}
                  </Link>
                )
              })}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                <LayoutDashboard className="h-3.5 w-3.5" />
                FINDGAGU OS Dashboard
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">오늘 작업을 한 화면에서 확인하세요</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">
                  상담, 이미지 자산, 쇼룸 운영 상태를 빠르게 점검하고 바로 자주 쓰는 화면으로 이동할 수 있는 내부 허브입니다.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                {user?.email || '로그인 사용자'}
              </div>
              <Link to="/consultation">
                <Button className="gap-1.5">
                  상담 관리 열기
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/showroom">
                <Button type="button" variant="outline" className="gap-1.5">
                  내부 쇼룸 보기
                </Button>
              </Link>
              <Link to="/admin/showroom-case-studio">
                <Button type="button" variant="outline" className="gap-1.5">
                  케이스 작업실
                </Button>
              </Link>
              <a href={openShowroomUrl} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" className="gap-1.5">
                  오픈 쇼룸 보기
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </a>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={async () => {
                  try {
                    await signOut()
                  } catch (error) {
                    console.error(error)
                    toast.error('로그아웃에 실패했습니다.')
                  }
                }}
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">이번달 진행 상담</p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900">{dashboardStats.activeConsultationCount}</p>
            <p className="mt-2 text-xs text-neutral-500">업데이트일 기준 · 접수/견적/진행 상태</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">이번달 신규 상담</p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900">{dashboardStats.newConsultationCount}</p>
            <p className="mt-2 text-xs text-neutral-500">인입일 기준 이번달 상담 수</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">이번달 견적 금액</p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900">{formatCurrencySummary(dashboardStats.estimateAmountThisMonth)}</p>
            <p className="mt-2 text-xs text-neutral-500">이번달 견적서 업로드 이력 있는 상담의 대표 견적 합계</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-neutral-500">이번달 완료 상담</p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900">{dashboardStats.completedConsultationCount}</p>
            <p className="mt-2 text-xs text-neutral-500">업데이트일 기준 완료 처리된 상담 건수</p>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-900">최근 상담</h2>
                <p className="mt-1 text-sm text-neutral-500">최근 7일 이내 인입된 상담을 확인합니다.</p>
              </div>
              <Link to="/consultation" className="text-sm font-medium text-amber-700 hover:text-amber-800">
                전체 보기
              </Link>
            </div>
            <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-neutral-500">불러오는 중…</p>
              ) : recentConsultations.length === 0 ? (
                <p className="text-sm text-neutral-500">표시할 상담이 없습니다.</p>
              ) : (
                recentConsultations.map((item) => (
                  <Link
                    key={item.id}
                    to={`/consultation?leadId=${item.id}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-neutral-300 hover:bg-white"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">{item.company_name || '(업체명 없음)'}</p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {item.status || '상태 미지정'}
                        {item.contact ? ` · ${item.contact}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs text-neutral-400">{getTimeAgoLabel(item.created_at)}</div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-neutral-900">방치 상담</h2>
                  <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                    {neglectedConsultations.length}건
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">접수·견적 상태 중 8일 이상 30일 이내 방치된 상담을 확인합니다.</p>
              </div>
              <Link to="/consultation" className="text-sm font-medium text-amber-700 hover:text-amber-800">
                전체 보기
              </Link>
            </div>
            <div className="mt-5 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {loading ? (
                <p className="text-sm text-neutral-500">불러오는 중…</p>
              ) : neglectedConsultations.length === 0 ? (
                <p className="text-sm text-neutral-500">표시할 방치 상담이 없습니다.</p>
              ) : (
                neglectedConsultations.map((item) => (
                  <Link
                    key={item.id}
                    to={`/consultation?leadId=${item.id}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 transition-colors hover:border-neutral-300 hover:bg-white"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-900">
                        {item.company_name || '(업체명 없음)'}
                      </p>
                      <p className="mt-1 text-sm text-neutral-500">
                        {item.status || '상태 미지정'}
                        {item.contact ? ` · ${item.contact}` : ''}
                      </p>
                      <p className="mt-2 flex items-center gap-1 text-xs text-neutral-400">
                        <Clock3 className="h-3.5 w-3.5" />
                        마지막 업데이트 {getTimeAgoLabel(item.update_date || item.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs font-medium text-rose-500">
                      {getNeglectDaysLabel(item.update_date, item.created_at)}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">데이터 점검</h2>
          <p className="mt-1 text-sm text-neutral-500">운영 전에 확인할 항목만 모아봤습니다.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <Sparkles className="h-4 w-4 text-amber-600" />
                외부 표시명 누락
              </div>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">{dashboardStats.missingDisplayNameCount}</p>
              <p className="mt-1 text-xs text-neutral-500">고객용 외부 디스플레이 네임이 비어 있는 이미지 수</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <FolderOpen className="h-4 w-4 text-sky-600" />
                스페이스 미매칭
              </div>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">{dashboardStats.unmatchedSpaceCount}</p>
              <p className="mt-1 text-xs text-neutral-500">`space_id` 없이 남아 있는 상담용 이미지 수</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-neutral-800">
                <TriangleAlert className="h-4 w-4 text-rose-600" />
                Before/After 상태
              </div>
              <p className="mt-2 text-2xl font-semibold text-neutral-900">
                {dashboardStats.completedBeforeAfterCount}
                <span className="ml-2 text-base font-medium text-neutral-400">완성 / {dashboardStats.incompleteBeforeAfterCount} 보완 필요</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">비포어/애프터 묶음 기준 집계</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">운영 보조 메뉴</h2>
              <p className="mt-1 text-sm text-neutral-500">가끔 필요한 관리 화면은 아래에서 바로 이동합니다.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/homepage-concept"><Button variant="outline">홈페이지 컨셉</Button></Link>
            <Link to="/admin/migration"><Button variant="outline">데이터 통합 마이그레이션</Button></Link>
            <Link to="/admin/archive"><Button variant="outline">숨긴 상담 아카이브</Button></Link>
            <Link to="/admin/competitor-monitor"><Button variant="outline">경쟁사 모니터링</Button></Link>
            <Link to="/admin/edu-outreach"><Button variant="outline">교육가구 아웃리치</Button></Link>
            <Link to="/admin/showroom-case-studio"><Button variant="outline">케이스 작업실</Button></Link>
            <Link to="/admin/showroom-abm"><Button variant="outline">쇼룸 유입</Button></Link>
            <Link to="/admin/test-console"><Button variant="outline">채널톡 시뮬레이터</Button></Link>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}
