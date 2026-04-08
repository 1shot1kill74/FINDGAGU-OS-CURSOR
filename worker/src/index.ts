import express, { type Request, type Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

type JsonRecord = Record<string, unknown>

type ShowroomShortsJobRow = {
  id: string
  status: string
  source_video_url: string | null
  final_video_url: string | null
  duration_seconds: number | null
}

type ActiveJobState = {
  status: 'queued' | 'processing' | 'completed' | 'failed'
  updatedAt: string
  error?: string | null
}

const app = express()
app.use(express.json({ limit: '1mb' }))

const PORT = Number(process.env.PORT || 8080)
const VIDEO_BUCKET = 'showroom-shorts-videos'
const OUTPUT_WIDTH = 720
const OUTPUT_HEIGHT = 1280
const VIDEO_WIDTH = 720
const VIDEO_HEIGHT = 700
const VIDEO_Y = 290
const DEFAULT_DURATION_SECONDS = 10
const WORKER_TOKEN = process.env.SHOWROOM_SHORTS_WORKER_TOKEN?.trim() || ''
const DEFAULT_BGM_URL =
  'https://findgagu-os-cursor.vercel.app/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3'
const BGM_URL = process.env.SHOWROOM_SHORTS_BGM_URL?.trim() || DEFAULT_BGM_URL
const FONT_FILE =
  process.env.SHOWROOM_SHORTS_FONT_FILE?.trim() ||
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
const SUPABASE_URL = getEnv('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const activeJobs = new Map<string, ActiveJobState>()
const queuedJobs: string[] = []
let queueRunning = false

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'showroom-shorts-worker',
    queueDepth: queuedJobs.length,
    activeJobs: Array.from(activeJobs.entries()).map(([jobId, state]) => ({
      jobId,
      ...state,
    })),
  })
})

