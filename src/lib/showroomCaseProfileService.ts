import { supabase } from '@/lib/supabase'
import {
  buildShowroomFollowupSummary,
  resolveShowroomCaseProfile,
  type ShowroomCaseProfile,
} from '@/features/지능형쇼룸홈페이지/showroomCaseProfileService'

export {
  buildShowroomFollowupSummary,
  resolveShowroomCaseProfile,
  type ShowroomCaseProfile,
}

export type ShowroomCaseProfileDraft = {
  siteName: string
  painPoint: string | null
  solutionPoint: string | null
}

export async function fetchShowroomCaseProfileDrafts(siteNames: string[]): Promise<ShowroomCaseProfileDraft[]> {
  const normalized = Array.from(new Set(siteNames.map((siteName) => siteName.trim()).filter(Boolean)))
  if (normalized.length === 0) return []

  const { data, error } = await (supabase as any)
    .from('showroom_case_profiles')
    .select('site_name, pain_point, solution_point')
    .in('site_name', normalized)

  if (error) throw new Error(error.message)

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    siteName: String(row.site_name ?? ''),
    painPoint: typeof row.pain_point === 'string' ? row.pain_point : null,
    solutionPoint: typeof row.solution_point === 'string' ? row.solution_point : null,
  }))
}

export async function saveShowroomCaseProfileDraft(input: {
  siteName: string
  canonicalSiteName?: string | null
  industry?: string | null
  painPoint: string | null
  solutionPoint: string | null
}): Promise<{ error: Error | null }> {
  const siteName = input.siteName.trim()
  if (!siteName) {
    return { error: new Error('현장명이 비어 있어 사례 설명을 저장할 수 없습니다.') }
  }

  const payload = {
    site_name: siteName,
    canonical_site_name: input.canonicalSiteName?.trim() || null,
    industry: input.industry?.trim() || null,
    pain_point: input.painPoint?.trim() || null,
    solution_point: input.solutionPoint?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await (supabase as any)
    .from('showroom_case_profiles')
    .upsert(payload, { onConflict: 'site_name', ignoreDuplicates: false })

  return { error: error ?? null }
}
