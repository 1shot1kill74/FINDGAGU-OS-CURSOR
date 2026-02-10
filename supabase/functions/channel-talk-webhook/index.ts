/**
 * 채널톡 웹훅 — 현재 수신 중인 v4(구형) 명세 대응.
 * - type: "message" (v5는 ch.webhook.chat.user_message). 허용: message, chat.opened, chat.user_message
 * - 메시지: payload.entity.plainText (v4). v5는 entity.lastMessage.plainText
 * - plainText에서 정규식으로 핸드폰 번호 추출 → contact, 없으면 '번호 미등록'
 * - 처리 이벤트 1건당 consultations 1행 + consultation_messages 1행 Insert
 *
 * 배포: npx supabase functions deploy channel-talk-webhook --no-verify-jwt
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-channel-signature, x-cannel-signature",
}

// 현재 수신되는 v4 구조에 맞는 허용 타입 (실제 type: "message" 로 들어옴)
const ALLOWED_TYPES = ["message", "chat.opened", "chat.user_message"]

/** 메시지 본문(plainText)에서 핸드폰 번호 추출 — 한국 휴대/지역번호 정규식 */
function extractPhoneFromText(text: string): string | null {
  const m = (text || "").match(/01[0-9]-?\d{3,4}-?\d{4}|02-?\d{3,4}-?\d{4}|0\d{1,2}-?\d{3,4}-?\d{4}/)
  if (!m) return null
  const digits = m[0].replace(/\D/g, "")
  if (digits.length >= 9) return m[0].trim()
  return null
}

/** display_name: [YYMM] (채널톡) [뒷4자리]. contact가 '번호 미등록'이면 0000 */
function buildInitialDisplayName(contact: string, refDate: Date): string {
  const yymm = `${refDate.getFullYear().toString().slice(-2)}${String(refDate.getMonth() + 1).padStart(2, "0")}`
  const digits = (contact || "").replace(/\D/g, "")
  const last4 = digits.slice(-4) || "0000"
  return `${yymm} (채널톡) ${last4}`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  try {
    const rawBody = await req.text()
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr)
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    const payload = body

    console.log("전체 데이터 구조:", JSON.stringify(payload))

    const eventType = payload.type as string | undefined
    console.log("추출된 eventType:", eventType)

    if (!ALLOWED_TYPES.includes(eventType ?? "")) {
      console.info(`스킵: '${eventType}' 아님 push`)
      return new Response("Skipped", {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/plain" },
      })
    }

    const entity = payload.entity as Record<string, unknown> | undefined
    const refers = payload.refers as Record<string, unknown> | undefined
    const user = refers?.user as Record<string, unknown> | undefined
    const userName = (user?.name != null ? String(user.name) : "") || "알 수 없음"

    const messageText =
      (entity?.plainText != null ? String(entity.plainText) : "") ||
      (entity?.lastMessage != null && typeof entity.lastMessage === "object"
        ? String((entity.lastMessage as Record<string, unknown>).plainText ?? "")
        : "") ||
      ""
    const plainText = messageText.trim()
    console.log(`✅ 처리 완료 - [${userName}]: ${messageText}`)

    const chatId = entity?.id != null ? String(entity.id) : undefined

    const contact = extractPhoneFromText(plainText) ?? "번호 미등록"
    const now = new Date()
    const displayName = buildInitialDisplayName(contact, now)

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!serviceRoleKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY 없음")
      return new Response(JSON.stringify({ error: "Server config missing" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const metadata: Record<string, unknown> = {
      source: "채널톡",
      display_name: displayName,
      pain_point: plainText.slice(0, 500),
      ...(chatId && { channel_chat_id: chatId }),
    }

    const insertPayload = {
      company_name: "(채널톡)",
      manager_name: userName,
      contact,
      status: "상담중",
      expected_revenue: null,
      is_test: false,
      is_visible: true,
      metadata,
    }

    const { data: consultation, error: consultErr } = await supabase
      .from("consultations")
      .insert(insertPayload)
      .select("id")
      .single()

    if (consultErr || !consultation?.id) {
      console.error("consultations insert 실패:", consultErr)
      return new Response(
        JSON.stringify({
          error: "Consultation insert failed",
          detail: (consultErr as Error)?.message,
        }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const consultationId = consultation.id as string

    await supabase.from("consultation_messages").insert({
      consultation_id: consultationId,
      sender_id: "channel_user",
      content: plainText || "(내용 없음)",
      message_type: "USER",
      metadata: { type: "channel_talk_incoming" },
    })

    console.log("consultations insert 성공:", { consultationId, contact })
    return new Response(
      JSON.stringify({ ok: true, consultationId }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    )
  } catch (e) {
    console.error("Edge function error:", e)
    return new Response(
      JSON.stringify({ error: "Internal error", detail: (e as Error)?.message ?? String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    )
  }
})
