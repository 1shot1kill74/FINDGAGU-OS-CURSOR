/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 데이터 통합 관리 AI 파싱 API URL (POST multipart: file, testMode). 미설정 시 Mock 사용 */
  readonly VITE_MIGRATION_PARSE_API?: string
  /** Gemini 2.0 API Key (메인). Vite에서는 VITE_ 접두사 필요 */
  readonly GOOGLE_GEMINI_API_KEY?: string
  readonly VITE_GOOGLE_GEMINI_API_KEY?: string
  readonly VITE_GEMINI_API_KEY?: string
  /** OpenAI API Key (폴백) — Gemini 실패 시 GPT-4o 재시도 */
  readonly VITE_OPENAI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
