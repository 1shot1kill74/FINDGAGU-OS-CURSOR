import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bot, LayoutDashboard, Layers3, ListTodo, Send, Sparkles } from 'lucide-react'

type ContentWorkspaceShellProps = {
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

const navigationItems = [
  { href: '/content', label: '발행 큐', icon: ListTodo },
  { href: '/content/distribution', label: '배포 관리', icon: Send },
  { href: '/content/automation', label: '자동화 큐', icon: Bot },
  { href: '/content/templates', label: '템플릿', icon: Layers3 },
]

export default function ContentWorkspaceShell({ title, description, actions, children }: ContentWorkspaceShellProps) {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:block">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-900 p-2 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">콘텐츠 시스템</p>
              <p className="text-xs text-slate-500">내부 운영 콘솔</p>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            <Link
              to="/dashboard"
              className="flex items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              <LayoutDashboard className="h-4 w-4" />
              대시보드
            </Link>
            {navigationItems.map((item) => {
              const Icon = item.icon
              const active = location.pathname === item.href
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={[
                    'flex items-center gap-3 rounded-2xl px-3 py-2 text-sm transition',
                    active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-700">운영 기준</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              발행 큐에서 우선순위를 정하고, 콘텐츠 상세에서 원문과 파생을 보완한 뒤, 자동화 큐와 배포 관리에서 최종 반영까지 확인합니다.
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Content Workspace</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
              </div>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
          </header>

          <div className="mt-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
