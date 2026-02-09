/**
 * 이미지 추출/내보내기 옵션
 *
 * 설계 원칙 (docs/IMAGE_TEXT_OVERLAY_DESIGN.md):
 * - Named Transformation은 이미지 가공(리사이즈·압축 등)만 사용하고, 가변 한글 텍스트는 이 옵션으로 전달.
 * - 추후 텍스트 합성(클라이언트 Canvas 또는 Cloudinary URL) 추가 시, 이 필드들을 사용한다.
 * - 현재는 인터페이스만 정의하며, 실제 합성 로직은 구현하지 않음.
 */
export interface ImageExportTextOverlay {
  /** 업체명 (예: 시공 사례 카드·워터마크) */
  companyName?: string
  /** 노출 날짜 (예: "2025-02-06") */
  date?: string
  /** 워터마크 문구 (없으면 업체명 등으로 대체 가능) */
  watermarkText?: string
  /** 기타 자유 텍스트 (캠페인 문구 등) */
  caption?: string
}

export interface ImageExportOptions {
  /** 출력 용도: marketing(고화질) | mobile(저용량) */
  usage?: 'marketing' | 'mobile'
  /**
   * 텍스트 레이어 합성에 쓸 데이터.
   * 추후 구현: 클라이언트 Canvas 합성 또는 Cloudinary URL 오버레이 시 이 값을 사용.
   */
  textOverlay?: ImageExportTextOverlay
}

/** 외부 자동화(n8n, Python 등)용 이미지 항목 — base_alt_text 우선, AI 보강 시 가이드 포함 */
export interface ImageAssetExportItem {
  id: string
  url: string
  /** 시스템 확정 데이터. {date}_{company}_{space} 포맷. 외부 툴은 이 값을 그대로 사용. */
  base_alt_text: string
  /** display_name(파일명) — base_alt_text와 동일 소스, 수정 시 양쪽 동기화 */
  display_name: string | null
  cloudinary_public_id: string
  /** AI가 알트 텍스트를 보강할 때 반드시 base_alt_text를 접두어로 사용하라는 프롬프트 가이드 */
  alt_text_prompt_guide: string
}

/** AI 알트 텍스트 보강 시 준수할 프롬프트 가이드 (전송 데이터에 포함) */
export const ALT_TEXT_PROMPT_GUIDE =
  '알트 텍스트를 생성하거나 보강할 때, 반드시 시스템이 제공한 base_alt_text를 접두어(Prefix)로 사용하세요. 예: base_alt_text가 "260206_목동학원_강의실"이면 최종 alt는 "260206_목동학원_강의실 전경" 형태로 작성.'
