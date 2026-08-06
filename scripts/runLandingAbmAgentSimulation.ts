/* eslint-disable no-console */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildLandingAbmReport,
  compareLandingAbmVariants,
  formatLiftLabel,
  formatPercentLabel,
  landingAbmComparisonToJson,
} from '../src/lib/landingAbmAgentSimulation'

const agentCount = Number(process.env.ABM_AGENT_COUNT ?? 1000)
const seed = Number(process.env.ABM_SEED ?? 20260806)

const comparison = compareLandingAbmVariants(agentCount, seed)
const report = buildLandingAbmReport(comparison)
const json = landingAbmComparisonToJson(comparison)

console.log(report)
console.log('--- Summary ---')
console.log(
  `Consult rate: ${formatPercentLabel(comparison.before.rates.consultRate)} -> ${formatPercentLabel(comparison.after.rates.consultRate)} (${formatLiftLabel(comparison.lift.consultRate)})`,
)

const mdPath = resolve(process.cwd(), 'docs/LANDING_ABM_AGENT_SIMULATION_LATEST.md')
const jsonPath = resolve(process.cwd(), 'docs/landing_abm_simulation_latest.json')
writeFileSync(mdPath, `${report}\n`, 'utf8')
writeFileSync(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
console.log(`\nSaved: ${mdPath}`)
console.log(`Saved: ${jsonPath}`)
