#!/usr/bin/env node
/**
 * 대기실 11시 줄서기 예약 크론 (매일 02:10 Asia/Seoul ≈ UTC 17:10 전날)
 * — 미예약 launch_ready 카드를 앞으로 11:00 슬롯에 하루 1장씩 채움
 *
 * 사용:
 *   node scripts/setupShowroomShortsPublishQueueFillCron.mjs
 *   node scripts/setupShowroomShortsPublishQueueFillCron.mjs --secret=existing_secret
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_REF = 'sxxnshvidfwuemgbyuqz'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const CRON_JOB_NAME = 'showroom-shorts-publish-queue-fill'
/** 매일 UTC 17:10 = KST 02:10 — 새 카드가 쌓인 뒤 다음 날 11시 줄 보강 */
const CRON_EXPR = '10 17 * * *'

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function getServiceRoleKey() {
  const env = loadEnvFile()
  if (env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return env.SUPABASE_SERVICE_ROLE_KEY.trim()

  const output = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  const line = output.split('\n').find((row) => row.includes('service_role'))
  if (!line) throw new Error('service_role 키를 찾지 못했습니다.')
  const parts = line.split('|').map((part) => part.trim())
  return parts[parts.length - 1]
}

function sqlEscape(value) {
  return value.replace(/'/g, "''")
}

function main() {
  const argSecret = process.argv.find((arg) => arg.startsWith('--secret='))?.split('=')[1]
  const env = loadEnvFile()
  const cronSecret = argSecret?.trim() || env.SHOWROOM_SHORTS_PUBLISH_CRON_SECRET?.trim() || ''
  if (!cronSecret) {
    console.error(
      'SHOWROOM_SHORTS_PUBLISH_CRON_SECRET 가 없습니다. 기존 발행 크론과 맞추려면:\n' +
        '  node scripts/setupShowroomShortsPublishQueueFillCron.mjs --secret=<기존시크릿>',
    )
    process.exit(1)
  }
  const serviceRoleKey = getServiceRoleKey()

  console.log('기존 SHOWROOM_SHORTS_PUBLISH_CRON_SECRET 사용 (secrets set 생략)')

  const scheduleSql = `
do $$
begin
  if exists (select 1 from cron.job where jobname = '${CRON_JOB_NAME}') then
    perform cron.unschedule('${CRON_JOB_NAME}');
  end if;
end $$;

select cron.schedule(
  '${CRON_JOB_NAME}',
  '${CRON_EXPR}',
  $$
  select net.http_post(
    url := '${PROJECT_URL}/functions/v1/showroom-shorts-publish-queue-fill',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${sqlEscape(serviceRoleKey)}',
      'x-shorts-publish-cron-secret', '${sqlEscape(cronSecret)}'
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
`

  const sqlPath = resolve(process.cwd(), '.tmp_shorts_publish_queue_fill_cron.sql')
  writeFileSync(sqlPath, scheduleSql)

  console.log('pg_cron 스케줄 등록 (매일 UTC 17:10 = KST 02:10)…')
  execSync(`npx supabase@latest db query --linked --file ${sqlPath}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  unlinkSync(sqlPath)

  console.log('✓ 줄서기 예약 크론 등록 완료')
  console.log(`  - 스케줄: ${CRON_EXPR} (UTC) → KST 매일 02:10`)
  console.log(`  - 대상: ${PROJECT_URL}/functions/v1/showroom-shorts-publish-queue-fill`)
  console.log(
    '  - Edge 배포: npx supabase functions deploy showroom-shorts-publish-queue-fill --project-ref sxxnshvidfwuemgbyuqz',
  )
  console.log(`  - 시크릿(재사용 시): --secret=${cronSecret}`)
}

main()
