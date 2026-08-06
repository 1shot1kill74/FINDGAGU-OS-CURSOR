/**
 * 쇼츠 발행 실패 Slack Incoming Webhook 알림.
 * SHOWROOM_SHORTS_SLACK_WEBHOOK_URL 이 없으면 no-op (ok: skipped).
 */

export type ShowroomShortsAlertInput = {
  reason: "failed" | "stale_timeout"
  channel: string
  title?: string | null
  targetId: string
  jobId?: string | null
  publishStatus: string
  errorSummary?: string | null
  sourceType?: "shorts" | "basic_shorts"
  action?: "prepare" | "launch" | string
}

const ADMIN_INBOX_URL = "https://os.findgagu.co.kr/admin/ad-inbox"

function getWebhookUrl() {
  return Deno.env.get("SHOWROOM_SHORTS_SLACK_WEBHOOK_URL")?.trim() || ""
}

function truncate(value: string, max = 400) {
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function buildShowroomShortsSlackText(input: ShowroomShortsAlertInput) {
  const reasonLabel =
    input.reason === "stale_timeout"
      ? "고임 타임아웃 (publishing/preparing)"
      : "발행 실패"
  const lines = [
    `*[쇼츠 발행]* ${reasonLabel}`,
    `• 채널: \`${input.channel || "?"}\``,
    `• 상태: \`${input.publishStatus}\``,
    input.title ? `• 제목: ${truncate(String(input.title), 120)}` : null,
    `• targetId: \`${input.targetId}\``,
    input.jobId ? `• jobId: \`${input.jobId}\`` : null,
    input.sourceType ? `• source: \`${input.sourceType}\`` : null,
    input.action ? `• action: \`${input.action}\`` : null,
    input.errorSummary
      ? `• 에러: ${truncate(String(input.errorSummary), 300)}`
      : null,
    `• 대기실: ${ADMIN_INBOX_URL}`,
  ].filter(Boolean)
  return lines.join("\n")
}

/** Slack Incoming Webhook POST. 실패해도 throw 하지 않음. */
export async function sendShowroomShortsSlackAlert(
  input: ShowroomShortsAlertInput,
): Promise<{ ok: boolean; skipped?: boolean; status?: number; message?: string }> {
  const webhookUrl = getWebhookUrl()
  if (!webhookUrl) {
    return { ok: true, skipped: true, message: "SHOWROOM_SHORTS_SLACK_WEBHOOK_URL not set" }
  }

  try {
    const text = buildShowroomShortsSlackText(input)
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        ok: false,
        status: response.status,
        message: truncate(body || `Slack webhook HTTP ${response.status}`, 200),
      }
    }
    return { ok: true, status: response.status }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Slack webhook request failed",
    }
  }
}
