import { supabase } from '@/lib/supabase'
import { BUCKET, MOCK_PUBLIC_ID_PREFIX } from '@/lib/imageAssetConstants'
import { getCloudinaryCloudName, getCloudinaryUploadPreset } from '@/lib/config'
import { CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS } from '@/lib/constants'
import type { SyncStatus } from '@/types/projectImage'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 파일 SHA-256 해시 (중복 업로드 감지용)
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 동일 content_hash가 이미 project_images에 있으면 true (중복 업로드 차단)
 */
export async function checkDuplicateByHash(contentHash: string): Promise<boolean> {
  const { data } = await supabase
    .from('project_images')
    .select('id')
    .eq('content_hash', contentHash)
    .maybeSingle()
  return data != null
}

/**
 * Cloudinary 업로드 시 사용할 옵션 — 생성된 파일명을 public_id로 노출
 */
export function getCloudinaryUploadOptions(publicId: string): {
  public_id: string
  use_filename: boolean
  unique_filename: boolean
} {
  return {
    public_id: publicId,
    use_filename: true,
    unique_filename: false,
  }
}

/** API 키가 설정되어 있으면 true. 업로드 창에서 테스트 모드 안내 표시용 */
export function isCloudinaryConfigured(): boolean {
  const name = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  return name !== 'demo' && preset != null
}

/** 목업 업로드로 생성된 public_id인지 (DEV에서 로컬 미리보기용 URL 치환) */
export function isMockPublicId(publicId: string | null | undefined): boolean {
  return Boolean(publicId && publicId.startsWith(MOCK_PUBLIC_ID_PREFIX))
}

/**
 * BLUEPRINT 이미지 이원화: 시공 사진 업로드는 반드시 Cloudinary(고화질) + Supabase(썸네일) 분기.
 */
export async function uploadConstructionImageDual(
  file: File,
  publicId: string
): Promise<{ cloudinaryPublicId: string; storagePath: string; thumbnailPath: string }> {
  if (import.meta.env.DEV) {
    if (!isCloudinaryConfigured()) {
      console.info('현재 테스트 모드입니다. 실전 업로드를 원하시면 .env 설정을 확인하세요.')
    }
    await delay(3000)
    const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
    const { error: storageError } = await supabase.storage.from(BUCKET).upload(thumbPath, file, {
      contentType: file.type,
      upsert: false,
    })
    if (storageError) throw new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`)
    return {
      cloudinaryPublicId: `${MOCK_PUBLIC_ID_PREFIX}${publicId}_${Date.now()}`,
      storagePath: thumbPath,
      thumbnailPath: thumbPath,
    }
  }

  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    throw new Error(
      'BLUEPRINT: 시공 사진은 Cloudinary(고화질) 업로드가 필수입니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET(unsigned)을 설정하세요.'
    )
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  formData.append('public_id', publicId)
  const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!cloudRes.ok) {
    const err = await cloudRes.text()
    throw new Error(`Cloudinary 업로드 실패: ${err}`)
  }
  const cloudJson = (await cloudRes.json()) as { public_id: string }
  const cloudinaryPublicId = cloudJson.public_id ?? publicId

  const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
  const { error: storageError } = await supabase.storage.from(BUCKET).upload(thumbPath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (storageError) {
    throw new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`)
  }
  return {
    cloudinaryPublicId,
    storagePath: thumbPath,
    thumbnailPath: thumbPath,
  }
}

/**
 * 이원화 업로드 + Cloudinary 업로드 진행률 콜백 (Progress Bar용)
 */
