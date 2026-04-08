import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>
const DEFAULT_KLING_API_BASE_URL = "https://api.klingai.com"
const FALLBACK_KLING_API_BASE_URL = "https://api-beijing.klingai.com"
const SHOWROOM_SHORTS_VIDEO_BUCKET = "showroom-shorts-videos"
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
  const payload = { iss: accessKey, iat: now, nbf: now - 5, exp: now + 1800 }
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

function normalizeKlingModelName(value: string) {
  return value.trim().toLowerCase()
}

function resolveKlingApiMode(modelName: string): KlingApiMode {
  const normalized = normalizeKlingModelName(modelName)
  if (normalized.includes("omni")) return "omni"
  if (normalized.includes("v3")) return "image-to-video-v3"
  return "legacy-multi-image"
}

function getKlingPollPath(mode: KlingApiMode, taskId: string) {
  if (mode === "omni") return `/v1/videos/omni/${taskId}`
  if (mode === "image-to-video-v3") return `/v1/videos/image2video/${taskId}`
  return `/v1/videos/multi-image2video/${taskId}`
}

function buildKlingPollPathCandidates(modelName: string, taskId: string) {
  const preferredMode = resolveKlingApiMode(modelName)
  const orderedModes: KlingApiMode[] = [
    preferredMode,
    "image-to-video-v3",
    "legacy-multi-image",
    "omni",
  ]
  return Array.from(new Set(orderedModes.map((mode) => getKlingPollPath(mode, taskId))))
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "file"
}

function inferVideoExtension(contentType: string | null, url: string) {
  if (contentType?.includes("quicktime")) return "mov"
  if (contentType?.includes("webm")) return "webm"
  if (contentType?.includes("mp4")) return "mp4"
  const urlMatch = url.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)
  return urlMatch?.[1]?.toLowerCase() || "mp4"
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
    `원본 생성 상태 조회 실패 (${status})`
  )
}

