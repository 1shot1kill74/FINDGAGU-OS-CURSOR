import type { ShowroomImageAsset } from '@/lib/imageAssetService'
import type { CardNewsSlideImageRef, ShowroomCaseCardNewsSlide } from '@/lib/showroomCaseContentPackage'
import type { ShowroomCaseCanonicalBlogPost } from '@/lib/showroomCaseCanonicalBlog'
import type { ShowroomCaseCardNewsPublication, ShowroomCaseProfileDraft } from '@/lib/showroomCaseProfileService'

export type StudioCardNewsSlide = {
  id: string
  key: ShowroomCaseCardNewsSlide['key']
  title: string
  body: string
  imageRef: CardNewsSlideImageRef
  /** 저장된 응답에만 있는 스냅샷(자산 ID를 못 찾을 때 미리보기용) */
  imageUrl?: string | null
}

export type CaseDraftState = {
  siteName: string
  industry: string
  externalLabel: string
  headlineHook: string
  problemCode: string
  solutionCode: string
  problemFrameLabel: string
  solutionFrameLabel: string
  problemDetail: string
  solutionDetail: string
  evidencePoints: string
  beforeUrl: string
  afterUrl: string
  /** 동일 현장 상담 이미지 전체 — 카드뉴스 사진 선택 풀 */
  projectImages: ShowroomImageAsset[]
  cardNewsGeneration: ShowroomCaseProfileDraft['cardNewsGeneration']
  blogGeneration: ShowroomCaseProfileDraft['blogGeneration']
  cardNewsPublication: ShowroomCaseCardNewsPublication
  /** 저장된 블로그 정본(미리보기·공개 노출용). 없으면 `null`. */
  canonicalBlogPost: ShowroomCaseCanonicalBlogPost | null
  cardNewsSlides: StudioCardNewsSlide[]
}

export type CaseDraftSeedRow = Omit<CaseDraftState, 'cardNewsSlides'>

export type FrameTemplateEditorState = {
  id: string
  label: string
  body: string
}