app.post('/jobs/compose', requireWorkerAuth, async (req, res) => {
  const jobId = getString(req.body?.jobId)
  if (!jobId) {
    res.status(400).json({ ok: false, message: 'jobId가 필요합니다.' })
    return
  }

  try {
    const job = await getJob(jobId)
    if (!job) {
      res.status(404).json({ ok: false, message: '숏츠 작업을 찾지 못했습니다.' })
      return
    }

    if (!job.source_video_url) {
      res.status(400).json({ ok: false, message: '원본 영상이 없어 서버 합성을 시작할 수 없습니다.' })
      return
    }

    const existingState = activeJobs.get(jobId)
    if (existingState?.status === 'queued' || existingState?.status === 'processing') {
      res.status(202).json({
        ok: true,
        jobId,
        status: existingState.status,
        message: existingState.status === 'processing' ? '이미 서버 합성이 진행 중입니다.' : '이미 합성 대기열에 있습니다.',
      })
      return
    }

    if (existingState?.status === 'failed' || existingState?.status === 'completed') {
      activeJobs.delete(jobId)
    }

    await updateJob(jobId, {
      status: 'composition_queued',
      final_video_url: null,
      updated_at: new Date().toISOString(),
    })
    await insertLog(jobId, 'composition_queued', 'Railway 워커 합성 대기열에 등록했습니다.')

    activeJobs.set(jobId, {
      status: 'queued',
      updatedAt: new Date().toISOString(),
      error: null,
    })
    queuedJobs.push(jobId)
    void drainQueue()

    res.status(202).json({
      ok: true,
      jobId,
      status: 'queued',
      message: 'Railway 워커 합성 요청을 등록했습니다.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '합성 요청 처리 중 오류가 발생했습니다.'
    res.status(500).json({ ok: false, message })
  }
})

app.get('/jobs/:id', requireWorkerAuth, async (req, res) => {
  const jobId = getString(req.params.id)
  if (!jobId) {
    res.status(400).json({ ok: false, message: 'jobId가 필요합니다.' })
    return
  }

  try {
    const job = await getJob(jobId)
    if (!job) {
      res.status(404).json({ ok: false, message: '숏츠 작업을 찾지 못했습니다.' })
      return
    }

    const state = activeJobs.get(jobId)
    const responseStatus = state?.status ?? mapWorkerStatus(job.status, job.final_video_url)
    res.json({
      ok: true,
      jobId,
      status: responseStatus,
      jobStatus: job.status,
      sourceVideoUrl: job.source_video_url,
      finalVideoUrl: job.final_video_url,
      error: state?.error ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '합성 상태 조회 중 오류가 발생했습니다.'
    res.status(500).json({ ok: false, message })
  }
})

app.listen(PORT, () => {
  console.log(`[showroom-shorts-worker] listening on ${PORT}`)
})

function getEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  }
  return value
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function requireWorkerAuth(req: Request, res: Response, next: () => void) {
  if (!WORKER_TOKEN) {
    next()
    return
  }

  const authHeader = req.header('authorization') || ''
  const expected = `Bearer ${WORKER_TOKEN}`
  if (authHeader !== expected) {
    res.status(401).json({ ok: false, message: '워커 인증에 실패했습니다.' })
    return
  }
  next()
}

async function drainQueue() {
  if (queueRunning) return
  queueRunning = true

  try {
    while (queuedJobs.length > 0) {
      const nextJobId = queuedJobs.shift()
      if (!nextJobId) continue
      await processComposeJob(nextJobId)
    }
  } finally {
    queueRunning = false
  }
}

async function processComposeJob(jobId: string) {
  const updateActiveState = (state: ActiveJobState) => {
    activeJobs.set(jobId, state)
  }

  updateActiveState({
    status: 'processing',
    updatedAt: new Date().toISOString(),
    error: null,
  })

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `showroom-shorts-${jobId}-`))

  try {
    await updateJob(jobId, {
      status: 'composition_processing',
      updated_at: new Date().toISOString(),
    })
    await insertLog(jobId, 'composition_processing', 'Railway 워커에서 서버 합성을 시작했습니다.')

    const job = await getJob(jobId)
    if (!job?.source_video_url) {
      throw new Error('원본 영상 URL이 없어 서버 합성을 진행할 수 없습니다.')
    }

    const inputVideoPath = path.join(tempDir, 'source-video.mp4')
    const bgmAudioPath = path.join(tempDir, 'bgm-audio')
    const outputVideoPath = path.join(tempDir, 'final-video.mp4')

    await downloadToFile(job.source_video_url, inputVideoPath)
    const bgmPath = BGM_URL ? await downloadBgmToFile(BGM_URL, bgmAudioPath) : null
    const durationSeconds = await getVideoDurationSeconds(inputVideoPath, job.duration_seconds ?? DEFAULT_DURATION_SECONDS)
    const textPaths = await writeTextAssets(tempDir)

    await runFfmpegCompose({
      inputVideoPath,
      bgmPath,
      outputVideoPath,
      durationSeconds,
      textPaths,
    })

    const objectPath = `final/${jobId}/shorts-final-${Date.now()}.mp4`
    const videoBuffer = await fs.readFile(outputVideoPath)
    const { error: uploadError } = await supabase.storage.from(VIDEO_BUCKET).upload(objectPath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    })
    if (uploadError) {
      throw new Error(`최종 MP4 업로드에 실패했습니다: ${uploadError.message}`)
    }

    const finalVideoUrl = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(objectPath).data.publicUrl
    await updateJob(jobId, {
      status: 'ready_for_review',
      final_video_url: finalVideoUrl,
      updated_at: new Date().toISOString(),
    })
    await markTargetsReady(jobId)
    await insertLog(jobId, 'composition_completed', 'Railway 워커가 최종 MP4를 생성하고 검수 준비 상태로 전환했습니다.', {
      final_video_url: finalVideoUrl,
      storage_path: objectPath,
      bgm_enabled: Boolean(bgmPath),
    })

    updateActiveState({
      status: 'completed',
      updatedAt: new Date().toISOString(),
      error: null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '서버 합성 중 오류가 발생했습니다.'
    await updateJob(jobId, {
      status: 'failed',
      updated_at: new Date().toISOString(),
    }).catch(() => undefined)
    await insertLog(jobId, 'composition_failed', message).catch(() => undefined)
    updateActiveState({
      status: 'failed',
      updatedAt: new Date().toISOString(),
      error: message,
    })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    const finalState = activeJobs.get(jobId)
    if (finalState?.status === 'completed') {
      setTimeout(() => {
        const current = activeJobs.get(jobId)
        if (current?.status === 'completed') {
          activeJobs.delete(jobId)
        }
      }, 60_000)
    }
  }
}

async function getJob(jobId: string) {
  const { data, error } = await supabase
    .from('showroom_shorts_jobs')
    .select('id, status, source_video_url, final_video_url, duration_seconds')
    .eq('id', jobId)
    .single<ShowroomShortsJobRow>()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

async function updateJob(jobId: string, patch: JsonRecord) {
  const { error } = await supabase.from('showroom_shorts_jobs').update(patch).eq('id', jobId)
  if (error) {
    throw new Error(error.message)
  }
}

async function insertLog(jobId: string, stage: string, message: string, payload: JsonRecord = {}) {
  const { error } = await supabase.from('showroom_shorts_logs').insert({
    shorts_job_id: jobId,
    stage,
    message,
    payload,
  })
  if (error) {
    throw new Error(error.message)
  }
}

async function markTargetsReady(jobId: string) {
  const nowIso = new Date().toISOString()
  const { data: targets, error } = await supabase
    .from('showroom_shorts_targets')
    .update({
      publish_status: 'ready',
      updated_at: nowIso,
    })
    .eq('shorts_job_id', jobId)
    .in('publish_status', ['draft', 'failed'])
    .select('id, channel')

  if (error) {
    throw new Error(error.message)
  }

  for (const target of targets ?? []) {
    await insertLog(jobId, 'publish_ready', '업로드 준비가 완료되었습니다.', {
      channel: target.channel,
      target_id: target.id,
    })
  }
}

async function downloadToFile(url: string, destinationPath: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`파일 다운로드에 실패했습니다. (${response.status})`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destinationPath, buffer)
}

async function downloadBgmToFile(url: string, destinationBasePath: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`BGM 다운로드에 실패했습니다. (${response.status})`)
  }

  const contentType = response.headers.get('content-type') || ''
  const extension = inferAudioExtension(contentType, url)
  const destinationPath = `${destinationBasePath}.${extension}`
  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(destinationPath, buffer)
  return destinationPath
}

