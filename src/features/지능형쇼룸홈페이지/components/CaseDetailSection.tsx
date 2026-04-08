import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  buildCompactCaseLabel,
  buildConceptContactUrl,
  buildSiteFactChips,
  type ConcernCard,
  type SiteGroup,
} from '@/features/지능형쇼룸홈페이지/useShowroomHomepageData'

interface CaseDetailSectionProps {
  selectedSite: SiteGroup
  selectedConcern: ConcernCard
  selectedImageIndex: number
  onClose: () => void
  onSelectImage: (index: number) => void
  onPreviousImage: () => void
  onNextImage: () => void
  onReplyIntent: (site: SiteGroup) => void
}

export default function CaseDetailSection({
  selectedSite,
  selectedConcern,
  selectedImageIndex,
  onClose,
  onSelectImage,
  onPreviousImage,
  onNextImage,
  onReplyIntent,
}: CaseDetailSectionProps) {
  const selectedImage = selectedSite.images[selectedImageIndex] ?? null
  if (!selectedImage) return null

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <div className="rounded-[36px] border border-white/10 bg-[#140f0d] p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Case Detail</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{selectedSite.siteName}</h2>
            <p className="mt-2 inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100">
              회신 예시: {selectedSite.siteName} 또는 {buildCompactCaseLabel(selectedSite.siteName)}
            </p>
            <p className="mt-2 text-sm text-stone-300">
              {[selectedSite.location, ...selectedSite.businessTypes.slice(0, 2)].filter(Boolean).join(' · ') || '대표 시공사례'}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              목록으로 돌아가기
            </button>
            <Link
              to={buildConceptContactUrl(selectedSite, selectedConcern)}
              onClick={() => onReplyIntent(selectedSite)}
              className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-semibold text-stone-950 transition hover:bg-amber-300"
            >
              이 사례 기준으로 상담하기
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-stone-900">
              <div className="relative aspect-[4/3]">
                <img
                  src={selectedImage.cloudinary_url}
                  alt={selectedSite.siteName}
                  className="h-full w-full object-contain bg-stone-900"
                />
                {selectedImage.before_after_role ? (
                  <span
                    className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold text-white ${
                      selectedImage.before_after_role === 'before' ? 'bg-black/75' : 'bg-emerald-600/90'
                    }`}
                  >
                    {selectedImage.before_after_role === 'before' ? 'Before' : 'After'}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onPreviousImage}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
              >
                <ChevronLeft className="mr-2 h-4 w-4" />
                이전 사진
              </button>
              <button
                type="button"
                onClick={onNextImage}
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white transition hover:bg-white/10"
              >
                다음 사진
                <ChevronRight className="ml-2 h-4 w-4" />
              </button>
            </div>
            <p className="text-center text-xs text-stone-400">
              {selectedImageIndex + 1} / {selectedSite.images.length}
            </p>

            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
              {selectedSite.images.map((image, index) => (
                <button
                  key={`${selectedSite.siteName}-${image.id}`}
                  type="button"
                  onClick={() => onSelectImage(index)}
                  className={`relative w-24 shrink-0 overflow-hidden rounded-2xl border md:w-auto ${
                    index === selectedImageIndex ? 'border-amber-300 ring-2 ring-amber-300/20' : 'border-white/10'
                  }`}
                >
                  <img
                    src={image.thumbnail_url || image.cloudinary_url}
                    alt={selectedSite.siteName}
                    className="aspect-square h-full w-full object-cover"
                  />
                  {image.before_after_role ? (
                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
                      {image.before_after_role === 'before' ? 'Before' : 'After'}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">Case Summary</p>
              <p className="mt-3 text-sm leading-7 text-stone-200">{selectedSite.profile.channelFollowupSummary}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {buildSiteFactChips(selectedSite).map((chip) => (
                  <span
                    key={`${selectedSite.siteName}-${chip}`}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-stone-200"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">규모와 예산 기준</p>
              <ul className="mt-4 space-y-2 text-sm text-stone-300">
                <li>좌석 수: {selectedSite.profile.seatCountBand}</li>
                <li>평수: {selectedSite.profile.areaPyeongBand}</li>
                <li>예산대: {selectedSite.profile.budgetBand}</li>
              </ul>
              <p className="mt-3 text-xs leading-6 text-stone-400">{selectedSite.profile.seatCountNote}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">핵심 문제와 해결 포인트</p>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                <span className="font-medium text-white">문제:</span> {selectedSite.profile.painPoint}
              </p>
              <p className="mt-3 text-sm leading-7 text-stone-300">
                <span className="font-medium text-white">해결:</span> {selectedSite.profile.solutionPoint}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold text-white">운영자 관점</p>
              <p className="mt-3 text-sm leading-7 text-stone-300">{selectedSite.profile.operatorReview}</p>
              <p className="mt-3 text-xs leading-6 text-stone-400">추천 대상: {selectedSite.profile.recommendedFor}</p>
            </div>
            <div className="rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5">
              <div className="flex gap-3">
                <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div>
                  <p className="text-sm font-semibold text-white">원하실 때만 이어서 안내드립니다</p>
                  <p className="mt-2 text-sm leading-7 text-stone-200">
                    {selectedSite.profile.channelFollowupPrompt}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-stone-400">
                    같은 내용을 여러 번 먼저 보내드리기보다, 관심 사례가 분명할 때 필요한 정보만 이어서 설명드리는 방식을 기본으로 합니다.
                  </p>
                  <p className="mt-2 text-xs leading-6 text-amber-100/80">
                    예: "{selectedSite.siteName} 자세히" 또는 "{buildCompactCaseLabel(selectedSite.siteName)} 기준으로 보고 싶어요"
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
