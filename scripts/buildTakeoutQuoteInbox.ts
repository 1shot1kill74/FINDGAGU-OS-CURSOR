import fs from 'node:fs'
import path from 'node:path'

type CsvRow = {
  space_id: string
  file_name: string
  src_path: string
  dst_path: string
  match_reason: string
}

type ManifestItem = {
  id: string
  spaceId: string
  spaceIdNormalized: string
  fileName: string
  assetUrl: string
  matchReason: string
  sourcePath: string
  takeoutVersion: number
}

type Manifest = {
  generatedAt: string
  takeoutVersion: number
  total: number
  candidates: ManifestItem[]
}

const DATA_ROOT = '/Users/findgagu/findgagu-os-data'
const WORKSPACE_ROOT = '/Users/findgagu/Desktop/FINDGAGU-OS-CURSOR'
const PUBLIC_ASSET_ROOT = path.join(WORKSPACE_ROOT, 'public', 'assets', 'takeout-quote-inbox')
const PUBLIC_DATA_PATH = path.join(WORKSPACE_ROOT, 'public', 'data', 'takeout-quote-inbox.json')
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

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

function loadCsvRows(csvPath: string): CsvRow[] {
  const raw = fs.readFileSync(csvPath, 'utf-8').trim()
  if (!raw) return []
  const lines = raw.split(/\r?\n/)
  const [headerLine, ...rowLines] = lines
  if (!headerLine) return []
  const headers = parseCsvLine(headerLine)
  return rowLines
    .map((line) => parseCsvLine(line))
    .filter((cols) => cols.length === headers.length)
    .map((cols) => {
      const row = Object.fromEntries(headers.map((header, idx) => [header, cols[idx] ?? ''])) as Record<string, string>
      return {
        space_id: row.space_id ?? '',
        file_name: row.file_name ?? '',
        src_path: row.src_path ?? '',
        dst_path: row.dst_path ?? '',
        match_reason: row.match_reason ?? '',
      }
    })
    .filter((row) => row.space_id && row.file_name && row.dst_path)
}

function detectLatestTakeoutVersion(): number {
  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true })
  const versions = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const match = entry.name.match(/^collected-quotes-v(\d+)$/)
      return match ? Number(match[1]) : null
    })
    .filter((n): n is number => Number.isInteger(n))
    .sort((a, b) => b - a)

  if (versions.length === 0) {
    throw new Error('collected-quotes-v* 폴더를 찾지 못했습니다.')
  }
  return versions[0]
}

function normalizeSpaceId(input: string): string {
  return input
    .replace(/^spaces\//i, '')
    .replace(/^Space\s+/i, '')
    .trim()
}

function makeSafeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true })
}

function main() {
  const takeoutVersion = Number(process.env.TAKEOUT_VERSION || '') || detectLatestTakeoutVersion()
  const mode = (process.env.TAKEOUT_SOURCE_MODE || 'all').trim().toLowerCase()
  const rows =
    mode === 'candidates'
      ? (() => {
        const sourceDir = path.join(DATA_ROOT, `collected-quotes-v${takeoutVersion}`)
        const csvPath = path.join(sourceDir, 'index.csv')
        if (!fs.existsSync(csvPath)) {
          throw new Error(`index.csv가 없습니다: ${csvPath}`)
        }
        return loadCsvRows(csvPath)
      })()
      : (() => {
        const groupsDir = path.join(DATA_ROOT, 'staging', `Takeout ${takeoutVersion}`, 'Google Chat', 'Groups')
        if (!fs.existsSync(groupsDir)) {
          throw new Error(`Groups 폴더가 없습니다: ${groupsDir}`)
        }
        const out: CsvRow[] = []
        const spaces = fs.readdirSync(groupsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())
        spaces.forEach((spaceDir) => {
          const fullSpaceDir = path.join(groupsDir, spaceDir.name)
          fs.readdirSync(fullSpaceDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && IMAGE_EXTS.has(path.extname(entry.name).toLowerCase()))
            .forEach((entry) => {
              const srcPath = path.join(fullSpaceDir, entry.name)
              out.push({
                space_id: spaceDir.name,
                file_name: entry.name,
                src_path: srcPath,
                dst_path: srcPath,
                match_reason: 'ALL_IMAGES',
              })
            })
        })
        return out
      })()

  ensureDir(path.dirname(PUBLIC_DATA_PATH))
  fs.rmSync(PUBLIC_ASSET_ROOT, { recursive: true, force: true })
  ensureDir(PUBLIC_ASSET_ROOT)

  const candidates: ManifestItem[] = []

  rows.forEach((row, index) => {
    const sourcePath = row.dst_path && fs.existsSync(row.dst_path) ? row.dst_path : row.src_path
    if (!sourcePath || !fs.existsSync(sourcePath)) return

    const normalizedSpaceId = normalizeSpaceId(row.space_id)
    const safeSpace = makeSafeSegment(normalizedSpaceId || row.space_id)
    const safeFileName = makeSafeSegment(row.file_name)
    const targetDir = path.join(PUBLIC_ASSET_ROOT, `v${takeoutVersion}`, safeSpace)
    ensureDir(targetDir)
    const targetPath = path.join(targetDir, `${String(index + 1).padStart(4, '0')}_${safeFileName}`)
    fs.copyFileSync(sourcePath, targetPath)

    candidates.push({
      id: `v${takeoutVersion}-${safeSpace}-${index + 1}`,
      spaceId: row.space_id,
      spaceIdNormalized: normalizedSpaceId,
      fileName: row.file_name,
      assetUrl: `/assets/takeout-quote-inbox/v${takeoutVersion}/${safeSpace}/${path.basename(targetPath)}`,
      matchReason: row.match_reason,
      sourcePath,
      takeoutVersion,
    })
  })

  const manifest: Manifest = {
    generatedAt: new Date().toISOString(),
    takeoutVersion,
    total: candidates.length,
    candidates,
  }

  fs.writeFileSync(PUBLIC_DATA_PATH, JSON.stringify(manifest, null, 2), 'utf-8')

  console.log(`takeout quote inbox build complete`)
  console.log(`takeoutVersion: ${takeoutVersion}`)
  console.log(`sourceMode: ${mode}`)
  console.log(`candidates: ${manifest.total}`)
  console.log(`manifest: ${PUBLIC_DATA_PATH}`)
}

main()