function inferAudioExtension(contentType: string, url: string) {
  if (contentType.includes('mpeg')) return 'mp3'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('aac')) return 'aac'
  if (contentType.includes('ogg')) return 'ogg'
  const urlMatch = url.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)
  return urlMatch?.[1]?.toLowerCase() || 'mp3'
}

async function getVideoDurationSeconds(filePath: string, fallbackSeconds: number) {
  const result = await runCommand('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const parsed = Number(result.stdout.trim())
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackSeconds
  }
  return parsed
}

async function writeTextAssets(tempDir: string) {
  const assets = {
    top: '잠시 후, 이 공간은\n완전히 달라집니다',
    badge: '실제사진 기반 Before & After',
    question: '뭐가 가장 달라보이시나요?\n댓글로 알려주세요',
    cta: '자세한 구성은 파인드가구 온라인 쇼룸에서 확인하세요',
    before: 'Before',
    after: 'After',
  }

  const entries = await Promise.all(
    Object.entries(assets).map(async ([key, value]) => {
      const filePath = path.join(tempDir, `${key}.txt`)
      await fs.writeFile(filePath, value, 'utf8')
      return [key, filePath] as const
    })
  )

  return Object.fromEntries(entries) as Record<keyof typeof assets, string>
}

async function runFfmpegCompose(input: {
  inputVideoPath: string
  bgmPath: string | null
  outputVideoPath: string
  durationSeconds: number
  textPaths: Record<'top' | 'badge' | 'question' | 'cta' | 'before' | 'after', string>
}) {
  const filterComplex = buildFilterComplex(input.durationSeconds, input.textPaths)
  const args = ['-y', '-i', input.inputVideoPath]

  if (input.bgmPath) {
    args.push('-i', input.bgmPath)
  } else {
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=48000`)
  }

  args.push(
    '-filter_complex',
    filterComplex,
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-shortest',
    input.outputVideoPath
  )

  await runCommand('ffmpeg', args)
}

function buildFilterComplex(
  durationSeconds: number,
  textPaths: Record<'top' | 'badge' | 'question' | 'cta' | 'before' | 'after', string>
) {
  const safeDuration = Math.max(durationSeconds, DEFAULT_DURATION_SECONDS)
  const zoomStart = Math.max(safeDuration - 2, 0)
  const escape = escapeFilterValue
  const beforeEnable = escapeExpression('lte(t,1.6)')
  const afterEnable = escapeExpression(`gte(t,${formatSeconds(Math.max(safeDuration - 1.6, 0))})`)
  const ctaEnable = escapeExpression('gte(t,5)')
  const zoomExpr = escapeExpression(
    `if(gte(t,${formatSeconds(zoomStart)}),1+(0.04*((t-${formatSeconds(zoomStart)})/2)),1)`
  )
  const cropWidth = `${VIDEO_WIDTH}/${zoomExpr}`
  const cropHeight = `${VIDEO_HEIGHT}/${zoomExpr}`

  return [
    `color=c=black:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${formatSeconds(safeDuration)}[bg]`,
    `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${cropWidth}:${cropHeight}:(in_w-out_w)/2:(in_h-out_h)/2,scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT},setsar=1[clip]`,
    `[bg][clip]overlay=0:${VIDEO_Y}[stage0]`,
    `[stage0]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.top)}':fontcolor=0x2ef2ff:fontsize=62:line_spacing=16:shadowcolor=black@0.45:shadowx=0:shadowy=2:x=(w-text_w)/2:y=90[stage1]`,
    `[stage1]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.badge)}':fontcolor=white:fontsize=21:shadowcolor=black@0.45:shadowx=0:shadowy=2:x=w-text_w-28:y=${VIDEO_Y + VIDEO_HEIGHT - 60}[stage2]`,
    `[stage2]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.question)}':fontcolor=white:fontsize=42:line_spacing=12:shadowcolor=black@0.45:shadowx=0:shadowy=2:x=(w-text_w)/2:y=1038[stage3]`,
    `[stage3]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.cta)}':fontcolor=0xffd84f:fontsize=21:line_spacing=8:shadowcolor=black@0.35:shadowx=0:shadowy=2:x=(w-text_w)/2:y=1150:enable='${ctaEnable}'[stage4]`,
    `[stage4]drawbox=x=22:y=${VIDEO_Y + 22}:w=116:h=42:color=black@0.68:t=fill:enable='${beforeEnable}'[stage5]`,
    `[stage5]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.before)}':fontcolor=white:fontsize=22:x=44:y=${VIDEO_Y + 31}:enable='${beforeEnable}'[stage6]`,
    `[stage6]drawbox=x=582:y=${VIDEO_Y + 22}:w=116:h=42:color=black@0.68:t=fill:enable='${afterEnable}'[stage7]`,
    `[stage7]drawtext=fontfile='${escape(FONT_FILE)}':textfile='${escape(textPaths.after)}':fontcolor=white:fontsize=22:x=613:y=${VIDEO_Y + 31}:enable='${afterEnable}'[vout]`,
    inputAudioFilter(safeDuration),
  ].join(';')
}

