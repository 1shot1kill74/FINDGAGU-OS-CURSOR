#!/usr/bin/env node
/**
 * 경쟁사 모니터링 주간 크론 등록
 * - 매주 일요일 00:00 KST (= 토요일 15:00 UTC)
 *
 * 사용:
 *   npm run setup:competitor-cron
 *   npm run setup:competitor-cron -- --secret existing_secret
 */
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_REF = 'sxxnshvidfwuemgbyuqz'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const CRON_JOB_NAME = 'competitor-monitor-weekly'
// 일요일 00:00 KST = 토요 15:00 UTC
const CRON_EXPR = '0 15 * * 6'

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
  const cronSecret = argSecret?.trim() || randomBytes(24).toString('hex')
  const serviceRoleKey = getServiceRoleKey()

  console.log('Edge Function 시크릿 COMPETITOR_MONITOR_CRON_SECRET 등록…')
  execSync(`npx supabase secrets set COMPETITOR_MONITOR_CRON_SECRET=${cronSecret}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

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
    url := '${PROJECT_URL}/functions/v1/competitor-monitor-poll',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${sqlEscape(serviceRoleKey)}',
      'x-competitor-monitor-cron-secret', '${sqlEscape(cronSecret)}'
    ),
    body := '{"competitorSlug":"wannaeus","source":"cron"}'::jsonb,
    timeout_milliseconds := 300000
  ) as request_id;
  $$
);
`

  const sqlPath = resolve(process.cwd(), '.tmp_competitor_cron_schedule.sql')
  writeFileSync(sqlPath, scheduleSql)

  console.log('pg_cron 스케줄 등록 (매주 일요일 00:00 KST)…')
  execSync(`npx supabase@latest db query --linked --file ${sqlPath}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  unlinkSync(sqlPath)

  console.log('✓ 크론 등록 완료')
  console.log(`  - 스케줄: ${CRON_EXPR} (UTC) = 매주 일요일 00:00 KST`)
  console.log(`  - 대상: ${PROJECT_URL}/functions/v1/competitor-monitor-poll`)
  console.log('  - Edge Function 재배포 후 동작: npx supabase functions deploy competitor-monitor-poll --project-ref sxxnshvidfwuemgbyuqz')
}

main()
