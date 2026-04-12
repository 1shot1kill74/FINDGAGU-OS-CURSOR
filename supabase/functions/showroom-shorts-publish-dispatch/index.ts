import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>
type DispatchAction = "prepare" | "launch"

type DispatchBody = {
  targetId?: string
  action?: DispatchAction
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

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function trimOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function joinHashtags(hashtags: unknown) {
  return Array.isArray(hashtags)
    ? hashtags.map((item) => getString(item)).filter(Boolean).join(" ").trim()
    : ""
}

function pickPreparationString(payload: JsonRecord | null, keys: string[]) {
  if (!payload) return ""
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

function extractHashtagsText(value: string) {
  const matches = value.match(/#[^\s#]+/g) ?? []
  return matches.join(" ").trim()
}

function buildPublishPackage(target: JsonRecord) {
  const preparationPayload = getRecord(target.preparation_payload)
  const fallbackHashtagsText = joinHashtags(target.hashtags)
  const preparedTitle =
    pickPreparationString(preparationPayload, ["preparedTitle", "title", "videoTitle"])
    || getString(target.title)
  const descriptionWithHashtags =
    pickPreparationString(preparationPayload, ["descriptionWithHashtags", "caption"])
    || [getString(target.description), fallbackHashtagsText].filter(Boolean).join("\n\n")
  const caption =
    pickPreparationString(preparationPayload, ["caption", "descriptionWithHashtags"])
    || descriptionWithHashtags
  const hashtagsText =
    pickPreparationString(preparationPayload, ["hashtagsText"])
    || extractHashtagsText(descriptionWithHashtags)
    || fallbackHashtagsText
  const description =
    pickPreparationString(preparationPayload, ["description", "preparedDescription"])
    || getString(target.description)
  const firstComment =
    pickPreparationString(preparationPayload, ["firstComment", "comment"])
    || getString(target.first_comment)

  return {
    title: preparedTitle,
    description,
    hashtagsText,
    firstComment,
    descriptionWithHashtags,
    caption,
  }
}

function parseResponseBody(rawText: string): JsonRecord | null {
  try {
    return rawText ? JSON.parse(rawText) as JsonRecord : null
  } catch {
    return null
  }
}

function getAcceptedStatus(action: DispatchAction) {
  return action === "prepare" ? "preparing" : "publishing"
}

function getCompletedStatus(action: DispatchAction) {
  return action === "prepare" ? "launch_ready" : "published"
}

function extractMessage(record: JsonRecord | null, fallback: string) {
  return (
    trimOrNull(record?.message)
    || trimOrNull(record?.detail)
    || trimOrNull(record?.error)
    || fallback
  )
}

async function insertLog(
  supabase: ReturnType<typeof createClient>,
  input: {
    jobId: string
    targetId: string
    stage: string
    message: string
    payload?: JsonRecord
  }
) {
  await supabase.from("showroom_shorts_logs").insert({
    shorts_job_id: input.jobId,
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

  let body: DispatchBody
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, message: "JSON body를 해석할 수 없습니다." }, 400)
  }

  const targetId = getString(body.targetId)
  const action = body.action === "launch" ? "launch" : "prepare"
  if (!targetId) {
    return json({ ok: false, message: "targetId가 필요합니다." }, 400)
  }

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")
    const webhookUrl = getEnv("SHOWROOM_SHORTS_PUBLISH_WEBHOOK_URL", false)
    const webhookSecret = getEnv("SHOWROOM_SHORTS_PUBLISH_WEBHOOK_SECRET", false)
    const callbackUrl =
      getEnv("SHOWROOM_SHORTS_PUBLISH_CALLBACK_URL", false)
      || `${supabaseUrl.replace(/\/$/, "")}/functions/v1/showroom-shorts-publish-callback`
    const callbackSecret = getEnv("SHOWROOM_SHORTS_PUBLISH_CALLBACK_SECRET", false)
    const mode = getEnv("SHOWROOM_SHORTS_PUBLISH_MODE", false).toLowerCase() === "mock" ? "mock" : "live"

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const nowIso = new Date().toISOString()

    const { data: target, error: targetError } = await supabase
      .from("showroom_shorts_targets")
      .select("*, showroom_shorts_jobs(*)")
      .eq("id", targetId)
      .single()

    if (targetError || !target) {
      return json({ ok: false, message: targetError?.message ?? "배포 타깃을 찾지 못했습니다." }, 404)
    }

    const targetRow = target as JsonRecord
    const jobRow = getRecord(targetRow.showroom_shorts_jobs)
    const jobId = getString(targetRow.shorts_job_id)
    const publishStatus = getString(targetRow.publish_status)
    const finalVideoUrl = trimOrNull(jobRow?.final_video_url)

    if (!jobRow || !jobId) {
      return json({ ok: false, message: "연결된 숏츠 작업 정보를 찾지 못했습니다." }, 400)
    }

    if (!finalVideoUrl) {
      return json({ ok: false, message: "최종 MP4가 없어 퍼블리싱 준비를 시작할 수 없습니다." }, 400)
    }

    if (action === "prepare" && !["ready", "failed", "launch_ready", "approved"].includes(publishStatus)) {
      return json({ ok: false, message: `현재 상태(${publishStatus})에서는 업로드 준비를 시작할 수 없습니다.` }, 400)
    }

    if (action === "launch" && !["launch_ready", "approved"].includes(publishStatus)) {
      return json({ ok: false, message: `현재 상태(${publishStatus})에서는 론칭 승인을 진행할 수 없습니다.` }, 400)
    }

    const publishPackage = buildPublishPackage(targetRow)
    const acceptedStatus = getAcceptedStatus(action)

    if (!webhookUrl && mode !== "mock") {
      return json({ ok: false, message: "SHOWROOM_SHORTS_PUBLISH_WEBHOOK_URL이 설정되지 않았습니다." }, 500)
    }

    const optimisticPatch: JsonRecord = {
      publish_status: acceptedStatus,
      updated_at: nowIso,
    }
    if (action === "launch") optimisticPatch.approved_at = nowIso

    const { error: updateError } = await supabase
      .from("showroom_shorts_targets")
      .update(optimisticPatch)
      .eq("id", targetId)

    if (updateError) {
      return json({ ok: false, message: updateError.message }, 500)
    }

    await insertLog(supabase, {
      jobId,
      targetId,
      stage: action === "prepare" ? "publish_prepare_requested" : "publish_launch_requested",
      message: action === "prepare" ? "n8n 업로드 준비 요청을 보냈습니다." : "n8n 론칭 승인 요청을 보냈습니다.",
      payload: {
        action,
        channel: getString(targetRow.channel),
        mode,
      },
    })

    if (!webhookUrl) {
      const mockPatch: JsonRecord = {
        publish_status: action === "prepare" ? "launch_ready" : "published",
        updated_at: nowIso,
      }
      if (action === "prepare") {
        mockPatch.preparation_payload = {
          mode: "mock",
          action,
          publishPackage,
        }
        mockPatch.prepared_at = nowIso
        mockPatch.launch_ready_at = nowIso
        mockPatch.preparation_error = null
      }
      if (action === "launch") {
        mockPatch.external_post_url = `https://mock.local/${getString(targetRow.channel)}/${targetId}`
        mockPatch.published_at = nowIso
      }

      await supabase
        .from("showroom_shorts_targets")
        .update(mockPatch)
        .eq("id", targetId)

      await insertLog(supabase, {
        jobId,
        targetId,
        stage: action === "prepare" ? "publish_prepare_mock_completed" : "publish_launch_mock_completed",
        message: action === "prepare" ? "mock 모드로 업로드 준비를 완료했습니다." : "mock 모드로 론칭을 완료했습니다.",
        payload: {
          action,
          mode: "mock",
        },
      })

      return json({
        ok: true,
        action,
        status: getCompletedStatus(action),
        mode: "mock",
        message: action === "prepare" ? "mock 업로드 준비가 완료되었습니다." : "mock 론칭이 완료되었습니다.",
      })
    }

    const requestBody = {
      source: "showroom-shorts",
      action,
      dispatchedAt: nowIso,
      callback: {
        url: callbackUrl,
        secretHeaderName: "x-showroom-shorts-publish-secret",
        ...(callbackSecret ? { secret: callbackSecret } : {}),
      },
      job: {
        id: getString(jobRow.id),
        status: getString(jobRow.status),
        finalVideoUrl,
        sourceVideoUrl: trimOrNull(jobRow.source_video_url),
        durationSeconds: jobRow.duration_seconds,
      },
      target: {
        id: targetId,
        channel: getString(targetRow.channel),
        publishStatus: acceptedStatus,
        title: getString(targetRow.title),
        description: getString(targetRow.description),
        hashtags: Array.isArray(targetRow.hashtags) ? targetRow.hashtags : [],
        firstComment: getString(targetRow.first_comment),
      },
      publishPackage,
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Showroom-Shorts-Source": "showroom-shorts",
        "X-Showroom-Shorts-Action": action,
        ...(webhookSecret ? { "X-Showroom-Shorts-Secret": webhookSecret } : {}),
      },
      body: JSON.stringify(requestBody),
    })

    const rawText = await response.text()
    const parsed = parseResponseBody(rawText)

    if (!response.ok) {
      await supabase
        .from("showroom_shorts_targets")
        .update({
          publish_status: "failed",
          preparation_error: extractMessage(parsed, `외부 webhook 호출 실패 (${response.status})`),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)

      await insertLog(supabase, {
        jobId,
        targetId,
        stage: action === "prepare" ? "publish_prepare_failed" : "publish_launch_failed",
        message: extractMessage(parsed, `외부 webhook 호출 실패 (${response.status})`),
        payload: {
          action,
          status: response.status,
        },
      })

      return json({
        ok: false,
        message: extractMessage(parsed, `외부 webhook 호출 실패 (${response.status})`),
      }, response.status)
    }

    const returnedStatus = getString(parsed?.status).toLowerCase()
    if (action === "prepare" && ["completed", "launch_ready", "ready"].includes(returnedStatus)) {
      await supabase
        .from("showroom_shorts_targets")
        .update({
          publish_status: "launch_ready",
          preparation_payload: parsed ?? {},
          preparation_error: null,
          prepared_at: new Date().toISOString(),
          launch_ready_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
    }

    if (action === "launch" && ["completed", "published"].includes(returnedStatus)) {
      await supabase
        .from("showroom_shorts_targets")
        .update({
          publish_status: "published",
          external_post_id: trimOrNull(parsed?.externalPostId) ?? trimOrNull(parsed?.external_post_id),
          external_post_url: trimOrNull(parsed?.externalPostUrl) ?? trimOrNull(parsed?.external_post_url) ?? trimOrNull(parsed?.publishUrl),
          published_at: new Date().toISOString(),
          preparation_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetId)
    }

    return json({
      ok: true,
      action,
      status: ["completed", "published"].includes(returnedStatus)
        ? getCompletedStatus(action)
        : acceptedStatus,
      mode,
      message: extractMessage(
        parsed,
        action === "prepare"
          ? "n8n 업로드 준비 요청을 전달했습니다."
          : "n8n 론칭 승인 요청을 전달했습니다."
      ),
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "퍼블리싱 디스패치 중 오류가 발생했습니다.",
    }, 500)
  }
})