function inputAudioFilter(durationSeconds: number) {
  const fadeOutStart = Math.max(durationSeconds - 1.1, 0)
  return `[1:a]atrim=0:${formatSeconds(durationSeconds)},asetpts=N/SR/TB,volume=0.24,afade=t=in:st=0:d=0.8,afade=t=out:st=${formatSeconds(fadeOutStart)}:d=1.1[aout]`
}

function formatSeconds(value: number) {
  return value.toFixed(3)
}

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function escapeExpression(value: string) {
  return value.replace(/,/g, '\\,')
}

async function runCommand(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      reject(error)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error([`${command} 실행에 실패했습니다.`, stderr.trim()].filter(Boolean).join(' ')))
    })
  })
}

function mapWorkerStatus(jobStatus: string, finalVideoUrl: string | null) {
  if (jobStatus === 'composition_queued') return 'queued'
  if (jobStatus === 'composition_processing') return 'processing'
  if (jobStatus === 'ready_for_review' && finalVideoUrl) return 'completed'
  if (jobStatus === 'failed') return 'failed'
  return 'idle'
}

process.on('unhandledRejection', (error) => {
  console.error('[showroom-shorts-worker] unhandledRejection', error)
})

process.on('uncaughtException', (error) => {
  console.error('[showroom-shorts-worker] uncaughtException', error)
})
