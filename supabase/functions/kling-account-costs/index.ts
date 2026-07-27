import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

type JsonRecord = Record<string, unknown>

const DEFAULT_KLING_API_BASE_URL = 'https://api.klingai.com'
const FALLBACK_KLING_API_BASE_URL = 'https://api-beijing.klingai.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getEnv(name: string, required = true) {
  const value = Deno.env.get(name)?.trim()
  if (!value && required) throw new Error(`${name} is not set`)
  return value || ''
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlEncodeJson(input: unknown) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(input)))
}

async function createKlingJwt(accessKey: string, secretKey: string) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, iat: now, nbf: now - 5, exp: now + 1800 }
  const message = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message))
  return `${message}.${base64UrlEncodeBytes(new Uint8Array(signature))}`
}

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('', { status: 204 })

    const now = Date.now()
    const startTime = now - 400 * 24 * 60 * 60 * 1000
    const endTime = now + 400 * 24 * 60 * 60 * 1000
    const accessKey = getEnv('KLING_ACCESS_KEY')
    const secretKey = getEnv('KLING_SECRET_KEY')
    const preferredBase = getEnv('KLING_API_BASE_URL', false) || DEFAULT_KLING_API_BASE_URL
    const bases = [...new Set([preferredBase, DEFAULT_KLING_API_BASE_URL, FALLBACK_KLING_API_BASE_URL])]
    const token = await createKlingJwt(accessKey, secretKey)

    for (const base of bases) {
      const endpoint = `${base.replace(/\/$/, '')}/account/costs?start_time=${startTime}&end_time=${endTime}`
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })
      const body = (await response.json().catch(() => null)) as JsonRecord | null
      if (!response.ok || !body) continue

      const data = (body.data && typeof body.data === 'object' ? body.data : body) as JsonRecord
      const packsRaw = Array.isArray(data.resource_pack_subscribe_infos)
        ? data.resource_pack_subscribe_infos
        : []

      const packs = packsRaw.map((pack) => {
        const row = pack as JsonRecord
        const total = Number(row.total_quantity ?? 0)
        const remaining = Number(row.remaining_quantity ?? 0)
        return {
          name: String(row.resource_pack_name ?? ''),
          status: String(row.status ?? ''),
          total_quantity: total,
          remaining_quantity: remaining,
          used_quantity: Number.isFinite(total) && Number.isFinite(remaining) ? total - remaining : null,
          purchase_time: row.purchase_time ?? null,
          effective_time: row.effective_time ?? null,
          invalid_time: row.invalid_time ?? null,
        }
      })

      const remainingUsable = packs
        .filter((pack) => pack.status.toLowerCase() === 'online')
        .reduce((sum, pack) => sum + (Number(pack.remaining_quantity) || 0), 0)

      return json({
        ok: true,
        endpoint,
        note: 'Kling remaining_quantity can lag ~12 hours.',
        remaining_usable: remainingUsable,
        packs,
      })
    }

    return json({ ok: false, message: 'Failed to query Kling account costs' }, 502)
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})
