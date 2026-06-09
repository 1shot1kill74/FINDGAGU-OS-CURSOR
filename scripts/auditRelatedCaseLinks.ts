/* eslint-disable no-console */
import 'dotenv/config'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL?.trim() || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY?.trim() || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

Object.assign(import.meta, {
  env: {
    VITE_SUPABASE_URL: SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  },
})
;(import.meta as ImportMeta & { env: Record<string, string> }).env = {
  VITE_SUPABASE_URL: SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
}

async function main() {
  const [
    { fetchApprovedBlogShowroomCaseProfileDrafts },
    { fetchPublicShowroomAssets },
    { fetchShowroomImageAssets },
    { resolvePublicShowroomCaseHref, loadShowroomCaseApproachBundle },
    { groupBeforeAfterAssets },
  ] = await Promise.all([
    import('../src/lib/showroomCaseProfileService'),
    import('../src/lib/showroomShareService'),
    import('../src/lib/imageAssetService'),
    import('../src/lib/showroomCaseApproachData'),
    import('../src/lib/showroomImageAssetGrouping'),
  ])

  const drafts = await fetchApprovedBlogShowroomCaseProfileDrafts()
  const publicAssets = await fetchPublicShowroomAssets()
  const internalAssets = await fetchShowroomImageAssets()
  const groups = groupBeforeAfterAssets(publicAssets)
  let completeGroups = 0
  for (const [, images] of groups) {
    if (images.some((i) => i.before_after_role === 'before') && images.some((i) => i.before_after_role === 'after')) {
      completeGroups++
    }
  }

  const results = []
  for (const d of drafts) {
    const href = resolvePublicShowroomCaseHref(d, publicAssets, internalAssets)
    const siteKey = decodeURIComponent(href.replace('/public/showroom/case/', ''))
    const load = await loadShowroomCaseApproachBundle(encodeURIComponent(siteKey), 'public')
    results.push({
      siteName: d.siteName,
      canonical: d.canonicalSiteName,
      siteKey,
      ok: load.ok,
      reason: load.ok ? null : load.reason,
    })
  }

  const okCount = results.filter((r) => r.ok).length
  console.log('Total approved blog drafts:', drafts.length)
  console.log('Public complete B/A groups:', completeGroups)
  console.log(`Load OK: ${okCount}/${results.length}`)

  const failures = results.filter((r) => !r.ok)
  if (failures.length === 0) {
    console.log('\nAll related-case hrefs resolve successfully.')
    return
  }

  console.log('\nFAILURES:')
  for (const r of failures) {
    console.log('-', r.siteName)
    console.log('  canonical:', r.canonical)
    console.log('  resolved siteKey:', r.siteKey)
    console.log('  reason:', r.reason)
  }
  process.exitCode = 1
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
