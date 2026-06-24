/* eslint-disable no-console */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildShowroomAbmComparisonReport,
  buildShowroomAbmFrictionMarkdown,
  compareShowroomAbmVariants,
  formatLift,
  formatPercent,
} from '../src/lib/showroomAbmAgentSimulation'

const agentCount = Number(process.env.ABM_AGENT_COUNT ?? 1000)
const seed = Number(process.env.ABM_SEED ?? 20260618)
const mobile = process.env.ABM_MOBILE !== '0'
const options = { mobile }

const comparison = compareShowroomAbmVariants(agentCount, seed, options)
const report = buildShowroomAbmComparisonReport(comparison, options)

console.log(report)
console.log('')
console.log('--- Summary ---')
console.log(`Overall consultation rate: ${formatPercent(comparison.before.rates.overallConsultationRate)} -> ${formatPercent(comparison.after.rates.overallConsultationRate)} (${formatLift(comparison.lift.overallConsultationRate)})`)

const outputPath = resolve(process.cwd(), 'docs/SHOWROOM_ABM_AGENT_SIMULATION_LATEST.md')
writeFileSync(outputPath, `${report}\n`, 'utf8')
console.log('')
console.log('--- Friction focus (after UX) ---')
console.log(buildShowroomAbmFrictionMarkdown(comparison, 'after', options))
console.log(`\nSaved: ${outputPath}`)
