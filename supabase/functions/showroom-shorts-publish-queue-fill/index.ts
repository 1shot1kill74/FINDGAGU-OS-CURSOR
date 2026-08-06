/**
 * showroom-shorts-publish-queue-fill
 *
 * 대기실(ad inbox) 숏츠 중 업로드 준비 끝·미예약 카드를
 * Asia/Seoul 11:00 슬롯에 격일(2일) 1장씩 줄 세워 예약한다.
 *
 * 인증:
 * - 크론: x-shorts-publish-cron-secret = SHOWROOM_SHORTS_PUBLISH_CRON_SECRET
 * - 관리자 UI: Authorization Bearer (로그인 사용자)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shorts-publish-cron-secret",
}

const SCHEDULABLE = new Set(["launch_ready", "approved"])
const SLOT_HOUR = 11
const SLOT_MINUTE = 0
/** 발행 간격(일). 1=매일, 2=격일 */
const SLOT_INTERVAL_DAYS = 2

type TargetRow = {
  id: string
  shorts_job_id: string
  channel: string
  publish_status: string
  scheduled_at: string | null
}

type JobRow = {
  id: string
  before_after_group_key: string | null
  final_video_url: string | null
  updated_at: string | null
  created_at: string | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function isAdInboxGroupKey(key: string | null | undefined): boolean {
  const k = (key ?? "").trim()
  if (!k) return false
  return k.includes("ad_site:") || k.includes("before-after:ad:")
}

function seoulYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function seoulHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  return { hour, minute }
}

/** YYYY-MM-DD → 그날 Asia/Seoul 11:00 ISO */
function elevenAmSeoulIso(ymd: string): string {
  return new Date(`${ymd}T11:00:00+09:00`).toISOString()
}

function addDaysYmd(ymd: string, days: number): string {
  const base = new Date(`${ymd}T12:00:00+09:00`)
  base.setUTCDate(base.getUTCDate() + days)
  return seoulYmd(base)
}

function isElevenAmSeoulSlot(iso: string | null | undefined): boolean {
  if (!iso?.trim()) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const { hour, minute } = seoulHourMinute(d)
  return hour === SLOT_HOUR && minute === SLOT_MINUTE
}

