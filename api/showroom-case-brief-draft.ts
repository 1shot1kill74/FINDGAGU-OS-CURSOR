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

type BriefImageInput = {
  id: string
  role?: 'before' | 'after' | null
  url: string
  summaryLine?: string | null
}

type GeminiPart = {
  text?: string
  thought?: boolean
  thoughtSignature?: string
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

function isAllowedAdminEmail(email: string | undefined) {
  const configured = getEnv('SHOWROOM_CASE_CONTENT_ALLOWED_EMAILS', false)
  if (!configured) return true
  const allowed = configured
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return Boolean(email && allowed.includes(email.trim().toLowerCase()))
}

async function assertAuthenticatedInternalUser(req: RequestLike) {
  const token = getBearerToken(req)
  if (!token) {
    return { ok: false as const, status: 401, message: '로그인이 필요합니다.' }
  }

  const supabase = createClient(getEnv('VITE_SUPABASE_URL'), getEnv('VITE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { ok: false as const, status: 401, message: '유효하지 않은 로그인 세션입니다.' }
  }
  if (!isAllowedAdminEmail(data.user.email)) {
    return { ok: false as const, status: 403, message: '콘텐츠 생성 권한이 없습니다.' }
  }
  return { ok: true as const, userEmail: data.user.email ?? null }
}

/** Cloudinary 등 경로에 한글이 있으면 fetch 전에 퍼센트 인코딩 */
function encodeFetchUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl)
    parsed.pathname = parsed.pathname
      .split('/')
      .map((segment) => {
        if (!segment) return segment
        try {
          return encodeURIComponent(decodeURIComponent(segment))
        } catch {
          return encodeURIComponent(segment)
        }
      })
      .join('/')
    return parsed.toString()
  } catch {
    return rawUrl
  }
}

