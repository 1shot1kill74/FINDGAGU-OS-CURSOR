/**
 * exportPriceSources.ts
 *
 * 가격 테이블에 포함된 각 (제품명, 규격, 단가)가
 * 어느 견적서에서 나왔는지 추적하는 CSV 생성.
 *
 * 출력: scripts/priceSources.csv
 * 컬럼: 제품명, 규격, 단가, 견적날짜, 현장명, space_id
 *
 * 실행: npx tsx scripts/exportPriceSources.ts
 */

import fs from 'fs'
import path from 'path'
import { loadAllEntries, INPUT_DIR, normalizeName, normalizeSpec, toNumber } from './lib/quoteUtils'

const OUTPUT = path.resolve('scripts/priceSources.csv')

const SKIP_KEYWORDS = [
  '배송비', '설치비', '조립설치비', '조립 설치비',
  '전기작업비', '운임', '실리콘시공',
]

function esc(s: string): string {
  // CSV 이스케이프: 쉼표·줄바꿈·따옴표 포함 시 따옴표로 감싸기
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function main() {
  const entries = loadAllEntries(INPUT_DIR)
  console.log(`파일 수: ${entries.length}개`)

  const rows: string[] = ['제품명,규격,단가,견적날짜,현장명,space_id']

  for (const { filePath, parsed } of entries) {
    const data = parsed?.data
    const quoteDate = String(data?.quoteDate ?? '').trim()
    const siteName  = String((data as any)?.siteName ?? '').trim()
    const spaceId   = String(parsed?.space_id ?? path.basename(path.dirname(filePath))).trim()

    const lineRows = data?.rows
    if (!Array.isArray(lineRows)) continue

    for (const row of lineRows) {
      const rawName  = String(row.name ?? '').trim()
      const rawSpec  = String(row.spec ?? '').split(/\n/)[0]!.trim()
      const price    = toNumber(row.unitPrice)

      if (!rawName || price <= 0) continue

      const baseName = normalizeName(rawName)
      if (!baseName) continue
      if (SKIP_KEYWORDS.some((kw) => baseName.includes(kw))) continue

      const spec = normalizeSpec(rawSpec)

      rows.push([
        esc(baseName),
        esc(spec),
        String(price),
        esc(quoteDate),
        esc(siteName),
        esc(spaceId),
      ].join(','))
    }
  }

  fs.writeFileSync(OUTPUT, '\uFEFF' + rows.join('\n'), 'utf-8')
  console.log(`✅ 저장 완료: ${OUTPUT}`)
  console.log(`   총 ${rows.length - 1}행 (헤더 제외)`)
}

main()
