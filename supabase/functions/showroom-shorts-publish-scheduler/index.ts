/**
 * showroom-shorts-publish-scheduler
 * pg_cron이 1분마다 호출. scheduled_at이 지난 타깃을 기존 launch dispatch로 넘긴다.
 *
 * 시크릿: SHOWROOM_SHORTS_PUBLISH_CRON_SECRET
 * 헤더: x-shorts-publish-cron-secret
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shorts-publish-cron-secret",
}

const DUE_LIMIT = 20

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
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
    const nowIso = new Date().toISOString()

    const { data: dueRows, error: dueError } = await supabase
      .from("showroom_shorts_targets")
      .select("id, channel, scheduled_at")
      .eq("publish_status", "scheduled")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(DUE_LIMIT)

    if (dueError) {
      return json({ ok: false, message: dueError.message }, 500)
    }

    const due = dueRows ?? []
    if (due.length === 0) {
      return json({ ok: true, launched: 0, failed: 0, message: "no due targets" })
    }

    const results: Array<{ targetId: string; ok: boolean; message?: string }> = []

    for (const row of due) {
      const targetId = String(row.id)
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/showroom-shorts-publish-dispatch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRole}`,
            apikey: serviceRole,
          },
          body: JSON.stringify({ targetId, action: "launch", sourceType: "shorts" }),
        })
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          message?: string
        }
        results.push({
          targetId,
          ok: Boolean(body.ok) && res.ok,
          message: typeof body.message === "string" ? body.message : undefined,
        })
      } catch (error) {
        results.push({
          targetId,
          ok: false,
          message: error instanceof Error ? error.message : "launch invoke failed",
        })
      }
    }

    const launched = results.filter((r) => r.ok).length
    const failed = results.length - launched

    return json({
      ok: failed === 0,
      launched,
      failed,
      results,
    })
  } catch (error) {
    return json(
      { ok: false, message: error instanceof Error ? error.message : "scheduler failed" },
      500,
    )
  }
})
