/**
 * runEngineResearch.ts
 *
 * FINDGAGU 견적 데이터 자동 연구 파이프라인.
 * 모든 분석 모듈을 순서대로 실행하고 결과를 출력한다.
 *
 * 실행:
 *   npx tsx scripts/runEngineResearch.ts
 */

import { loadAllEntries, INPUT_DIR } from "./lib/quoteUtils"
import { analyzeProductFrequency, printFrequencyResult } from "./analyzeProductFrequency"
import { analyzeUnitPriceBySpec, printUnitPriceResult } from "./analyzeUnitPriceBySpec"
import { analyzeCostRatios, printCostRatioResult } from "./analyzeCostRatios"
import { detectOutliers, printOutlierResult } from "./detectOutliers"
import fs from "fs"

// ─── 헬퍼 ──────────────────────────────────────────────────────

function section(n: number, total: number, title: string) {
  const SEP = "═".repeat(62)
  console.log(`\n${SEP}`)
  console.log(` [${n}/${total}] ${title}`)
  console.log(SEP)
}

// ─── MAIN ──────────────────────────────────────────────────────

function main() {
  const TOTAL = 4
  const SEP = "═".repeat(62)
  const startMs = Date.now()

  console.log(`\n${SEP}`)
  console.log(` FINDGAGU 견적 데이터 자동 연구 파이프라인`)
  console.log(SEP)
  console.log(` 입력 경로: ${INPUT_DIR}`)

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`\n[오류] 폴더 없음: ${INPUT_DIR}`)
    process.exit(1)
  }

  // JSON 일괄 로딩 (모든 모듈이 공유)
  const entries = loadAllEntries(INPUT_DIR)
  console.log(` JSON 파일 : ${entries.length}개`)
  console.log(SEP)

  // ── [1/4] 제품 빈도 분석 ──────────────────────────────────────
  section(1, TOTAL, "제품 빈도 분석")
  const freqResult = analyzeProductFrequency(entries)
  printFrequencyResult(freqResult)

  // ── [2/4] 단가 분석 ────────────────────────────────────────────
  section(2, TOTAL, "제품 × 규격 단가 분석")
  const priceResult = analyzeUnitPriceBySpec(entries)
  printUnitPriceResult(priceResult)

  // ── [3/4] 배송비 / 설치비 비율 ────────────────────────────────
  section(3, TOTAL, "배송비 / 설치비 비율 분석")
  const ratioResult = analyzeCostRatios(entries)
  printCostRatioResult(ratioResult)

  // ── [4/4] 이상치 감지 ─────────────────────────────────────────
  section(4, TOTAL, "이상치 감지")
  // priceResult.groups를 재사용 (재계산 없음)
  const outlierResult = detectOutliers(entries, priceResult.groups)
  printOutlierResult(outlierResult)

  // ── 완료 ──────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`\n${SEP}`)
  console.log(` 분석 완료  |  소요 ${elapsed}s`)
  console.log(SEP)
  console.log()
}

main()
