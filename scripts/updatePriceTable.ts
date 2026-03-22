/**
 * updatePriceTable.ts
 *
 * scripts/standardPriceTable.v1.json → public/data/ 에 버전 누적 방식으로 복사.
 * public/data/priceTable.meta.json 으로 최신 버전을 관리.
 *
 * 실행:
 *   npx tsx scripts/updatePriceTable.ts
 *
 * 파이프라인 (권장):
 *   npm run build:price
 *   = tsx scripts/buildPriceTable.ts && tsx scripts/updatePriceTable.ts
 */

import fs from "fs"
import path from "path"

// ─── 경로 ──────────────────────────────────────────────────────

const SCRIPTS_DIR = path.dirname(new URL(import.meta.url).pathname)
const PUBLIC_DATA = path.join(SCRIPTS_DIR, "..", "public", "data")

/** buildPriceTable.ts 가 출력하는 소스 파일 (항상 이 경로에 덮어씀) */
const SOURCE = path.join(SCRIPTS_DIR, "standardPriceTable.v1.json")

/** 버전 메타 관리 파일 */
const META_PATH = path.join(PUBLIC_DATA, "priceTable.meta.json")

// ─── 타입 ──────────────────────────────────────────────────────

interface PriceTableMeta {
  latest: number
  updatedAt: string
}

// ─── MAIN ──────────────────────────────────────────────────────

function main() {
  // 1. 소스 파일 존재 확인
  if (!fs.existsSync(SOURCE)) {
    console.error(`[오류] 소스 파일 없음: ${SOURCE}`)
    console.error("먼저 npx tsx scripts/buildPriceTable.ts 를 실행하세요.")
    process.exit(1)
  }

  // 2. public/data 폴더 생성 (없으면)
  if (!fs.existsSync(PUBLIC_DATA)) {
    fs.mkdirSync(PUBLIC_DATA, { recursive: true })
    console.log(`[생성] ${PUBLIC_DATA}`)
  }

  // 3. 현재 메타 읽기 → 다음 버전 결정
  let nextVersion = 1
  if (fs.existsSync(META_PATH)) {
    const meta = JSON.parse(fs.readFileSync(META_PATH, "utf-8")) as PriceTableMeta
    nextVersion = (meta.latest ?? 0) + 1
    console.log(`[메타] 현재 latest=${meta.latest} → 다음 v${nextVersion}`)
  } else {
    console.log("[메타] priceTable.meta.json 없음 → v1 부터 시작")
  }

  // 4. public/data/standardPriceTable.v{next}.json 으로 복사
  const destFileName = `standardPriceTable.v${nextVersion}.json`
  const destPath = path.join(PUBLIC_DATA, destFileName)
  fs.copyFileSync(SOURCE, destPath)
  console.log(`[복사] ${path.basename(SOURCE)} → public/data/${destFileName}`)

  // 5. priceTable.meta.json 갱신
  const newMeta: PriceTableMeta = {
    latest: nextVersion,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(META_PATH, JSON.stringify(newMeta, null, 2), "utf-8")
  console.log(`[메타] priceTable.meta.json 갱신 → latest=${nextVersion}, updatedAt=${newMeta.updatedAt}`)

  console.log(`\n완료: public/data/${destFileName} (v${nextVersion})`)
}

main()