function firstOpenSlotYmd(occupied: Set<string>, now = new Date()): string {
  const today = seoulYmd(now)
  const todayEleven = new Date(`${today}T11:00:00+09:00`)
  const earliest = now.getTime() < todayEleven.getTime() ? today : addDaysYmd(today, 1)

  const occupiedSorted = [...occupied].filter(Boolean).sort()
  let cursor =
    occupiedSorted.length === 0
      ? earliest
      : addDaysYmd(occupiedSorted[occupiedSorted.length - 1], SLOT_INTERVAL_DAYS)

  while (cursor < earliest) {
    cursor = addDaysYmd(cursor, SLOT_INTERVAL_DAYS)
  }

  for (let i = 0; i < 400; i += 1) {
    if (!occupied.has(cursor) && cursor >= earliest) return cursor
    cursor = addDaysYmd(cursor, SLOT_INTERVAL_DAYS)
  }
  throw new Error("빈 11시 격일 슬롯을 찾지 못했습니다.")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const cronSecret = Deno.env.get("SHOWROOM_SHORTS_PUBLISH_CRON_SECRET")?.trim() || ""
    const headerSecret = req.headers.get("x-shorts-publish-cron-secret")?.trim() || ""
    const authHeader = req.headers.get("Authorization")?.trim() || ""

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || ""
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || ""
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || ""
    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, message: "Missing Supabase env" }, 500)
    }

    const cronOk = Boolean(cronSecret && headerSecret === cronSecret)
    let userOk = false
    if (!cronOk && authHeader.toLowerCase().startsWith("bearer ") && anonKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: userData, error: userError } = await userClient.auth.getUser()
      userOk = !userError && Boolean(userData.user)
    }
    if (!cronOk && !userOk) {
      return json({ ok: false, message: "Unauthorized" }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRole)

    const { data: jobRows, error: jobError } = await supabase
      .from("showroom_shorts_jobs")
      .select("id, before_after_group_key, final_video_url, updated_at, created_at")
      .not("final_video_url", "is", null)
      .order("updated_at", { ascending: true })
      .limit(500)

    if (jobError) return json({ ok: false, message: jobError.message }, 500)

    const adJobs = ((jobRows ?? []) as JobRow[]).filter(
      (j) => isAdInboxGroupKey(j.before_after_group_key) && Boolean(j.final_video_url?.trim()),
    )
    if (adJobs.length === 0) {
      return json({ ok: true, scheduledJobs: 0, message: "no ad-inbox jobs with final video" })
    }

    const jobIds = adJobs.map((j) => j.id)
    const { data: targetRows, error: targetError } = await supabase
      .from("showroom_shorts_targets")
      .select("id, shorts_job_id, channel, publish_status, scheduled_at")
      .in("shorts_job_id", jobIds)

    if (targetError) return json({ ok: false, message: targetError.message }, 500)

    const targetsByJob = new Map<string, TargetRow[]>()
    for (const row of (targetRows ?? []) as TargetRow[]) {
      const list = targetsByJob.get(row.shorts_job_id) ?? []
      list.push(row)
      targetsByJob.set(row.shorts_job_id, list)
    }

    const occupied = new Set<string>()
    for (const targets of targetsByJob.values()) {
      for (const t of targets) {
        if (t.publish_status !== "scheduled") continue
        if (!isElevenAmSeoulSlot(t.scheduled_at)) continue
        occupied.add(seoulYmd(new Date(t.scheduled_at as string)))
      }
    }

    // 이미 예약된(다른 시각 포함) job은 줄에서 제외 — 카드당 1슬롯
    const eligible: Array<{ job: JobRow; targetIds: string[] }> = []
    for (const job of adJobs) {
      const targets = targetsByJob.get(job.id) ?? []
      if (targets.some((t) => t.publish_status === "scheduled")) continue
      if (targets.some((t) => ["preparing", "publishing"].includes(t.publish_status))) continue
      const schedulable = targets.filter((t) => SCHEDULABLE.has(t.publish_status))
      if (schedulable.length === 0) continue
      eligible.push({ job, targetIds: schedulable.map((t) => t.id) })
    }

    if (eligible.length === 0) {
      return json({
        ok: true,
        scheduledJobs: 0,
        occupiedSlots: [...occupied].sort(),
        message: "no unscheduled launch-ready ad-inbox cards",
      })
    }

    const nowIso = new Date().toISOString()
    const results: Array<{
      jobId: string
      groupKey: string | null
      scheduledAt: string
      slotYmd: string
      targetCount: number
    }> = []

    for (const item of eligible) {
      const slotYmd = firstOpenSlotYmd(occupied)
      const scheduledAt = elevenAmSeoulIso(slotYmd)
      const { data: updated, error: updateError } = await supabase
        .from("showroom_shorts_targets")
        .update({
          publish_status: "scheduled",
          scheduled_at: scheduledAt,
          updated_at: nowIso,
        })
        .in("id", item.targetIds)
        .in("publish_status", ["launch_ready", "approved"])
        .select("id")

      if (updateError) {
        return json({
          ok: false,
          message: updateError.message,
          scheduledJobs: results.length,
          results,
        }, 500)
      }

      const count = (updated ?? []).length
      if (count === 0) continue

      occupied.add(slotYmd)
      results.push({
        jobId: item.job.id,
        groupKey: item.job.before_after_group_key,
        scheduledAt,
        slotYmd,
        targetCount: count,
      })
    }

    return json({
      ok: true,
      scheduledJobs: results.length,
      results,
      occupiedSlots: [...occupied].sort(),
    })
  } catch (error) {
    return json(
      { ok: false, message: error instanceof Error ? error.message : "queue fill failed" },
      500,
    )
  }
})
