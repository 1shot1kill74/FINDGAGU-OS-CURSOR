/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** 데이터 통합 관리 AI 파싱 API URL (POST multipart: file, testMode). 미설정 시 Mock 사용 */
  readonly VITE_MIGRATION_PARSE_API?: string
  /** OpenAI API Key (GPT-4o PDF/JPG 추출용). 프로덕션에서는 백엔드 프록시 권장 */
  readonly VITE_OPENAI_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
