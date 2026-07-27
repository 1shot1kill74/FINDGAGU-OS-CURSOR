import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  KLING_SPLIT_SEGMENT_SECONDS,
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_DEMOLISH_PROMPT,
  SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_INSTALL_PROMPT,
} from "../_shared/klingSplitPrompts.ts"
import { encodeSplitState, parseSplitState } from "../_shared/klingSplitState.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>
const DEFAULT_KLING_API_BASE_URL = "https://api.klingai.com"
const FALLBACK_KLING_API_BASE_URL = "https://api-beijing.klingai.com"
type KlingApiMode = "legacy-multi-image" | "image-to-video-v3" | "omni"

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
    nbf: now - 5,
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

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeKlingModelName(value: string) {
  return value.trim().toLowerCase()
}

function resolveKlingApiMode(modelName: string): KlingApiMode {
  const normalized = normalizeKlingModelName(modelName)
  if (normalized.includes("omni")) return "omni"
  if (normalized.includes("v3")) return "image-to-video-v3"
  return "legacy-multi-image"
}

function getKlingCreatePath(mode: KlingApiMode) {
  if (mode === "omni") return "/v1/videos/omni"
  if (mode === "image-to-video-v3") return "/v1/videos/image2video"
  return "/v1/videos/multi-image2video"
}

function buildKlingRequestBody(input: {
  mode: KlingApiMode
  modelName: string
  beforeUrl: string
  afterUrl: string | null
  promptText: string
  negativePrompt: string
  durationSeconds: number
  aspectRatio: string
  externalTaskId: string
  callbackUrl: string | null
}) {
  const common = {
    model_name: input.modelName,
    aspect_ratio: input.aspectRatio,
    external_task_id: input.externalTaskId,
  }
  const negativePrompt = input.negativePrompt.trim() || SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT

  if (input.mode === "omni") {
    const imageUrls = input.afterUrl ? [input.beforeUrl, input.afterUrl] : [input.beforeUrl]
    const requestBody: JsonRecord = {
      ...common,
      prompt: input.promptText,
      negative_prompt: negativePrompt,
      image_urls: imageUrls,
      duration: input.durationSeconds,
      generate_audio: false,
    }
    if (input.callbackUrl) {
      requestBody.callback_url = input.callbackUrl
      requestBody.webhook_url = input.callbackUrl
    }
    return requestBody
  }

  if (input.mode === "image-to-video-v3") {
    const requestBody: JsonRecord = {
      ...common,
      image: input.beforeUrl,
      prompt: input.promptText,
      negative_prompt: negativePrompt,
      mode: "pro",
      duration: String(input.durationSeconds),
      sound: "off",
    }
    if (input.afterUrl) {
      requestBody.image_tail = input.afterUrl
    }
    if (input.callbackUrl) {
      requestBody.callback_url = input.callbackUrl
    }
    return requestBody
  }

  const requestBody: JsonRecord = {
    ...common,
    image_list: input.afterUrl
      ? [{ image: input.beforeUrl }, { image: input.afterUrl }]
      : [{ image: input.beforeUrl }],
    prompt: input.promptText,
    negative_prompt: negativePrompt,
    mode: "pro",
    duration: String(input.durationSeconds),
    watermark_info: { enabled: false },
  }
  if (input.callbackUrl) {
    requestBody.callback_url = input.callbackUrl
  }
  return requestBody
}

async function postKlingCreate(input: {
  token: string
  baseUrls: string[]
  requestPath: string
  requestBody: JsonRecord
}) {
  let activeBaseUrl = input.baseUrls[0]
  let response = await fetch(`${activeBaseUrl}${input.requestPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input.requestBody),
  })
  let rawText = await response.text()
  let parsed: JsonRecord | null = parseJsonRecord(rawText)

  if (!response.ok && shouldRetryWithFallback(response.status, parsed, rawText) && input.baseUrls.length > 1) {
    for (const candidate of input.baseUrls.slice(1)) {
      activeBaseUrl = candidate
      response = await fetch(`${activeBaseUrl}${input.requestPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.requestBody),
      })
      rawText = await response.text()
      parsed = parseJsonRecord(rawText)
      if (response.ok || !shouldRetryWithFallback(response.status, parsed, rawText)) {
        break
      }
    }
  }

  return { response, rawText, parsed, activeBaseUrl }
}

function buildKlingApiBaseUrls(preferredBaseUrl: string | null) {
  const candidates = [preferredBaseUrl || DEFAULT_KLING_API_BASE_URL, DEFAULT_KLING_API_BASE_URL, FALLBACK_KLING_API_BASE_URL]
  return Array.from(new Set(candidates.map((value) => value.replace(/\/+$/, "")).filter(Boolean)))
}

