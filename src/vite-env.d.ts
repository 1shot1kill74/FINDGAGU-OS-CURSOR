/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PUBLIC_SHOWROOM_BASE_URL?: string
  readonly VITE_CHANNEL_TALK_PLUGIN_KEY?: string
  /** 데이터 통합 관리 AI 파싱 API URL (POST multipart: file, testMode). 미설정 시 Mock 사용 */
  readonly VITE_MIGRATION_PARSE_API?: string
  /** 카카오 공유 SDK용 공개 키 */
  readonly VITE_KAKAO_JS_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
