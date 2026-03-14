/**
 * exportPriceTableCsv.ts
 * 가격 테이블 JSON → CSV 변환 (노이즈 확인용)
 * 실행: tsx scripts/exportPriceTableCsv.ts
 */

import fs from 'fs'
import path from 'path'

const INPUT = path.resolve('public/data/standardPriceTable.v2.json')
const OUTPUT = path.resolve('scripts/priceTable.csv')

const raw = JSON.parse(fs.readFileSync(INPUT, 'utf-8')) as {
  prices: Record<string, Record<string, number>>
}

const rows: string[] = ['제품명,규격,단가']

for (const [baseName, specs] of Object.entries(raw.prices)) {
  for (const [spec, price] of Object.entries(specs)) {
    const displaySpec = spec === '__BASE__' ? '(기본)' : spec
    // CSV 이스케이프
    const escapedBase = baseName.includes(',') ? `"${baseName}"` : baseName
    const escapedSpec = displaySpec.includes(',') ? `"${displaySpec}"` : displaySpec
    rows.push(`${escapedBase},${escapedSpec},${price}`)
  }
}

fs.writeFileSync(OUTPUT, '\uFEFF' + rows.join('\n'), 'utf-8') // BOM 추가 → Excel/Numbers 한글 깨짐 방지
console.log(`✅ 저장 완료: ${OUTPUT}`)
console.log(`   총 ${rows.length - 1}행 (제품 ${Object.keys(raw.prices).length}개)`)
