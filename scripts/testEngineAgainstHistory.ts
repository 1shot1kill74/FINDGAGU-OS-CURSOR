/**
 * testEngineAgainstHistory.ts
 *
 * 과거 견적 JSON 1개를 불러와
 * 엔진 계산 결과와 실제 금액을 비교한다.
 *
 * 실행:
 *   npx tsx scripts/testEngineAgainstHistory.ts
 */

import fs from "fs"
import { calculateEstimate, loadPriceMap, type EstimateItem } from "./calculateEstimate"
import { normalizeName, toNumber } from "./lib/quoteUtils"

// ─── 테스트 대상 파일 (하드코딩) ───────────────────────────────

const TEST_FILE = "/Users/findgagu/findgagu-os-data/parsed-quotes/Space AAAAA0dAH24/File-image(17).json"

// 배송/설치 관련 항목명 — 엔진이 별도 계산하므로 rows에서 제외
const SKIP_KEYWORDS = ["배송비", "설치비", "조립설치비", "조립 설치비", "전기작업비", "운임", "실리콘시공"]

// ─── 유틸 ──────────────────────────────────────────────────────

function diffPct(engine: number, actual: number): number {
  if (actual === 0) return 0
  return Math.abs(engine - actual) / actual * 100
}

function won(n: number): string {
  return Math.round(n).toLocaleString("ko-KR")
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`
}

// ─── MAIN ──────────────────────────────────────────────────────

function main() {
  // 1. JSON 로드
  if (!fs.existsSync(TEST_FILE)) {
    console.error(`[오류] 파일 없음: ${TEST_FILE}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(TEST_FILE, "utf-8"))
  const data = raw.data

  console.log(`\n테스트 파일: ${TEST_FILE}`)
  console.log(`현장명    : ${data.siteName ?? "(없음)"}`)
  console.log(`견적일    : ${data.quoteDate ?? "(없음)"}`)

  // 2. rows 파싱
  const allRows: Array<{ name?: unknown; spec?: unknown; qty?: unknown; unitPrice?: unknown }> =
    Array.isArray(data.rows) ? data.rows : []

  // 실제값 추출 — 신규 포맷(supply_total/grand_total) 우선, 없으면 rows에서 재계산
  let actual_supply: number = toNumber(data.supply_total)
  let actual_total: number  = toNumber(data.grand_total)

  if (actual_supply === 0) {
    actual_supply = allRows.reduce(
      (s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0
    )
  }
  if (actual_total === 0) {
    // legacy: total_amount = grand_total (VAT 포함)
    actual_total = toNumber(data.total_amount) || actual_supply * 1.1
  }

  // 3. rows 분리: 제품 rows만 calculateEstimate에 전달
  const productRows: EstimateItem[] = []
  const skippedRows: string[] = []

  for (const row of allRows) {
    const rawName = String(row.name ?? "").trim()
    const base_name = normalizeName(rawName)
    const isSkip = SKIP_KEYWORDS.some((kw) => base_name.includes(kw))

    if (isSkip) {
      skippedRows.push(base_name)
      continue
    }

    // spec 정규화: 줄바꿈은 첫 줄만 사용
    const rawSpec = String(row.spec ?? "").split(/\n/)[0]!.trim()

    productRows.push({
      base_name,
      spec: rawSpec,
      qty: toNumber(row.qty),
    })
  }

  // 4. 엔진 계산
  const priceMap = loadPriceMap()
  const result = calculateEstimate(productRows, priceMap)

  // 5. 비교 출력
  const SEP = "─".repeat(60)

  console.log(`\n${SEP}`)
  console.log(" 품목 구성")
  console.log(SEP)
  console.log(`  엔진 계산 대상 rows  : ${productRows.length}개`)
  console.log(`  제외 rows (배송/설치): ${skippedRows.length}개 — ${skippedRows.join(", ")}`)

  console.log(`\n${SEP}`)
  console.log(" 품목별 단가 조회 결과")
  console.log(SEP)
  for (const r of result.rows) {
    const mark = r.matched ? "✓" : "✗ 미등록"
    const spec = r.spec.length > 20 ? r.spec.slice(0, 19) + "…" : r.spec
    console.log(
      `  ${r.base_name.padEnd(20)}  ${spec.padEnd(22)}` +
      `  qty=${r.qty}  단가=${won(r.unit_price)}  금액=${won(r.amount)}  ${mark}`
    )
  }

  console.log(`\n${SEP}`)
  console.log(" 공급가액 비교")
  console.log(SEP)
  console.log(`  실제 공급가 (actual) : ${won(actual_supply)}`)
  console.log(`  엔진 공급가 (engine) : ${won(result.supply_total)}`)
  console.log(`  오차율               : ${pct(diffPct(result.supply_total, actual_supply))}`)

  console.log(`\n${SEP}`)
  console.log(" 최종 합계 비교")
  console.log(SEP)
  console.log(`  실제 합계 (actual) : ${won(actual_total)}`)
  console.log(`  엔진 합계 (engine) : ${won(result.grand_total)}`)
  console.log(`  오차율             : ${pct(diffPct(result.grand_total, actual_total))}`)

  // 6. 구조화 결과 출력
  const comparison = {
    actual_supply,
    engine_supply:           result.supply_total,
    supply_diff_percent:     parseFloat(diffPct(result.supply_total, actual_supply).toFixed(2)),
    actual_total,
    engine_total:            result.grand_total,
    total_diff_percent:      parseFloat(diffPct(result.grand_total, actual_total).toFixed(2)),
  }

  console.log(`\n${SEP}`)
  console.log(" 구조화 결과 (JSON)")
  console.log(SEP)
  console.log(JSON.stringify(comparison, null, 2))
  console.log(SEP)
  console.log()
}

main()
