/**
 * simulateEstimateSession.ts
 *
 * 실제 견적 JSON 1개를 불러와 엔진 계산 결과와 비교한다.
 * 제품별 단가 오차, 공급가/배송설치/총액 비교를 표 형태로 출력.
 *
 * 실행:
 *   npx tsx scripts/simulateEstimateSession.ts
 */

import fs from "fs"
import { calculateEstimate, loadPriceMap, type EstimateItem } from "./calculateEstimate"
import { normalizeName, toNumber } from "./lib/quoteUtils"

// ─── 테스트 파일 ───────────────────────────────────────────────
// parsed-quotes 폴더의 다른 파일로 교체 가능

const TEST_FILE =
  "/Users/findgagu/findgagu-os-data/parsed-quotes/Space AAAA-2vbRes/File-image(17).json"

// ─── 분류 키워드 ───────────────────────────────────────────────

const DELIVERY_KW = ["배송비", "운임"]
const INSTALL_KW  = ["설치비", "조립설치비", "조립 설치비"]
const SKIP_KW     = [...DELIVERY_KW, ...INSTALL_KW, "전기작업비", "실리콘시공"]

// ─── 출력 헬퍼 ─────────────────────────────────────────────────

const won = (n: number) => Math.round(n).toLocaleString("ko-KR")

function diffPct(engine: number, actual: number): string {
  if (actual === 0) return "  N/A"
  const p = Math.abs(engine - actual) / actual * 100
  return `${p.toFixed(1).padStart(5)}%`
}

function diffSign(engine: number, actual: number): string {
  if (actual === 0) return ""
  const diff = engine - actual
  return diff > 0 ? `+${won(diff)}` : won(diff)
}

/** 한글 포함 문자열을 지정 표시폭으로 패딩 */
function wp(s: string, len: number, right = false): string {
  const dw = [...s].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 2 : 1), 0)
  const pad = " ".repeat(Math.max(0, len - dw))
  return right ? pad + s : s + pad
}

