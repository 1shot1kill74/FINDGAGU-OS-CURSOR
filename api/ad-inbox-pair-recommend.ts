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

type Candidate = {
  id: string
  role?: 'before' | 'after' | null
  url: string
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
  return { ok: true as const, user: data.user }
}

async function urlToInlinePart(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  // Gemini 입력 용량 보호 — 대략 4MB 초과면 스킵
  if (buf.byteLength > 4_000_000) throw new Error('이미지 용량이 너무 큽니다.')
  return {
    inlineData: {
      mimeType: contentType.split(';')[0] || 'image/jpeg',
      data: buf.toString('base64'),
    },
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0]) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

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
      batchLabel?: string
      candidates?: Candidate[]
    }
    const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 8) : []
    if (candidates.length < 2) {
      res.status(400).json({ ok: false, message: '후보 사진이 2장 이상 필요합니다.' })
      return
    }

    const apiKey = getEnv('GOOGLE_GEMINI_API_KEY', false) || getEnv('VITE_GOOGLE_GEMINI_API_KEY', false)
    if (!apiKey) {
      res.status(503).json({ ok: false, message: 'GOOGLE_GEMINI_API_KEY 미설정' })
      return
    }

    const parts: Array<Record<string, unknown>> = [
      {
        text: `당신은 사무공간/인테리어 Before-After 페어 추천기입니다.
같은 현장 후보 사진 목록이 주어집니다. 타임랩스 광고에 쓸 Before 1장 + After 1장을 고르세요.

규칙:
- Before = 공사 전·비어 있거나 낡은 상태
- After = 가구 배치·시공 완료 상태
- 서로 다른 id여야 함
- 확신이 낮으면 confidence를 low로
- JSON만 출력: {"beforeId":"...","afterId":"...","confidence":"high|medium|low","reason":"한국어 한 줄"}

배치: ${body.batchLabel || ''}
후보 id 목록: ${candidates.map((c) => c.id).join(', ')}`,
      },
    ]

    for (const c of candidates) {
      parts.push({ text: `candidate id=${c.id} existingRole=${c.role ?? 'unset'}` })
      parts.push(await urlToInlinePart(c.url))
    }

    const model = process.env.GOOGLE_GEMINI_MODEL?.trim() || 'gemini-2.0-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
      }),
    })

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      error?: { message?: string }
    }

    if (!geminiRes.ok) {
      res.status(502).json({
        ok: false,
        message: geminiJson.error?.message || `Gemini HTTP ${geminiRes.status}`,
      })
      return
    }

    const text = geminiJson.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || ''
    const parsed = extractJson(text)
    const beforeId = typeof parsed?.beforeId === 'string' ? parsed.beforeId : ''
    const afterId = typeof parsed?.afterId === 'string' ? parsed.afterId : ''
    const idSet = new Set(candidates.map((c) => c.id))
    if (!beforeId || !afterId || !idSet.has(beforeId) || !idSet.has(afterId) || beforeId === afterId) {
      res.status(422).json({ ok: false, message: '모델이 유효한 페어를 반환하지 않았습니다.' })
      return
    }

    const confidence =
      parsed?.confidence === 'high' || parsed?.confidence === 'medium' || parsed?.confidence === 'low'
        ? parsed.confidence
        : 'medium'

    res.status(200).json({
      ok: true,
      beforeId,
      afterId,
      confidence,
      reason: typeof parsed?.reason === 'string' ? parsed.reason : '비전 모델 추천',
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '추천 실패',
    })
  }
}