function shouldRetryWithFallback(status: number, payload: JsonRecord | null, rawText: string) {
  if (status !== 401) return false
  const message = getKlingErrorMessage(payload, rawText, status).toLowerCase()
  return message.includes("access key not found") || message.includes("authorization") || message.includes("jwt")
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
    getOptionalString(payload.url) ||
    getOptionalString(payload.output)
  if (direct) return direct

  const data = getRecord(payload.data)
  const dataUrl =
    getOptionalString(data?.video_url) ||
    getOptionalString(data?.videoUrl) ||
    getOptionalString(data?.url) ||
    getOptionalString(data?.output)
  if (dataUrl) return dataUrl

  const result = getRecord(data?.result ?? payload.result)
  const resultUrl =
    getOptionalString(result?.video_url) ||
    getOptionalString(result?.videoUrl) ||
    getOptionalString(result?.url) ||
    getOptionalString(result?.output)
  if (resultUrl) return resultUrl

  const taskResult = getRecord(data?.task_result)
  const taskResultUrl =
    getOptionalString(taskResult?.video_url) ||
    getOptionalString(taskResult?.videoUrl) ||
    getOptionalString(taskResult?.url) ||
    getOptionalString(taskResult?.output)
  if (taskResultUrl) return taskResultUrl

  const videos = Array.isArray(taskResult?.videos) ? taskResult?.videos : []
  for (const video of videos) {
    const record = getRecord(video)
    const candidate =
      getOptionalString(record?.url) ||
      getOptionalString(record?.video_url) ||
      getOptionalString(record?.videoUrl)
    if (candidate) return candidate
  }

  const works = Array.isArray(data?.works) ? data?.works : Array.isArray(payload.works) ? payload.works : []
  for (const work of works) {
    const record = getRecord(work)
    const resource = getRecord(record?.resource)
    const candidate =
      getOptionalString(resource?.resource) ||
      getOptionalString(resource?.url) ||
      getOptionalString(resource?.video_url) ||
      getOptionalString(resource?.videoUrl) ||
      getOptionalString(record?.url)
    if (candidate) return candidate
  }
  const outputs = Array.isArray(data?.outputs) ? data?.outputs : Array.isArray(payload.outputs) ? payload.outputs : []
  for (const output of outputs) {
    const record = getRecord(output)
    const candidate =
      getOptionalString(record?.url) ||
      getOptionalString(record?.video_url) ||
      getOptionalString(record?.videoUrl) ||
      getOptionalString(record?.output)
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

async function persistSourceVideoToStorage(
  supabase: ReturnType<typeof createClient>,
  input: { jobId: string; sourceVideoUrl: string },
) {
  if (input.sourceVideoUrl.includes(`/storage/v1/object/public/${SHOWROOM_SHORTS_VIDEO_BUCKET}/`)) {
    return input.sourceVideoUrl
  }

  const response = await fetch(input.sourceVideoUrl)
  if (!response.ok) {
    throw new Error(`원본 영상 다운로드 실패 (${response.status})`)
  }

  const contentType = getOptionalString(response.headers.get("content-type")) || "video/mp4"
  const extension = inferVideoExtension(contentType, input.sourceVideoUrl)
  const objectPath = `source/${sanitizePathSegment(input.jobId)}/kling-source-${Date.now()}.${extension}`
  const buffer = new Uint8Array(await response.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(SHOWROOM_SHORTS_VIDEO_BUCKET)
    .upload(objectPath, buffer, {
      contentType,
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`쇼츠 원본 Storage 업로드 실패: ${uploadError.message}`)
  }

  return supabase.storage.from(SHOWROOM_SHORTS_VIDEO_BUCKET).getPublicUrl(objectPath).data.publicUrl
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, message: "POST 요청만 지원합니다." }, 405)

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const klingAccessKey = getEnv("KLING_ACCESS_KEY")
    const klingSecretKey = getEnv("KLING_SECRET_KEY")
    const klingApiBaseUrl = getEnv("KLING_API_BASE_URL", false) || DEFAULT_KLING_API_BASE_URL
    const klingModelName = getEnv("KLING_MODEL_NAME", false) || "kling-v3"

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
      return json({ ok: false, message: "아직 생성 작업 ID가 없습니다. 먼저 생성 요청을 실행하세요." }, 400)
    }

    const token = await createKlingJwt(klingAccessKey, klingSecretKey)
    const apiMode = resolveKlingApiMode(klingModelName)
    const requestPaths = buildKlingPollPathCandidates(klingModelName, klingTaskId)
    const candidateBaseUrls = buildKlingApiBaseUrls(klingApiBaseUrl)
    let activeBaseUrl = candidateBaseUrls[0]
    let requestPath = requestPaths[0]
    let response!: Response
    let rawText = ""
    let parsed: JsonRecord | null = null

    for (const candidatePath of requestPaths) {
      requestPath = candidatePath
      activeBaseUrl = candidateBaseUrls[0]
      response = await fetch(`${activeBaseUrl}${requestPath}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      rawText = await response.text()
      parsed = parseJsonRecord(rawText)

      if (!response.ok && shouldRetryWithFallback(response.status, parsed, rawText) && candidateBaseUrls.length > 1) {
        for (const candidate of candidateBaseUrls.slice(1)) {
          activeBaseUrl = candidate
          response = await fetch(`${activeBaseUrl}${requestPath}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
          rawText = await response.text()
          parsed = parseJsonRecord(rawText)
          if (response.ok || !shouldRetryWithFallback(response.status, parsed, rawText)) {
            break
          }
        }
      }

      if (response.ok || ![400, 404].includes(response.status)) {
        break
      }
    }

    if (!response.ok) {
      await insertLog(supabase, {
        jobId,
        stage: "kling_poll_failed",
        message: `원본 생성 상태 조회 실패 (${response.status})`,
        payload: {
          ...(parsed ?? { rawText }),
          request_path: requestPath,
          request_mode: apiMode,
          model_name: klingModelName,
          request_base_url: activeBaseUrl,
        },
      })
      return json({
        ok: false,
        provider: "kling",
        upstreamStatus: response.status,
        requestBaseUrl: activeBaseUrl,
        message: getKlingErrorMessage(parsed, rawText, response.status),
      })
    }

    const klingStatus = extractStatus(parsed)
    const sourceVideoUrl = extractVideoUrl(parsed)
    const nextStatus = mapJobStatus(klingStatus)
    const nowIso = new Date().toISOString()

    let persistedSourceVideoUrl = sourceVideoUrl
    let storageCopyError: string | null = null

    if (nextStatus === "generated" && sourceVideoUrl) {
      try {
        persistedSourceVideoUrl = await persistSourceVideoToStorage(supabase, {
          jobId,
          sourceVideoUrl,
        })
        await insertLog(supabase, {
          jobId,
          stage: "source_video_persisted",
          message: "원본 영상을 Supabase Storage로 복사했습니다.",
          payload: {
            original_source_video_url: sourceVideoUrl,
            persisted_source_video_url: persistedSourceVideoUrl,
            bucket: SHOWROOM_SHORTS_VIDEO_BUCKET,
          },
        })
      } catch (error) {
        storageCopyError = error instanceof Error ? error.message : "쇼츠 원본 Storage 복사에 실패했습니다."
        await insertLog(supabase, {
          jobId,
          stage: "source_video_persist_failed",
          message: storageCopyError,
          payload: {
            original_source_video_url: sourceVideoUrl,
            bucket: SHOWROOM_SHORTS_VIDEO_BUCKET,
          },
        })
      }
    }

    await supabase
      .from("showroom_shorts_jobs")
      .update({
        status: nextStatus,
        kling_status: klingStatus,
        source_video_url: persistedSourceVideoUrl,
        updated_at: nowIso,
      })
      .eq("id", jobId)

    await insertLog(supabase, {
      jobId,
      stage: "kling_polled",
      message: `원본 생성 상태 조회 완료: ${klingStatus}`,
      payload: {
        ...(parsed ?? { rawText }),
        request_base_url: activeBaseUrl,
        request_path: requestPath,
        request_mode: apiMode,
        model_name: klingModelName,
        original_source_video_url: sourceVideoUrl,
        persisted_source_video_url: persistedSourceVideoUrl,
        storage_copy_error: storageCopyError,
      },
    })

    return json({
      ok: true,
      jobId,
      status: nextStatus,
      klingStatus,
      sourceVideoUrl: persistedSourceVideoUrl,
      finalVideoUrl: getOptionalString(job.final_video_url),
      requestBaseUrl: activeBaseUrl,
      requestPath,
      message:
        nextStatus === "generated"
          ? !persistedSourceVideoUrl
            ? "원본 생성은 완료되었지만 원본 영상 URL을 아직 추출하지 못했습니다."
            : storageCopyError
              ? `원본 생성은 완료되었지만 Storage 복사에 실패했습니다: ${storageCopyError}`
              : "원본 생성이 완료되었고 Supabase Storage에 저장했습니다. 다음 단계는 9:16 템플릿 합성입니다."
          : nextStatus === "failed"
            ? "생성 작업이 실패했습니다."
            : "생성 작업이 아직 진행 중입니다.",
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "showroom-shorts-poll 실행 중 오류가 발생했습니다.",
    }, 500)
  }
})
