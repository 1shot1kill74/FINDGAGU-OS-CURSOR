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
  if (!value && required) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  }
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
  const payload = {
    iss: accessKey,
    iat: now,
    exp: now + 1800,
  }
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
  const signaturePart = base64UrlEncodeBytes(new Uint8Array(signature))
  return `${message}.${signaturePart}`
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function extractTaskId(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const direct = getString(payload.task_id) || getString(payload.taskId) || getString(payload.id)
  if (direct) return direct
  const data = getRecord(payload.data)
  return data ? extractTaskId(data) : null
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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return json({ ok: false, message: "POST 요청만 지원합니다." }, 405)
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const klingAccessKey = getEnv("KLING_ACCESS_KEY")
    const klingSecretKey = getEnv("KLING_SECRET_KEY")
    const klingApiBaseUrl = getEnv("KLING_API_BASE_URL", false) || "https://api-beijing.klingai.com"
    const klingModelName = getEnv("KLING_MODEL_NAME", false) || "kling-v1-6"
    const callbackUrl = getEnv("SHOWROOM_SHORTS_CALLBACK_URL", false)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => null) as { jobId?: string } | null
    const jobId = getString(body?.jobId)
    if (!jobId) {
      return json({ ok: false, message: "jobId가 필요합니다." }, 400)
    }

    const { data: job, error: jobError } = await supabase
      .from("showroom_shorts_jobs")
      .select("*")
      .eq("id", jobId)
      .single()

    if (jobError || !job) {
      return json({ ok: false, message: jobError?.message ?? "숏츠 작업을 찾지 못했습니다." }, 404)
    }

    const beforeUrl = getString(job.before_asset_url)
    const afterUrl = getString(job.after_asset_url)
    if (!beforeUrl || !afterUrl) {
      return json({ ok: false, message: "Before/After 이미지 URL이 없습니다." }, 400)
    }

    const token = await createKlingJwt(klingAccessKey, klingSecretKey)
    const requestBody: JsonRecord = {
      model_name: klingModelName,
      image_list: [
        { image: beforeUrl },
        { image: afterUrl },
      ],
      prompt: getString(job.prompt_text),
      mode: "pro",
      duration: String(job.duration_seconds ?? 10),
      aspect_ratio: getString(job.source_aspect_ratio) || "16:9",
      external_task_id: jobId,
      watermark_info: { enabled: true },
    }

    if (callbackUrl) {
      requestBody.callback_url = callbackUrl
    }

    const response = await fetch(`${klingApiBaseUrl.replace(/\/+$/, "")}/v1/videos/multi-image2video`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
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
      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status: "failed",
          kling_status: "request_failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)
      await insertLog(supabase, {
        jobId,
        stage: "kling_request_failed",
        message: `Kling 요청 실패 (${response.status})`,
        payload: parsed ?? { rawText },
      })
      return json({
        ok: false,
        message: getString(parsed?.message) || getString(parsed?.error) || `Kling 요청 실패 (${response.status})`,
      }, response.status)
    }

    const taskId = extractTaskId(parsed)
    await supabase
      .from("showroom_shorts_jobs")
      .update({
        status: "generating",
        kling_status: "submitted",
        kling_job_id: taskId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    await insertLog(supabase, {
      jobId,
      stage: "kling_requested",
      message: "Kling multi-image2video 작업을 요청했습니다.",
      payload: parsed ?? { rawText },
    })

    return json({
      ok: true,
      jobId,
      status: "generating",
      klingTaskId: taskId,
      message: "Kling 원본 생성 요청을 전달했습니다.",
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "showroom-shorts-create 실행 중 오류가 발생했습니다.",
    }, 500)
  }
})
