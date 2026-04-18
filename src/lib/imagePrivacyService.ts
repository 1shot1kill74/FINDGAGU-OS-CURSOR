import { supabase } from '@/lib/supabase'
import { createWorker, type Worker } from 'tesseract.js'
import {
  IMAGE_PRIVACY_SCAN_VERSION,
  type ImagePrivacyIssue,
  type ImagePrivacyScanResult,
  type StoredImagePrivacyScan,
} from '@/types/imagePrivacy'

interface AnalyzePrivacyResponse {
  result?: ImagePrivacyScanResult
  error?: string
  detail?: string
  stage?: string
  model?: string
  responsePreview?: string | null
}

const PRIVACY_SCAN_MAX_DIMENSION = 1600
const PRIVACY_SCAN_TARGET_MAX_BYTES = 1_400_000
const PRIVACY_REMOTE_TIMEOUT_MS = 4000
const PRIVACY_LOCAL_OCR_TIMEOUT_MS = 8000
let privacyOcrWorkerPromise: Promise<Worker> | null = null

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: number | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timeoutId != null) {
      window.clearTimeout(timeoutId)
    }
  }
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('이미지 미리보기를 생성하지 못했습니다.'))
      img.src = objectUrl
    })
    return image
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('민감정보 스캔용 이미지를 압축하지 못했습니다.'))
      },
      'image/jpeg',
      quality
    )
  })
}

async function createPrivacyScanPayload(file: File): Promise<{ base64: string; fileName: string; blob: Blob }> {
  const image = await loadImageFromFile(file)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) {
    throw new Error('이미지 크기를 읽지 못했습니다.')
  }

  const scale = Math.min(1, PRIVACY_SCAN_MAX_DIMENSION / Math.max(width, height))
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('민감정보 스캔용 캔버스를 초기화하지 못했습니다.')
  }
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const qualitySteps = [0.82, 0.72, 0.6, 0.5]
  let compressed = await canvasToJpegBlob(canvas, qualitySteps[0]!)
  for (const quality of qualitySteps.slice(1)) {
    if (compressed.size <= PRIVACY_SCAN_TARGET_MAX_BYTES) break
    compressed = await canvasToJpegBlob(canvas, quality)
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = reject
    reader.readAsDataURL(compressed)
  })

  const stem = file.name.replace(/\.[^.]+$/, '') || 'privacy-scan'
  return {
    base64,
    fileName: `${stem}.jpg`,
    blob: compressed,
  }
}

async function getPrivacyOcrWorker(): Promise<Worker> {
  if (!privacyOcrWorkerPromise) {
    privacyOcrWorkerPromise = createWorker('kor', 1, {
      langPath: `${window.location.origin}/assets/ocr`,
    })
  }
  return await privacyOcrWorkerPromise
}

export async function prewarmImagePrivacyScan(): Promise<void> {
  try {
    await withTimeout(getPrivacyOcrWorker(), 6000, '민감정보 OCR 워커 준비 시간 초과')
  } catch (error) {
    console.warn('민감정보 OCR 워커 선로딩 실패:', error)
  }
}

