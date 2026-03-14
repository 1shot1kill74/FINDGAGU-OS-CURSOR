#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'

const UTF8_BOM = '\uFEFF'

const IMAGE_EXTS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.heif',
  '.tif',
  '.tiff',
])

type FolderSummary = {
  sourceRoot: string
  folderName: string
  folderPath: string
  fileCount: number
  sampleFile: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  let output = path.resolve(process.cwd(), 'data', 'photo-folder-mapping.csv')
  const roots: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--root' && args[i + 1]) {
      roots.push(path.resolve(args[i + 1]))
      i += 1
      continue
    }
    if (arg.startsWith('--root=')) {
      roots.push(path.resolve(arg.split('=').slice(1).join('=')))
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

  if (roots.length === 0) {
    const envRoots = String(process.env.PHOTO_ROOTS || '')
      .split(path.delimiter)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => path.resolve(item))
    roots.push(...envRoots)
  }

  if (roots.length === 0) {
    console.error('사용법: npx tsx scripts/exportPhotoFolderMappingCandidates.ts --root "/path/to/resource 3966" --root "/path/to/resource 4274"')
    console.error('또는 PHOTO_ROOTS="/path/a:/path/b" npx tsx scripts/exportPhotoFolderMappingCandidates.ts')
    process.exit(1)
  }

  return { roots, output }
}

function csvEscape(value: string): string {
  if (/[,"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsvRow(fields: string[]): string {
  return `${fields.map(csvEscape).join(',')}\n`
}

function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase())
}

function walkImages(dirPath: string): string[] {
  const out: string[] = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkImages(fullPath))
      continue
    }
    if (entry.isFile() && isImageFile(fullPath)) {
      out.push(fullPath)
    }
  }
  return out
}

function scanRoot(rootPath: string): FolderSummary[] {
  if (!fs.existsSync(rootPath)) {
    console.warn(`[skip] root not found: ${rootPath}`)
    return []
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const folderPath = path.join(rootPath, entry.name)
      const images = walkImages(folderPath)
      const sampleFile = images[0] ? path.relative(folderPath, images[0]) : ''
      return {
        sourceRoot: rootPath,
        folderName: entry.name,
        folderPath,
        fileCount: images.length,
        sampleFile,
      }
    })
    .filter((item) => item.fileCount > 0)
    .sort((a, b) => a.folderName.localeCompare(b.folderName, 'ko'))
}

function main() {
  const { roots, output } = parseArgs()
  const rows = roots.flatMap((root) => scanRoot(root))
  const uniqueRows = new Map<string, FolderSummary>()
  for (const row of rows) {
    uniqueRows.set(row.folderPath, row)
  }

  const finalRows = Array.from(uniqueRows.values()).sort((a, b) => a.folderPath.localeCompare(b.folderPath, 'ko'))
  fs.mkdirSync(path.dirname(output), { recursive: true })

  const headers = [
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
  ]

  const chunks = [UTF8_BOM, toCsvRow(headers)]
  for (const row of finalRows) {
    chunks.push(
      toCsvRow([
        row.sourceRoot,
        row.folderName,
        row.folderPath,
        String(row.fileCount),
        row.sampleFile,
        '',
        '',
        '',
        '',
        'pending',
        '',
      ])
    )
  }

  fs.writeFileSync(output, chunks.join(''), 'utf-8')

  console.log(`photo folder mapping export complete`)
  console.log(`roots: ${roots.join(', ')}`)
  console.log(`folders: ${finalRows.length}`)
  console.log(`output: ${output}`)
}

main()
