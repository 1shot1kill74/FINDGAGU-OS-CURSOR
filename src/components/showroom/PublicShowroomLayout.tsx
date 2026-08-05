import { Outlet } from 'react-router-dom'
import PublicShowroomFooter from '@/components/showroom/PublicShowroomFooter'

/** 공개 쇼룸·가이드·문의 공통 레이아웃 (신뢰용 푸터) */
export default function PublicShowroomLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <Outlet />
      </div>
      <PublicShowroomFooter />
    </div>
  )
}
