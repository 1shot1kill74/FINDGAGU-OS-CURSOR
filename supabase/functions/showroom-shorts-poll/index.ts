import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  encodeSplitState,
  getFirstSegment,
  getFirstSegmentLabel,
  isAlignInstallSplit,
  isSplitReady,
  needsInstallStart,
  parseSplitState,
  type SplitKlingState,
} from "../_shared/klingSplitState.ts"
import {
  looksLikeLegacyKlingTaskId,
  pollReplicateVideo,
} from "../_shared/replicateVideo.ts"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

type JsonRecord = Record<string, unknown>
const SHOWROOM_SHORTS_VIDEO_BUCKET = "showroom-shorts-videos"

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

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
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

function mapJobStatus(providerStatus: string) {
  if (["failed", "error", "canceled", "cancelled"].includes(providerStatus)) return "failed"
  if (["succeed", "success", "succeeded", "completed", "done", "finished"].includes(providerStatus)) {
    return "generated"
  }
  return "generating"
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
  input: { jobId: string; sourceVideoUrl: string; segmentLabel?: string },
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
  const label = input.segmentLabel ? `${sanitizePathSegment(input.segmentLabel)}-` : ""
  const objectPath = `source/${sanitizePathSegment(input.jobId)}/${label}source-${Date.now()}.${extension}`
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

function collectLegacyKlingTaskIds(rawJobId: unknown): string[] {
  const split = parseSplitState(rawJobId)
  if (split) {
    return [getFirstSegment(split).taskId, split.install.taskId].filter((value) =>
      looksLikeLegacyKlingTaskId(value)
    )
  }
  const single = getString(rawJobId)
  return looksLikeLegacyKlingTaskId(single) ? [single] : []
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, message: "POST 요청만 지원합니다." }, 405)

  try {
    const supabaseUrl = getEnv("SUPABASE_URL")
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY")

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

    const rawKlingJobId = job.kling_job_id
    if (!rawKlingJobId) {
      return json({ ok: false, message: "아직 생성 작업 ID가 없습니다. 먼저 생성 요청을 실행하세요." }, 400)
    }

    const legacyTaskIds = collectLegacyKlingTaskIds(rawKlingJobId)
    if (legacyTaskIds.length > 0) {
      return json({
        ok: false,
        provider: "replicate",
        message: "이전 클링 직결 작업입니다. 클링 API는 더 이상 쓰지 않으니 원본을 다시 생성해 주세요.",
      }, 409)
    }

    const nowIso = new Date().toISOString()
    const splitState = parseSplitState(rawKlingJobId)

    if (splitState) {
      const first = getFirstSegment(splitState)
      const firstLabel = getFirstSegmentLabel(splitState)
      const firstPoll = await pollReplicateVideo(first.taskId)
      const installPoll = splitState.install.taskId
        ? await pollReplicateVideo(splitState.install.taskId)
        : null

      if (!firstPoll.ok || (installPoll && !installPoll.ok)) {
        const failed = !firstPoll.ok ? firstPoll : installPoll!
        await insertLog(supabase, {
          jobId,
          stage: "video_poll_failed",
          message: `분할 원본 상태 조회 실패 (${failed.status})`,
          payload: {
            [firstLabel]: firstPoll.raw ?? { rawText: firstPoll.rawText },
            install: installPoll ? (installPoll.raw ?? { rawText: installPoll.rawText }) : null,
          },
        })
        return json({
          ok: false,
          provider: "replicate",
          upstreamStatus: failed.status,
          message: failed.message,
        })
      }

      const next: SplitKlingState = isAlignInstallSplit(splitState)
        ? {
          mode: "split_align_install_v1",
          startFrameUrl: splitState.startFrameUrl ?? null,
          align: {
            taskId: splitState.align.taskId,
            status: firstPoll.mappedStatus,
            url: splitState.align.url ?? null,
            duration: splitState.align.duration,
          },
          install: {
            taskId: splitState.install.taskId,
            status: installPoll
              ? installPoll.mappedStatus
              : (splitState.install.status || "pending"),
            url: splitState.install.url ?? null,
            duration: splitState.install.duration,
          },
        }
        : {
          mode: "split_demo_install_v1",
          startFrameUrl: splitState.startFrameUrl ?? null,
          demo: {
            taskId: splitState.demo.taskId,
            status: firstPoll.mappedStatus,
            url: splitState.demo.url ?? null,
            duration: splitState.demo.duration,
          },
          install: {
            taskId: splitState.install.taskId,
            status: installPoll
              ? installPoll.mappedStatus
              : (splitState.install.status || "pending"),
            url: splitState.install.url ?? null,
            duration: splitState.install.duration,
          },
        }

      const persistIfReady = async (
        label: "demo" | "align" | "install",
        status: string,
        remoteUrl: string | null,
        existingUrl: string | null | undefined,
      ) => {
        if (mapJobStatus(status) !== "generated" || !remoteUrl) return null
        if (existingUrl) return existingUrl
        const persisted = await persistSourceVideoToStorage(supabase, {
          jobId,
          sourceVideoUrl: remoteUrl,
          segmentLabel: label,
        })
        const labelKo =
          label === "install" ? "설치" : label === "align" ? "구도 맞춤" : "철거"
        await insertLog(supabase, {
          jobId,
          stage: "source_segment_persisted",
          message: `${labelKo} 원본을 Storage에 저장했습니다.`,
          payload: { label, original: remoteUrl, persisted },
        })
        return persisted
      }

      try {
        const firstUrl = await persistIfReady(
          firstLabel,
          getFirstSegment(next).status || "",
          firstPoll.videoUrl,
          getFirstSegment(next).url,
        )
        const installUrl = await persistIfReady(
          "install",
          next.install.status || "",
          installPoll?.videoUrl ?? null,
          next.install.url,
        )
        if (firstUrl) {
          if (isAlignInstallSplit(next)) next.align.url = firstUrl
          else next.demo.url = firstUrl
        }
        if (installUrl) next.install.url = installUrl
      } catch (error) {
        const message = error instanceof Error ? error.message : "분할 원본 Storage 복사 실패"
        await insertLog(supabase, {
          jobId,
          stage: "source_video_persist_failed",
          message,
        })
        return json({ ok: false, message }, 500)
      }

      const firstFailed = mapJobStatus(getFirstSegment(next).status || "") === "failed"
      const installFailed = next.install.taskId
        ? mapJobStatus(next.install.status || "") === "failed"
        : false
      const awaitingInstall = needsInstallStart(next)
      const ready = isSplitReady(next)
      const emptyRoom = isAlignInstallSplit(next)

      let status = "generating"
      let installStatusLabel = next.install.taskId
        ? (next.install.status || "processing")
        : awaitingInstall
          ? "awaiting_start_frame"
          : "pending"
      let klingStatus = `${firstLabel}:${getFirstSegment(next).status || "processing"}|install:${installStatusLabel}`
      if (firstFailed || installFailed) {
        status = "failed"
        klingStatus = "request_failed"
      } else if (ready) {
        status = getString(job.source_video_url) ? "generated" : "generating"
        klingStatus = getString(job.source_video_url) ? "succeed" : "segments_ready"
      }

      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status,
          kling_status: klingStatus,
          kling_job_id: encodeSplitState(next),
          source_video_url: getOptionalString(job.source_video_url),
          updated_at: nowIso,
        })
        .eq("id", jobId)

      await insertLog(supabase, {
        jobId,
        stage: "video_polled_split",
        message: ready
          ? emptyRoom
            ? "구도 맞춤·설치 세그먼트가 준비됐습니다. 이어붙이기를 진행합니다."
            : "철거·설치 세그먼트가 준비됐습니다. 이어붙이기를 진행합니다."
          : awaitingInstall
            ? emptyRoom
              ? "구도 맞춤 원본이 준비됐습니다. 마지막 프레임으로 설치 생성을 시작합니다."
              : "철거 원본이 준비됐습니다. 마지막 프레임으로 설치 생성을 시작합니다."
            : `분할 생성 진행 중 (${klingStatus})`,
        payload: { split: next },
      })

      return json({
        ok: true,
        jobId,
        status,
        klingStatus,
        split: next,
        sourceVideoUrl: getOptionalString(job.source_video_url),
        finalVideoUrl: getOptionalString(job.final_video_url),
        message: ready
          ? getString(job.source_video_url)
            ? "이어붙인 원본이 준비됐습니다."
            : emptyRoom
              ? "구도 맞춤·설치 원본이 준비됐습니다. 워커가 이어붙입니다."
              : "철거·설치 원본이 준비됐습니다. 워커가 이어붙입니다."
          : awaitingInstall
            ? emptyRoom
              ? "구도 맞춤이 끝났습니다. 워커가 마지막 프레임으로 설치를 요청합니다."
              : "철거가 끝났습니다. 워커가 마지막 프레임으로 설치를 요청합니다."
          : status === "failed"
            ? "분할 생성 중 한쪽이 실패했습니다."
            : emptyRoom
              ? "구도 맞춤/설치 생성이 아직 진행 중입니다."
              : "철거/설치 생성이 아직 진행 중입니다.",
      })
    }

    const providerTaskId = getString(rawKlingJobId)
    if (!providerTaskId) {
      return json({ ok: false, message: "아직 생성 작업 ID가 없습니다. 먼저 생성 요청을 실행하세요." }, 400)
    }

    const polled = await pollReplicateVideo(providerTaskId)
    if (!polled.ok) {
      await insertLog(supabase, {
        jobId,
        stage: "video_poll_failed",
        message: `원본 생성 상태 조회 실패 (${polled.status})`,
        payload: polled.raw ?? { rawText: polled.rawText },
      })
      return json({
        ok: false,
        provider: "replicate",
        upstreamStatus: polled.status,
        message: polled.message,
      })
    }

    const providerStatus = polled.mappedStatus
    const sourceVideoUrl = polled.videoUrl
    const nextStatus = mapJobStatus(providerStatus)

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
        kling_status: providerStatus,
        source_video_url: persistedSourceVideoUrl,
        updated_at: nowIso,
      })
      .eq("id", jobId)

    await insertLog(supabase, {
      jobId,
      stage: "video_polled",
      message: `원본 생성 상태 조회 완료: ${providerStatus}`,
      payload: {
        ...(polled.raw ?? { rawText: polled.rawText }),
        original_source_video_url: sourceVideoUrl,
        persisted_source_video_url: persistedSourceVideoUrl,
        storage_copy_error: storageCopyError,
      },
    })

    return json({
      ok: true,
      jobId,
      status: nextStatus,
      klingStatus: providerStatus,
      sourceVideoUrl: persistedSourceVideoUrl,
      finalVideoUrl: getOptionalString(job.final_video_url),
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
