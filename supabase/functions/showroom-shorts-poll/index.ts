import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function getEnv(name: string, required = true) {
  const value = Deno.env.get(name)?.trim() || ""
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlEncodeJson(input: unknown) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(input)))
}

async function createKlingJwt(accessKey: string, secretKey: string) {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, iat: now, exp: now + 1800 }
  const headerPart = base64UrlEncodeJson(header)
  const payloadPart = base64UrlEncodeJson(payload)
  const message = `${headerPart}.${payloadPart}`
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message))
  return `${message}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeKlingStatus(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return "submitted"
  return normalized
}

function mapJobStatus(klingStatus: string) {
  if (["failed", "error", "canceled", "cancelled"].includes(klingStatus)) return "failed"
  if (["succeed", "success", "completed", "done", "finished"].includes(klingStatus)) return "generated"
  return "generating"
}

function extractStatus(payload: JsonRecord | null): string {
  if (!payload) return "submitted"
  const direct = getString(payload.status) || getString(payload.task_status) || getString(payload.taskStatus)
  if (direct) return normalizeKlingStatus(direct)
  const data = getRecord(payload.data)
  return data ? extractStatus(data) : "submitted"
}

function extractVideoUrl(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const direct =
    getOptionalString(payload.video_url) ||
    getOptionalString(payload.videoUrl) ||
    getOptionalString(payload.url)
  if (direct) return direct

  const data = getRecord(payload.data)
  const dataUrl =
    getOptionalString(data?.video_url) ||
    getOptionalString(data?.videoUrl) ||
    getOptionalString(data?.url)
  if (dataUrl) return dataUrl

  const result = getRecord(data?.result ?? payload.result)
  const resultUrl =
    getOptionalString(result?.video_url) ||
    getOptionalString(result?.videoUrl) ||
    getOptionalString(result?.url)
  if (resultUrl) return resultUrl

  const works = Array.isArray(data?.works) ? data?.works : Array.isArray(payload.works) ? payload.works : []
  for (const work of works) {
    const record = getRecord(work)
    const resource = getRecord(record?.resource)
    const candidate =
      getOptionalString(resource?.resource) ||
      getOptionalString(resource?.url) ||
      getOptionalString(record?.url)
    if (candidate) return candidate
  }
  return null
}

async function insertLog(
  supabase: ReturnType<typeof createClient>,
  input: { jobId: string; stage: string; message: string; payload?: JsonRecord },
) {
  await supabase.from("showroom_shorts_logs").insert({
    shorts_job_id: input.jobId,
    stage: input.stage,
    message: input.message,
    payload: input.payload ?? {},
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, message: "POST 요청만 지원합니다." }, 405)

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const klingAccessKey = getEnv("KLING_ACCESS_KEY")
    const klingSecretKey = getEnv("KLING_SECRET_KEY")
    const klingApiBaseUrl = getEnv("KLING_API_BASE_URL", false) || "https://api-beijing.klingai.com"

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => null) as { jobId?: string } | null
    const jobId = getString(body?.jobId)
    if (!jobId) return json({ ok: false, message: "jobId가 필요합니다." }, 400)

    const { data: job, error: jobError } = await supabase
      .from("showroom_shorts_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      return json({ ok: false, message: jobError?.message ?? "숏츠 작업을 찾지 못했습니다." }, 404)
    }

    const klingTaskId = getString(job.kling_job_id)
    if (!klingTaskId) {
      return json({ ok: false, message: "아직 Kling task id가 없습니다. 먼저 생성 요청을 실행하세요." }, 400)
    }

    const token = await createKlingJwt(klingAccessKey, klingSecretKey)
    const response = await fetch(`${klingApiBaseUrl.replace(/\/+$/, "")}/v1/videos/multi-image2video/${klingTaskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    const rawText = await response.text()
    let parsed: JsonRecord | null = null
    try {
      parsed = rawText ? JSON.parse(rawText) as JsonRecord : null
    } catch {
      parsed = null
    }

    if (!response.ok) {
      await insertLog(supabase, {
        jobId,
        stage: "kling_poll_failed",
        message: `Kling 상태 조회 실패 (${response.status})`,
        payload: parsed ?? { rawText },
      })
      return json({
        ok: false,
        message: getString(parsed?.message) || getString(parsed?.error) || `Kling 상태 조회 실패 (${response.status})`,
      }, response.status)
    }

    const klingStatus = extractStatus(parsed)
    const sourceVideoUrl = extractVideoUrl(parsed)
    const nextStatus = mapJobStatus(klingStatus)
    const nowIso = new Date().toISOString()

    await supabase
      .from("showroom_shorts_jobs")
      .update({
        status: nextStatus,
        kling_status: klingStatus,
        source_video_url: sourceVideoUrl,
        updated_at: nowIso,
      })
      .eq("id", jobId)

    await insertLog(supabase, {
      jobId,
      stage: "kling_polled",
      message: `Kling 상태 조회 완료: ${klingStatus}`,
      payload: parsed ?? { rawText },
    })

    return json({
      ok: true,
      jobId,
      status: nextStatus,
      klingStatus,
      sourceVideoUrl,
      finalVideoUrl: getOptionalString(job.final_video_url),
      message:
        nextStatus === "generated"
          ? "Kling 원본 생성이 완료되었습니다. 다음 단계는 9:16 템플릿 합성입니다."
          : nextStatus === "failed"
            ? "Kling 작업이 실패했습니다."
            : "Kling 작업이 아직 진행 중입니다.",
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "showroom-shorts-poll 실행 중 오류가 발생했습니다.",
    }, 500)
  }
})
