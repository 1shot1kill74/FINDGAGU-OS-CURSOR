import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import {
  KLING_EMPTY_ALIGN_SECONDS,
  KLING_EMPTY_INSTALL_SECONDS,
  KLING_SPLIT_SEGMENT_SECONDS,
  SHOWROOM_SHORTS_ALIGN_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_ALIGN_PROMPT,
  SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_DEMOLISH_PROMPT,
  SHOWROOM_SHORTS_EMPTY_INSTALL_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_EMPTY_INSTALL_PROMPT,
  SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT,
  SHOWROOM_SHORTS_INSTALL_PROMPT,
  isEmptyRoomTimelapsePrompt,
} from "../_shared/klingSplitPrompts.ts"
import {
  encodeSplitState,
  isAlignInstallSplit,
  isDemoInstallSplit,
  parseSplitState,
} from "../_shared/klingSplitState.ts"
import {
  getReplicateModel,
  submitReplicateVideo,
} from "../_shared/replicateVideo.ts"

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

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : ""
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
    const modelName = getReplicateModel()

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

    const aspectRatio = getString(job.source_aspect_ratio) || "16:9"
    const emptyRoom = isEmptyRoomTimelapsePrompt(getString(job.prompt_text))
    const requestedPhase = getString(body?.phase)
    const phase = requestedPhase || (emptyRoom ? "align" : "demolish")
    // 10초 1방이면 후반 설치가 무너짐 → 분할(철거/구도 + 설치)
    const useSplit = Number(job.duration_seconds ?? 10) >= 10

    if (useSplit && phase === "install") {
      const existing = parseSplitState(job.kling_job_id)
      if (!existing) {
        return json({
          ok: false,
          message: emptyRoom
            ? "구도 맞춤 세그먼트 상태가 없습니다. 먼저 구도 맞춤 생성을 실행하세요."
            : "철거 세그먼트 상태가 없습니다. 먼저 철거 생성을 실행하세요.",
        }, 400)
      }
      const firstTaskId = isAlignInstallSplit(existing)
        ? existing.align.taskId
        : isDemoInstallSplit(existing)
          ? existing.demo.taskId
          : ""
      if (!firstTaskId) {
        return json({ ok: false, message: "첫 세그먼트 상태가 없습니다." }, 400)
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
        return json({
          ok: false,
          message: emptyRoom
            ? "설치 시작 이미지(구도 맞춤 마지막 프레임) URL이 필요합니다."
            : "설치 시작 이미지(철거 마지막 프레임) URL이 필요합니다.",
        }, 400)
      }

      const emptyInstall = emptyRoom || isAlignInstallSplit(existing)
      const installSeconds = emptyInstall
        ? (existing.install.duration || KLING_EMPTY_INSTALL_SECONDS)
        : (existing.install.duration || KLING_SPLIT_SEGMENT_SECONDS)
      const installResult = await submitReplicateVideo({
        startImageUrl,
        endImageUrl: afterUrl,
        promptText: emptyInstall
          ? SHOWROOM_SHORTS_EMPTY_INSTALL_PROMPT
          : SHOWROOM_SHORTS_INSTALL_PROMPT,
        negativePrompt: emptyInstall
          ? SHOWROOM_SHORTS_EMPTY_INSTALL_NEGATIVE_PROMPT
          : SHOWROOM_SHORTS_INSTALL_NEGATIVE_PROMPT,
        durationSeconds: installSeconds,
        aspectRatio,
      })

      if (!installResult.ok) {
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
          stage: "video_request_failed",
          message: `설치 ${installSeconds}초 생성 요청 실패 (${installResult.status})`,
          payload: {
            install: installResult.raw ?? { rawText: installResult.rawText },
            start_image_url: startImageUrl,
            model_name: modelName,
            empty_room: emptyInstall,
          },
        })
        return json({
          ok: false,
          provider: "replicate",
          upstreamStatus: installResult.status,
          message: installResult.message,
        })
      }

      const firstStatus = isAlignInstallSplit(existing)
        ? (existing.align.status || "succeed")
        : (existing.demo.status || "succeed")
      const splitState = encodeSplitState({
        ...existing,
        startFrameUrl: startImageUrl,
        install: {
          taskId: installResult.taskId,
          status: "submitted",
          url: null,
          duration: installSeconds,
        },
      })
      const statusPrefix = isAlignInstallSplit(existing) ? "align" : "demo"

      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status: "generating",
          kling_status: `${statusPrefix}:${firstStatus}|install:submitted`,
          kling_job_id: splitState,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await insertLog(supabase, {
        jobId,
        stage: "video_requested_install",
        message: emptyInstall
          ? `구도 맞춤 마지막 프레임을 시작으로 설치 ${installSeconds}초 생성을 요청했습니다.`
          : `철거 마지막 프레임을 시작으로 설치 ${installSeconds}초 생성을 요청했습니다.`,
        payload: {
          install_task_id: installResult.taskId,
          start_image_url: startImageUrl,
          first_task_id: firstTaskId,
          segment_seconds: installSeconds,
          empty_room: emptyInstall,
          model_name: installResult.model,
        },
      })

      return json({
        ok: true,
        jobId,
        status: "generating",
        split: true,
        phase: "install",
        installTaskId: installResult.taskId,
        message: `설치 ${installSeconds}초 생성을 시작했습니다. 완료되면 앞 세그먼트와 이어붙입니다.`,
      })
    }

    if (useSplit) {
      // 빈 방: 기존 워커 호환을 위해 mode는 demo/install 구조를 쓰되, 프롬프트·길이만 구도맞춤/설치로 바꾼다.
      const firstSeconds = emptyRoom ? KLING_EMPTY_ALIGN_SECONDS : KLING_SPLIT_SEGMENT_SECONDS
      const secondSeconds = emptyRoom ? KLING_EMPTY_INSTALL_SECONDS : KLING_SPLIT_SEGMENT_SECONDS
      const firstResult = await submitReplicateVideo({
        startImageUrl: beforeUrl,
        endImageUrl: null,
        promptText: emptyRoom ? SHOWROOM_SHORTS_ALIGN_PROMPT : SHOWROOM_SHORTS_DEMOLISH_PROMPT,
        negativePrompt: emptyRoom
          ? SHOWROOM_SHORTS_ALIGN_NEGATIVE_PROMPT
          : SHOWROOM_SHORTS_DEMOLISH_NEGATIVE_PROMPT,
        durationSeconds: firstSeconds,
        aspectRatio,
      })

      if (!firstResult.ok) {
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
          stage: "video_request_failed",
          message: emptyRoom
            ? `구도 맞춤 ${firstSeconds}초 생성 요청 실패 (${firstResult.status})`
            : `철거 5초 생성 요청 실패 (${firstResult.status})`,
          payload: {
            first: firstResult.raw ?? { rawText: firstResult.rawText },
            model_name: modelName,
            empty_room: emptyRoom,
          },
        })
        return json({
          ok: false,
          provider: "replicate",
          upstreamStatus: firstResult.status,
          message: firstResult.message,
        })
      }

      const splitState = encodeSplitState({
        mode: "split_demo_install_v1",
        startFrameUrl: null,
        demo: {
          taskId: firstResult.taskId,
          status: "submitted",
          url: null,
          duration: firstSeconds,
        },
        install: {
          taskId: "",
          status: "pending",
          url: null,
          duration: secondSeconds,
        },
      })

      await supabase
        .from("showroom_shorts_jobs")
        .update({
          status: "generating",
          kling_status: "demo:submitted|install:pending",
          kling_job_id: splitState,
          source_video_url: null,
          duration_seconds: firstSeconds + secondSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      await insertLog(supabase, {
        jobId,
        stage: emptyRoom ? "video_requested_align" : "video_requested_demolish",
        message: emptyRoom
          ? `빈 방 구도 맞춤 ${firstSeconds}초를 먼저 요청했습니다. 완료 후 마지막 프레임으로 설치 ${secondSeconds}초를 시작합니다.`
          : "철거 5초 생성을 먼저 요청했습니다. 완료 후 마지막 프레임으로 설치를 시작합니다.",
        payload: {
          demo_task_id: firstResult.taskId,
          first_seconds: firstSeconds,
          install_seconds: secondSeconds,
          empty_room: emptyRoom,
          model_name: firstResult.model,
        },
      })

      return json({
        ok: true,
        jobId,
        status: "generating",
        klingTaskId: firstResult.taskId,
        split: true,
        phase: emptyRoom ? "align" : "demolish",
        demoTaskId: firstResult.taskId,
        message: emptyRoom
          ? `구도 맞춤 ${firstSeconds}초 생성을 시작했습니다. 끝나면 설치 ${secondSeconds}초를 만듭니다.`
          : "철거 5초 생성을 시작했습니다. 끝나면 마지막 프레임으로 설치 5초를 만듭니다.",
      })
    }

    const single = await submitReplicateVideo({
      startImageUrl: beforeUrl,
      endImageUrl: afterUrl,
      promptText: getString(job.prompt_text),
      negativePrompt: SHOWROOM_SHORTS_COMMON_NEGATIVE_PROMPT,
      durationSeconds: Number(job.duration_seconds ?? 10),
      aspectRatio,
    })

    if (!single.ok) {
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
        stage: "video_request_failed",
        message: `원본 생성 요청 실패 (${single.status})`,
        payload: {
          ...(single.raw ?? { rawText: single.rawText }),
          model_name: modelName,
        },
      })
      return json({
        ok: false,
        provider: "replicate",
        upstreamStatus: single.status,
        message: single.message,
      })
    }

    await supabase
      .from("showroom_shorts_jobs")
      .update({
        status: "generating",
        kling_status: "submitted",
        kling_job_id: single.taskId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)

    await insertLog(supabase, {
      jobId,
      stage: "video_requested",
      message: "원본 영상 생성 작업을 요청했습니다.",
      payload: {
        ...(single.raw ?? {}),
        model_name: single.model,
      },
    })

    return json({
      ok: true,
      jobId,
      status: "generating",
      klingTaskId: single.taskId,
      message: "원본 생성 요청을 전달했습니다.",
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : "showroom-shorts-create 실행 중 오류가 발생했습니다.",
    }, 500)
  }
})
