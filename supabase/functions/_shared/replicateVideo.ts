type JsonRecord = Record<string, unknown>

const API_BASE_URL = "https://api.replicate.com/v1"
const DEFAULT_MODEL = "kwaivgi/kling-v3-video"
const MIN_DURATION = 3
const MAX_DURATION = 15

export type ReplicateSubmitInput = {
  promptText: string
  negativePrompt: string
  startImageUrl: string
  endImageUrl?: string | null
  durationSeconds: number
  aspectRatio: string
  mode?: string
}

export type ReplicateSubmitResult =
  | { ok: true; taskId: string; model: string; raw: JsonRecord | null }
  | { ok: false; status: number; message: string; raw: JsonRecord | null; rawText: string }

export type ReplicatePollResult = {
  ok: boolean
  status: number
  mappedStatus: string
  rawStatus: string
  videoUrl: string | null
  message: string
  raw: JsonRecord | null
  rawText: string
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseJsonRecord(rawText: string): JsonRecord | null {
  try {
    return rawText ? JSON.parse(rawText) as JsonRecord : null
  } catch {
    return null
  }
}

export function getReplicateModel() {
  return Deno.env.get("REPLICATE_VIDEO_MODEL")?.trim() || DEFAULT_MODEL
}

export function getReplicateToken() {
  const value = Deno.env.get("REPLICATE_API_TOKEN")?.trim() || ""
  if (!value) throw new Error("REPLICATE_API_TOKEN 환경 변수가 설정되지 않았습니다.")
  return value
}

export function clampReplicateDuration(seconds: number) {
  const rounded = Math.round(Number.isFinite(seconds) ? seconds : 5)
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, rounded))
}

/** 예전 클링 직결 task id(긴 숫자열). 배포 후 잔여 잡은 재생성해야 한다. */
export function looksLikeLegacyKlingTaskId(taskId: string) {
  return /^\d{12,}$/.test(taskId.trim())
}

export function mapReplicateStatus(status: string) {
  const normalized = status.trim().toLowerCase()
  if (["failed", "canceled", "cancelled"].includes(normalized)) return "failed"
  if (["succeeded", "succeed", "success", "completed", "done", "finished"].includes(normalized)) {
    return "succeed"
  }
  if (normalized === "starting") return "submitted"
  if (normalized === "processing") return "processing"
  return normalized || "submitted"
}

function errorMessage(payload: JsonRecord | null, rawText: string, status: number) {
  return (
    getString(payload?.detail) ||
    getString(payload?.title) ||
    getString(payload?.error) ||
    getString(payload?.message) ||
    rawText.trim() ||
    `Replicate 요청 실패 (${status})`
  )
}

function extractOutputUrl(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const direct = getOptionalString(payload.output)
  if (direct) return direct
  if (Array.isArray(payload.output)) {
    for (let index = payload.output.length - 1; index >= 0; index -= 1) {
      const candidate = getOptionalString(payload.output[index])
      if (candidate) return candidate
    }
  }
  const record = getRecord(payload.output)
  return getOptionalString(record?.url) || getOptionalString(record?.video)
}

async function replicateRequest(input: {
  method: "GET" | "POST"
  path: string
  body?: JsonRecord
}): Promise<{ response: Response; rawText: string; parsed: JsonRecord | null }> {
  const response = await fetch(`${API_BASE_URL}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${getReplicateToken()}`,
      Accept: "application/json",
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  })
  const rawText = await response.text()
  return { response, rawText, parsed: parseJsonRecord(rawText) }
}

export async function submitReplicateVideo(input: ReplicateSubmitInput): Promise<ReplicateSubmitResult> {
  const model = getReplicateModel()
  const payload: JsonRecord = {
    prompt: input.promptText,
    negative_prompt: input.negativePrompt,
    start_image: input.startImageUrl,
    mode: input.mode || "pro",
    duration: clampReplicateDuration(input.durationSeconds),
    generate_audio: false,
    aspect_ratio: input.aspectRatio,
  }
  if (input.endImageUrl) payload.end_image = input.endImageUrl

  const { response, rawText, parsed } = await replicateRequest({
    method: "POST",
    path: `/models/${model}/predictions`,
    body: { input: payload },
  })

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: errorMessage(parsed, rawText, response.status),
      raw: parsed,
      rawText,
    }
  }

  const taskId = getOptionalString(parsed?.id)
  if (!taskId) {
    return {
      ok: false,
      status: 502,
      message: "Replicate 응답에서 prediction id를 받지 못했습니다.",
      raw: parsed,
      rawText,
    }
  }

  return { ok: true, taskId, model, raw: parsed }
}

export async function pollReplicateVideo(taskId: string): Promise<ReplicatePollResult> {
  const { response, rawText, parsed } = await replicateRequest({
    method: "GET",
    path: `/predictions/${taskId}`,
  })
  const rawStatus = getString(parsed?.status) || (response.ok ? "starting" : "")
  const failureDetail = getString(parsed?.error)
  return {
    ok: response.ok,
    status: response.status,
    mappedStatus: mapReplicateStatus(rawStatus),
    rawStatus: failureDetail ? `${rawStatus}: ${failureDetail}`.slice(0, 300) : rawStatus,
    videoUrl: extractOutputUrl(parsed),
    message: response.ok
      ? (failureDetail || rawStatus || "ok")
      : errorMessage(parsed, rawText, response.status),
    raw: parsed,
    rawText,
  }
}
