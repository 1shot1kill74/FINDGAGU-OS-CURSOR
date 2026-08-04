import { assertInternalAdmin } from './_internalAdminAuth'
import { buildGoogleAuthorizeUrl, createOAuthState } from './_youtubeAnalyticsAuth'

type RequestLike = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
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
    const auth = await assertInternalAdmin(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, message: auth.message })
      return
    }

    const state = createOAuthState(auth.user.id)
    const authorizeUrl = buildGoogleAuthorizeUrl(state)
    res.status(200).json({ ok: true, authorizeUrl })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : 'OAuth 시작 실패',
    })
  }
}