function parseJsonRecord(rawText: string): JsonRecord | null {
  try {
    return rawText ? JSON.parse(rawText) as JsonRecord : null
  } catch {
    return null
  }
}

function getKlingErrorMessage(payload: JsonRecord | null, rawText: string, status: number) {
  return (
    getString(payload?.message) ||
    getString(payload?.error) ||
    getOptionalString(getRecord(payload?.data)?.message) ||
    rawText.trim() ||
    `원본 생성 요청 실패 (${status})`
  )
}

function shouldRetryWithFallback(status: number, payload: JsonRecord | null, rawText: string) {
  if (status !== 401) return false
  const message = getKlingErrorMessage(payload, rawText, status).toLowerCase()
  return message.includes("access key not found") || message.includes("authorization") || message.includes("jwt")
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
    const klingApiBaseUrl = getEnv("KLING_API_BASE_URL", false) || DEFAULT_KLING_API_BASE_URL
    const klingModelName = getEnv("KLING_MODEL_NAME", false) || "kling-v3"
    const callbackUrl = getEnv("SHOWROOM_SHORTS_CALLBACK_URL", false)

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json().catch(() => null) as {
      jobId?: string
      phase?: string
      startImageUrl?: string
    } | null
    const jobId = getString(body?.jobId)
    if (!jobId) {
      return json({ ok: false, message: "jobId가 필요합니다." }, 400)
    }
    const phase = getString(body?.phase) || "demolish"
    const startImageUrl = getString(body?.startImageUrl)

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
    const apiMode = resolveKlingApiMode(klingModelName)
    const requestPath = getKlingCreatePath(apiMode)
    const candidateBaseUrls = buildKlingApiBaseUrls(klingApiBaseUrl)
    const stamp = Date.now()
    const aspectRatio = getString(job.source_aspect_ratio) || "16:9"
    const callback = getOptionalString(callbackUrl)
    // 10초 1방이면 후반 설치가 무너짐 → 철거 5초 후 마지막 프레임으로 설치 5초
    const useSplit = Number(job.duration_seconds ?? 10) >= 10 && apiMode === "image-to-video-v3"

    if (useSplit && phase === "install") {
      const existing = parseSplitState(job.kling_job_id)
      if (!existing?.demo.taskId) {
        return json({ ok: false, message: "철거 세그먼트 상태가 없습니다. 먼저 철거 생성을 실행하세요." }, 400)
      }
      if (existing.install.taskId) {
        return json({
          ok: true,
          jobId,
          status: "generating",
          split: true,
          phase: "install",
          installTaskId: existing.install.taskId,
          message: "설치 생성이 이미 요청되어 있습니다.",
        })
      }
      if (!startImageUrl) {
        return json({ ok: false, message: "설치 시작 이미지(철거 마지막 프레임) URL이 필요합니다." }, 400)
      }

      const installBody = buildKlingRequestBody({
        mode: apiMode,
        modelName: klingModelName,
        beforeUrl: startImageUrl,
        afterUrl,
        promptText: SHOWROOM_SHORTS_INSTALL_PROMPT,
        negativePrompt: SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT,
        durationSeconds: KLING_SPLIT_SEGMENT_SECONDS,
        aspectRatio,
        externalTaskId: `${jobId}-install-${stamp}`,
        callbackUrl: callback,
      })

      const installResult = await postKlingCreate({
        token,
        baseUrls: candidateBaseUrls,
        requestPath,
        requestBody: installBody,
      })

      if (!installResult.response.ok) {
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
          message: `설치 5초 생성 요청 실패 (${installResult.response.status})`,
          payload: {
            install: installResult.parsed ?? { rawText: installResult.rawText },
            start_image_url: startImageUrl,
            request_path: requestPath,
            model_name: klingModelName,
          },
        })
        return json({
          ok: false,
          provider: "kling",
          upstreamStatus: installResult.response.status,
          message: getKlingErrorMessage(installResult.parsed, installResult.rawText, installResult.response.status),
        })
      }

      const installTaskId = extractTaskId(installResult.parsed)
      if (!installTaskId) {
        return json({ ok: false, message: "설치 생성 task_id를 받지 못했습니다." }, 502)
      }

      const splitState = encodeSplitState({
        ...existing,
        startFrameUrl: startImageUrl,
        install: { taskId: installTaskId, status: "submitted", url: null },
      })

      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status: "generating",
          kling_status: `demo:${existing.demo.status || "succeed"}|install:submitted`,
          kling_job_id: splitState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await insertLog(supabase, {
        jobId,
        stage: "kling_requested_install",
        message: "철거 마지막 프레임을 시작으로 설치 5초 생성을 요청했습니다.",
        payload: {
          install_task_id: installTaskId,
          start_image_url: startImageUrl,
          demo_task_id: existing.demo.taskId,
          segment_seconds: KLING_SPLIT_SEGMENT_SECONDS,
        },
      })

      return json({
        ok: true,
        jobId,
        status: "generating",
        split: true,
        phase: "install",
        installTaskId,
        message: "설치 5초 생성을 시작했습니다. 완료되면 철거 영상과 이어붙입니다.",
      })
    }

    if (useSplit) {
      const demolishBody = buildKlingRequestBody({
        mode: apiMode,
        modelName: klingModelName,
        beforeUrl,
        afterUrl: null,
        promptText: SHOWROOM_SHORTS_DEMOLISH_PROMPT,
        negativePrompt: SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT,
        durationSeconds: KLING_SPLIT_SEGMENT_SECONDS,
        aspectRatio,
        externalTaskId: `${jobId}-demo-${stamp}`,
        callbackUrl: callback,
      })

      const demolishResult = await postKlingCreate({
        token,
        baseUrls: candidateBaseUrls,
        requestPath,
        requestBody: demolishBody,
      })

      if (!demolishResult.response.ok) {
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
          message: `철거 5초 생성 요청 실패 (${demolishResult.response.status})`,
          payload: {
            demolish: demolishResult.parsed ?? { rawText: demolishResult.rawText },
            request_path: requestPath,
            request_mode: apiMode,
            model_name: klingModelName,
          },
        })
        return json({
          ok: false,
          provider: "kling",
          upstreamStatus: demolishResult.response.status,
          message: getKlingErrorMessage(demolishResult.parsed, demolishResult.rawText, demolishResult.response.status),
        })
      }

      const demoTaskId = extractTaskId(demolishResult.parsed)
      if (!demoTaskId) {
        return json({ ok: false, message: "철거 생성 task_id를 받지 못했습니다." }, 502)
      }

      const splitState = encodeSplitState({
        mode: "split_demo_install_v1",
        startFrameUrl: null,
        demo: { taskId: demoTaskId, status: "submitted", url: null },
        install: { taskId: "", status: "pending", url: null },
      })

      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status: "generating",
          kling_status: "demo:submitted|install:pending",
          kling_job_id: splitState,
          source_video_url: null,
          duration_seconds: KLING_SPLIT_SEGMENT_SECONDS * 2,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await insertLog(supabase, {
        jobId,
        stage: "kling_requested_demolish",
        message: "철거 5초 생성을 먼저 요청했습니다. 완료 후 마지막 프레임으로 설치를 시작합니다.",
        payload: {
          demo_task_id: demoTaskId,
          segment_seconds: KLING_SPLIT_SEGMENT_SECONDS,
          request_path: requestPath,
          model_name: klingModelName,
        },
      })

      return json({
        ok: true,
        jobId,
        status: "generating",
        klingTaskId: demoTaskId,
        split: true,
        phase: "demolish",
        demoTaskId,
        message: "철거 5초 생성을 시작했습니다. 끝나면 마지막 프레임으로 설치 5초를 만듭니다.",
      })
    }

    // Kling은 external_task_id 재사용을 거부함 → 재생성마다 고유값 사용
    const externalTaskId = `${jobId}-${stamp}`
    const requestBody = buildKlingRequestBody({
      mode: apiMode,
      modelName: klingModelName,
      beforeUrl,
      afterUrl,
      promptText: getString(job.prompt_text),
      negativePrompt: SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
      durationSeconds: Number(job.duration_seconds ?? 10),
      aspectRatio,
      externalTaskId,
      callbackUrl: callback,
    })

    const single = await postKlingCreate({
      token,
      baseUrls: candidateBaseUrls,
      requestPath,
      requestBody,
    })

    if (!single.response.ok) {
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
        message: `원본 생성 요청 실패 (${single.response.status})`,
        payload: {
          ...(single.parsed ?? { rawText: single.rawText }),
          request_path: requestPath,
          request_mode: apiMode,
          model_name: klingModelName,
          request_base_url: single.activeBaseUrl,
        },
      })
      return json({
        ok: false,
        provider: "kling",
        upstreamStatus: single.response.status,
        requestBaseUrl: single.activeBaseUrl,
        message: getKlingErrorMessage(single.parsed, single.rawText, single.response.status),
      })
    }

    const taskId = extractTaskId(single.parsed)
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
      message: "원본 영상 생성 작업을 요청했습니다.",
      payload: {
        ...(single.parsed ?? { rawText: single.rawText }),
        request_path: requestPath,
        request_mode: apiMode,
        model_name: klingModelName,
        request_base_url: single.activeBaseUrl,
      },
    })

    return json({
      ok: true,
      jobId,
      status: "generating",
      klingTaskId: taskId,
      requestBaseUrl: single.activeBaseUrl,
      requestPath,
      message: "원본 생성 요청을 전달했습니다.",
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "showroom-shorts-create 실행 중 오류가 발생했습니다.",
    }, 500)
  }
})