function normalizeOcrText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function buildOcrPrivacyResult(text: string): ImagePrivacyScanResult {
  const normalized = normalizeOcrText(text)
  const compact = normalized.replace(/\s+/g, '')
  const issues: ImagePrivacyIssue[] = []

  const phoneMatches = Array.from(compact.matchAll(/(?:01[016789]|02|0\d{2})(?:\d{3,4})(?:\d{4})/g))
  if (phoneMatches.length > 0) {
    issues.push({
      type: 'phone_number',
      label: '전화번호',
      severity: 'high',
      confidence: 'medium',
      evidence: phoneMatches[0]?.[0] ?? null,
    })
  }

  const emailMatches = Array.from(normalized.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
  if (emailMatches.length > 0) {
    issues.push({
      type: 'email',
      label: '이메일',
      severity: 'high',
      confidence: 'medium',
      evidence: emailMatches[0]?.[0] ?? null,
    })
  }

  const bizMatches = Array.from(compact.matchAll(/\d{3}-?\d{2}-?\d{5}/g))
  if (bizMatches.length > 0) {
    issues.push({
      type: 'business_registration_number',
      label: '사업자번호',
      severity: 'high',
      confidence: 'medium',
      evidence: bizMatches[0]?.[0] ?? null,
    })
  }

  const plateMatches = Array.from(compact.matchAll(/\d{2,3}[가-힣]\d{4}/g))
  if (plateMatches.length > 0) {
    issues.push({
      type: 'license_plate',
      label: '차량번호판',
      severity: 'high',
      confidence: 'low',
      evidence: plateMatches[0]?.[0] ?? null,
    })
  }

  const accountHints = ['계좌', '예금주', '국민', '신한', '농협', '우리은행', '하나은행']
  if (accountHints.some((hint) => normalized.includes(hint))) {
    issues.push({
      type: 'account_number',
      label: '계좌정보',
      severity: 'high',
      confidence: 'low',
      evidence: accountHints.find((hint) => normalized.includes(hint)) ?? null,
    })
  }

  const addressHints = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '로 ', '길 ', '동 ', '층']
  if (addressHints.filter((hint) => normalized.includes(hint)).length >= 2) {
    issues.push({
      type: 'address',
      label: '주소정보',
      severity: 'medium',
      confidence: 'low',
      evidence: '주소로 보이는 텍스트 패턴 감지',
    })
  }

  const documentHints = ['견적서', '계약서', '사업자등록증', '주민등록', '납품', '공급가액', '합계', '서명']
  if (documentHints.some((hint) => normalized.includes(hint))) {
    issues.push({
      type: 'document',
      label: '문서 캡처',
      severity: 'medium',
      confidence: 'medium',
      evidence: documentHints.find((hint) => normalized.includes(hint)) ?? null,
    })
  }

  const chatHints = ['카카오톡', '오전', '오후', '읽음', '답장', '보냄', '채팅']
  if (chatHints.some((hint) => normalized.includes(hint))) {
    issues.push({
      type: 'chat_capture',
      label: '채팅 캡처',
      severity: 'medium',
      confidence: 'medium',
      evidence: chatHints.find((hint) => normalized.includes(hint)) ?? null,
    })
  }

  if (issues.length === 0) {
    return {
      verdict: 'clear',
      summary: 'OCR 기준으로 뚜렷한 민감정보 텍스트는 감지되지 않았습니다.',
      issues: [],
      suggestedAction: '공개 전 시각적으로 한 번 더 확인하세요.',
      debug: {
        engine: 'ocr',
        fallbackFrom: 'gemini',
        stage: 'ocr_completed',
        detail: null,
        responsePreview: null,
      },
    }
  }

  const hasHigh = issues.some((issue) => issue.severity === 'high')
  return {
    verdict: hasHigh ? 'blocked' : 'review',
    summary: hasHigh
      ? 'OCR 기준 민감정보 텍스트가 감지되어 공개 전 수정이 필요합니다.'
      : 'OCR 기준 검토가 필요한 텍스트가 감지되었습니다.',
    issues,
    suggestedAction: hasHigh
      ? '전화번호, 번호판, 계좌/사업자 정보 등 식별 가능한 텍스트를 가린 뒤 공개하세요.'
      : '문서/채팅/주소 노출 여부를 관리자 화면에서 확인하세요.',
    debug: {
      engine: 'ocr',
      fallbackFrom: 'gemini',
      stage: 'ocr_completed',
      detail: null,
      responsePreview: null,
    },
  }
}

async function runLocalPrivacyOcr(file: Blob): Promise<ImagePrivacyScanResult> {
  const worker = await getPrivacyOcrWorker()
  const { data } = await worker.recognize(file)
  const text = typeof data?.text === 'string' ? data.text : ''
  return buildOcrPrivacyResult(text)
}

function isValidSeverity(value: unknown): value is ImagePrivacyIssue['severity'] {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isValidConfidence(value: unknown): value is ImagePrivacyIssue['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isValidVerdict(value: unknown): value is ImagePrivacyScanResult['verdict'] {
  return value === 'clear' || value === 'review' || value === 'blocked'
}

function normalizeIssue(raw: unknown): ImagePrivacyIssue | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const label = typeof row.label === 'string' ? row.label.trim() : ''
  if (!label) return null
  return {
    type: typeof row.type === 'string' ? row.type as ImagePrivacyIssue['type'] : 'other',
    label,
    severity: isValidSeverity(row.severity) ? row.severity : 'medium',
    confidence: isValidConfidence(row.confidence) ? row.confidence : 'medium',
    evidence: typeof row.evidence === 'string' && row.evidence.trim() ? row.evidence.trim() : null,
  }
}

