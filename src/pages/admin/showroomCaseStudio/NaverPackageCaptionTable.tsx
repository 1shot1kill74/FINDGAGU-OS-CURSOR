import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NaverPackageImageItem } from '@/lib/naverBlogPackageBuilder'

export function NaverPackageCaptionTable({
  images,
  tableText,
  onCopy,
}: {
  images: NaverPackageImageItem[]
  tableText: string
  onCopy: (text: string, label: string) => void
}) {
  if (images.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">사진 캡션 정리표</p>
          <p className="mt-1 text-xs text-slate-500">네이버 사진 설명칸에 같은 번호 문구를 붙여넣으면 됩니다.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 gap-1.5"
          onClick={() => onCopy(tableText, '사진 캡션 정리표')}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          전체 복사
        </Button>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-semibold">마커</th>
              <th className="px-3 py-2 font-semibold">사진 설명</th>
              <th className="px-3 py-2 text-right font-semibold">복사</th>
            </tr>
          </thead>
          <tbody>
            {images.map((img) => (
              <tr key={`${img.index}-${img.caption}`} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-700">[이미지 {img.index}]</td>
                <td className="px-3 py-2 text-slate-800">{img.caption}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
                    onClick={() => onCopy(img.caption, `[이미지 ${img.index}] 사진 설명`)}
                  >
                    복사
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
