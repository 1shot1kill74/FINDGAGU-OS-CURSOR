/**
 * 앱 전역 환경 변수 접근자 — .env 키의 단일 소스.
 * 직접 import.meta.env.VITE_* 를 흩뿌리지 않고 이 파일을 통해서만 읽는다.
 */

export function getCloudinaryCloudName(): string {
  const name = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
  return typeof name === 'string' && name.trim() ? name.trim() : 'demo'
}

export function getCloudinaryUploadPreset(): string | null {
  const preset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET
  return typeof preset === 'string' && preset.trim() ? preset.trim() : null
}

export function getSupabaseUrl(): string {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? '').toString().trim()
  if (!url) throw new Error('VITE_SUPABASE_URL이 설정되지 않았습니다.')
  return url.replace(/\/$/, '')
}

export function getShowroomShortsWorkerUrl(): string {
  const configuredUrl = (import.meta.env.VITE_SHOWROOM_SHORTS_WORKER_URL ?? '').toString().trim()
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/showroom-shorts-worker`
  }

  throw new Error('쇼룸 숏츠 워커 URL을 확인할 수 없습니다.')
}

export function getChannelTalkPluginKey(): string | null {
  const key = import.meta.env.VITE_CHANNEL_TALK_PLUGIN_KEY
  return typeof key === 'string' && key.trim() ? key.trim() : null
}
