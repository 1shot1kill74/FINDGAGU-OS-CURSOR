type RequestLike = {
  method?: string
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
  res.status(200).json({
    ok: true,
    ping: true,
    hasClientId: Boolean(process.env.GOOGLE_YT_ANALYTICS_CLIENT_ID),
    hasEncKey: Boolean(process.env.YOUTUBE_ANALYTICS_TOKEN_ENC_KEY),
    hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasRedirect: Boolean(process.env.GOOGLE_YT_ANALYTICS_REDIRECT_URI),
  })
}
