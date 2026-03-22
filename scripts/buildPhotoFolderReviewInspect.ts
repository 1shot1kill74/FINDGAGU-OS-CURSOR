#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'

const UTF8_BOM = '\uFEFF'

type CsvRow = Record<string, string>

function parseArgs() {
  const args = process.argv.slice(2)
  let input = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.review.csv')
  let output = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.review.inspect.csv')

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

function readCsvRows(filePath: string): CsvRow[] {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '').trim()
  if (!raw) return []
  const lines = raw.split(/\r?\n/)
  const headers = parseCsvLine(lines[0] ?? '')
  return lines.slice(1)
    .map((line) => parseCsvLine(line))
    .map((cols) => alignColumns(headers, cols))
    .filter((cols): cols is string[] => cols !== null)
    .map((cols) => Object.fromEntries(headers.map((header, idx) => [header, cols[idx] ?? ''])))
}

function deriveResource(sourceRoot: string): string {
  if (sourceRoot.includes('Resource 3966')) return '3966'
  if (sourceRoot.includes('Resource 4274')) return '4274'
  return ''
}

function deriveTakeout(sourceRoot: string): string {
  const parts = sourceRoot.split('/')
  return parts.find((part) => part.startsWith('Takeout ')) ?? ''
}

function main() {
  const { input, output } = parseArgs()
  const rows = readCsvRows(input)
  const sortedRows = rows
    .map((row) => ({
      ...row,
      candidate_score_num: Number(row.candidate_score || 0),
    }))
    .sort((a, b) => {
      if (b.candidate_score_num !== a.candidate_score_num) {
        return b.candidate_score_num - a.candidate_score_num
      }
      return String(a.folder_name ?? '').localeCompare(String(b.folder_name ?? ''), 'ko')
    })

  const headers = [
    'resource',
    'takeout',
    'folder_name',
    'file_count',
    'sample_file',
    'candidate_score',
    'candidate_project_name',
    'candidate_display_name',
    'candidate_space_id',
    'candidate_consultation_id',
    'folder_path',
  ]

  fs.mkdirSync(path.dirname(output), { recursive: true })
  const chunks = [UTF8_BOM, toCsvRow(headers)]
  for (const row of sortedRows) {
    chunks.push(toCsvRow([
      deriveResource(String(row.source_root ?? '')),
      deriveTakeout(String(row.source_root ?? '')),
      String(row.folder_name ?? ''),
      String(row.file_count ?? ''),
      String(row.sample_file ?? ''),
      String(row.candidate_score ?? ''),
      String(row.candidate_project_name ?? ''),
      String(row.candidate_display_name ?? ''),
      String(row.candidate_space_id ?? ''),
      String(row.candidate_consultation_id ?? ''),
      String(row.folder_path ?? ''),
    ]))
  }

  fs.writeFileSync(output, chunks.join(''), 'utf-8')
  console.log(`photo folder mapping review inspect complete`)
  console.log(`input: ${input}`)
  console.log(`output: ${output}`)
  console.log(`rows: ${sortedRows.length}`)
}

main()
