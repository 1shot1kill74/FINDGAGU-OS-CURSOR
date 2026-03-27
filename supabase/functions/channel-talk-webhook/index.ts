/**
 * 채널톡 웹훅 — 임시 리드 저장 + 업종 제한 쇼룸 링크 자동 발송
 * - 채널톡 이벤트를 channel_talk_leads에 저장
 * - 전화번호가 처음 확보되면 3일 만료 쇼룸 링크 생성
 * - 업종 커스텀 필드가 있으면 해당 업종 사례로 서버 범위 제한
 *
 * 배포: npx supabase functions deploy channel-talk-webhook --no-verify-jwt
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-channel-signature, x-cannel-signature",
}

const ALLOWED_TYPES = ["message", "chat.opened", "chat.user_message"]
/**
 * 쇼룸 링크: 사용자 메시지 계열 이벤트에서 시도.
 * 채널톡이 같은 입력에 `message`와 `chat.user_message`를 연달아 보내면, DB에서 `showroom_link_sent_at` 선점(claim)으로 1회만 발송.
 */
const SHOWROOM_LINK_EVENT_TYPES = new Set(["message", "chat.user_message"])
/** 공개 쇼룸 SPA 경로 (내부 관리용 `/showroom` 과 구분) */
const CANON_PUBLIC_SHOWROOM_PATH = "/public/showroom"
const DEFAULT_PUBLIC_SHOWROOM_ORIGIN = "https://findgagu-os-cursor.vercel.app"
const SHOWROOM_SHARE_EXPIRY_DAYS = 3
const DEFAULT_SHOWROOM_TITLE = "시공사례 쇼룸"
const DEFAULT_SHOWROOM_DESCRIPTION =
  "문의 내용에 맞춰 핵심 시공사례만 먼저 모아 두었습니다. 링크에서 필요할 때만 추가로 펼쳐 보실 수 있어요."

function getPreviewSiteLimit(): number {
  const raw = Deno.env.get("SHOWROOM_PREVIEW_SITE_LIMIT")?.trim() || ""
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return 6
  return Math.min(50, Math.max(1, n))
}

const INDUSTRY_KEYWORDS: Array<{ label: string; keywords: string[] }> = [
  { label: "관리형", keywords: ["관리형"] },
  { label: "학원", keywords: ["학원"] },
  { label: "스터디카페", keywords: ["스터디카페", "독서실"] },
  { label: "학교", keywords: ["학교", "고교학점제", "교실"] },
  { label: "아파트", keywords: ["아파트", "커뮤니티"] },
  { label: "기타", keywords: ["기타"] },
]

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonRecord
}

function createShareToken(): string {
  return `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`
}

function getShowroomShareExpiryIso(days = SHOWROOM_SHARE_EXPIRY_DAYS): string {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt.toISOString()
}

