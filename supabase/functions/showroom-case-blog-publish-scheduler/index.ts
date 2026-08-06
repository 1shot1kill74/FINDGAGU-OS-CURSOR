/**
 * showroom-case-blog-publish-scheduler
 * pg_cron이 1분마다 호출. scheduled_at이 지난 사례 블로그를 approved로 전환한다.
 *
 * 시크릿: SHOWROOM_CASE_BLOG_PUBLISH_CRON_SECRET
 * 헤더: x-case-blog-publish-cron-secret
 * 선택: VERCEL_DEPLOY_HOOK_URL (또는 VITE_VERCEL_DEPLOY_HOOK_URL) — 승인 후 prerender용
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-case-blog-publish-cron-secret",
}

const DUE_LIMIT = 20
const CANONICAL_KEY = "canonical_blog_post"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function readNestedRecord(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null
  const root = metadata as Record<string, unknown>
  const raw = root[CANONICAL_KEY]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  return raw as Record<string, unknown>
}

function readStatus(blog: Record<string, unknown>) {
  const status = typeof blog.status === "string" ? blog.status.trim() : ""
  return status
}

function readScheduledAt(blog: Record<string, unknown>) {
  const value =
    (typeof blog.scheduledAt === "string" && blog.scheduledAt.trim()) ||
    (typeof blog.scheduled_at === "string" && blog.scheduled_at.trim()) ||
    ""
  return value || null
}

async function triggerDeployHook(reason: string) {
  const hookUrl =
    Deno.env.get("VERCEL_DEPLOY_HOOK_URL")?.trim() ||
    Deno.env.get("VITE_VERCEL_DEPLOY_HOOK_URL")?.trim() ||
    ""
  if (!hookUrl) {
    console.log(`[case-blog-scheduler] deploy hook skipped (${reason})`)
    return
  }
  try {
    await fetch(hookUrl, { method: "POST" })
    console.log(`[case-blog-scheduler] deploy hook triggered (${reason})`)
  } catch (error) {
    console.warn("[case-blog-scheduler] deploy hook failed", error)
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })

  try {
    const cronSecret = Deno.env.get("SHOWROOM_CASE_BLOG_PUBLISH_CRON_SECRET")?.trim() || ""
    const headerSecret = req.headers.get("x-case-blog-publish-cron-secret")?.trim() || ""
    if (!cronSecret || headerSecret !== cronSecret) {
      return json({ ok: false, message: "Unauthorized cron secret" }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || ""
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || ""
    if (!supabaseUrl || !serviceRole) {
      return json({ ok: false, message: "Missing Supabase env" }, 500)
    }

    const supabase = createClient(supabaseUrl, serviceRole)
    const nowMs = Date.now()
    const nowIso = new Date(nowMs).toISOString()

    const { data: rows, error: listError } = await supabase
      .from("showroom_case_profiles")
      .select("site_name, metadata")
      .filter("metadata->canonical_blog_post->>status", "eq", "scheduled")
      .limit(200)

    if (listError) {
      return json({ ok: false, message: listError.message }, 500)
    }

    const due = (rows ?? [])
      .map((row) => {
        const siteName = String(row.site_name ?? "").trim()
        const metadata =
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? { ...(row.metadata as Record<string, unknown>) }
            : {}
        const blog = readNestedRecord(metadata)
        if (!siteName || !blog) return null
        if (readStatus(blog) !== "scheduled") return null
        const scheduledAt = readScheduledAt(blog)
        if (!scheduledAt) return null
        const when = new Date(scheduledAt).getTime()
        if (Number.isNaN(when) || when > nowMs) return null
        return { siteName, metadata, blog, scheduledAt }
      })
      .filter(Boolean)
      .sort((a, b) => String(a!.scheduledAt).localeCompare(String(b!.scheduledAt)))
      .slice(0, DUE_LIMIT) as Array<{
      siteName: string
      metadata: Record<string, unknown>
      blog: Record<string, unknown>
      scheduledAt: string
    }>

    if (due.length === 0) {
      return json({ ok: true, published: 0, failed: 0, message: "no due blogs" })
    }

    const results: Array<{ siteName: string; ok: boolean; message?: string }> = []

    for (const item of due) {
      try {
        const nextBlog = {
          ...item.blog,
          status: "approved",
          scheduled_at: null,
          scheduledAt: null,
          approved_at: nowIso,
          approvedAt: nowIso,
          approved_by: "showroom-case-blog-publish-scheduler",
          approvedBy: "showroom-case-blog-publish-scheduler",
          updated_at: nowIso,
          updatedAt: nowIso,
        }
        const nextMeta = {
          ...item.metadata,
          [CANONICAL_KEY]: nextBlog,
        }

        // 오픈쇼룸 공개 표시명을 canonical_site_name에 연결 (공개 URL ↔ 승인 블로그 매칭)
        let publicDisplayName: string | null = null
        const { data: assetRows } = await supabase
          .from("image_assets")
          .select("metadata")
          .eq("site_name", item.siteName)
          .eq("is_consultation", true)
          .order("created_at", { ascending: false })
          .limit(12)
        for (const row of assetRows ?? []) {
          const meta =
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata as Record<string, unknown>)
              : {}
          const candidate =
            (typeof meta.public_display_name === "string" && meta.public_display_name.trim()) ||
            (typeof meta.external_display_name === "string" && meta.external_display_name.trim()) ||
            (typeof meta.broad_external_display_name === "string" && meta.broad_external_display_name.trim()) ||
            ""
          if (candidate && candidate !== item.siteName) {
            publicDisplayName = candidate
            break
          }
        }

        const upsertRow: Record<string, unknown> = {
          site_name: item.siteName,
          metadata: nextMeta,
          updated_at: nowIso,
        }
        if (publicDisplayName) upsertRow.canonical_site_name = publicDisplayName

        const { error: upsertError } = await supabase.from("showroom_case_profiles").upsert(
          upsertRow,
          { onConflict: "site_name", ignoreDuplicates: false },
        )
        if (upsertError) {
          results.push({ siteName: item.siteName, ok: false, message: upsertError.message })
          continue
        }
        results.push({ siteName: item.siteName, ok: true })
      } catch (error) {
        results.push({
          siteName: item.siteName,
          ok: false,
          message: error instanceof Error ? error.message : "publish failed",
        })
      }
    }

    const published = results.filter((r) => r.ok).length
    const failed = results.length - published
    if (published > 0) {
      await triggerDeployHook(`case-blog-scheduled-publish:${published}`)
    }

    return json({
      ok: failed === 0,
      published,
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
