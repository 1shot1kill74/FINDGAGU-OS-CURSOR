/**
 * 방금 업로드한 image_assets용 Cloudinary 이미지 삭제 (일회성).
 * .env의 VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_API_KEY, VITE_CLOUDINARY_API_SECRET 필요.
 * 사용: node scripts/delete-cloudinary-uploaded.mjs
 */
import { createHash } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function loadEnv() {
  const path = join(root, '.env')
  if (!existsSync(path)) return {}
  const env = {}
  readFileSync(path, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      let v = m[2].split('#')[0].trim()
      v = v.replace(/^["']|["']$/g, '')
      env[m[1].trim()] = v
    }
  })
  return env
}

const env = { ...process.env, ...loadEnv() }
const cloudName = (env.VITE_CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME || '').trim()
const apiKey = (env.VITE_CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY || '').trim()
const apiSecret = (env.VITE_CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET || '').trim()

if (!cloudName || !apiKey || !apiSecret) {
  console.error('Missing Cloudinary env: VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_API_KEY, VITE_CLOUDINARY_API_SECRET')
  process.exit(1)
}

// Supabase image_assets에서 삭제하기 전에 확인한 public_id (URL 기준: upload/ 다음, 확장자 제거)
const publicIds = [
  'khgm9q8h169kfdsxtwom',
  'qh1qcn8kxyufpcahmdhc',
  'i8i3gp8xnrur9wv8t0iu',
  'sqbjpzjtv4qkhievthfr',
  'qomagr6v4kmaatvwhfvd',
  'ibh92a3gyul1mgfjs9d3',
]

function sign(params, secret) {
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
  const toSign = sorted + secret
  return createHash('sha1').update(toSign, 'utf8').digest('hex')
}

async function destroy(publicId) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const params = { invalidate: 'true', public_id: publicId, timestamp }
  const signature = sign(params, apiSecret)
  const body = new URLSearchParams({ ...params, signature, api_key: apiKey })
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  const json = await res.json()
  if (json.result === 'ok') {
    console.log('Deleted:', publicId)
    return true
  }
  console.warn('Failed:', publicId, json)
  return false
}

const results = await Promise.all(publicIds.map(destroy))
console.log('Cloudinary 삭제 완료:', results.filter(Boolean).length + '/' + publicIds.length)
process.exit(results.every(Boolean) ? 0 : 1)
