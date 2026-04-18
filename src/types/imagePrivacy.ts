export type ImagePrivacyIssueType =
  | 'phone_number'
  | 'email'
  | 'address'
  | 'person_name'
  | 'license_plate'
  | 'account_number'
  | 'business_registration_number'
  | 'face'
  | 'document'
  | 'chat_capture'
  | 'other'

export type ImagePrivacySeverity = 'low' | 'medium' | 'high'
export type ImagePrivacyVerdict = 'clear' | 'review' | 'blocked'

export interface ImagePrivacyIssue {
  type: ImagePrivacyIssueType
  label: string
  severity: ImagePrivacySeverity
  confidence: 'low' | 'medium' | 'high'
  evidence?: string | null
}

export interface ImagePrivacyScanResult {
  verdict: ImagePrivacyVerdict
  summary: string
  issues: ImagePrivacyIssue[]
  suggestedAction?: string | null
  debug?: {
    engine?: 'gemini' | 'ocr'
    fallbackFrom?: 'gemini' | null
    stage?: string | null
    detail?: string | null
    responsePreview?: string | null
  } | null
}

export interface StoredImagePrivacyScan extends ImagePrivacyScanResult {
  scannedAt: string
  version: number
}

export const IMAGE_PRIVACY_SCAN_VERSION = 1