function normalizeResponse(raw: AnalyzePrivacyResponse | null | undefined): ImagePrivacyScanResult {
  const result = raw?.result
  const issues = Array.isArray(result?.issues)
    ? result!.issues.map(normalizeIssue).filter((issue): issue is ImagePrivacyIssue => issue != null)
    : []
  return {
    verdict: isValidVerdict(result?.verdict) ? result!.verdict : 'review',
    summary: typeof result?.summary === 'string' && result.summary.trim()
      ? result.summary.trim()
      : '민감정보 가능성이 감지되어 검토가 필요합니다.',
    issues,
    suggestedAction: typeof result?.suggestedAction === 'string' && result.suggestedAction.trim()
      ? result.suggestedAction.trim()
      : null,
    debug: result?.debug && typeof result.debug === 'object' && !Array.isArray(result.debug)
      ? {
          engine: result.debug.engine === 'ocr' ? 'ocr' : 'gemini',
          fallbackFrom: result.debug.fallbackFrom === 'gemini' ? 'gemini' : null,
          stage: typeof result.debug.stage === 'string' ? result.debug.stage : null,
          detail: typeof result.debug.detail === 'string' ? result.debug.detail : null,
          responsePreview: typeof result.debug.responsePreview === 'string' ? result.debug.responsePreview : null,
        }
      : null,
  }
}

export async function scanImagePrivacy(file: File): Promise<StoredImagePrivacyScan> {
  const payload = await createPrivacyScanPayload(file)
  let normalized: ImagePrivacyScanResult
  try {
    const { data, error } = await withTimeout(
      supabase.functions.invoke<AnalyzePrivacyResponse>('analyze-quote', {
        body: {
          image: payload.base64,
          fileName: payload.fileName,
          mode: 'privacy',
        },
      }),
      PRIVACY_REMOTE_TIMEOUT_MS,
      '원격 민감정보 검사 시간 초과'
    )

    if (error) {
      throw new Error(error.message || '민감정보 스캔 호출에 실패했습니다.')
    }
    if (!data) {
      throw new Error('민감정보 스캔 결과가 비어 있습니다.')
    }
    if (data.error) {
      throw new Error(data.error)
    }

    normalized = normalizeResponse(data)
  } catch (remoteError) {
    console.warn('원격 민감정보 스캔 실패, 로컬 OCR 폴백으로 전환합니다.', remoteError)
    try {
      normalized = await withTimeout(
        runLocalPrivacyOcr(payload.blob),
        PRIVACY_LOCAL_OCR_TIMEOUT_MS,
        '로컬 OCR 민감정보 검사 시간 초과'
      )
    } catch (ocrError) {
      console.warn('로컬 OCR 민감정보 스캔도 실패했습니다.', ocrError)
      normalized = {
        verdict: 'review',
        summary: '민감정보 자동 검사가 제한시간을 초과해 수동 검토가 필요합니다.',
        issues: [],
        suggestedAction: '업로드 후 관리자 화면에서 이미지를 직접 확인하세요.',
        debug: {
          engine: 'ocr',
          fallbackFrom: 'gemini',
          stage: remoteError instanceof Error && remoteError.message.includes('시간 초과')
            ? 'remote_timeout_then_ocr_timeout'
            : 'remote_failure_then_ocr_timeout',
          detail: [remoteError, ocrError]
            .map((error) => (error instanceof Error ? error.message : String(error)))
            .join(' | ')
            .slice(0, 300),
          responsePreview: null,
        },
      }
    }
  }

  return {
    ...normalized,
    scannedAt: new Date().toISOString(),
    version: IMAGE_PRIVACY_SCAN_VERSION,
  }
}

export function readStoredPrivacyScan(metadata: unknown): StoredImagePrivacyScan | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const raw = metadata as Record<string, unknown>
  const scan = raw.privacy_scan
  if (!scan || typeof scan !== 'object' || Array.isArray(scan)) return null
  const record = scan as Record<string, unknown>
  const issues = Array.isArray(record.issues)
    ? record.issues.map(normalizeIssue).filter((issue): issue is ImagePrivacyIssue => issue != null)
    : []
  if (!isValidVerdict(record.verdict)) return null
  return {
    verdict: record.verdict,
    summary: typeof record.summary === 'string' ? record.summary : '',
    issues,
    suggestedAction: typeof record.suggestedAction === 'string' ? record.suggestedAction : null,
    scannedAt: typeof record.scannedAt === 'string' ? record.scannedAt : '',
    version: typeof record.version === 'number' ? record.version : IMAGE_PRIVACY_SCAN_VERSION,
  }
}
