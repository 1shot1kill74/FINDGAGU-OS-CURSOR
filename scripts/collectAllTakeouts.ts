/**
 * collectAllTakeouts.ts
 *
 * Takeout 3 ~ 9까지 순차적으로 collectQuoteImages.ts 실행
 *
 * 실행:
 *   npx tsx scripts/collectAllTakeouts.ts
 */

import { execSync } from "child_process"

const TAKEOUTS = [3, 4, 5, 6, 7, 8, 9]

function run() {
  console.log("\n=========================================")
  console.log(" Takeout 3 ~ 9 순차 실행 시작")
  console.log("=========================================\n")

  for (const n of TAKEOUTS) {
    console.log("\n-----------------------------------------")
    console.log(` Takeout ${n} 시작`)
    console.log("-----------------------------------------\n")

    try {
      execSync(
        `TAKEOUT_NUMBER=${n} npx tsx scripts/collectQuoteImages.ts`,
        { stdio: "inherit" }
      )
    } catch (err) {
      console.error(`\n❌ Takeout ${n} 실행 중 오류 발생`)
      process.exit(1)
    }

    console.log(`\n✅ Takeout ${n} 완료`)
  }

  console.log("\n=========================================")
  console.log(" 모든 Takeout 처리 완료")
  console.log("=========================================\n")
}

run()
