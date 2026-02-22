/**
 * PDF/PPTX 문서 썸네일 생성
 * - PDF: pdf.js로 첫 페이지 렌더링
 * - PPTX: 내장 docProps/thumbnail 추출 (PowerPoint가 저장한 미리보기)
 */
import JSZip from 'jszip'

const THUMBNAIL_MAX_SIZE = 800
const THUMBNAIL_QUALITY = 0.85

/** PDF 첫 페이지를 JPEG Blob으로 변환 */
export async function generatePdfThumbnail(file: File): Promise<Blob | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdfjs = await import('pdfjs-dist')
    const pdfjsWorkerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
    }
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 1 })
    const scale = Math.min(THUMBNAIL_MAX_SIZE / viewport.width, THUMBNAIL_MAX_SIZE / viewport.height, 2)
    const scaledViewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = scaledViewport.width
    canvas.height = scaledViewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    await page.render({
      canvas,
      canvasContext: ctx,
      viewport: scaledViewport,
    }).promise
    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        THUMBNAIL_QUALITY
      )
    })
  } catch {
    return null
  }
}

/** PPTX 내장 썸네일 추출 (docProps/thumbnail.jpeg 등) */
export async function extractPptxThumbnail(file: File): Promise<Blob | null> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)
    const thumbPaths = [
      'docProps/thumbnail.jpeg',
      'docProps/thumbnail.jpg',
      'docProps/thumbnail.png',
      'docProps/thumbnail.wmf', // Windows 메타파일 - 브라우저에서 직접 표시 어려움
    ]
    for (const path of thumbPaths) {
      const entry = zip.file(path)
      if (entry) {
        const blob = await entry.async('blob')
        const ext = path.split('.').pop()?.toLowerCase()
        if (ext === 'wmf' || ext === 'emf') {
          return null
        }
        return blob
      }
    }
    return null
  } catch {
    return null
  }
}

/** PDF 또는 PPTX 파일에서 썸네일 Blob 생성 (ppt 구형 포맷은 ZIP 아님 → null) */
export async function generateDocumentThumbnail(file: File): Promise<Blob | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return generatePdfThumbnail(file)
  if (ext === 'pptx') return extractPptxThumbnail(file)
  return null
}
