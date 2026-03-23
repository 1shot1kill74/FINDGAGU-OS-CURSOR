import { Link, useLocation } from 'react-router-dom'
import { Grid3X3, Home, Image, MessageSquare } from 'lucide-react'

const TABS = [
  { label: '홈', path: '/', icon: Home },
  { label: '쇼룸', path: '/showroom', icon: Image },
  { label: '카탈로그', path: '/products-sites', icon: Grid3X3 },
  { label: '문의', path: '/contact', icon: MessageSquare },
]

export default function MobileTabBar() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-lg md:hidden">
      <div className="flex h-16 items-center justify-around">
        {TABS.map((tab) => {
          const active = location.pathname === tab.path
          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <tab.icon size={20} strokeWidth={active ? 2 : 1.5} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
