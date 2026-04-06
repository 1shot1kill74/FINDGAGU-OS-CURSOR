import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-content-automation-secret",
}

type CallbackBody = {
  jobId?: string
  status?: string
  publishUrl?: string | null
  publish_url?: string | null
  errorMessage?: string | null
  error_message?: string | null
  completedAt?: string | null
  completed_at?: string | null
  channel?: string
  contentItemId?: string
  content_item_id?: string
  payload?: Record<string, unknown>
}

type JsonRecord = Record<string, unknown>

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
    },
  })
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeJobStatus(value: string) {
  if (value === "completed" || value === "failed" || value === "processing") return value
  return "processing"
}

function deriveDistributionStatus(status: string, publishUrl: string | null) {
  if (status === "failed") return "error"
  if (status === "completed") return publishUrl ? "published" : "scheduled"
  return "review_pending"
}

function mapChannelValue(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes("google")) return "google_blog"
  if (normalized.includes("naver")) return "naver_blog"
  if (normalized.includes("youtube shorts")) return "youtube_shorts"
  if (normalized.includes("youtube long")) return "youtube_long"
  if (normalized.includes("instagram")) return "instagram"
  if (normalized.includes("facebook")) return "facebook"
  if (normalized.includes("tiktok")) return "tiktok"
  return normalized.replace(/\s+/g, "_")
}

function createActivityLogId(contentItemId: string, actionType: string, createdAt: string) {
  return `log-${contentItemId}-${actionType}-${createdAt.replace(/[^0-9]/g, "")}`
}

function mapDerivativeStatus(jobStatus: string) {
  if (jobStatus === "completed") return "in_review"
  if (jobStatus === "failed") return "draft_ready"
  return "draft_ready"
}

function buildSlidesText(value: unknown) {
  const slides = getArray(value)
    .map((entry) => getRecord(entry))
    .filter(Boolean)
    .map((slide) => {
      const slideNo = Number(slide?.slide ?? 0)
      const role = getString(slide?.role)
      const text = getString(slide?.text)
      if (!text) return null
      const prefix = [slideNo ? `${slideNo}` : "", role ? `[${role}]` : ""].filter(Boolean).join(" ")
      return prefix ? `${prefix} ${text}` : text
    })
    .filter(Boolean)

  return slides.join("\n")
}

function extractCardNewsDerivativePayload(
  callbackPayload: Record<string, unknown> | null,
  channelKey: "instagram" | "facebook"
) {
  const cardNews = getRecord(callbackPayload?.cardNews)
  const variant = getRecord(cardNews?.[channelKey])
  const slides = getArray(variant?.slides)
  if (!variant || slides.length === 0) return null

  const caption = getString(variant.caption)
  const body = buildSlidesText(slides)
  const firstSlide = getRecord(slides[0])
  const lastSlide = getRecord(slides[slides.length - 1])

  return {
    slides,
    caption,
    body,
    hookText: getString(firstSlide?.text),
    ctaText: getString(lastSlide?.text),
  }
}

