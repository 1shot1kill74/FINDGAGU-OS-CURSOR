import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl section-padding py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <h3 className="text-lg font-semibold text-foreground">파인드가구</h3>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              공간의 문제를 읽고, 가구로 해결책을 씁니다.
              <br />
              실제 시공 사례를 먼저 보여주고, 그다음 제품과 상담 흐름으로 자연스럽게 연결합니다.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground">바로가기</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><Link to="/showroom" className="transition-colors hover:text-foreground">쇼룸</Link></li>
              <li><Link to="/products-sites" className="transition-colors hover:text-foreground">제품 카탈로그</Link></li>
              <li><Link to="/contact" className="transition-colors hover:text-foreground">문의하기</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground">운영 원칙</h4>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>문제에서 시작</li>
              <li>사례로 설명</li>
              <li>제품은 맥락으로 연결</li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          © 2026 FINDGAGU. 공간 결과와 운영 흐름을 함께 설명하는 공개 홈페이지.
        </div>
      </div>
    </footer>
  )
}
