/**
 * 견적서 고해상도 PDF/이미지 내보내기 (html2canvas + jsPDF)
 * - 가상 뷰포트(windowWidth/Height) 1200×1522px 고정 → 해상도/브라우저 크기 무관, 짤림 방지
 * - scrollX/scrollY 0으로 상단 기준 캡처, windowHeight로 하단까지 전부 렌더
 * - scale PDF 2 / 이미지 3 고정 → 레티나·일반 모니터 동일 고화질
 * - 캡처 높이 확장: getCaptureViewportHeightPx(extraPx)로 시공 사례 등 추가 영역 대비
 * - data-html2canvas-ignore(원가·마진) 캡처 제외
 */

import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const A4_MM = { w: 210, h: 297 }
const A4_RATIO = A4_MM.h / A4_MM.w  // 1.414
const A4_HEIGHT_90_PCT_MM = A4_MM.h * 0.9  // 267.3mm — 이하면 100% 비율
const SCALE = 2
/** 이미지 다운로드용 고해상도 (확대 시 글자 선명) */
const IMAGE_SCALE = 3
const SIDE_MARGIN_MM = 10
const BOTTOM_SAFE_MM = 10
/** 상단 여백 강제(캡처 이미지에 padding-top으로 포함) */
const TOP_PADDING_MM = 15
/** 하단 여백(상단과 대칭) */
const BOTTOM_PADDING_MM = 15
/** 캡처 컨테이너 내용 영역 너비(좌우 여백 제외) */
const CAPTURE_CONTENT_WIDTH_MM = A4_MM.w - SIDE_MARGIN_MM * 2  // 190
/** 96dpi 기준 1px = 25.4/96 mm */
const PX_TO_MM = 25.4 / 96

/** 가상 뷰포트: 모니터/브라우저 크기와 무관하게 고정 규격으로 캡처해 짤림 방지 */
const CAPTURE_VIEWPORT_WIDTH = 1200
/** A4 높이(297mm)를 96dpi px로 환산 — 캡처 컨테이너 기본 높이 */
const CAPTURE_HEIGHT_BASE_PX = Math.ceil(A4_MM.h * (96 / 25.4))

/**
 * 캡처 대상 컨테이너 높이(px) — 견적서 본문 + 추후 시공 사례 등 부가 영역 확장용.
 * @param extraPx - 추가 영역 높이(예: 시공 사례 이미지 영역). 기본 0.
 */
export function getCaptureViewportHeightPx(extraPx: number = 0): number {
  return CAPTURE_HEIGHT_BASE_PX + extraPx
}

/** 캡처 시 사용할 가상 windowHeight — 전체 컨텐츠가 그려지도록 여유 있게 */
const CAPTURE_VIEWPORT_HEIGHT = getCaptureViewportHeightPx(400)

/** 원가·마진 캡처 제외 (보안) — PDF/이미지 공통 */
function shouldIgnoreElement(el: Element): boolean {
  return el.hasAttribute('data-html2canvas-ignore') || el.closest('[data-html2canvas-ignore]') !== null
}

/** 현재 날짜 YYYYMMDD (KST) */
function getDateKstYyyymmdd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).replace(/-/g, '')
}

/** 파일명용 업체명 정규화 — 빈 값·불가 문자 제거, 최대 50자 */
function safeCompanyForFilename(name: string | undefined, fallback: string): string {
  const raw = (name ?? '').trim() || fallback
  return raw.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50)
}

/** PDF 파일명 규칙: YYYYMMDD_업체명_견적서.pdf (날짜 KST, 업체명 없으면 파인드가구) */
export function buildEstimatePdfFilename(recipientName?: string): string {
  const dateStr = getDateKstYyyymmdd()
  const safe = safeCompanyForFilename(recipientName, '파인드가구')
  return `${dateStr}_${safe}_견적서.pdf`
}

/** BLUEPRINT 파일명 규칙: [날짜]_[업체명]_견적서.png — 업체명은 파일명 불가 문자 제거 */
export function buildEstimateImageFilename(quoteDate?: string, recipientName?: string): string {
  const dateStr = quoteDate
    ? quoteDate.replace(/\D/g, '').slice(0, 8) || getDateKstYyyymmdd()
    : getDateKstYyyymmdd()
  const safe = safeCompanyForFilename(recipientName, '업체명없음')
  return `${dateStr}_${safe}_견적서.png`
}