async function upsertCardNewsDerivative(
  supabase: ReturnType<typeof createClient>,
  input: {
    contentItemId: string
    channel: "instagram" | "facebook"
    siteName: string
    callbackPayload: Record<string, unknown> | null
    updatedAt: string
    jobStatus: string
  }
) {
  const derivative = extractCardNewsDerivativePayload(input.callbackPayload, input.channel)
  if (!derivative) return false

  const channelValue = input.channel
  const channelLabel = input.channel === "instagram" ? "Instagram" : "Facebook CardNews"

  const { data: existingRows, error: existingError } = await supabase
    .from("content_derivatives")
    .select("id, payload")
    .eq("content_item_id", input.contentItemId)
    .eq("derivative_type", "card_news")
    .order("updated_at", { ascending: false })
    .limit(10)

  if (existingError) throw new Error(existingError.message)

  const existingId = (existingRows ?? []).find((row) => {
    const payload = getRecord(row.payload)
    return getString(payload?.channel) === channelValue
  })?.id

  const payload = {
    channel: channelValue,
    title: `${input.siteName} ${channelLabel} 카드뉴스 초안`,
    body: derivative.body,
    hookText: derivative.hookText,
    outline: derivative.caption || derivative.ctaText,
    slides: derivative.slides,
    caption: derivative.caption,
    ctaText: derivative.ctaText,
    originalType: "card_news",
  }

  const query = existingId
    ? supabase
      .from("content_derivatives")
      .update({
        status: mapDerivativeStatus(input.jobStatus),
        payload,
        version_no: 1,
        updated_at: input.updatedAt,
      })
      .eq("id", existingId)
    : supabase
      .from("content_derivatives")
      .insert({
        content_item_id: input.contentItemId,
        derivative_type: "card_news",
        status: mapDerivativeStatus(input.jobStatus),
        payload,
        version_no: 1,
        updated_at: input.updatedAt,
      })

  const { error } = await query
  if (error) throw new Error(error.message)
  return true
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "POST 요청만 지원합니다." }, 405)
  }

  const callbackSecret = Deno.env.get("CONTENT_AUTOMATION_CALLBACK_SECRET")?.trim() || ""
  const requestSecret = req.headers.get("x-content-automation-secret")?.trim() || ""
  if (callbackSecret && requestSecret !== callbackSecret) {
    return json({ ok: false, error: "callback secret 불일치" }, 401)
  }

  let body: CallbackBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "JSON body를 해석할 수 없습니다." }, 400)
  }

  const jobId = getString(body.jobId)
  const nextJobStatus = normalizeJobStatus(getString(body.status))
  const publishUrl = getOptionalString(body.publishUrl) ?? getOptionalString(body.publish_url)
  const errorMessage = getOptionalString(body.errorMessage) ?? getOptionalString(body.error_message)
  const completedAt = getOptionalString(body.completedAt) ?? getOptionalString(body.completed_at)
  const explicitContentItemId = getOptionalString(body.contentItemId) ?? getOptionalString(body.content_item_id)
  const explicitChannel = getOptionalString(body.channel)

  if (!jobId) {
    return json({ ok: false, error: "jobId가 필요합니다." }, 400)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다." }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const now = new Date().toISOString()

  const { data: jobRow, error: jobError } = await supabase
    .from("content_automation_jobs")
    .select("id, content_item_id, distribution_id, channel, status, payload")
    .eq("id", jobId)
    .maybeSingle()

  if (jobError) {
    return json({ ok: false, error: jobError.message }, 500)
  }

  if (!jobRow) {
    return json({ ok: false, error: "대상 자동화 작업을 찾을 수 없습니다." }, 404)
  }

  const contentItemId = explicitContentItemId || getString(jobRow.content_item_id)
  const distributionId = getString(jobRow.distribution_id)
  const channel = explicitChannel || getString(jobRow.channel)
  const normalizedChannel = mapChannelValue(channel)
  const nextDistributionStatus = deriveDistributionStatus(nextJobStatus, publishUrl)
  const originalJobPayload = getRecord(jobRow.payload)
  const callbackPayload = getRecord(body.payload)
  const siteName =
    getString(getRecord(originalJobPayload?.content)?.siteName)
    || contentItemId

  const nextPayload = {
    ...(typeof jobRow.payload === "object" && jobRow.payload ? jobRow.payload as Record<string, unknown> : {}),
    callback: {
      receivedAt: now,
      status: nextJobStatus,
      publishUrl,
      errorMessage,
      payload: body.payload ?? null,
    },
  }

  const { error: updateJobError } = await supabase
    .from("content_automation_jobs")
    .update({
      status: nextJobStatus,
      error_message: nextJobStatus === "failed" ? errorMessage || "외부 자동화 실패" : null,
      completed_at: nextJobStatus === "completed" ? completedAt || now : null,
      updated_at: now,
      payload: nextPayload,
    })
    .eq("id", jobId)

  if (updateJobError) {
    return json({ ok: false, error: updateJobError.message }, 500)
  }

  const distributionPatch = {
    status: nextDistributionStatus,
    publish_url: publishUrl,
    published_at: nextDistributionStatus === "published" ? completedAt || now : null,
    last_checked_at: completedAt || now,
    error_message: nextJobStatus === "failed" ? errorMessage || "외부 자동화 실패" : null,
    updated_at: now,
  }

  let updateDistributionError: { message: string } | null = null
  let distributionUpdated = false

  if (distributionId) {
    const { data, error } = await supabase
      .from("content_distributions")
      .update(distributionPatch)
      .eq("id", distributionId)
      .select("id")
    updateDistributionError = error
    distributionUpdated = Array.isArray(data) && data.length > 0
  }

  if (!distributionUpdated && contentItemId && normalizedChannel) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("content_distributions")
      .update(distributionPatch)
      .eq("content_item_id", contentItemId)
      .eq("channel", normalizedChannel)
      .select("id")
    updateDistributionError = fallbackError
    distributionUpdated = Array.isArray(fallbackData) && fallbackData.length > 0
  }

  if (updateDistributionError) {
    return json({ ok: false, error: updateDistributionError.message }, 500)
  }

  let derivativesUpdated = 0
  if (contentItemId && callbackPayload) {
    if (await upsertCardNewsDerivative(supabase, {
      contentItemId,
      channel: "instagram",
      siteName,
      callbackPayload,
      updatedAt: now,
      jobStatus: nextJobStatus,
    })) {
      derivativesUpdated += 1
    }

    if (await upsertCardNewsDerivative(supabase, {
      contentItemId,
      channel: "facebook",
      siteName,
      callbackPayload,
      updatedAt: now,
      jobStatus: nextJobStatus,
    })) {
      derivativesUpdated += 1
    }
  }

  if (contentItemId) {
    const actionType = nextJobStatus === "failed" ? "automation_callback_failed" : "automation_callback_completed"
    const message =
      nextJobStatus === "failed"
        ? `${channel || "미지정 채널"} 외부 callback 실패가 반영되었습니다.`
        : `${channel || "미지정 채널"} 외부 callback 결과가 반영되었습니다.${derivativesUpdated > 0 ? ` 카드뉴스 초안 ${derivativesUpdated}건도 저장했습니다.` : ""}`

    await supabase
      .from("content_activity_logs")
      .upsert({
        id: createActivityLogId(contentItemId, actionType, now),
        content_item_id: contentItemId,
        action_type: actionType,
        from_status: getString(jobRow.status) || null,
        to_status: nextJobStatus,
        channel,
        message,
        payload: {
          jobId,
          distributionId,
          publishUrl,
          errorMessage,
          callbackPayload: body.payload ?? null,
        },
        created_at: now,
      })
  }

  return json({
    ok: true,
    jobId,
    status: nextJobStatus,
    distributionStatus: nextDistributionStatus,
    publishUrl,
    derivativesUpdated,
    updatedAt: now,
  })
})