function getShowroomBaseUrl(): string {
  const fromEnv =
    Deno.env.get("SHOWROOM_PUBLIC_BASE_URL")?.trim() ||
    Deno.env.get("PUBLIC_SHOWROOM_BASE_URL")?.trim() ||
    ""
  const fallback = `${DEFAULT_PUBLIC_SHOWROOM_ORIGIN}${CANON_PUBLIC_SHOWROOM_PATH}`
  const raw = (fromEnv || DEFAULT_PUBLIC_SHOWROOM_ORIGIN).replace(/\/+$/, "")

  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`)
    let path = u.pathname.replace(/\/+$/, "") || ""
    const isLegacyHomepageHost = u.hostname === "findgagu.com" || u.hostname === "www.findgagu.com"
    const origin = isLegacyHomepageHost ? DEFAULT_PUBLIC_SHOWROOM_ORIGIN : u.origin

    if (path.endsWith(CANON_PUBLIC_SHOWROOM_PATH)) {
      return `${origin}${path}`
    }
    if (!path || path === "/" || path === "/showroom") {
      return `${origin}${CANON_PUBLIC_SHOWROOM_PATH}`
    }
    if (!path.includes("public/showroom")) {
      return `${origin}${CANON_PUBLIC_SHOWROOM_PATH}`
    }
    return `${origin}${path}`
  } catch {
    return fallback
  }
}

function buildShowroomShareUrl(token: string): string {
  const url = new URL(getShowroomBaseUrl())
  url.searchParams.set("t", token)
  return url.toString()
}

function normalizePhone(phone: string | null): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, "")
  return digits.length >= 9 ? trimmed : null
}

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

function getStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/** loose: 리드용. strict: 쇼룸 발송용 — key에 'tel'/'mobile' 부분일치만으로는 잡지 않음(satellite, microphone 등 오탐 방지). */
function directObjectKeySuggestsPhone(keyLower: string, strict: boolean): boolean {
  if (!strict) {
    return ["phone", "mobile", "tel", "contact", "연락처", "휴대폰", "전화번호"].some((token) => keyLower.includes(token))
  }
  if (/연락처|휴대폰|전화번호/.test(keyLower)) return true
  const exactish =
    /^(phonenumber|mobilenumber|mobilephone|cellphone|telephone|mobile_number|phone_number|contactphone|contact_phone|tel)$/i
  return exactish.test(keyLower) || /^(phone|mobile|tel)$/i.test(keyLower)
}

function fieldMetaSuggestsPhone(fieldKeyJoined: string, strict: boolean): boolean {
  if (!strict) {
    return /(phone|mobile|tel|contact|연락처|휴대폰|전화번호)/i.test(fieldKeyJoined)
  }
  const fk = fieldKeyJoined.toLowerCase()
  if (/연락처|휴대폰|전화번호/.test(fk)) return true
  return /\b(phone|mobile|cellphone|telephone|tel)\b/.test(fk) || /mobilenumber|phonenumber|mobile_number|phone_number/i.test(fk)
}

function collectPhoneCandidates(value: unknown, depth = 0, strictKeys = false): string[] {
  if (depth > 6 || value == null) return []

  if (typeof value === "string") return []

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPhoneCandidates(item, depth + 1, strictKeys))
  }

  const record = asRecord(value)
  if (!record) return []

  const out: string[] = []
  const keys = Object.keys(record)
  for (const key of keys) {
    const keyLower = key.toLowerCase()
    const current = record[key]
    // strict: entity 안의 user/refers 는 프로필·유저 스냅샷 복제로 전화가 붙는 경우가 많아 쇼룸 조기 발송 원인
    if (strictKeys && (keyLower === "user" || keyLower === "refers")) continue

    if (directObjectKeySuggestsPhone(keyLower, strictKeys)) {
      const direct = getStringValue(current)
      if (direct) out.push(direct)
    }

    const fieldRecord = asRecord(current)
    if (fieldRecord) {
      const fieldKey = [
        getStringValue(fieldRecord.key),
        getStringValue(fieldRecord.name),
        getStringValue(fieldRecord.label),
        getStringValue(fieldRecord.title),
        getStringValue(fieldRecord.fieldName),
      ].filter((item): item is string => Boolean(item)).join(" ")
      if (fieldMetaSuggestsPhone(fieldKey, strictKeys)) {
        const fieldValue =
          getStringValue(fieldRecord.value) ||
          getStringValue(fieldRecord.text) ||
          getStringValue(fieldRecord.plainText) ||
          getStringValue(fieldRecord.displayValue) ||
          getStringValue(fieldRecord.selectedValue) ||
          getStringValue(fieldRecord.selectedOptionValue) ||
          getStringValue(fieldRecord.selectedOptionName)
        if (fieldValue) out.push(fieldValue)
      }
    }

    out.push(...collectPhoneCandidates(current, depth + 1, strictKeys))
  }

  return out
}

function extractPhone(payload: JsonRecord, plainText: string): string | null {
  const directUserPhone = normalizePhone(
    getStringValue(asRecord(asRecord(payload.refers)?.user)?.mobileNumber),
  )
  if (directUserPhone) return directUserPhone

  const phoneCandidates = collectPhoneCandidates(payload)
  for (const candidate of phoneCandidates) {
    const normalized = normalizePhone(candidate)
    if (normalized) return normalized
  }

  return normalizePhone(extractPhoneFromText(plainText))
}

/**
 * 쇼룸 링크 자동 발송용 전화 인식.
 * - 프로필(refers.user.mobileNumber)·전체 페이로드 뭉텅이 스캔은 하지 않음 → 1~3번 질문 훅 오발송 방지.
 * - 이번 메시지 본문(010 등 패턴) + entity 안의 **전화 필드로 명시된 값만** strict 추출.
 */
function extractPhoneForShowroomTrigger(payload: JsonRecord, plainText: string): string | null {
  const fromText = normalizePhone(extractPhoneFromText(plainText))
  if (fromText) return fromText

  const entity = asRecord(payload.entity)
  if (entity) {
    for (const candidate of collectPhoneCandidates(entity, 0, true)) {
      const normalized = normalizePhone(candidate)
      if (normalized) return normalized
    }
  }

  return null
}

function collectIndustryCandidates(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return []

  if (typeof value === "string") return []

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectIndustryCandidates(item, depth + 1))
  }

  const record = asRecord(value)
  if (!record) return []

  const out: string[] = []
  const keys = Object.keys(record)
  for (const key of keys) {
    const keyLower = key.toLowerCase()
    const current = record[key]
    if (["industry", "업종", "business", "businesstype", "sector", "category"].some((token) => keyLower.includes(token))) {
      const direct = getStringValue(current)
      if (direct) out.push(direct)
    }

    const fieldRecord = asRecord(current)
    if (fieldRecord) {
      const fieldKey = [
        getStringValue(fieldRecord.key),
        getStringValue(fieldRecord.name),
        getStringValue(fieldRecord.label),
        getStringValue(fieldRecord.title),
        getStringValue(fieldRecord.fieldName),
      ].filter((item): item is string => Boolean(item)).join(" ")
      if (/(industry|업종|business|sector|category)/i.test(fieldKey)) {
        const fieldValue =
          getStringValue(fieldRecord.value) ||
          getStringValue(fieldRecord.text) ||
          getStringValue(fieldRecord.plainText) ||
          getStringValue(fieldRecord.displayValue) ||
          getStringValue(fieldRecord.selectedValue) ||
          getStringValue(fieldRecord.selectedOptionValue) ||
          getStringValue(fieldRecord.selectedOptionName)
        if (fieldValue) out.push(fieldValue)
      }
    }

    out.push(...collectIndustryCandidates(current, depth + 1))
  }

  return out
}

/** 채널/워크플로 내부 문자열(예: handlingWorkflow)은 업종 스코프로 쓰지 않음 */
function isChannelInternalIndustryNoise(value: string): boolean {
  const t = value.trim()
  if (!t) return true
  if (/workflow/i.test(t)) return true
  // camelCase 식별자 전체를 업종으로 쓰지 않음 (한글 업종은 보통 해당 패턴이 아님)
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && /[A-Z]/.test(t)) return true
  return false
}

function normalizeIndustry(value: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (isChannelInternalIndustryNoise(trimmed)) return null

  for (const entry of INDUSTRY_KEYWORDS) {
    if (entry.keywords.some((keyword) => trimmed.includes(keyword))) {
      return entry.label
    }
  }

  return trimmed
}

function extractIndustry(payload: JsonRecord, plainText: string): string | null {
  const candidates = [
    ...collectIndustryCandidates(payload),
    ...(plainText ? [plainText] : []),
  ]

  for (const candidate of candidates) {
    const normalized = normalizeIndustry(candidate)
    if (normalized) return normalized
  }

  return null
}

function extractUserChatId(payload: JsonRecord): string | null {
  const entity = asRecord(payload.entity)
  const refers = asRecord(payload.refers)
  const chat = asRecord(refers?.chat)
  return (
    getStringValue(entity?.userChatId) ||
    getStringValue(entity?.chatId) ||
    getStringValue(chat?.userChatId) ||
    getStringValue(chat?.id)
  )
}

function extractUserId(payload: JsonRecord): string | null {
  const refers = asRecord(payload.refers)
  const user = asRecord(refers?.user)
  return getStringValue(user?.id)
}

function extractUserName(payload: JsonRecord): string {
  const refers = asRecord(payload.refers)
  const user = asRecord(refers?.user)
  return getStringValue(user?.name) || "알 수 없음"
}

function extractProfileMobile(payload: JsonRecord): string | null {
  const refers = asRecord(payload.refers)
  const user = asRecord(refers?.user)
  return normalizePhone(
    getStringValue(user?.mobileNumber) ||
      getStringValue(asRecord(user?.profile)?.mobileNumber),
  )
}

function isWorkflowCompletionEvent(payload: JsonRecord, eventType: string | null): boolean {
  if (eventType !== "message") return false
  const entity = asRecord(payload.entity)
  const log = asRecord(entity?.log)
  return getStringValue(entity?.personType) === "bot" && getStringValue(log?.action) === "endWorkflow"
}

function extractMessageText(payload: JsonRecord): string {
  const entity = asRecord(payload.entity)
  const lastMessage = asRecord(entity?.lastMessage)
  return (
    getStringValue(entity?.plainText) ||
    getStringValue(lastMessage?.plainText) ||
    ""
  )
}

async function createScopedShowroomShare(
  supabase: ReturnType<typeof createClient>,
  userChatId: string,
  industryScope: string | null,
): Promise<{ token: string; url: string }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = createShareToken()
    const { error } = await supabase.from("showroom_share_links").insert({
      token,
      title: industryScope ? `${industryScope} 맞춤 시공사례` : DEFAULT_SHOWROOM_TITLE,
      description: DEFAULT_SHOWROOM_DESCRIPTION,
      industry_scope: industryScope,
      source: "channel_talk_auto",
      channel_user_chat_id: userChatId,
      preview_site_limit: getPreviewSiteLimit(),
      expires_at: getShowroomShareExpiryIso(),
    })

    if (!error) return { token, url: buildShowroomShareUrl(token) }
    if (!String(error.message).toLowerCase().includes("duplicate")) {
      throw new Error(error.message)
    }
  }

  throw new Error("쇼룸 공유 토큰 생성에 실패했습니다.")
}

async function sendChannelTalkMessage(userChatId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const accessKey = Deno.env.get("CHANNELTALK_ACCESS_KEY")?.trim() || ""
  const accessSecret = Deno.env.get("CHANNELTALK_ACCESS_SECRET")?.trim() || ""
  const botName = Deno.env.get("CHANNELTALK_BOT_NAME")?.trim() || ""

  if (!accessKey || !accessSecret) {
    return { ok: false, error: "CHANNELTALK_ACCESS_KEY 또는 CHANNELTALK_ACCESS_SECRET이 없습니다." }
  }

  const url = new URL(`https://api.channel.io/open/v5/user-chats/${encodeURIComponent(userChatId)}/messages`)
  if (botName) url.searchParams.set("botName", botName)

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-key": accessKey,
      "x-access-secret": accessSecret,
    },
    body: JSON.stringify({
      blocks: [
        {
          type: "text",
          value: content,
        },
      ],
    }),
  })

  if (response.ok) return { ok: true }

  const errorText = await response.text()
  return {
    ok: false,
    error: `ChannelTalk API ${response.status}: ${errorText || "메시지 전송 실패"}`,
  }
}

