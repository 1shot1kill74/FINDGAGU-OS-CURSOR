#!/usr/bin/env npx tsx
import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const UTF8_BOM = '\uFEFF'

type CsvRow = Record<string, string>

type ConsultationInfo = {
  id: string
  projectName: string
  displayName: string
  spaceId: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  let base = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.high-confidence.prefilled.csv')
  let manual = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.unmatched.review.csv')
  let output = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.final.csv')
  let matchedOutput = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.final.matched.csv')

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--base' && args[i + 1]) {
      base = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--base=')) {
      base = path.resolve(arg.split('=').slice(1).join('='))
      continue
    }
    if (arg === '--manual' && args[i + 1]) {
      manual = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--manual=')) {
      manual = path.resolve(arg.split('=').slice(1).join('='))
      continue
    }
    if (arg === '--output' && args[i + 1]) {
      output = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--output=')) {
      output = path.resolve(arg.split('=').slice(1).join('='))
      continue
    }
    if (arg === '--matched-output' && args[i + 1]) {
      matchedOutput = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--matched-output=')) {
      matchedOutput = path.resolve(arg.split('=').slice(1).join('='))
    }
  }

  return { base, manual, output, matchedOutput }
}

function getSupabaseEnv() {
  const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    throw new Error('Supabase 환경변수가 없습니다. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 또는 VITE_SUPABASE_ANON_KEY를 설정하세요.')
  }
  return { url, key }
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '"') {
      const next = line[i + 1]
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
      continue
    }
    current += ch
  }
  out.push(current)
  return out
}

function csvEscape(value: string): string {
  if (/[,"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsvRow(fields: string[]): string {
  return `${fields.map(csvEscape).join(',')}\n`
}

function alignColumns(headers: string[], cols: string[]): string[] | null {
  if (cols.length < headers.length) return null
  if (cols.length === headers.length) return cols
  return [
    ...cols.slice(0, headers.length - 1),
    cols.slice(headers.length - 1).join(','),
  ]
}

function readCsvRows(filePath: string): { headers: string[]; rows: CsvRow[] } {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim()
  if (!raw) return { headers: [], rows: [] }
  const lines = raw.split(/\r?\n/)
  const headers = parseCsvLine(lines[0] ?? '')
  const rows = lines.slice(1)
    .map((line) => parseCsvLine(line))
    .map((cols) => alignColumns(headers, cols))
    .filter((cols): cols is string[] => cols !== null)
    .map((cols) => Object.fromEntries(headers.map((header, idx) => [header, cols[idx] ?? ''])))
  return { headers, rows }
}

function normalizeStatus(value: string): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'matched') return 'matched'
  if (normalized === 'ignored') return 'ignored'
  return normalized || 'pending'
}

function parseGoogleChatSpaceId(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('spaces/')) return raw.slice('spaces/'.length)
  const roomMatch = raw.match(/\/room\/([A-Za-z0-9_-]+)/)
  return roomMatch?.[1] ?? raw
}

async function fetchConsultationMap(spaceIds: string[]): Promise<Map<string, ConsultationInfo>> {
  const uniqueSpaceIds = Array.from(new Set(spaceIds.map((item) => item.trim()).filter(Boolean)))
  if (uniqueSpaceIds.length === 0) return new Map()

  const { url, key } = getSupabaseEnv()
  const supabase = createClient<any>(url, key)

  const consultationMap = new Map<string, ConsultationInfo>()
  const batchSize = 1000

  for (let from = 0; ; from += batchSize) {
    const to = from + batchSize - 1
    const { data, error } = await supabase
      .from('consultations')
      .select('id, project_name, channel_chat_id, metadata')
      .range(from, to)

    if (error) throw error

    for (const row of data ?? []) {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const spaceId = String(metadata.space_id ?? '').trim() || parseGoogleChatSpaceId(row.channel_chat_id)
      if (!spaceId || !uniqueSpaceIds.includes(spaceId)) continue
      consultationMap.set(spaceId, {
        id: String(row.id ?? ''),
        projectName: String(row.project_name ?? '').trim(),
        displayName: String(metadata.display_name ?? '').trim(),
        spaceId,
      })
    }

    if (!data || data.length < batchSize || consultationMap.size === uniqueSpaceIds.length) {
      break
    }
  }
  return consultationMap
}

function ensureHeaders(baseHeaders: string[]): string[] {
  const requiredHeaders = [
    'source_root',
    'folder_name',
    'folder_path',
    'file_count',
    'sample_file',
    'consultation_id',
    'space_id',
    'space_display_name',
    'site_name',
    'mapping_status',
    'note',
    'candidate_consultation_id',
    'candidate_space_id',
    'candidate_project_name',
    'candidate_display_name',
    'candidate_score',
  ]
  return [...baseHeaders, ...requiredHeaders.filter((header) => !baseHeaders.includes(header))]
}

