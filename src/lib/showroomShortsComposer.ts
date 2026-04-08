import { supabase } from '@/lib/supabase'
import { markShowroomShortsTargetsReady, type ShowroomShortsJobRecord } from '@/lib/showroomShorts'

const SHOWROOM_SHORTS_VIDEO_BUCKET = 'showroom-shorts-videos'
const SHOWROOM_SHORTS_BGM_URL = '/assets/bgm/bright-lines-new-light-sample-b-24-34.mp3'
const CANVAS_WIDTH = 720
const CANVAS_HEIGHT = 1280
const VIDEO_WIDTH = 720
const VIDEO_HEIGHT = 700
const VIDEO_Y = 290
const FPS = 30
const TOP_HEADLINE = '잠시 후, 이 공간은\n완전히 달라집니다'
const BADGE_TEXT = '실제사진 기반 Before & After'
const BOTTOM_QUESTION = '뭐가 가장 달라보이시나요?\n댓글로 알려주세요'
const BOTTOM_CTA = '자세한 구성은 파인드가구 온라인 쇼룸에서 확인하세요'
const FONT_STACK = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif'
const GANA_FONT_FAMILY = 'GanaChocolate'
const GANA_FONT_URL = 'https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_20-04@1.0/ghanachoco.woff'
const TOP_FADE_DURATION_SEC = 0.45
const CTA_APPEAR_AT_SEC = 5
const CTA_FADE_DURATION_SEC = 0.6
const BEFORE_LABEL_VISIBLE_SEC = 1.6
const AFTER_LABEL_VISIBLE_SEC = 1.6
const QUESTION_LINE_HEIGHT = 56
const CTA_Y = 1170
const BADGE_X = CANVAS_WIDTH - 28
const BADGE_Y = VIDEO_Y + VIDEO_HEIGHT - 36
const BGM_VOLUME = 0.24
const BGM_FADE_IN_SEC = 0.8
const BGM_FADE_OUT_SEC = 1.1
const END_ZOOM_DURATION_SEC = 2
const END_ZOOM_SCALE = 1.04
const FFMPEG_CORE_BASE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd'

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function easeOutCubic(value: number) {
  const x = clamp01(value)
  return 1 - Math.pow(1 - x, 3)
}

function pickRecorderMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return candidates.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? ''
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000)
}

function sanitizeFilenameSegment(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const explicitLines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (explicitLines.length > 1) {
    const startY = y - ((explicitLines.length - 1) * lineHeight) / 2
    explicitLines.forEach((line, index) => {
      ctx.fillText(line, x, startY + index * lineHeight)
    })
    return
  }

  const words = text.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word
    if (ctx.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine
      continue
    }
    if (currentLine) lines.push(currentLine)
    currentLine = word
  }
  if (currentLine) lines.push(currentLine)

  const startY = y - ((lines.length - 1) * lineHeight) / 2
  lines.forEach((line, index) => {
    ctx.fillText(line, x, startY + index * lineHeight)
  })
}

function drawVideoCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dWidth: number,
  dHeight: number,
  zoom = 1
) {
  const sourceWidth = video.videoWidth || 1
  const sourceHeight = video.videoHeight || 1
  const sourceAspectRatio = sourceWidth / sourceHeight
  const targetAspectRatio = dWidth / dHeight

  let sx = 0
  let sy = 0
  let sWidth = sourceWidth
  let sHeight = sourceHeight

  if (sourceAspectRatio > targetAspectRatio) {
    sWidth = sourceHeight * targetAspectRatio
    sx = (sourceWidth - sWidth) / 2
  } else if (sourceAspectRatio < targetAspectRatio) {
    sHeight = sourceWidth / targetAspectRatio
    sy = (sourceHeight - sHeight) / 2
  }

  if (zoom > 1) {
    const zoomedWidth = sWidth / zoom
    const zoomedHeight = sHeight / zoom
    sx += (sWidth - zoomedWidth) / 2
    sy += (sHeight - zoomedHeight) / 2
    sWidth = zoomedWidth
    sHeight = zoomedHeight
  }

  ctx.drawImage(video, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
}

function drawVideoCornerLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  alpha: number
) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = `700 22px ${FONT_STACK}`
  const width = ctx.measureText(label).width + 28
  ctx.fillStyle = 'rgba(10, 10, 12, 0.68)'
  drawRoundedRect(ctx, x, y, width, 42, 12)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + width / 2, y + 22)
  ctx.restore()
}

