import { createClient } from '@supabase/supabase-js'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  return value
}

function readHeader(req: RequestLike, name: string) {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function getBearerToken(req: RequestLike) {
  const authorization = readHeader(req, 'authorization')
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

async function assertUser(req: RequestLike) {
  const token = getBearerToken(req)
  if (!token) return { ok: false as const, status: 401, message: '로그인이 필요합니다.' }
  const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return { ok: false as const, status: 401, message: '유효하지 않은 세션입니다.' }
  return { ok: true as const }
}

async function fetchImageAsBase64(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`원본 이미지 다운로드 실패: ${res.status}`)
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0] || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > 8_000_000) throw new Error('이미지 용량이 너무 큽니다(8MB 초과).')
  return { mimeType: contentType, base64: buf.toString('base64'), byteLength: buf.byteLength }
}

function extractInlineImage(geminiJson: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>
}): { mimeType: string; data: string } | null {
  const parts = geminiJson.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    if (part.inlineData?.data) {
      return {
        mimeType: part.inlineData.mimeType || 'image/png',
        data: part.inlineData.data,
      }
    }
  }
  return null
}

async function uploadToCloudinary(mimeType: string, base64: string) {
  const cloud = getEnv('VITE_CLOUDINARY_CLOUD_NAME')
  const preset = getEnv('VITE_CLOUDINARY_UPLOAD_PRESET')
  const endpoint = `https://api.cloudinary.com/v1_1/${cloud}/image/upload`
  const body = new URLSearchParams()
  body.set('file', `data:${mimeType};base64,${base64}`)
  body.set('upload_preset', preset)
  body.set('folder', 'ad-inbox-cleanup')

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const json = (await res.json()) as {
    secure_url?: string
    public_id?: string
    error?: { message?: string }
  }
  if (!res.ok || !json.secure_url || !json.public_id) {
    throw new Error(json.error?.message || `Cloudinary 업로드 실패: ${res.status}`)
  }

  const thumb = `https://res.cloudinary.com/${cloud}/image/upload/c_limit,w_800,f_auto,q_auto/${json.public_id}`
  return {
    cloudinary_url: json.secure_url,
    thumbnail_url: thumb,
    public_id: json.public_id,
  }
}

const CLEANUP_PROMPT = `Edit this interior/construction site photo.
Remove ALL people, human figures, faces, bodies, and any identifiable persons completely.
Fill the removed areas naturally so the room looks empty of people — match floor, walls, desks, chairs, lighting, and perspective.
Do NOT change the furniture layout, architecture, camera angle, or overall scene.
Keep it photorealistic and suitable for a Before renovation photo.
Output the edited image only.`

export default async function handler(req: RequestLike, res: ResponseLike) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'POST only' })
    return
  }

  try {
    const auth = await assertUser(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      imageUrl?: string
      prompt?: string
      /** text-first는 지시 준수에 유리 (Before 합성 등) */
      promptFirst?: boolean
      model?: string
      temperature?: number
    }
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
    if (!imageUrl) {
      res.status(400).json({ ok: false, message: 'imageUrl이 필요합니다.' })
      return
    }

    const apiKey = getEnv('GOOGLE_GEMINI_API_KEY', false) || getEnv('VITE_GOOGLE_GEMINI_API_KEY', false)
    if (!apiKey) {
      res.status(503).json({ ok: false, message: 'GOOGLE_GEMINI_API_KEY 미설정' })
      return
    }

    const source = await fetchImageAsBase64(imageUrl)
    // Before 합성·사람 제거용. 2.5 flash-image는 구조(문/창) 환각이 잦아 3.1로 기본 전환.
    const model =
      (typeof body.model === 'string' && body.model.trim()) ||
      process.env.GOOGLE_GEMINI_IMAGE_MODEL?.trim() ||
      'gemini-3.1-flash-image'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const promptText =
      typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim() : CLEANUP_PROMPT
    const imagePart = { inlineData: { mimeType: source.mimeType, data: source.base64 } }
    const textPart = { text: promptText }
    const promptFirst = body.promptFirst === true
    const temperature =
      typeof body.temperature === 'number' && Number.isFinite(body.temperature)
        ? Math.min(1, Math.max(0, body.temperature))
        : 0.15

    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: promptFirst ? [textPart, imagePart] : [imagePart, textPart],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          temperature,
        },
      }),
    })

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> } }>
      error?: { message?: string }
    }

    if (!geminiRes.ok) {
      // snake_case fallback for older API response shape
      const altEndpoint = endpoint
      void altEndpoint
      res.status(502).json({
        ok: false,
        message: geminiJson.error?.message || `Gemini HTTP ${geminiRes.status}`,
        model,
      })
      return
    }

    let image = extractInlineImage(geminiJson)
    if (!image) {
      // Some responses use snake_case inline_data
      const parts = (geminiJson.candidates?.[0]?.content?.parts ?? []) as Array<Record<string, unknown>>
      for (const part of parts) {
        const inline = part.inline_data as { mime_type?: string; data?: string } | undefined
        if (inline?.data) {
          image = { mimeType: inline.mime_type || 'image/png', data: inline.data }
          break
        }
      }
    }

    if (!image) {
      res.status(422).json({ ok: false, message: '모델이 보정 이미지를 반환하지 않았습니다.', model })
      return
    }

    const uploaded = await uploadToCloudinary(image.mimeType, image.data)
    res.status(200).json({
      ok: true,
      model,
      ...uploaded,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '보정 실패',
    })
  }
}
