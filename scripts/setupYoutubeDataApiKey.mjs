#!/usr/bin/env node
/**
 * FINDGAGU 전용 YouTube Data API 키 검증 + Supabase 시크릿 등록
 *
 * 사용:
 *   node scripts/setupYoutubeDataApiKey.mjs AIzaSy...
 *   node scripts/setupYoutubeDataApiKey.mjs --from-env   # .env 의 YOUTUBE_DATA_API_KEY
 *
 * Google Cloud Console에서 YouTube Data API v3만 허용한 키를 발급하세요.
 * docs/COMPETITOR_MONITOR_SETUP.md 참고
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return {}
  const out = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

async function validateYoutubeKey(apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels')
  url.searchParams.set('part', 'id')
  url.searchParams.set('forHandle', 'jooneeyayo33')
  url.searchParams.set('key', apiKey)

  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `YouTube API ${res.status}`)
  }
  if (!data?.items?.length) {
    throw new Error('YouTube API 응답은 성공했지만 채널 조회 결과가 없습니다. 키는 유효합니다.')
  }
  return data.items[0].id
}

function warnIfGeminiKey(apiKey, env) {
  const gemini = env.GOOGLE_GEMINI_API_KEY?.trim()
  if (gemini && gemini === apiKey) {
    console.warn('⚠️  Gemini 키와 동일합니다. YouTube Data API v3 전용 키 발급을 권장합니다.')
  }
}

async function main() {
  const env = loadEnvFile()
  const fromEnvFlag = process.argv.includes('--from-env')
  const argKey = process.argv.find((a) => a.startsWith('AIza'))
  const apiKey = (fromEnvFlag ? env.YOUTUBE_DATA_API_KEY : argKey)?.trim()

  if (!apiKey) {
    console.error('사용법: node scripts/setupYoutubeDataApiKey.mjs AIzaSy... [--from-env]')
    process.exit(1)
  }

  warnIfGeminiKey(apiKey, env)

  console.log('YouTube Data API 키 검증 중…')
  const channelId = await validateYoutubeKey(apiKey)
  console.log(`✓ YouTube API OK (테스트 채널: ${channelId})`)

  console.log('Supabase 시크릿 YOUTUBE_DATA_API_KEY 등록 중…')
  execSync(`npx supabase secrets set YOUTUBE_DATA_API_KEY=${apiKey}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('✓ findgagu-auto-os Supabase 시크릿 등록 완료')
}

main().catch((error) => {
  console.error('실패:', error instanceof Error ? error.message : error)
  process.exit(1)
})
