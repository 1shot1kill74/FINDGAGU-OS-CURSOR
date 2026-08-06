/**
 * showroom-shorts-publish-watchdog
 *
 * publishing / preparing 상태가 STALE_MINUTES 이상 유지되면
 * failed 로 전환하고 Slack 알람을 보낸다.
 *
 * 인증: x-shorts-publish-cron-secret = SHOWROOM_SHORTS_PUBLISH_CRON_SECRET
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { sendShowroomShortsSlackAlert } from "../_shared/showroomShortsSlackAlert.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shorts-publish-cron-secret",
}

const STALE_MINUTES = 20
const BATCH_LIMIT = 30
const STALE_ERROR = "stale_publishing_timeout: stuck in publishing/preparing > 20m"

type TargetRow = {
  id: string
  shorts_job_id: string
  channel: string
  title: string | null
  publish_status: string
  preparation_payload: Record<string, unknown> | null
  updated_at: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const cronSecret = Deno.env.get("SHOWROOM_SHORTS_PUBLISH_CRON_SECRET")?.trim() || ""
    const headerSecret = req.headers.get("x-shorts-publish-cron-secret")?.trim() || ""
    if (!cronSecret || headerSecret !== cronSecret) {
      return json({ ok: false, message: "Unauthorized cron secret" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || ""
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || ""
    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, message: "Missing Supabase env" }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRole)
    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString()
    const nowIso = new Date().toISOString()

    const { data: rows, error: queryError } = await supabase
      .from("showroom_shorts_targets")
      .select("id, shorts_job_id, channel, title, publish_status, preparation_payload, updated_at")
      .in("publish_status", ["publishing", "preparing"])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(BATCH_LIMIT)

    if (queryError) {
      return json({ ok: false, message: queryError.message }, 500)
    }

    const stale = (rows ?? []) as TargetRow[]
    if (stale.length === 0) {
      return json({ ok: true, scanned: 0, markedFailed: 0, alerted: 0 })
    }

    let markedFailed = 0
    let alerted = 0
    const details: Array<{ targetId: string; channel: string; alerted: boolean }> = []

    for (const row of stale) {
      const prep = getRecord(row.preparation_payload)
      const alreadyAlerted = typeof prep.staleAlertedAt === "string" && prep.staleAlertedAt.trim()

      const nextPayload = {
        ...prep,
        staleAlertedAt: alreadyAlerted || nowIso,
        staleReason: STALE_ERROR,
        staleFromStatus: row.publish_status,
      }

      const { error: updateError } = await supabase
        .from("showroom_shorts_targets")
        .update({
          publish_status: "failed",
          preparation_error: STALE_ERROR,
          preparation_payload: nextPayload,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .in("publish_status", ["publishing", "preparing"])

      if (updateError) {
        details.push({ targetId: row.id, channel: row.channel, alerted: false })
        continue
      }

      markedFailed += 1

      await supabase.from("showroom_shorts_logs").insert({
        shorts_job_id: row.shorts_job_id,
        target_id: row.id,
        stage: "publish_stale_alerted",
        message: STALE_ERROR,
        payload: {
          channel: row.channel,
          previousStatus: row.publish_status,
          updatedAt: row.updated_at,
          staleMinutes: STALE_MINUTES,
        },
      })

      let didAlert = false
      if (!alreadyAlerted) {
        const alertResult = await sendShowroomShortsSlackAlert({
          reason: "stale_timeout",
          channel: row.channel,
          title: row.title,
          targetId: row.id,
          jobId: row.shorts_job_id,
          publishStatus: "failed",
          errorSummary: STALE_ERROR,
          sourceType: "shorts",
        })
        if (alertResult.ok && !alertResult.skipped) {
          alerted += 1
          didAlert = true
        }
      }

      details.push({ targetId: row.id, channel: row.channel, alerted: didAlert })
    }

    return json({
      ok: true,
      scanned: stale.length,
      markedFailed,
      alerted,
      staleMinutes: STALE_MINUTES,
      details,
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "watchdog failed",
    }, 500)
  }
})