// ─── MAIN ──────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(TEST_FILE)) {
    console.error(`[오류] 파일 없음: ${TEST_FILE}`)
    process.exit(1)
  }

  const raw = JSON.parse(fs.readFileSync(TEST_FILE, "utf-8"))
  const data = raw.data

  // ── 실제값 추출 ────────────────────────────────────────────
  const allRows: Array<{ name?: unknown; spec?: unknown; qty?: unknown; unitPrice?: unknown }> =
    Array.isArray(data.rows) ? data.rows : []

  let actual_supply: number = toNumber(data.supply_total)
  let actual_total: number  = toNumber(data.grand_total)
  if (actual_supply === 0) {
    actual_supply = allRows.reduce((s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0)
  }
  if (actual_total === 0) {
    actual_total = toNumber(data.total_amount) || actual_supply * 1.1
  }

  // ── rows 분류 ─────────────────────────────────────────────
  type RawRow = typeof allRows[0]

  const productRows:  Array<RawRow & { _baseName: string }> = []
  const deliveryRows: Array<RawRow> = []
  const installRows:  Array<RawRow> = []
  const otherRows:    Array<RawRow> = []

  for (const row of allRows) {
    const base = normalizeName(String(row.name ?? "").trim())
    if (DELIVERY_KW.some((k) => base.includes(k)))   { deliveryRows.push(row); continue }
    if (INSTALL_KW.some((k)  => base.includes(k)))   { installRows.push(row);  continue }
    if (SKIP_KW.some((k)     => base.includes(k)))   { otherRows.push(row);    continue }
    productRows.push({ ...row, _baseName: base })
  }

  // 실제 배송비 / 설치비 합계
  const actual_delivery = deliveryRows.reduce(
    (s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0
  )
  const actual_install = installRows.reduce(
    (s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0
  )
  // 제품 rows만의 실제 공급가 (배송/설치 제외)
  const actual_product_supply = productRows.reduce(
    (s, r) => s + toNumber(r.qty) * toNumber(r.unitPrice), 0
  )

  // ── 엔진 계산 ─────────────────────────────────────────────
  const estimateItems: EstimateItem[] = productRows.map((r) => ({
    base_name: r._baseName,
    spec: String(r.spec ?? "").split(/\n/)[0]!.trim(),
    qty: toNumber(r.qty),
  }))

  const priceTable = loadPriceMap()
  const result = calculateEstimate(estimateItems, priceTable)

  // ── 출력 ──────────────────────────────────────────────────
  const W = 90
  const SEP  = "═".repeat(W)
  const sep  = "─".repeat(W)
  const sep2 = "┄".repeat(W)

  console.log(`\n${SEP}`)
  console.log(` 견적 시뮬레이션`)
  console.log(SEP)
  console.log(` 파일    : ${TEST_FILE.split("/").slice(-2).join("/")}`)
  console.log(` 현장명  : ${data.siteName  ?? "(없음)"}`)
  console.log(` 견적일  : ${data.quoteDate ?? "(없음)"}`)
  console.log(` 가격표  : ${Object.keys(priceTable).length}개 제품`)
  console.log(SEP)

  // ── [1] 제품별 단가 비교 ──────────────────────────────────
  console.log(`\n${sep}`)
  console.log(
    ` ${wp("제품명", 18)}  ${wp("규격", 22)}` +
    `  ${wp("qty", 3, true)}  ${wp("실제단가", 10, true)}  ${wp("엔진단가", 10, true)}` +
    `  ${wp("오차%", 6, true)}  ${wp("매칭", 8)}`
  )
  console.log(` ${sep}`)

  for (let i = 0; i < productRows.length; i++) {
    const rawRow  = productRows[i]!
    const engRow  = result.rows[i]!
    const actual_up = toNumber(rawRow.unitPrice)
    const engine_up = engRow.unit_price
    const name = engRow.base_name.length > 13 ? engRow.base_name.slice(0, 12) + "…" : engRow.base_name
    const spec = engRow.spec.length > 19      ? engRow.spec.slice(0, 18) + "…"      : engRow.spec

    const matchLabel = { spec: "✓ spec", base: "△ BASE", none: "✗ 없음" }[engRow.matchType]

    console.log(
      ` ${wp(name, 18)}  ${wp(spec, 22)}` +
      `  ${String(engRow.qty).padStart(3)}  ${won(actual_up).padStart(10)}  ${won(engine_up).padStart(10)}` +
      `  ${diffPct(engine_up, actual_up)}  ${matchLabel}`
    )
  }
  console.log(` ${sep}`)

  // ── [2] 공급가 비교 ───────────────────────────────────────
  console.log(`\n${sep2}`)
  console.log(` [공급가 비교]  (배송·설치 제외 제품 합계)`)
  console.log(` ${sep2}`)
  console.log(
    `  ${"실제 제품 공급가".padEnd(18)}: ${won(actual_product_supply).padStart(14)}` +
    `  (전체 공급가 ${won(actual_supply)} 중 배송/설치 제외)`
  )
  console.log(
    `  ${"엔진 공급가".padEnd(18)}: ${won(result.supply_total).padStart(14)}` +
    `  오차 ${diffSign(result.supply_total, actual_product_supply)}  (${diffPct(result.supply_total, actual_product_supply).trim()})`
  )

  // ── [3] 배송·설치 비교 ────────────────────────────────────
  console.log(`\n${sep2}`)
  console.log(` [배송·설치 비교]`)
  console.log(` ${sep2}`)
  console.log(
    `  ${"배송비".padEnd(8)}  실제 ${won(actual_delivery).padStart(10)}  엔진 ${won(result.delivery_cost).padStart(10)}` +
    `  오차 ${diffSign(result.delivery_cost, actual_delivery)}  (${diffPct(result.delivery_cost, actual_delivery).trim()})`
  )
  console.log(
    `  ${"설치비".padEnd(8)}  실제 ${won(actual_install).padStart(10)}  엔진 ${won(result.install_cost).padStart(10)}` +
    `  오차 ${diffSign(result.install_cost, actual_install)}  (${diffPct(result.install_cost, actual_install).trim()})`
  )

  // ── [4] 총액 비교 ─────────────────────────────────────────
  console.log(`\n${SEP}`)
  console.log(` [최종 합계 비교]`)
  console.log(` ${SEP}`)
  console.log(`  ${"실제 grand_total".padEnd(18)}: ${won(actual_total).padStart(14)}`)
  console.log(`  ${"엔진 grand_total".padEnd(18)}: ${won(result.grand_total).padStart(14)}`)
  console.log(`  ${"총액 오차".padEnd(18)}: ${diffSign(result.grand_total, actual_total).padStart(14)}  (${diffPct(result.grand_total, actual_total).trim()})`)

  // ── [5] 매칭 요약 ─────────────────────────────────────────
  const specCount = result.rows.filter((r) => r.matchType === "spec").length
  const baseCount = result.rows.filter((r) => r.matchType === "base").length
  const noneCount = result.rows.filter((r) => r.matchType === "none").length

  console.log(`\n  매칭 현황: ✓ spec ${specCount}개  △ BASE ${baseCount}개  ✗ 없음 ${noneCount}개`)
  console.log(`${SEP}\n`)
}

main()