async function urlToInlinePart(url: string) {
  const res = await fetch(encodeFetchUrl(url))
  if (!res.ok) throw new Error(`이미지 다운로드 실패: ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/jpeg'
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength > 4_000_000) throw new Error('이미지 용량이 너무 큽니다.')
  return {
    inlineData: {
      mimeType: contentType.split(';')[0] || 'image/jpeg',
      data: buf.toString('base64'),
    },
  }
}

function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function collectModelText(parts: GeminiPart[] | undefined) {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text || '')
    .join('\n')
    .trim()
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function readBriefField(parsed: Record<string, unknown> | null, camel: string, snake: string) {
  if (!parsed) return ''
  return asString(parsed[camel]) || asString(parsed[snake])
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
    const auth = await assertAuthenticatedInternalUser(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as {
      siteName?: string
      displayName?: string
      industry?: string
      images?: BriefImageInput[]
    }

    const siteName = asString(body.siteName)
    const displayName = asString(body.displayName) || siteName
    const industry = asString(body.industry)
    // 비전+사고 토큰 폭주 방지: 최대 4장
    const images = (Array.isArray(body.images) ? body.images : [])
      .filter((item) => item && typeof item.url === 'string' && item.url.trim())
      .slice(0, 4)

    if (!siteName) {
      res.status(400).json({ ok: false, message: 'siteName이 필요합니다.' })
      return
    }
    if (images.length < 1) {
      res.status(400).json({ ok: false, message: '분석할 이미지가 1장 이상 필요합니다.' })
      return
    }

    const apiKey = getEnv('GOOGLE_GEMINI_API_KEY', false) || getEnv('VITE_GOOGLE_GEMINI_API_KEY', false)
    if (!apiKey) {
      res.status(503).json({ ok: false, message: 'GOOGLE_GEMINI_API_KEY 미설정' })
      return
    }

    const parts: Array<Record<string, unknown>> = [
      {
        text: `당신은 교육·업무 가구 Before/After 현장 브리프 작성 보조입니다.
아래 사진과 메타를 보고 Case Studio용 브리프 초안을 JSON으로만 작성하세요.

목적:
- 사람이 검토·수정한 뒤 블로그 생성에 쓸 "문제/해결" 초안을 만듭니다.
- 사진에 보이지 않는 사실(예산, 발주 사유, 고객 발언, 수치)은 단정하지 마세요.
- 확신 없으면 추정임을 드러내고 uncertainClaims에 넣으세요.

메타:
- 현장명(내부): ${siteName}
- 공개명: ${displayName}
- 업종: ${industry || '미상'}

출력 JSON 스키마(키 고정):
{
  "problemDetail": "현장 핵심 문제/과제 2~5문장, 사실·관찰 중심",
  "solutionDetail": "적용된 해결/구성 2~5문장, 보이는 제품·배치 변화 중심",
  "headlineHook": "한 줄 훅(질문형 또는 긴장형, 40자 내외)",
  "evidencePoints": ["변화 근거 포인트", "..."],
  "confidence": "high|medium|low",
  "notes": "초안 근거 한 줄",
  "uncertainClaims": ["사진만으로 불확실한 추정"]
}

규칙:
- 한국어
- 마케팅 과장·추측 금지
- 제품명이 메타/요약에 있으면 활용, 없으면 일반 표현
- evidencePoints는 0~4개
- JSON만 출력`,
      },
    ]

    for (const image of images) {
      const role =
        image.role === 'before' || image.role === 'after' ? image.role : 'unknown'
      parts.push({
        text: `image id=${image.id} role=${role} summary=${asString(image.summaryLine) || '(없음)'}`,
      })
      parts.push(await urlToInlinePart(image.url))
    }

    const model = process.env.GOOGLE_GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const geminiRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.2,
          // 3.5 Flash 기본 thinking이 maxOutputTokens를 선점해 JSON이 잘리던 문제 방지
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    })

    const geminiJson = (await geminiRes.json()) as {
      candidates?: Array<{
        finishReason?: string
        content?: { parts?: GeminiPart[] }
      }>
      error?: { message?: string }
    }

    if (!geminiRes.ok) {
      res.status(502).json({
        ok: false,
        message: geminiJson.error?.message || `Gemini HTTP ${geminiRes.status}`,
      })
      return
    }

    const candidate = geminiJson.candidates?.[0]
    const text = collectModelText(candidate?.content?.parts)
    const parsed = extractJson(text)
    const problemDetail = readBriefField(parsed, 'problemDetail', 'problem_detail')
    const solutionDetail = readBriefField(parsed, 'solutionDetail', 'solution_detail')
    if (!problemDetail || !solutionDetail) {
      const finishReason = candidate?.finishReason || 'UNKNOWN'
      res.status(422).json({
        ok: false,
        message:
          finishReason === 'MAX_TOKENS'
            ? '모델 출력이 중간에 잘렸습니다. 잠시 후 다시 시도해 주세요.'
            : '모델이 유효한 브리프 초안을 반환하지 않았습니다.',
        finishReason,
        preview: text.slice(0, 240),
      })
      return
    }

    const confidenceRaw =
      asString(parsed?.confidence) || asString(parsed?.Confidence)
    const confidence =
      confidenceRaw === 'high' || confidenceRaw === 'medium' || confidenceRaw === 'low'
        ? confidenceRaw
        : 'medium'

    res.status(200).json({
      ok: true,
      problemDetail,
      solutionDetail,
      headlineHook: readBriefField(parsed, 'headlineHook', 'headline_hook'),
      evidencePoints: asStringArray(
        parsed?.evidencePoints ?? parsed?.evidence_points,
      ).slice(0, 4),
      confidence,
      notes: readBriefField(parsed, 'notes', 'notes') || '비전 모델 브리프 초안',
      uncertainClaims: asStringArray(
        parsed?.uncertainClaims ?? parsed?.uncertain_claims,
      ).slice(0, 6),
      imageCount: images.length,
      requestedBy: auth.userEmail,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '브리프 초안 생성 실패',
    })
  }
}