function buildShowroomMessage(url: string, industry: string | null): string {
  const industryLine = industry
    ? `${industry} 업종에 맞춰 먼저 볼 만한 사례만 모았습니다.`
    : "먼저 볼 만한 핵심 사례만 모았습니다."
  return [
    "문의 남겨주셔서 감사합니다.",
    industryLine,
    "아래 링크를 누르시면 휴대폰에서 바로 열립니다.",
    url,
    "(링크는 설정된 기간 후 만료될 수 있습니다.)",
    "궁금하신 점은 이 채팅창에 그대로 남겨 주세요.",
  ].join("\n")
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
    let payload: JsonRecord
    try {
      payload = JSON.parse(rawBody) as JsonRecord
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr)
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    console.log("전체 데이터 구조:", JSON.stringify(payload))

    const eventType = getStringValue(payload.type)
    if (!ALLOWED_TYPES.includes(eventType ?? "")) {
      console.info(`스킵: '${eventType}' 아님 push`)
      return new Response("Skipped", {
        status: 200,
        headers: { ...CORS, "Content-Type": "text/plain" },
      })
    }

    const userChatId = extractUserChatId(payload)
    if (!userChatId) {
      return new Response(JSON.stringify({ error: "userChatId not found" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      })
    }

    const userName = extractUserName(payload)
    const plainText = extractMessageText(payload)
    const phone = extractPhone(payload, plainText)
    const phoneForShowroomThisEvent = extractPhoneForShowroomTrigger(payload, plainText)
    const workflowCompletionPhone = extractProfileMobile(payload)
    const isWorkflowCompletion = isWorkflowCompletionEvent(payload, eventType)
    const industry = extractIndustry(payload, plainText)

    console.log(
      `추출 결과 - 이름: ${userName}, 번호(리드): ${phone ?? "미확인"}, 번호(쇼룸트리거): ${phoneForShowroomThisEvent ?? "미확인"}, 번호(워크플로종료): ${workflowCompletionPhone ?? "미확인"}, 워크플로종료이벤트: ${isWorkflowCompletion}, 업종: ${industry ?? "미확인"}`,
    )

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
    const nowIso = new Date().toISOString()

    const { data: existingLead, error: leadSelectError } = await supabase
      .from("channel_talk_leads")
      .select("id, phone, industry, showroom_share_token, showroom_link_sent_at")
      .eq("channel_user_chat_id", userChatId)
      .maybeSingle()

    if (leadSelectError) {
      throw new Error(leadSelectError.message)
    }

    const mergedPhone = phone || (typeof existingLead?.phone === "string" && existingLead.phone.trim() ? existingLead.phone.trim() : null)
    const mergedIndustry =
      industry ??
      normalizeIndustry(typeof existingLead?.industry === "string" ? existingLead.industry : null)

    const leadPayload = {
      channel_user_chat_id: userChatId,
      channel_user_id: extractUserId(payload),
      customer_name: userName,
      phone: mergedPhone,
      industry: mergedIndustry,
      last_message: plainText || null,
      raw_payload: payload,
      source_event_type: eventType,
      last_event_at: nowIso,
      updated_at: nowIso,
    }

    const { data: savedLead, error: leadUpsertError } = await supabase
      .from("channel_talk_leads")
      .upsert(leadPayload, { onConflict: "channel_user_chat_id" })
      .select("id, showroom_share_token, showroom_link_sent_at")
      .single()

    if (leadUpsertError || !savedLead?.id) {
      throw new Error(leadUpsertError?.message || "channel_talk_leads upsert failed")
    }

    const { data: gateRow } = await supabase
      .from("channel_talk_leads")
      .select("showroom_link_sent_at, showroom_share_token")
      .eq("id", savedLead.id)
      .maybeSingle()

    let sentShowroomLink = false
    let showroomShareToken =
      typeof gateRow?.showroom_share_token === "string"
        ? gateRow.showroom_share_token
        : typeof savedLead.showroom_share_token === "string"
          ? savedLead.showroom_share_token
          : null
    let showroomSendError: string | null = null

    const shouldAttemptShowroomSend =
      (Boolean(phoneForShowroomThisEvent) && SHOWROOM_LINK_EVENT_TYPES.has(eventType ?? "")) ||
      (isWorkflowCompletion && Boolean(workflowCompletionPhone))

    async function revertShowroomClaim(reason: string): Promise<void> {
      showroomSendError = reason
      await supabase
        .from("channel_talk_leads")
        .update({ showroom_link_sent_at: null, showroom_send_error: reason, updated_at: nowIso })
        .eq("id", savedLead.id)
    }

    if (shouldAttemptShowroomSend) {
      const { data: claimedRow, error: claimErr } = await supabase
        .from("channel_talk_leads")
        .update({ showroom_link_sent_at: nowIso, updated_at: nowIso })
        .eq("id", savedLead.id)
        .is("showroom_link_sent_at", null)
        .select("id, showroom_share_token")
        .maybeSingle()

      if (claimErr) {
        showroomSendError = claimErr.message
      } else if (claimedRow?.id) {
        try {
          let shareUrl: string
          const tokenFromClaim =
            typeof claimedRow.showroom_share_token === "string" ? claimedRow.showroom_share_token : null
          if (tokenFromClaim) {
            showroomShareToken = tokenFromClaim
            shareUrl = buildShowroomShareUrl(showroomShareToken)
          } else {
            const createdShare = await createScopedShowroomShare(supabase, userChatId, mergedIndustry)
            showroomShareToken = createdShare.token
            shareUrl = createdShare.url
          }

          const sendResult = await sendChannelTalkMessage(userChatId, buildShowroomMessage(shareUrl, mergedIndustry))
          if (!sendResult.ok) {
            await revertShowroomClaim(sendResult.error ?? "쇼룸 링크 자동 발송 실패")
          } else {
            sentShowroomLink = true
            showroomSendError = null
          }
        } catch (error) {
          await revertShowroomClaim(error instanceof Error ? error.message : "쇼룸 링크 발송 중 알 수 없는 오류")
        }
      }
    }

    const leadStatusPatch: Record<string, unknown> = {
      showroom_share_token: showroomShareToken,
      showroom_send_error: showroomSendError,
      updated_at: nowIso,
    }

    const { error: leadStatusError } = await supabase
      .from("channel_talk_leads")
      .update(leadStatusPatch)
      .eq("id", savedLead.id)

    if (leadStatusError) {
      throw new Error(leadStatusError.message)
    }

    return new Response(
      JSON.stringify({
        ok: true,
        consultationId: null,
        leadId: savedLead.id,
        userChatId,
        sentShowroomLink,
        industry: mergedIndustry,
        hasPhone: Boolean(mergedPhone),
        hasShowroomTriggerPhone: Boolean(phoneForShowroomThisEvent),
        workflowCompletionTriggered: isWorkflowCompletion && Boolean(workflowCompletionPhone),
        showroomSendError,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  } catch (e) {
    console.error("Edge function error:", e)
    return new Response(
      JSON.stringify({ error: "Internal error", detail: (e as Error)?.message ?? String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }
})