async function ensureGanaChocolateFont() {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const existingFonts = Array.from(document.fonts).some((fontFace) => fontFace.family === GANA_FONT_FAMILY)
  if (existingFonts) {
    await document.fonts.load(`700 62px "${GANA_FONT_FAMILY}"`)
    return
  }

  const fontFace = new FontFace(GANA_FONT_FAMILY, `url(${GANA_FONT_URL})`)
  await fontFace.load()
  document.fonts.add(fontFace)
  await document.fonts.load(`700 62px "${GANA_FONT_FAMILY}"`)
}

async function waitForMediaLoaded(media: HTMLMediaElement, errorMessage: string) {
  if (media.readyState >= 1) return

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error(errorMessage))
    }
    const cleanup = () => {
      media.removeEventListener('loadedmetadata', onLoaded)
      media.removeEventListener('error', onError)
    }
    media.addEventListener('loadedmetadata', onLoaded)
    media.addEventListener('error', onError)
  })
}

function getBgmGain(currentTime: number, duration: number) {
  const fadeIn = clamp01(currentTime / BGM_FADE_IN_SEC)
  const fadeOutStart = Math.max(duration - BGM_FADE_OUT_SEC, 0)
  const fadeOut = currentTime < fadeOutStart
    ? 1
    : 1 - clamp01((currentTime - fadeOutStart) / BGM_FADE_OUT_SEC)

  return BGM_VOLUME * Math.min(fadeIn, fadeOut)
}

function drawCompositeFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const currentTime = video.currentTime || 0
  const duration = video.duration || 10
  const topAlpha = easeOutCubic(currentTime / TOP_FADE_DURATION_SEC)
  const ctaAlpha = easeOutCubic((currentTime - CTA_APPEAR_AT_SEC) / CTA_FADE_DURATION_SEC)
  const beforeAlpha = 1 - easeOutCubic((currentTime - BEFORE_LABEL_VISIBLE_SEC + 0.25) / 0.35)
  const afterAlpha = easeOutCubic((currentTime - (duration - AFTER_LABEL_VISIBLE_SEC)) / 0.35)
  const endZoomProgress = easeOutCubic((currentTime - (duration - END_ZOOM_DURATION_SEC)) / END_ZOOM_DURATION_SEC)
  const endZoomScale = 1 + (END_ZOOM_SCALE - 1) * endZoomProgress

  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const videoX = (CANVAS_WIDTH - VIDEO_WIDTH) / 2
  drawVideoCover(ctx, video, videoX, VIDEO_Y, VIDEO_WIDTH, VIDEO_HEIGHT, endZoomScale)
  drawVideoCornerLabel(ctx, 'Before', videoX + 22, VIDEO_Y + 22, beforeAlpha)
  drawVideoCornerLabel(ctx, 'After', videoX + VIDEO_WIDTH - 118, VIDEO_Y + 22, afterAlpha)

  ctx.save()
  ctx.globalAlpha = topAlpha
  ctx.fillStyle = '#2ef2ff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(46, 242, 255, 0.42)'
  ctx.shadowBlur = 18
  ctx.font = `700 62px "${GANA_FONT_FAMILY}", ${FONT_STACK}`
  drawCenteredText(ctx, TOP_HEADLINE, CANVAS_WIDTH / 2, 150, CANVAS_WIDTH - 110, 78)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)'
  ctx.font = `700 21px ${FONT_STACK}`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.48)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 2
  ctx.fillText(BADGE_TEXT, BADGE_X, BADGE_Y)
  ctx.restore()

  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.font = `900 44px ${FONT_STACK}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawCenteredText(ctx, BOTTOM_QUESTION, CANVAS_WIDTH / 2, 1088, CANVAS_WIDTH - 80, QUESTION_LINE_HEIGHT)
  ctx.restore()

  if (ctaAlpha > 0) {
    ctx.save()
    ctx.globalAlpha = ctaAlpha
    ctx.fillStyle = '#ffd84f'
    ctx.font = `700 21px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    drawCenteredText(ctx, BOTTOM_CTA, CANVAS_WIDTH / 2, CTA_Y + (1 - ctaAlpha) * 18, CANVAS_WIDTH - 90, 30)
    ctx.restore()
  }
}

