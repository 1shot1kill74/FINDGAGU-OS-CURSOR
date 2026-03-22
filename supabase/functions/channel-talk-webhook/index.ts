/**
 * 채널톡 웹훅 — 상담카드 유지 방식 (대화 로그 저장 제거)
 * - chatId 기준 consultations Upsert: 있으면 유지(업데이트), 없으면 신규 생성
 * - 허용: message, chat.opened, chat.user_message
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

/** 메시지 본문에서 전화번호 추출 — 010 우선, 그 외 한국 휴대/지역번호 */
function extractPhoneFromText(text: string): string | null {
  const t = text || ""
  const m010 = t.match(/010[- .]?\d{3,4}[- .]?\d{4}/)
  if (m010) return m010[0].trim()
  const m = t.match(/01[0-9]-?\d{3,4}-?\d{4}|02-?\d{3,4}-?\d{4}|0\d{1,2}-?\d{3,4}-?\d{4}/)
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

    let mobileNumber = (user?.mobileNumber != null ? String(user.mobileNumber) : "") || ""

    const messageText =
      (entity?.plainText != null ? String(entity.plainText) : "") ||
      (entity?.lastMessage != null && typeof entity.lastMessage === "object"
        ? String((entity.lastMessage as Record<string, unknown>).plainText ?? "")
        : "") ||
      ""
    const plainText = messageText.trim()

    if (!mobileNumber) {
      const fromMessage = extractPhoneFromText(plainText)
      if (fromMessage) mobileNumber = fromMessage
    }

    const contact = mobileNumber || "번호 미등록"
    console.log(`추출 결과 - 이름: ${userName}, 번호: ${contact}`)
    console.log(`✅ 처리 완료 - [${userName}]: ${plainText || "(없음)"}`)

    // chatId: 채팅방 ID (entity.id는 메시지 ID라 매번 달라짐. entity.chatId 또는 refers.chat.id 사용)
    const chatId =
      (entity?.chatId != null ? String(entity.chatId) : undefined) ||
      (refers?.chat != null && typeof refers.chat === "object" && (refers.chat as Record<string, unknown>)?.id != null
        ? String((refers.chat as Record<string, unknown>).id)
        : undefined)
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
    }

    let consultationId: string

    if (chatId) {
      // Upsert: chatId 기준으로 기존 상담 있으면 유지, 없으면 신규 생성
      const { data: existing } = await supabase
        .from("consultations")
        .select("id, manager_name, contact")
        .eq("channel_chat_id", chatId)
        .maybeSingle()

      if (existing?.id) {
        consultationId = existing.id as string
        // 최신 고객 정보로 업데이트 (선택적)
        await supabase
          .from("consultations")
          .update({
            manager_name: userName,
            contact,
            metadata: { ...metadata, display_name: displayName, pain_point: plainText.slice(0, 500) },
          })
          .eq("id", consultationId)
        console.log("consultations 기존 유지:", { consultationId, contact })
      } else {
        const insertPayload = {
          company_name: "(채널톡)",
          manager_name: userName,
          contact,
          status: "접수",
          expected_revenue: null,
          is_test: false,
          is_visible: true,
          channel_chat_id: chatId,
          metadata,
        }
        const { data: created, error: consultErr } = await supabase
          .from("consultations")
          .insert(insertPayload)
          .select("id")
          .single()
        if (consultErr || !created?.id) {
          console.error("consultations insert 실패:", consultErr)
          return new Response(
            JSON.stringify({
              error: "Consultation insert failed",
              detail: (consultErr as Error)?.message,
            }),
            { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
          )
        }
        consultationId = created.id as string
        console.log("consultations 신규 생성:", { consultationId, contact, chatId })
      }
    } else {
      // chatId 없음: 기존 방식으로 신규 생성 (하위 호환)
      const insertPayload = {
        company_name: "(채널톡)",
        manager_name: userName,
        contact,
        status: "접수",
        expected_revenue: null,
        is_test: false,
        is_visible: true,
        metadata: { ...metadata, display_name: displayName, pain_point: plainText.slice(0, 500) },
      }
      const { data: created, error: consultErr } = await supabase
        .from("consultations")
        .insert(insertPayload)
        .select("id")
        .single()
      if (consultErr || !created?.id) {
        console.error("consultations insert 실패:", consultErr)
        return new Response(
          JSON.stringify({
            error: "Consultation insert failed",
            detail: (consultErr as Error)?.message,
          }),
          { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
        )
      }
      consultationId = created.id as string
      console.log("consultations 신규 생성(chatId 없음):", { consultationId, contact })
    }

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
