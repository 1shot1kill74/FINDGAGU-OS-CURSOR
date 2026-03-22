#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'

const UTF8_BOM = '\uFEFF'

function main() {
  const dataDir = path.resolve(process.cwd(), 'data')
  const files = fs.readdirSync(dataDir)
    .filter((file) => file.startsWith('photo-folder-mapping') && file.endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b, 'ko'))

  let updated = 0
  for (const file of files) {
    const filePath = path.join(dataDir, file)
    const raw = fs.readFileSync(filePath, 'utf-8')
    const normalized = raw.replace(/^\uFEFF/, '')
    fs.writeFileSync(filePath, `${UTF8_BOM}${normalized}`, 'utf-8')
    updated += 1
    console.log(`updated: ${filePath}`)
  }

  console.log(`done: ${updated} files`)
}

main()