function buildManualCanonicalRow(row: CsvRow, consultationMap: Map<string, ConsultationInfo>): CsvRow {
  const folderPath = String(row.folder_path ?? '').trim()
  const status = normalizeStatus(row.manual_status ?? '')
  const manualSpaceId = String(row.manual_space_id ?? '').trim()
  const consultation = consultationMap.get(manualSpaceId)
  const siteName = String(row.manual_site_name ?? '').trim() || consultation?.displayName || consultation?.projectName || ''
  const spaceDisplayName = consultation?.displayName || siteName
  const consultationId = String(row.manual_consultation_id ?? '').trim() || consultation?.id || ''
  const note = String(row.note ?? '').trim() || (status === 'matched' ? 'manual_review_matched' : status === 'ignored' ? 'manual_review_ignored' : '')

  return {
    source_root: path.dirname(folderPath),
    folder_name: String(row.folder_name ?? '').trim(),
    folder_path: folderPath,
    file_count: String(row.file_count ?? '').trim(),
    sample_file: String(row.sample_file ?? '').trim(),
    consultation_id: consultationId,
    space_id: manualSpaceId,
    space_display_name: spaceDisplayName,
    site_name: siteName,
    mapping_status: status,
    note,
    candidate_consultation_id: consultationId,
    candidate_space_id: manualSpaceId,
    candidate_project_name: consultation?.projectName ?? '',
    candidate_display_name: consultation?.displayName ?? '',
    candidate_score: status === 'matched' ? 'manual' : '',
  }
}

function writeCsv(filePath: string, headers: string[], rows: CsvRow[]) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const chunks = [UTF8_BOM, toCsvRow(headers)]
  for (const row of rows) {
    chunks.push(toCsvRow(headers.map((header) => row[header] ?? '')))
  }
  fs.writeFileSync(filePath, chunks.join(''), 'utf-8')
}

async function main() {
  const { base, manual, output, matchedOutput } = parseArgs()
  const baseCsv = readCsvRows(base)
  const manualCsv = readCsvRows(manual)

  if (baseCsv.rows.length === 0) throw new Error(`기본 CSV가 비어 있습니다: ${base}`)
  if (manualCsv.rows.length === 0) throw new Error(`수동 검토 CSV가 비어 있습니다: ${manual}`)

  const finalHeaders = ensureHeaders(baseCsv.headers)
  const manualRows = manualCsv.rows.filter((row) => normalizeStatus(row.manual_status ?? '') !== 'pending')
  const consultationMap = await fetchConsultationMap(manualRows.map((row) => row.manual_space_id ?? ''))

  const mergedByFolderPath = new Map<string, CsvRow>()
  for (const row of baseCsv.rows) {
    const folderPath = String(row.folder_path ?? '').trim()
    if (!folderPath) continue
    mergedByFolderPath.set(folderPath, row)
  }

  for (const row of manualRows) {
    const manualCanonical = buildManualCanonicalRow(row, consultationMap)
    if (!manualCanonical.folder_path) continue
    mergedByFolderPath.set(manualCanonical.folder_path, manualCanonical)
  }

  const mergedRows = Array.from(mergedByFolderPath.values()).sort((a, b) => {
    return String(a.folder_path ?? '').localeCompare(String(b.folder_path ?? ''), 'ko')
  })
  const matchedRows = mergedRows.filter((row) => normalizeStatus(row.mapping_status ?? '') === 'matched')

  writeCsv(output, finalHeaders, mergedRows)
  writeCsv(matchedOutput, finalHeaders, matchedRows)

  const ignoredManualCount = manualRows.filter((row) => normalizeStatus(row.manual_status ?? '') === 'ignored').length
  const matchedManualCount = manualRows.filter((row) => normalizeStatus(row.manual_status ?? '') === 'matched').length

  console.log('photo folder mapping merge complete')
  console.log(`base: ${base}`)
  console.log(`manual: ${manual}`)
  console.log(`output: ${output}`)
  console.log(`matched output: ${matchedOutput}`)
  console.log(`base rows: ${baseCsv.rows.length}`)
  console.log(`manual reviewed rows: ${manualRows.length}`)
  console.log(`manual matched: ${matchedManualCount}`)
  console.log(`manual ignored: ${ignoredManualCount}`)
  console.log(`final rows: ${mergedRows.length}`)
  console.log(`final matched rows: ${matchedRows.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
