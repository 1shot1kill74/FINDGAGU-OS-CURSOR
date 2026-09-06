import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import {
  getReplicateModel,
  pollReplicateVideo,
  submitReplicateVideo,
} from "../_shared/replicateVideo.ts"

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

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405)

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = getString(body?.action) || "create"
    const model = getReplicateModel()

    if (action === "poll") {
      const taskId = getString(body?.taskId)
      if (!taskId) return json({ ok: false, message: "taskId required" }, 400)

      const polled = await pollReplicateVideo(taskId)
      return json({
        ok: polled.ok,
        action: "poll",
        taskId,
        status: polled.mappedStatus,
        videoUrl: polled.videoUrl,
        upstreamStatus: polled.status,
        raw: polled.raw ?? { text: polled.rawText.slice(0, 2000) },
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

    if (!imageUrl || !prompt) {
      return json({ ok: false, message: "imageUrl and prompt required" }, 400)
    }

    const created = await submitReplicateVideo({
      promptText: prompt,
      negativePrompt,
      startImageUrl: imageUrl,
      endImageUrl: imageTailUrl || null,
      durationSeconds: duration,
      aspectRatio,
      mode,
    })

    if (!created.ok) {
      return json({
        ok: false,
        action: "create",
        upstreamStatus: created.status,
        message: created.message,
        raw: created.raw ?? { text: created.rawText.slice(0, 2000) },
        model,
      }, created.status >= 400 ? created.status : 502)
    }

    return json({
      ok: true,
      action: "create",
      taskId: created.taskId,
      model: created.model,
      request: {
        aspectRatio,
        duration,
        hasTail: Boolean(imageTailUrl),
      },
    })
  } catch (error) {
    return json({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
