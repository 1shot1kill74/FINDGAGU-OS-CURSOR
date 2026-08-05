import { Link } from 'react-router-dom'
import {
  FINDGAGU_ENTITY_ONE_LINER,
  MANAGED_STUDY_CAFE_GUIDE_PATH,
} from '@/lib/aeo/managedStudyCafeFurnitureGuide'
import {
  PUBLIC_SHOWROOM_BRAND,
  PUBLIC_SHOWROOM_COMPANY,
  PUBLIC_SHOWROOM_HUB_PATH,
  PUBLIC_SHOWROOM_PRODUCT_ORIGIN,
  PUBLIC_SHOWROOM_SAME_AS,
} from '@/lib/publicShowroomSeo'

const CHANNEL_LABELS: Record<string, string> = {
  'youtube.com': '유튜브',
  'instagram.com': '인스타그램',
  'facebook.com': '페이스북',
  'blog.naver.com': '네이버 블로그',
}

function channelLabel(url: string): string {
  for (const [host, label] of Object.entries(CHANNEL_LABELS)) {
    if (url.includes(host)) return label
  }
  return '채널'
}

export default function PublicShowroomFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="text-base font-semibold tracking-tight text-slate-900">{PUBLIC_SHOWROOM_BRAND}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">{FINDGAGU_ENTITY_ONE_LINER}</p>
          </div>

          <div className="md:col-span-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">바로가기</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>
                <Link to={PUBLIC_SHOWROOM_HUB_PATH} className="hover:text-slate-900">
                  온라인 쇼룸
                </Link>
              </li>
              <li>
                <Link to={MANAGED_STUDY_CAFE_GUIDE_PATH} className="hover:text-slate-900">
                  관리형 가구 가이드
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-slate-900">
                  상담 문의
                </Link>
              </li>
              <li>
                <a
                  href={PUBLIC_SHOWROOM_PRODUCT_ORIGIN}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900"
                >
                  제품·회사 소개 (findgagu.com)
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">사업자 정보</p>
            <dl className="mt-3 space-y-1.5 text-sm leading-6 text-slate-700">
              <div>
                <dt className="sr-only">전화</dt>
                <dd>
                  TEL{' '}
                  <a href={`tel:${PUBLIC_SHOWROOM_COMPANY.phone}`} className="hover:text-slate-900">
                    {PUBLIC_SHOWROOM_COMPANY.phone}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="sr-only">이메일</dt>
                <dd>
                  <a href={`mailto:${PUBLIC_SHOWROOM_COMPANY.email}`} className="hover:text-slate-900">
                    {PUBLIC_SHOWROOM_COMPANY.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="sr-only">주소</dt>
                <dd>{PUBLIC_SHOWROOM_COMPANY.address}</dd>
              </div>
              <div>
                <dt className="sr-only">사업자등록번호</dt>
                <dd>사업자등록번호 {PUBLIC_SHOWROOM_COMPANY.businessNumber}</dd>
              </div>
              <div>
                <dt className="sr-only">통신판매업</dt>
                <dd>통신판매업신고 {PUBLIC_SHOWROOM_COMPANY.mailOrderNumber}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {PUBLIC_SHOWROOM_BRAND}. 현장 사례 쇼룸 · www.findgagu.co.kr
          </p>
          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {PUBLIC_SHOWROOM_SAME_AS.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-slate-800">
                  {channelLabel(url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
