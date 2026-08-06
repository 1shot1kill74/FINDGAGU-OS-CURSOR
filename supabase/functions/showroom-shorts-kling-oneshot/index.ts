import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

type JsonRecord = Record<string, unknown>

const DEFAULT_KLING_API_BASE_URL = "https://api.klingai.com"
const FALLBACK_KLING_API_BASE_URL = "https://api-beijing.klingai.com"
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}

function getEnv(name: string, required = true) {
  const value = Deno.env.get(name)?.trim()
  if (!value && required) throw new Error(`${name} is not set`)
  return value || ""
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
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
  const message = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`
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

function buildKlingApiBaseUrls(preferredBaseUrl: string | null) {
  const candidates = [
    preferredBaseUrl || DEFAULT_KLING_API_BASE_URL,
    DEFAULT_KLING_API_BASE_URL,
    FALLBACK_KLING_API_BASE_URL,
  ]
  return Array.from(new Set(candidates.map((value) => value.replace(/\/+$/, "")).filter(Boolean)))
}

function parseJsonRecord(rawText: string): JsonRecord | null {
  try {
    return rawText ? JSON.parse(rawText) as JsonRecord : null
  } catch {
    return null
  }
}

function extractTaskId(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const direct = getString(payload.task_id) || getString(payload.taskId) || getString(payload.id)
  if (direct) return direct
  return extractTaskId(getRecord(payload.data))
}

function extractVideoUrl(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const direct = getString(payload.video_url) || getString(payload.url)
  if (direct.startsWith("http")) return direct

  const data = getRecord(payload.data)
  if (!data) return null

  const taskResult = getRecord(data.task_result)
  const videos = Array.isArray(taskResult?.videos) ? taskResult.videos : null
  if (videos?.[0]) {
    const first = getRecord(videos[0])
    const url = getString(first?.url) || getString(first?.video_url)
    if (url) return url
  }

  const works = Array.isArray(data.works) ? data.works : null
  if (works?.[0]) {
    const first = getRecord(works[0])
    const url = getString(first?.video_url) || getString(first?.url) || getString(first?.resource)
    if (url) return url
  }

  return getString(data.video_url) || getString(data.url) || null
}

function extractTaskStatus(payload: JsonRecord | null): string {
  const data = getRecord(payload?.data) || payload
  return (
    getString(data?.task_status) ||
    getString(data?.status) ||
    getString(payload?.task_status) ||
    getString(payload?.status) ||
    "unknown"
  )
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405)

  try {
    const klingAccessKey = getEnv("KLING_ACCESS_KEY")
    const klingSecretKey = getEnv("KLING_SECRET_KEY")
    const klingApiBaseUrl = getEnv("KLING_API_BASE_URL", false) || DEFAULT_KLING_API_BASE_URL
    const klingModelName = getEnv("KLING_MODEL_NAME", false) || "kling-v3"

    const body = await req.json().catch(() => null) as JsonRecord | null
    const action = getString(body?.action) || "create"
    const token = await createKlingJwt(klingAccessKey, klingSecretKey)
    const bases = buildKlingApiBaseUrls(klingApiBaseUrl)

    if (action === "poll") {
      const taskId = getString(body?.taskId)
      if (!taskId) return json({ ok: false, message: "taskId required" }, 400)

      let lastRaw = ""
      let lastParsed: JsonRecord | null = null
      let lastStatus = 0
      for (const base of bases) {
        const response = await fetch(`${base}/v1/videos/image2video/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        })
        lastStatus = response.status
        lastRaw = await response.text()
        lastParsed = parseJsonRecord(lastRaw)
        if (response.ok) break
      }

      const status = extractTaskStatus(lastParsed)
      const videoUrl = extractVideoUrl(lastParsed)
      return json({
        ok: lastStatus >= 200 && lastStatus < 300,
        action: "poll",
        taskId,
        status,
        videoUrl,
        upstreamStatus: lastStatus,
        raw: lastParsed ?? { text: lastRaw.slice(0, 2000) },
      })
    }

    const imageUrl = getString(body?.imageUrl)
    const imageTailUrl = getString(body?.imageTailUrl)
    const prompt = getString(body?.prompt)
    const negativePrompt = getString(body?.negativePrompt) ||
      "text, watermark, logo, subtitle, people faces, distorted room, morphing furniture, cartoon, low quality"
    const aspectRatio = getString(body?.aspectRatio) || "9:16"
    const duration = Number(body?.duration ?? 5)
    const mode = getString(body?.mode) || "pro"
    const externalTaskId = getString(body?.externalTaskId) || `hook-${Date.now()}`

    if (!imageUrl || !prompt) {
      return json({ ok: false, message: "imageUrl and prompt required" }, 400)
    }

    const requestBody: JsonRecord = {
      model_name: klingModelName,
      image: imageUrl,
      prompt,
      negative_prompt: negativePrompt,
      mode,
      duration: String(duration === 10 ? 10 : 5),
      aspect_ratio: aspectRatio,
      sound: "off",
      external_task_id: externalTaskId,
    }
    if (imageTailUrl) requestBody.image_tail = imageTailUrl

    let lastRaw = ""
    let lastParsed: JsonRecord | null = null
    let lastStatus = 0
    let activeBase = bases[0]
    for (const base of bases) {
      activeBase = base
      const response = await fetch(`${base}/v1/videos/image2video`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })
      lastStatus = response.status
      lastRaw = await response.text()
      lastParsed = parseJsonRecord(lastRaw)
      if (response.ok) break
    }

    const taskId = extractTaskId(lastParsed)
    if (!taskId) {
      return json({
        ok: false,
        action: "create",
        upstreamStatus: lastStatus,
        message: getString(lastParsed?.message) || lastRaw.slice(0, 500) || "no task_id",
        raw: lastParsed ?? { text: lastRaw.slice(0, 2000) },
        base: activeBase,
      }, lastStatus >= 400 ? lastStatus : 502)
    }

    return json({
      ok: true,
      action: "create",
      taskId,
      model: klingModelName,
      base: activeBase,
      request: {
        aspectRatio,
        duration: requestBody.duration,
        hasTail: Boolean(imageTailUrl),
        externalTaskId,
      },
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
