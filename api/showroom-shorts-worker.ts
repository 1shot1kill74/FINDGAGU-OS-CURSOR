type RequestLike = {
  method?: string
  query: Record<string, string | string[] | undefined>
  body?: unknown
}

type ResponseLike = {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): void; send(body: string): void }
}

function getEnv(name: string, required = true) {
  const value = process.env[name]?.trim() || ''
  if (!value && required) {
    throw new Error(`${name} 환경 변수가 설정되지 않았습니다.`)
  }
  return value
}

function getString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

async function forwardToWorker(pathname: string, init?: RequestInit) {
  const workerUrl = getEnv('SHOWROOM_SHORTS_WORKER_URL')
  const workerToken = getEnv('SHOWROOM_SHORTS_WORKER_TOKEN', false)
  const response = await fetch(`${workerUrl.replace(/\/$/, '')}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const contentType = response.headers.get('content-type') || 'application/json'
  const payload = await response.text()
  return {
    status: response.status,
    contentType,
    payload,
  }
}

export default async function handler(req: RequestLike, res: ResponseLike) {
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET,POST,OPTIONS')
      res.status(200).send('ok')
      return
    }

    if (req.method === 'POST') {
      const jobId = getString((req.body as { jobId?: unknown } | null)?.jobId)
      if (!jobId) {
        res.status(400).json({ ok: false, message: 'jobId가 필요합니다.' })
        return
      }

      const workerResponse = await forwardToWorker('/jobs/compose', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
      })
      res.setHeader('Content-Type', workerResponse.contentType)
      res.status(workerResponse.status).send(workerResponse.payload)
      return
    }

    if (req.method === 'GET') {
      const jobId = getString(req.query.jobId)
      if (!jobId) {
        res.status(400).json({ ok: false, message: 'jobId가 필요합니다.' })
        return
      }

      const workerResponse = await forwardToWorker(`/jobs/${encodeURIComponent(jobId)}`, {
        method: 'GET',
      })
      res.setHeader('Content-Type', workerResponse.contentType)
      res.status(workerResponse.status).send(workerResponse.payload)
      return
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS')
    res.status(405).json({ ok: false, message: 'GET/POST 요청만 지원합니다.' })
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : '워커 프록시 요청 중 오류가 발생했습니다.',
    })
  }
}
