import {
  adminShortsRedirect,
  decryptSecret,
  exchangeCodeForTokens,
  fetchMineChannel,
  loadOauthRow,
  upsertOauthConnection,
  verifyOAuthState,
} from '../server/youtubeAnalyticsAuth'

type RequestLike = {
  method?: string
  query: Record<string, string | string[] | undefined>
  headers: Record<string, string | string[] | undefined>
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function q(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function redirect(res: ResponseLike, location: string) {
  res.setHeader('Location', location)
  res.status(302).send('')
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json')
    res.status(405).json({ ok: false, message: 'GET only' })
    return
  }

  const errorParam = q(req.query.error)
  if (errorParam) {
    redirect(
      res,
      adminShortsRedirect({
        yt_analytics: 'error',
        message: q(req.query.error_description) || errorParam,
      }),
    )
    return
  }

  const code = q(req.query.code)
  const state = q(req.query.state)
  if (!code || !state) {
    redirect(res, adminShortsRedirect({ yt_analytics: 'error', message: 'code_or_state_missing' }))
    return
  }

  const verified = verifyOAuthState(state)
  if (!verified.ok) {
    redirect(res, adminShortsRedirect({ yt_analytics: 'error', message: verified.message }))
    return
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    const channel = await fetchMineChannel(tokens.accessToken)

    let refreshToken = tokens.refreshToken
    if (!refreshToken) {
      const existing = await loadOauthRow()
      if (existing?.refresh_token_enc) {
        refreshToken = decryptSecret(existing.refresh_token_enc)
      }
    }
    if (!refreshToken) {
      redirect(
        res,
        adminShortsRedirect({
          yt_analytics: 'error',
          message: 'refresh_token_missing_retry_consent',
        }),
      )
      return
    }

    await upsertOauthConnection({
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
      refreshToken,
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      connectedBy: verified.userId,
    })

    redirect(res, adminShortsRedirect({ yt_analytics: 'connected' }))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth_callback_failed'
    redirect(res, adminShortsRedirect({ yt_analytics: 'error', message: message.slice(0, 180) }))
  }
}