export function uploadConstructionImageDualWithProgress(
  file: File,
  publicId: string,
  onProgress: (percent: number) => void
): Promise<{ cloudinaryPublicId: string; storagePath: string; thumbnailPath: string }> {
  if (import.meta.env.DEV) {
    if (!isCloudinaryConfigured()) {
      console.info('현재 테스트 모드입니다. 실전 업로드를 원하시면 .env 설정을 확인하세요.')
    }
    const totalMs = 3000
    const stepMs = 200
    let p = 0
    return new Promise((resolve, reject) => {
      const tick = () => {
        p = Math.min(99, p + (100 * stepMs) / totalMs)
        onProgress(Math.round(p))
        if (p < 99) setTimeout(tick, stepMs)
        else {
          onProgress(100)
          const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
          supabase.storage
            .from(BUCKET)
            .upload(thumbPath, file, { contentType: file.type, upsert: false })
            .then(({ error: storageError }) => {
              if (storageError) {
                reject(new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`))
                return
              }
              resolve({
                cloudinaryPublicId: `${MOCK_PUBLIC_ID_PREFIX}${publicId}_${Date.now()}`,
                storagePath: thumbPath,
                thumbnailPath: thumbPath,
              })
            })
            .catch(reject)
        }
      }
      setTimeout(tick, stepMs)
    })
  }

  const cloudName = getCloudinaryCloudName()
  const preset = getCloudinaryUploadPreset()
  if (!preset || cloudName === 'demo') {
    return Promise.reject(
      new Error(
        'BLUEPRINT: 시공 사진은 Cloudinary(고화질) 업로드가 필수입니다. .env에 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET(unsigned)을 설정하세요.'
      )
    )
  }
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', preset)
  formData.append('public_id', publicId)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
        onProgress(percent)
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Cloudinary 업로드 실패: ${xhr.status} ${xhr.responseText}`))
        return
      }
      try {
        const json = JSON.parse(xhr.responseText) as { public_id?: string }
        const cloudinaryPublicId = json.public_id ?? publicId
        onProgress(100)
        const thumbPath = `thumb/${publicId.replace(/\//g, '_')}_${Date.now()}`
        supabase.storage
          .from(BUCKET)
          .upload(thumbPath, file, {
            contentType: file.type,
            upsert: false,
          })
          .then(({ error: storageError }) => {
            if (storageError) {
              reject(new Error(`Supabase 썸네일 업로드 실패: ${storageError.message}`))
              return
            }
            resolve({
              cloudinaryPublicId,
              storagePath: thumbPath,
              thumbnailPath: thumbPath,
            })
          })
          .catch(reject)
      } catch {
        reject(new Error('Cloudinary 응답 파싱 실패'))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Cloudinary 네트워크 오류')))
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`)
    xhr.send(formData)
  })
}

export function buildCloudinaryUrl(
  publicId: string,
  type: 'marketing' | 'mobile'
): string {
  const cloudName = getCloudinaryCloudName()
  const base = `https://res.cloudinary.com/${cloudName}/image/upload`
  if (type === 'marketing') {
    return `${base}/f_auto,q_auto,w_1200/${publicId}`
  }
  return `${base}/${CLOUDINARY_ADMIN_THUMBNAIL_OPTIONS}/${publicId}`
}

export const CLOUDINARY_CHAT_THUMB = 'w_200,h_200,c_fill,f_auto,q_auto'

export function buildCloudinaryUrlWithTransformation(
  publicId: string,
  transformation: string,
  cloudName?: string
): string {
  const name = cloudName ?? getCloudinaryCloudName()
  return `https://res.cloudinary.com/${name}/image/upload/${transformation}/${publicId}`
}

function getSeedImageUrl(publicId: string, type: 'marketing' | 'mobile'): string | null {
  const m = /^seed_(\d+)$/.exec(publicId.trim())
  if (!m) return null
  const num = m[1]
  const w = type === 'marketing' ? 1200 : 600
  return `https://picsum.photos/seed/${num}/${w}/400`
}

export function getAssetUrl(
  asset: { cloudinaryPublicId: string; storagePath?: string | null },
  type: 'marketing' | 'mobile'
): string {
  const seedUrl = getSeedImageUrl(asset.cloudinaryPublicId, type)
  if (seedUrl) return seedUrl
  const useStorage = asset.storagePath && asset.storagePath.trim()
  if (import.meta.env.DEV && isMockPublicId(asset.cloudinaryPublicId) && useStorage) {
    return supabase.storage.from(BUCKET).getPublicUrl(asset.storagePath!).data.publicUrl
  }
  if (type === 'marketing') {
    return buildCloudinaryUrl(asset.cloudinaryPublicId, 'marketing')
  }
  if (useStorage) {
    return supabase.storage.from(BUCKET).getPublicUrl(asset.storagePath!).data.publicUrl
  }
  return buildCloudinaryUrl(asset.cloudinaryPublicId, 'mobile')
}

export function getSyncStatus(asset: {
  cloudinaryPublicId: string
  storagePath?: string | null
  usageType?: string
}): SyncStatus {
  const hasCloudinary = Boolean(asset.cloudinaryPublicId && asset.cloudinaryPublicId.trim())
  const hasStorage = Boolean(asset.storagePath && asset.storagePath.trim())
  if (!hasCloudinary) return hasStorage ? 'storage_only' : 'missing'
  if (asset.usageType === 'Mobile_Only' && !hasStorage) return 'cloudinary_only'
  return hasStorage ? 'synced' : 'cloudinary_only'
}
