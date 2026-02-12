#!/usr/bin/env node
/**
 * 구글 시트 → Supabase consultations 데이터 이관
 *
 * 동기화 규칙 (sync_consultations_from_sheet RPC):
 *   - Null 덮어쓰기 방지: 시트 필드가 빈 값이면 Supabase 기존 데이터 유지
 *   - 신규 행에만 기본값: status='상담중', estimate_amount=0
 *   - 데이터 주권: status, estimate_amount는 앱(Supabase)이 주인, 시트는 정보 전달만
 *
 * 사용:
 *   1. 구글 시트에서 CSV 내보내기 (파일 > 다운로드 > CSV)
 *   2. node scripts/import-consultations-from-sheet.mjs <sheet.csv>
 *
 *   또는 JSON 파일:
 *   node scripts/import-consultations-from-sheet.mjs sheet.json
 *
 * CSV/JSON 컬럼 (헤더):
 *   project_name, start_date, link, update_date, customer_phone, region, industry, request_date 등
 *   (status, estimate_amount는 시트 값 무시 — 앱이 주인)
 */

import { readFileSync, existsSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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
const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim()
const supabaseKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(또는 VITE_SUPABASE_ANON_KEY)')
  process.exit(1)
}

/** 시작일자(YYYY-MM-DD) → created_at ISO 문자열 */
function toCreatedAt(value) {
  if (!value) return new Date().toISOString()
  const s = String(value).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`
  const d = s.match(/(\d{4})[./](\d{1,2})[./](\d{1,2})/)
  if (d) {
    const y = d[1], mon = d[2].padStart(2, '0'), day = d[3].padStart(2, '0')
    return `${y}-${mon}-${day}T00:00:00.000Z`
  }
  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()
  return new Date().toISOString()
}

/** CSV 파싱 (헤더 행 기준) */
function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''))
    const row = {}
    header.forEach((h, idx) => {
      row[h] = vals[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

/** 시트 컬럼명 → DB 컬럼명 매핑 */
const COL_MAP = {
  project_name: 'project_name',
  프로젝트명: 'project_name',
  '업체명': 'project_name',
  A열: 'project_name',
  link: 'link',
  링크: 'link',
  start_date: 'start_date',
  시작일: 'start_date',
  시작일자: 'start_date',
  시작일자: 'start_date',
  update_date: 'update_date',
  업데이트일: 'update_date',
  status: 'status',
  상태: 'status',
  estimate_amount: 'estimate_amount',
  견적가: 'estimate_amount',
  customer_phone: 'customer_phone',
  전화번호: 'customer_phone',
  region: 'region',
  지역: 'region',
  industry: 'industry',
  업종: 'industry',
  request_date: 'request_date',
  요청일: 'request_date',
}

function normalizeRow(raw) {
  const r = {}
  for (const [key, val] of Object.entries(raw)) {
    const dbCol = COL_MAP[key] || key
    if (val !== '' && val != null) r[dbCol] = val
  }
  return r
}

/** 시트 행 → RPC용 row (status, estimate_amount 제외 — 앱 주권) */
function buildConsultationRow(row) {
  const projectName = row.project_name || row.프로젝트명 || row['업체명'] || row.A열 || ''
  if (!projectName || !String(projectName).trim()) return null

  const startDateRaw = row.start_date || row.시작일 || row.시작일자 || ''
  const created_at = toCreatedAt(startDateRaw)
  const start_date = startDateRaw ? startDateRaw.replace(/\D/g, '').slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : null

  return {
    project_name: String(projectName).trim(),
    created_at,
    link: row.link || row.링크 || null,
    start_date: start_date || null,
    update_date: row.update_date || row.업데이트일 || null,
    customer_phone: row.customer_phone || row.전화번호 || null,
    region: row.region || row.지역 || null,
    industry: row.industry || row.업종 || null,
    request_date: row.request_date || row.요청일 || null,
    is_visible: true,
  }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath || !existsSync(filePath)) {
    console.error('사용법: node scripts/import-consultations-from-sheet.mjs <sheet.csv 또는 sheet.json>')
    process.exit(1)
  }

  const content = readFileSync(filePath, 'utf8')
  let rows = []
  if (filePath.endsWith('.json')) {
    const data = JSON.parse(content)
    rows = Array.isArray(data) ? data : (data.rows || data.data || [])
  } else {
    rows = parseCSV(content)
  }

  if (rows.length === 0) {
    console.error('행이 없습니다.')
    process.exit(1)
  }

  const consultations = rows
    .map((r) => buildConsultationRow(typeof r === 'object' ? r : {}))
    .filter(Boolean)

  if (consultations.length === 0) {
    console.error('유효한 project_name(프로젝트명)이 없습니다.')
    process.exit(1)
  }

  console.log(`이관 대상: ${consultations.length}건`)
  console.log('첫 행 예시:', JSON.stringify(consultations[0], null, 2))

  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data, error } = await supabase.rpc('sync_consultations_from_sheet', { rows: consultations })

  if (error) {
    console.error('동기화 실패:', error.message)
    process.exit(1)
  }

  const result = Array.isArray(data) ? data[0] : data
  const inserted = result?.inserted ?? 0
  const updated = result?.updated ?? 0
  console.log(`완료: 신규 ${inserted}건, 수정 ${updated}건 (project_name 기준, status/estimate_amount 앱 주권)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
