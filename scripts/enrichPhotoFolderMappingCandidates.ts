#!/usr/bin/env npx tsx
import 'dotenv/config'

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const UTF8_BOM = '\uFEFF'

type CsvRow = Record<string, string>

type ConsultationCandidate = {
  id: string
  projectName: string
  displayName: string
  spaceId: string
  searchBlob: string
  tokens: string[]
}

function parseArgs() {
  const args = process.argv.slice(2)
  let input = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.csv')
  let output = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.enriched.csv')

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--input' && args[i + 1]) {
      input = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--input=')) {
      input = path.resolve(arg.split('=').slice(1).join('='))
      continue
    }
    if (arg === '--output' && args[i + 1]) {
      output = path.resolve(args[i + 1])
      i += 1
      continue
    }
    if (arg.startsWith('--output=')) {
      output = path.resolve(arg.split('=').slice(1).join('='))
    }
  }

  return { input, output }
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

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[,_/\\-]+/g, ' ')
    .replace(/[^0-9a-zA-Z가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSearchTokens(value: string): string[] {
  return Array.from(new Set(
    normalizeText(value)
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 2)
  ))
}

function scoreCandidate(folderName: string, candidate: ConsultationCandidate): number {
  const normalizedFolder = normalizeText(folderName)
  if (!normalizedFolder) return 0

  let score = 0
  if (candidate.searchBlob === normalizedFolder) score += 100
  if (candidate.searchBlob.includes(normalizedFolder) || normalizedFolder.includes(candidate.searchBlob)) score += 45

  const folderTokens = buildSearchTokens(folderName)
  const sharedTokens = folderTokens.filter((token) => candidate.tokens.includes(token))
  score += sharedTokens.length * 12

  const folderNumbers = folderTokens.filter((token) => /^\d{2,}$/.test(token))
  const numberMatches = folderNumbers.filter((token) => candidate.tokens.includes(token))
  score += numberMatches.length * 15

  if (folderTokens.some((token) => candidate.projectName.includes(token))) score += 10
  if (folderTokens.some((token) => candidate.displayName.includes(token))) score += 10

  return score
}

function parseGoogleChatSpaceId(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('spaces/')) return raw.slice('spaces/'.length)
  const roomMatch = raw.match(/\/room\/([A-Za-z0-9_-]+)/)
  return roomMatch?.[1] ?? raw
}

async function fetchConsultations(): Promise<ConsultationCandidate[]> {
  const { url, key } = getSupabaseEnv()
  const supabase = createClient<any>(url, key)
  const { data, error } = await supabase
    .from('consultations')
    .select('id, project_name, channel_chat_id, metadata, is_visible')
    .eq('is_visible', true)
    .limit(5000)

  if (error) throw error

  return (data ?? [])
    .map((row: any) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>
      const projectName = String(row.project_name ?? '').trim()
      const displayName = String(metadata.display_name ?? '').trim()
      const spaceId = String(metadata.space_id ?? '').trim() || parseGoogleChatSpaceId(row.channel_chat_id)
      const searchParts = [projectName, displayName, spaceId].filter(Boolean)
      const searchBlob = normalizeText(searchParts.join(' '))
      return {
        id: String(row.id),
        projectName,
        displayName,
        spaceId,
        searchBlob,
        tokens: buildSearchTokens(searchParts.join(' ')),
      }
    })
    .filter((item) => item.projectName || item.displayName || item.spaceId)
}

async function main() {
  const { input, output } = parseArgs()
  const { headers, rows } = readCsvRows(input)
  if (rows.length === 0) throw new Error(`입력 CSV가 비어 있습니다: ${input}`)

  const candidates = await fetchConsultations()
  const extraHeaders = [
    'candidate_consultation_id',
    'candidate_space_id',
    'candidate_project_name',
    'candidate_display_name',
    'candidate_score',
  ]
  const finalHeaders = [...headers, ...extraHeaders.filter((header) => !headers.includes(header))]

  const outRows = rows.map((row) => {
    const folderName = row.folder_name ?? ''
    const ranked = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(folderName, candidate),
      }))
      .filter((item) => item.score >= 25)
      .sort((a, b) => b.score - a.score)

    const top = ranked[0]
    return {
      ...row,
      candidate_consultation_id: top?.candidate.id ?? '',
      candidate_space_id: top?.candidate.spaceId ?? '',
      candidate_project_name: top?.candidate.projectName ?? '',
      candidate_display_name: top?.candidate.displayName ?? '',
      candidate_score: top ? String(top.score) : '',
    }
  })

  fs.mkdirSync(path.dirname(output), { recursive: true })
  const chunks = [UTF8_BOM, toCsvRow(finalHeaders)]
  for (const row of outRows) {
    chunks.push(toCsvRow(finalHeaders.map((header) => row[header] ?? '')))
  }
  fs.writeFileSync(output, chunks.join(''), 'utf-8')

  const matchedCount = outRows.filter((row) => row.candidate_consultation_id).length
  console.log(`photo folder mapping enrichment complete`)
  console.log(`input: ${input}`)
  console.log(`output: ${output}`)
  console.log(`rows: ${outRows.length}`)
  console.log(`matched: ${matchedCount}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
