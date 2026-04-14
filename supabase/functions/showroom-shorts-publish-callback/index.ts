import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-showroom-shorts-publish-secret",
}

type JsonRecord = Record<string, unknown>
type CallbackAction = "prepare" | "launch"
type SourceType = "shorts" | "basic_shorts"

type CallbackBody = {
  targetId?: string
  action?: CallbackAction
  sourceType?: SourceType
  status?: string
  message?: string | null
  errorMessage?: string | null
  error_message?: string | null
  completedAt?: string | null
  completed_at?: string | null
  externalPostId?: string | null
  external_post_id?: string | null
  externalPostUrl?: string | null
  external_post_url?: string | null
  payload?: JsonRecord | null
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

function getEnv(name: string, required = true) {
  const value = Deno.env.get(name)?.trim() || ""
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeAction(value: unknown): CallbackAction {
  return value === "launch" ? "launch" : "prepare"
}

function normalizeStatus(value: unknown) {
  const normalized = getString(value).toLowerCase()
  if (["completed", "published", "failed", "processing", "launch_ready", "ready"].includes(normalized)) {
    return normalized
  }
  return "processing"
}

function getSourceType(value: unknown): SourceType {
  return value === "basic_shorts" ? "basic_shorts" : "shorts"
}

function getTables(sourceType: SourceType) {
  if (sourceType === "basic_shorts") {
    return {
      targets: "showroom_basic_shorts_targets",
      logs: "showroom_basic_shorts_logs",
      parentIdField: "basic_shorts_draft_id",
    } as const
  }

  return {
    targets: "showroom_shorts_targets",
    logs: "showroom_shorts_logs",
    parentIdField: "shorts_job_id",
  } as const
}

async function insertLog(
  supabase: ReturnType<typeof createClient>,
  input: {
    parentId: string
    targetId: string
    stage: string
    message: string
    payload?: JsonRecord
    sourceType: SourceType
  }
) {
  const tables = getTables(input.sourceType)
  await supabase.from(tables.logs).insert({
    [tables.parentIdField]: input.parentId,
    target_id: input.targetId,
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
    const callbackSecret = getEnv("SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET", false)
    const requestSecret = req.headers.get("x-showroom-shorts-publish-secret")?.trim() || ""
    if (callbackSecret && callbackSecret !== requestSecret) {
      return json({ ok: false, message: "callback secret 불일치" }, 401)
    }

    let body: CallbackBody
    try {
      body = await req.json()
    } catch {
      return json({ ok: false, message: "JSON body를 해석할 수 없습니다." }, 400)
    }

    const targetId = getString(body.targetId)
    if (!targetId) {
      return json({ ok: false, message: "targetId가 필요합니다." }, 400)
    }

    const action = normalizeAction(body.action)
    const sourceType = getSourceType(body.sourceType)
    const status = normalizeStatus(body.status)
    const message =
      trimOrNull(body.message)
      || trimOrNull(body.errorMessage)
      || trimOrNull(body.error_message)
      || (action === "prepare" ? "퍼블리싱 준비 상태가 갱신되었습니다." : "퍼블리싱 상태가 갱신되었습니다.")
    const completedAt = trimOrNull(body.completedAt) ?? trimOrNull(body.completed_at) ?? new Date().toISOString()
    const externalPostId = trimOrNull(body.externalPostId) ?? trimOrNull(body.external_post_id)
    const externalPostUrl = trimOrNull(body.externalPostUrl) ?? trimOrNull(body.external_post_url)

    const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"))
    const tables = getTables(sourceType)

    const { data: target, error: targetError } = await supabase
      .from(tables.targets)
      .select(`id, ${tables.parentIdField}, channel, publish_status, preparation_payload`)
      .eq("id", targetId)
      .single()

    if (targetError || !target) {
      return json({ ok: false, message: targetError?.message ?? "대상 배포 타깃을 찾지 못했습니다." }, 404)
    }

    const nowIso = new Date().toISOString()
    const updatePatch: JsonRecord = {
      updated_at: nowIso,
    }

    if (action === "prepare") {
      if (["completed", "launch_ready", "ready"].includes(status)) {
        updatePatch.publish_status = "launch_ready"
        updatePatch.preparation_payload = body.payload ?? {}
        updatePatch.preparation_error = null
        updatePatch.prepared_at = completedAt
        updatePatch.launch_ready_at = completedAt
      } else if (status === "failed") {
        updatePatch.publish_status = "failed"
        updatePatch.preparation_error = message
        if (body.payload) updatePatch.preparation_payload = body.payload
      } else {
        updatePatch.publish_status = "preparing"
      }
    }

    if (action === "launch") {
      if (["completed", "published"].includes(status)) {
        updatePatch.publish_status = "published"
        updatePatch.external_post_id = externalPostId
        updatePatch.external_post_url = externalPostUrl
        updatePatch.published_at = completedAt
        updatePatch.preparation_error = null
      } else if (status === "failed") {
        updatePatch.publish_status = "failed"
        updatePatch.preparation_error = message
      } else {
        updatePatch.publish_status = "publishing"
      }
    }

    const { error: updateError } = await supabase
      .from(tables.targets)
      .update(updatePatch)
      .eq("id", targetId)

    if (updateError) {
      return json({ ok: false, message: updateError.message }, 500)
    }

    await insertLog(supabase, {
      parentId: String(target[tables.parentIdField]),
      targetId,
      stage:
        action === "prepare"
          ? (["completed", "launch_ready", "ready"].includes(status) ? "publish_prepare_completed" : status === "failed" ? "publish_prepare_failed" : "publish_prepare_processing")
          : (["completed", "published"].includes(status) ? "publish_completed" : status === "failed" ? "publish_failed" : "publish_processing"),
      message,
      payload: {
        action,
        channel: target.channel,
        status,
        sourceType,
        external_post_id: externalPostId,
        external_post_url: externalPostUrl,
        payload: body.payload ?? {},
      },
      sourceType,
    })

    return json({
      ok: true,
      targetId,
      action,
      status: updatePatch.publish_status,
      message,
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "퍼블리싱 callback 처리 중 오류가 발생했습니다.",
    }, 500)
  }
})
