#!/usr/bin/env node
/**
 * Apify API 토큰 → Supabase 시크릿 등록 (인스타 경쟁사 수집)
 *
 * 토큰 발급: https://console.apify.com/account/integrations
 *
 * 사용:
 *   node scripts/setupApifyToken.mjs apify_api_...
 *   node scripts/setupApifyToken.mjs --from-env
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

async function validateApifyToken(token) {
  const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Apify 토큰 검증 실패 (${res.status}): ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  const username = data?.data?.username ?? data?.username ?? 'unknown'
  return username
}

async function main() {
  const env = loadEnvFile()
  const fromEnvFlag = process.argv.includes('--from-env')
  const argToken = process.argv.find((a) => a.startsWith('apify_api_'))
  const token = (fromEnvFlag ? env.APIFY_API_TOKEN : argToken)?.trim()

  if (!token) {
    console.error('사용법: node scripts/setupApifyToken.mjs apify_api_... [--from-env]')
    console.error('토큰 발급: https://console.apify.com/account/integrations')
    process.exit(1)
  }

  console.log('Apify 토큰 검증 중…')
  const username = await validateApifyToken(token)
  console.log(`✓ Apify OK (계정: ${username})`)

  console.log('Supabase 시크릿 APIFY_API_TOKEN 등록 중…')
  execSync(`npx supabase secrets set APIFY_API_TOKEN=${token}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })
  console.log('✓ findgagu-auto-os Supabase 시크릿 등록 완료')
  console.log('다음: npx supabase functions deploy competitor-monitor-poll --project-ref sxxnshvidfwuemgbyuqz')
}

main().catch((error) => {
  console.error('실패:', error instanceof Error ? error.message : error)
  process.exit(1)
})