/** 캡처용 onclone 공통 (PDF/이미지 동일 레이아웃) */
function applyPrintAreaCloneStyles(
  cloned: Document,
  root: Element | null
): void {
  if (root && root instanceof HTMLElement) {
    root.style.background = '#ffffff'
    root.style.boxShadow = 'none'
    root.style.overflow = 'visible'
    root.style.width = `${CAPTURE_CONTENT_WIDTH_MM}mm`
    root.style.height = `${A4_MM.h}mm`
    root.style.paddingTop = `${TOP_PADDING_MM}mm`
    root.style.paddingBottom = `${BOTTOM_PADDING_MM}mm`
    root.style.boxSizing = 'border-box'
    root.style.flex = 'none'
    root.style.maxHeight = 'none'
  }
  let parent: Element | null = root?.parentElement ?? null
  while (parent && parent !== cloned.body) {
    if (parent instanceof HTMLElement) {
      parent.style.overflow = 'visible'
      parent.style.height = 'auto'
      parent.style.maxHeight = 'none'
    }
    parent = parent.parentElement
  }
  cloned.querySelectorAll?.('article').forEach((art) => {
    if (art instanceof HTMLElement) {
      art.style.background = '#ffffff'
      art.style.boxShadow = 'none'
      art.style.minHeight = `${A4_MM.h - TOP_PADDING_MM - BOTTOM_PADDING_MM}mm`
    }
  })
  cloned.querySelectorAll?.('[data-estimate-print-area] article footer').forEach((footer) => {
    if (footer instanceof HTMLElement) footer.style.paddingBottom = '12mm'
  })
}

/**
 * 요소를 캡처해 A4 PDF로 저장.
 * - 캡처 직전: 배경 #ffffff, box-shadow 제거
 * - 비율 유지하며 한 페이지에 맞춤(fit-to-page), 하단 10mm 안전 여백
 * - 한 장 초과 시: 캡처 이미지 전체를 A4 한 페이지에 비율 유지 리사이징하여 맞춤(세로 기준 fit)
 */
export async function exportEstimateToPdf(element: HTMLElement, filename: string = '견적서.pdf'): Promise<void> {
  const originalBg = element.style.background
  const originalBoxShadow = element.style.boxShadow

  element.style.background = '#ffffff'
  element.style.boxShadow = 'none'

  try {
    const canvas = await html2canvas(element, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      ignoreElements: shouldIgnoreElement,
      windowWidth: CAPTURE_VIEWPORT_WIDTH,
      windowHeight: CAPTURE_VIEWPORT_HEIGHT,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc) => {
        const root = doc.querySelector('[data-estimate-print-area]') ?? doc.body
        applyPrintAreaCloneStyles(doc, root)
      },
    })

    const imgW = canvas.width
    const imgH = canvas.height
    const ratio = imgW / imgH

    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const pageW = A4_MM.w
    const pageH = A4_MM.h
    const contentW = pageW - SIDE_MARGIN_MM * 2
    const contentH = pageH - SIDE_MARGIN_MM - SIDE_MARGIN_MM - BOTTOM_SAFE_MM

    // 캡처 이미지 높이를 mm로 환산 (스케일 적용 후)
    const contentHeightMm = (imgH / SCALE) * PX_TO_MM
    const contentWidthMm = (imgW / SCALE) * PX_TO_MM

    let fitW: number
    let fitH: number
    if (contentHeightMm <= A4_HEIGHT_90_PCT_MM) {
      // A4 높이의 90% 이내면 축소 없이 100% 비율로 출력
      fitW = Math.min(contentWidthMm, contentW)
      fitH = Math.min(contentHeightMm, contentH)
    } else {
      const fitByWidthH = contentW / ratio
      if (fitByWidthH <= contentH) {
        fitW = contentW
        fitH = fitByWidthH
      } else {
        fitH = contentH
        fitW = contentH * ratio
      }
    }

    // 캡처에 padding-top 15mm 포함 → y=0으로 두면 용지 상단에서 정확히 15mm 여백
    const pdfY = 0
    pdf.addImage(
      canvas.toDataURL('image/png'),
      'PNG',
      SIDE_MARGIN_MM,
      pdfY,
      fitW,
      fitH,
      undefined,
      'FAST'
    )
    pdf.save(filename)
  } finally {
    element.style.background = originalBg
    element.style.boxShadow = originalBoxShadow
  }
}

/**
 * 견적서를 고해상도 이미지(PNG)로 캡처해 다운로드.
 * - scale 3으로 캡처해 확대 시에도 글자 선명 (원가·마진은 data-html2canvas-ignore로 제외)
 * - 파일명은 buildEstimateImageFilename(quoteDate, recipientName)으로 생성 권장
 */
export async function exportEstimateToImage(element: HTMLElement, filename: string = '견적서.png'): Promise<void> {
  const originalBg = element.style.background
  const originalBoxShadow = element.style.boxShadow
  element.style.background = '#ffffff'
  element.style.boxShadow = 'none'
  try {
    const canvas = await html2canvas(element, {
      scale: IMAGE_SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      ignoreElements: shouldIgnoreElement,
      windowWidth: CAPTURE_VIEWPORT_WIDTH,
      windowHeight: CAPTURE_VIEWPORT_HEIGHT,
      scrollX: 0,
      scrollY: 0,
      onclone: (doc) => {
        const root = doc.querySelector('[data-estimate-print-area]') ?? doc.body
        applyPrintAreaCloneStyles(doc, root)
      },
    })
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 1.0)
    })
    if (!blob) {
      throw new Error('이미지 생성 실패')
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    element.style.background = originalBg
    element.style.boxShadow = originalBoxShadow
  }
}
