import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>

type DispatchPayload = {
  job?: {
    id?: string
    type?: string
    status?: string
    requestedAt?: string
    reflectedAt?: string | null
  }
  content?: {
    id?: string
    siteName?: string
    businessType?: string
    region?: string
    revealLevel?: string
    priorityReason?: string
    blogTitle?: string
    seoDescription?: string
    ctaText?: string
    faqTopics?: string[]
    derivativeHook?: string
    tags?: string[]
  }
  distribution?: {
    id?: string
    channel?: string
    status?: string
    webhookStatus?: string
    publishUrl?: string | null
    updatedAt?: string
  } | null
  derivatives?: Array<JsonRecord>
  activityContext?: Array<JsonRecord>
  readiness?: Array<{
    label?: string
    passed?: boolean
    hint?: string
  }>
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "Content-Type": "application/json",
    },
  })
}

function toEnvKey(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function getStatusMode(value: string) {
  return value.trim().toLowerCase() === "live" ? "live" : "mock"
}

function getConfig(payload: DispatchPayload) {
  const channelKey = toEnvKey(getString(payload.distribution?.channel ?? payload.job?.type ?? "default"))
  const jobTypeKey = toEnvKey(getString(payload.job?.type))
  const keys = [
    `CONTENT_AUTOMATION_${channelKey}_WEBHOOK_URL`,
    `CONTENT_AUTOMATION_${jobTypeKey}_WEBHOOK_URL`,
    "CONTENT_AUTOMATION_DEFAULT_WEBHOOK_URL",
  ]
  const secretKeys = [
    `CONTENT_AUTOMATION_${channelKey}_WEBHOOK_SECRET`,
    `CONTENT_AUTOMATION_${jobTypeKey}_WEBHOOK_SECRET`,
    "CONTENT_AUTOMATION_DEFAULT_WEBHOOK_SECRET",
  ]
  const modeKeys = [
    `CONTENT_AUTOMATION_${channelKey}_MODE`,
    `CONTENT_AUTOMATION_${jobTypeKey}_MODE`,
    "CONTENT_AUTOMATION_DEFAULT_MODE",
  ]
  const labelKeys = [
    `CONTENT_AUTOMATION_${channelKey}_LABEL`,
    `CONTENT_AUTOMATION_${jobTypeKey}_LABEL`,
    "CONTENT_AUTOMATION_DEFAULT_LABEL",
  ]

  const url = keys.map((key) => Deno.env.get(key)?.trim() || "").find(Boolean) || ""
  const secret = secretKeys.map((key) => Deno.env.get(key)?.trim() || "").find(Boolean) || ""
  const mode = modeKeys.map((key) => Deno.env.get(key)?.trim() || "").find(Boolean) || "mock"
  const label = labelKeys.map((key) => Deno.env.get(key)?.trim() || "").find(Boolean) || channelKey || jobTypeKey || "DEFAULT"

  return {
    url,
    secret,
    mode: getStatusMode(mode),
    label,
  }
}

function extractObject(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonRecord
}

function pickString(record: JsonRecord | null, keys: string[]) {
  if (!record) return null
  for (const key of keys) {
    const value = getOptionalString(record[key])
    if (value) return value
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }

  if (req.method !== "POST") {
    return json({ accepted: false, error: "POST 요청만 지원합니다." }, 405)
  }

  let payload: DispatchPayload
  try {
    payload = await req.json()
  } catch {
    return json({ accepted: false, error: "JSON body를 해석할 수 없습니다." }, 400)
  }

  const jobId = getString(payload.job?.id)
  const contentItemId = getString(payload.content?.id)
  const channel = getString(payload.distribution?.channel)
  const jobType = getString(payload.job?.type)

  if (!jobId || !contentItemId || !channel || !jobType) {
    return json({ accepted: false, error: "job/content/distribution 필수 정보가 부족합니다." }, 400)
  }

  const config = getConfig(payload)
  if (!config.url && config.mode === "mock") {
    return json({
      accepted: true,
      status: "processing",
      mode: "mock",
      endpointLabel: `${config.label} inline mock`,
      webhookStatus: "mock 연결",
      publishUrl: null,
      completedAt: null,
      externalRequestId: `mock-${jobId}`,
      message: "외부 webhook URL 없이 mock 디스패치로 접수되었습니다.",
    })
  }

  if (!config.url) {
    return json({
      accepted: false,
      error: `채널 ${channel} 또는 작업유형 ${jobType} 에 대응하는 webhook URL이 설정되지 않았습니다.`,
    }, 400)
  }

  const requestBody = {
    source: "content-workspace",
    dispatchedAt: new Date().toISOString(),
    jobId,
    contentItemId,
    channel,
    jobType,
    payload,
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Content-Automation-Source": "content-workspace",
      "X-Content-Channel": channel,
      "X-Content-Job-Type": jobType,
      ...(config.secret ? { "X-Content-Automation-Secret": config.secret } : {}),
    },
    body: JSON.stringify(requestBody),
  })

  const rawText = await response.text()
  let parsed: JsonRecord | null = null
  try {
    parsed = rawText ? JSON.parse(rawText) as JsonRecord : null
  } catch {
    parsed = null
  }

  if (!response.ok) {
    return json({
      accepted: false,
      error: pickString(parsed, ["error", "message", "detail"]) || `외부 webhook 호출 실패 (${response.status})`,
      endpointLabel: config.label,
      mode: config.mode,
    }, response.status)
  }

  const returnedStatus = pickString(parsed, ["status", "jobStatus", "dispatchStatus"])
  const publishUrl = pickString(parsed, ["publishUrl", "publish_url", "url"])
  const externalRequestId = pickString(parsed, ["requestId", "request_id", "executionId", "execution_id", "id"])
  const completedAt = pickString(parsed, ["completedAt", "completed_at", "publishedAt", "published_at"])
  const status = returnedStatus === "completed" ? "completed" : "processing"

  return json({
    accepted: true,
    status,
    mode: config.mode,
    endpointLabel: config.label,
    webhookStatus: config.mode === "live" ? "실URL 연결" : "mock 연결",
    publishUrl,
    completedAt,
    externalRequestId,
    message: pickString(parsed, ["message", "detail"]) || `외부 webhook 요청이 ${config.label} 엔드포인트에 전달되었습니다.`,
  })
})
