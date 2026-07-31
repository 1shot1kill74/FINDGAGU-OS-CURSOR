#!/usr/bin/env node
/**
 * 사례 블로그 예약 공개 크론 등록 (1분마다)
 *
 * 사용:
 *   node scripts/setupShowroomCaseBlogPublishSchedulerCron.mjs
 *   node scripts/setupShowroomCaseBlogPublishSchedulerCron.mjs --secret=existing_secret
 */
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_REF = 'sxxnshvidfwuemgbyuqz'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const CRON_JOB_NAME = 'showroom-case-blog-publish-scheduler'
const CRON_EXPR = '* * * * *'
const FUNCTION_NAME = 'showroom-case-blog-publish-scheduler'

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
  const cronSecret = argSecret?.trim() || randomBytes(24).toString('hex')
  const serviceRoleKey = getServiceRoleKey()
  const env = loadEnvFile()
  const deployHook =
    env.VERCEL_DEPLOY_HOOK_URL?.trim() || env.VITE_VERCEL_DEPLOY_HOOK_URL?.trim() || ''

  console.log('Edge Function 시크릿 SHOWROOM_CASE_BLOG_PUBLISH_CRON_SECRET 등록…')
  execSync(`npx supabase secrets set SHOWROOM_CASE_BLOG_PUBLISH_CRON_SECRET=${cronSecret}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  if (deployHook) {
    console.log('Edge Function 시크릿 VERCEL_DEPLOY_HOOK_URL 등록…')
    execSync(`npx supabase secrets set VERCEL_DEPLOY_HOOK_URL=${deployHook}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    })
  } else {
    console.warn('VERCEL_DEPLOY_HOOK_URL / VITE_VERCEL_DEPLOY_HOOK_URL 없음 → deploy hook 스킵')
  }

  console.log(`Edge Function 배포: ${FUNCTION_NAME}…`)
  execSync(
    `npx supabase functions deploy ${FUNCTION_NAME} --project-ref ${PROJECT_REF} --no-verify-jwt`,
    {
      stdio: 'inherit',
      cwd: process.cwd(),
    },
  )

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
    url := '${PROJECT_URL}/functions/v1/${FUNCTION_NAME}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ${sqlEscape(serviceRoleKey)}',
      'x-case-blog-publish-cron-secret', '${sqlEscape(cronSecret)}'
    ),
    body := '{"source":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $$
);
`

  const sqlPath = resolve(process.cwd(), '.tmp_case_blog_publish_scheduler_cron.sql')
  writeFileSync(sqlPath, scheduleSql)

  console.log('pg_cron 스케줄 등록 (매 1분)…')
  execSync(`npx supabase@latest db query --linked --file ${sqlPath}`, {
    stdio: 'inherit',
    cwd: process.cwd(),
  })

  unlinkSync(sqlPath)

  console.log('✓ 크론 등록 완료')
  console.log(`  - 스케줄: ${CRON_EXPR} (every minute)`)
  console.log(`  - 대상: ${PROJECT_URL}/functions/v1/${FUNCTION_NAME}`)
  console.log(`  - 시크릿(재사용 시): --secret=${cronSecret}`)
}

main()