async function renderShowroomShortsComposite(sourceVideoUrl: string) {
  const mimeType = pickRecorderMimeType()
  if (!mimeType) {
    throw new Error('현재 브라우저가 합성 결과 비디오 저장을 지원하지 않습니다.')
  }

  await ensureGanaChocolateFont()

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('합성 캔버스를 초기화하지 못했습니다.')
  }

  const video = document.createElement('video')
  video.src = sourceVideoUrl
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const bgm = document.createElement('audio')
  bgm.src = SHOWROOM_SHORTS_BGM_URL
  bgm.crossOrigin = 'anonymous'
  bgm.preload = 'auto'
  bgm.loop = false
  bgm.muted = false

  await Promise.all([
    waitForMediaLoaded(video, '원본 영상을 불러오지 못했습니다.'),
    waitForMediaLoaded(bgm, '선택한 배경 음악을 불러오지 못했습니다.'),
  ])

  const audioContext = new AudioContext()
  const destination = audioContext.createMediaStreamDestination()
  const bgmSource = audioContext.createMediaElementSource(bgm)
  const bgmGain = audioContext.createGain()
  bgmGain.gain.value = 0
  bgmSource.connect(bgmGain)
  bgmGain.connect(destination)

  const stream = canvas.captureStream(FPS)
  destination.stream.getAudioTracks().forEach((track) => {
    stream.addTrack(track)
  })

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  })

  const chunks: BlobPart[] = []
  const composedBlobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    })
    recorder.addEventListener('stop', () => {
      const blob = new Blob(chunks, { type: mimeType })
      if (!blob.size) {
        reject(new Error('합성 결과 비디오가 비어 있습니다.'))
        return
      }
      resolve(blob)
    })
    recorder.addEventListener('error', () => {
      reject(new Error('합성 비디오 녹화에 실패했습니다.'))
    })
  })

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    if (recorder.state !== 'inactive') recorder.stop()
    stream.getTracks().forEach((track) => track.stop())
    video.pause()
    bgm.pause()
    void audioContext.close()
  }

  recorder.start(250)
  await audioContext.resume()
  bgm.currentTime = 0
  await Promise.all([video.play(), bgm.play()])

  await new Promise<void>((resolve) => {
    const tick = () => {
      drawCompositeFrame(ctx, video)
      bgmGain.gain.value = getBgmGain(video.currentTime || 0, video.duration || 10)
      if (video.ended || video.currentTime >= Math.max((video.duration || 0) - 0.05, 0)) {
        finish()
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    video.addEventListener(
      'ended',
      () => {
        finish()
        resolve()
      },
      { once: true }
    )
    requestAnimationFrame(tick)
  })

  return composedBlobPromise
}

let ffmpegLoadPromise: Promise<import('@ffmpeg/ffmpeg').FFmpeg> | null = null

async function getBrowserFfmpeg() {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])
      const ffmpeg = new FFmpeg()
      const coreURL = await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, 'text/javascript')
      const wasmURL = await toBlobURL(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, 'application/wasm')
      await ffmpeg.load({ coreURL, wasmURL })
      return ffmpeg
    })().catch((error) => {
      ffmpegLoadPromise = null
      throw error
    })
  }
  return ffmpegLoadPromise
}

