/**
 * Lyria 3 Clip으로 숏츠 BGM을 뽑는다.
 * 사용: node --env-file=.env scripts/generate-lyria-bgm.mjs
 * 덮어쓰기: --force
 * 한 곡만: --only=bright-acoustic
 *
 * 최종 영상은 약 14초(오프닝 스틸 + 원본 10초 + 홀드).
 * 워커는 파일 앞부분을 쓰므로 20초로 자르고, 14초 안에서 루프가 없게 만든다.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const CLIP_SECONDS = 20

const SHAPE = `20-second instrumental underscore for a before-after renovation short. The video is about 14 seconds; only the first 20 seconds of this track are used, and it must not loop.
[0:00 - 0:02] OPENING STILLS: slower, sparse, restrained, half-energy. The old space. No beat drop yet.
[0:02 - 0:14] REVEAL AND TIMELAPSE: clear tempo lift, brighter, more percussion and motion. Covers the full remaining video. Not a trailer hit, not an EDM drop.
[0:14 - 0:20] HOLD: continue the reveal energy, no hard stop, no restart, no new section.
Instrumental only, no vocals, no lyrics, no humming, no choir, no speech.`

const SHAPE_MOVING = `20-second instrumental underscore for a before-after renovation short. The video is about 14 seconds; only the first 20 seconds of this track are used, and it must not loop.
Important: the first 2 seconds MUST already have a clear audible beat/pulse. Do not start ambient, rubato, or ballad-slow.
[0:00 - 0:02] OPENING STILLS: mid-tempo groove around 96-100 BPM, restrained but already moving.
[0:02 - 0:14] REVEAL AND TIMELAPSE: tempo lift to about 114-118 BPM, brighter, more percussion. Not a trailer hit, not an EDM drop.
[0:14 - 0:20] HOLD: continue the reveal energy, no hard stop, no restart, no new section.
Instrumental only, no vocals, no lyrics, no humming, no choir, no speech.`

const TRACKS = [
  {
    n: 1,
    id: 'bright-acoustic',
    prompt: `${SHAPE_MOVING}
Color: acoustic guitar with light percussion, original composition. Opening = already strumming with a clear pulse, not fingerpicked-slow, not ballad. Reveal = fuller strums, shaker and soft kick ~116 BPM, G major. Warm hopeful renovation. No famous riffs.`,
  },
  {
    n: 2,
    id: 'soft-piano',
    prompt: `${SHAPE_MOVING}
Color: felt piano with brushed drums and muted bass, original composition. Opening = mid-tempo groove already present, not sparse left-hand ballad. Reveal = brighter right-hand figures and stronger brushes ~108 BPM, D major. Intimate modern interior. No vocals.`,
  },
  {
    n: 3,
    id: 'rhodes-soul',
    prompt: `${SHAPE_MOVING}
Color: warm electric piano and muted bass, original composition. Opening = pocket already present. Reveal = brighter keys and rim clicks. Cozy interior. No famous songs.`,
  },
  {
    n: 4,
    id: 'warm-house',
    prompt: `${SHAPE}
Color: warm deep house. Opening = muted pads, half-time, almost no kick. Reveal = full groove 118 BPM, soft synth stabs, tasteful not clubby.`,
  },
  {
    n: 5,
    id: 'ambient-pads',
    prompt: `${SHAPE}
Color: analog drone and electric piano. Opening = open fifths, 66 BPM feel. Reveal = a clearer pulse around 90 BPM, still documentary, original composition, no pop melody.`,
  },
  {
    n: 6,
    id: 'handpan-pulse',
    prompt: `${SHAPE_MOVING}
Color: handpan and light frame drum, original composition. Opening = steady ostinato, already rhythmic. Reveal = fuller interlocking pattern. Not new-age cliché.`,
  },
  {
    n: 7,
    id: 'delay-electric',
    prompt: `${SHAPE_MOVING}
Color: clean electric guitar with analog delay, original composition. Opening = delayed-guitar pulse already moving. Reveal = brighter arpeggio and light kick. Contemporary loft. No distortion solo, no famous riffs.`,
  },
  {
    n: 8,
    id: 'analog-synth',
    prompt: `${SHAPE}
Color: analog synth. Opening = slow arpeggio, no kick. Reveal = double-time arp and soft kick ~114 BPM. Contemporary kitchen, retro-modern, no EDM drop.`,
  },
  {
    n: 9,
    id: 'mallet-hope',
    prompt: `${SHAPE_MOVING}
Color: marimba and light percussion, original composition. Opening = already a clear mallet ostinato, not sparse. Reveal = brighter faster pattern and soft shaker. F major, adult, not cartoon.`,
  },
  {
    n: 10,
    id: 'nylon-bossa',
    prompt: `${SHAPE}
Color: nylon-string guitar. Opening = rubato, quiet. Reveal = bossa nova groove with light brushes ~118 BPM. Stylish living room. No vocals, no Portuguese lyrics.`,
  },
]

const MODEL = 'lyria-3-clip-preview'
const OUT_DIR = path.resolve('worker/assets/bgm')
const API_KEY = process.env.GOOGLE_GEMINI_API_KEY?.trim()
if (!API_KEY) {
  console.error('GOOGLE_GEMINI_API_KEY 가 없습니다. --env-file=.env 로 실행하세요.')
  process.exit(1)
}

const onlyId = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length)
const selected = onlyId ? TRACKS.filter((track) => track.id === onlyId) : TRACKS
if (onlyId && selected.length === 0) {
  console.error(`알 수 없는 id: ${onlyId}`)
  process.exit(1)
}

function extractAudio(body) {
  const parts = body?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      return {
        mime: inline.mimeType || inline.mime_type || 'audio/mp3',
        buffer: Buffer.from(inline.data, 'base64'),
      }
    }
  }
  return null
}

async function generateTrack(track) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: track.prompt }] }],
    }),
  })
  const raw = await response.text()
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    throw new Error(`JSON 아님 HTTP ${response.status}: ${raw.slice(0, 400)}`)
  }
  if (!response.ok) {
    const message = body?.error?.message || raw.slice(0, 400)
    throw new Error(`HTTP ${response.status}: ${message}`)
  }
  const audio = extractAudio(body)
  if (!audio) {
    const text = body?.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text
    throw new Error(`오디오 없음. ${text ? `텍스트: ${text.slice(0, 200)}` : JSON.stringify(body).slice(0, 400)}`)
  }
  return audio
}

await fs.mkdir(OUT_DIR, { recursive: true })

const results = []
for (const [index, track] of selected.entries()) {
  const filename = `lyria-${String(track.n).padStart(2, '0')}-${track.id}.mp3`
  const outPath = path.join(OUT_DIR, filename)
  process.stdout.write(`[${index + 1}/${selected.length}] ${track.id} … `)
  try {
    if (!process.argv.includes('--force')) {
      try {
        const stat = await fs.stat(outPath)
        if (stat.size > 10_000) {
          console.log(`이미 있음 (${Math.round(stat.size / 1024)}KB)`)
          results.push({ id: track.id, file: filename, bytes: stat.size, ok: true, skipped: true })
          continue
        }
      } catch {
        // 없음
      }
    }
    const audio = await generateTrack(track)
    const rawPath = `${outPath}.raw.mp3`
    await fs.writeFile(rawPath, audio.buffer)
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      rawPath,
      '-t',
      String(CLIP_SECONDS),
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outPath,
    ])
    await fs.unlink(rawPath)
    const stat = await fs.stat(outPath)
    console.log(`${Math.round(stat.size / 1024)}KB / ${CLIP_SECONDS}s → ${filename}`)
    results.push({ id: track.id, file: filename, bytes: stat.size, ok: true })
  } catch (error) {
    console.log('실패')
    console.error(`  ${error instanceof Error ? error.message : error}`)
    results.push({ id: track.id, file: filename, ok: false, error: String(error) })
  }
  if (index < selected.length - 1) await new Promise((resolve) => setTimeout(resolve, 4000))
}

const ok = results.filter((row) => row.ok).length
console.log(`\n완료 ${ok}/${results.length}`)
if (ok === 0) process.exit(1)
if (results.some((row) => !row.ok)) process.exit(1)