async function transcodeToMp4(input: Blob | string) {
  const ffmpeg = await getBrowserFfmpeg()
  const [{ fetchFile }] = await Promise.all([import('@ffmpeg/util')])
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const inputName = `input-${token}.webm`
  const outputName = `output-${token}.mp4`
  const ffmpegLogs: string[] = []
  const handleLog = ({ message }: { message: string }) => {
    if (!message) return
    ffmpegLogs.push(message)
    if (ffmpegLogs.length > 30) ffmpegLogs.shift()
  }

  try {
    ffmpeg.on('log', handleLog)
    await ffmpeg.writeFile(inputName, await fetchFile(input))
    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-c:v',
      'mpeg4',
      '-q:v',
      '5',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-c:a',
      'aac',
      '-b:a',
      '160k',
      outputName,
    ], 180_000)

    if (exitCode !== 0) {
      const details = ffmpegLogs.slice(-5).join(' | ')
      throw new Error(details ? `MP4 변환에 실패했습니다. (code: ${exitCode}) ${details}` : `MP4 변환에 실패했습니다. (code: ${exitCode})`)
    }

    const outputData = await ffmpeg.readFile(outputName)
    if (!(outputData instanceof Uint8Array) || outputData.byteLength === 0) {
      throw new Error('MP4 변환 결과가 비어 있습니다.')
    }

    return new Blob([outputData], { type: 'video/mp4' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MP4 변환에 실패했습니다.'
    throw new Error(message)
  } finally {
    ffmpeg.off('log', handleLog)
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(outputName),
    ])
  }
}

export async function downloadShowroomShortsFinalAsMp4(finalVideoUrl: string, filenameBase = 'showroom-shorts-final') {
  const trimmedUrl = finalVideoUrl.trim()
  if (!trimmedUrl) {
    throw new Error('최종 영상 URL이 없어 MP4 다운로드를 진행할 수 없습니다.')
  }

  const safeName = sanitizeFilenameSegment(filenameBase) || 'showroom-shorts-final'

  if (/\.mp4($|\?)/i.test(trimmedUrl)) {
    const response = await fetch(trimmedUrl)
    if (!response.ok) {
      throw new Error(`최종 MP4 파일 다운로드에 실패했습니다. (${response.status})`)
    }
    const mp4Blob = await response.blob()
    downloadBlob(mp4Blob, `${safeName}.mp4`)
    return
  }

  const mp4Blob = await transcodeToMp4(trimmedUrl)
  downloadBlob(mp4Blob, `${safeName}.mp4`)
}

async function insertComposeLog(jobId: string, stage: string, message: string, payload?: Record<string, unknown>) {
  await supabase.from('showroom_shorts_logs').insert({
    shorts_job_id: jobId,
    stage,
    message,
    payload: payload ?? {},
  })
}

export async function composeShowroomShortsJob(job: ShowroomShortsJobRecord) {
  if (!job.source_video_url) {
    throw new Error('원본 영상이 없어 합성을 시작할 수 없습니다.')
  }

  await insertComposeLog(job.id, 'composition_requested', '브라우저에서 9:16 합성을 시작했습니다.', {
    source_video_url: job.source_video_url,
  })

  try {
    const composedBlob = await renderShowroomShortsComposite(job.source_video_url)
    await insertComposeLog(job.id, 'composition_transcoding', '합성본을 MP4로 변환하고 있습니다.')
    const mp4Blob = await transcodeToMp4(composedBlob)
    const objectPath = `final/${job.id}/shorts-final-${Date.now()}.mp4`
    const { error: uploadError } = await supabase.storage
      .from(SHOWROOM_SHORTS_VIDEO_BUCKET)
      .upload(objectPath, mp4Blob, {
        contentType: 'video/mp4',
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`합성본 업로드에 실패했습니다: ${uploadError.message}`)
    }

    const finalVideoUrl = supabase.storage.from(SHOWROOM_SHORTS_VIDEO_BUCKET).getPublicUrl(objectPath).data.publicUrl
    const nowIso = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('showroom_shorts_jobs')
      .update({
        status: 'ready_for_review',
        final_video_url: finalVideoUrl,
        updated_at: nowIso,
      })
      .eq('id', job.id)

    if (updateError) {
      throw new Error(`합성 상태 저장에 실패했습니다: ${updateError.message}`)
    }

    await markShowroomShortsTargetsReady(job.id)

    await insertComposeLog(job.id, 'composition_completed', '9:16 합성본을 생성하고 검수 준비 상태로 전환했습니다.', {
      final_video_url: finalVideoUrl,
      storage_path: objectPath,
    })

    return {
      finalVideoUrl,
      message: '9:16 합성이 완료되었습니다. 최종 영상 검수 후 퍼블리시를 진행하세요.',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '9:16 합성에 실패했습니다.'
    await insertComposeLog(job.id, 'composition_failed_detail', message)
    await insertComposeLog(job.id, 'composition_failed', message)
    throw error
  }
}
