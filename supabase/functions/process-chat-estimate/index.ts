/**
 * process-chat-estimate — 구글챗 봇 "견적서" 명령 처리
 *
 * 입력: { spaceName: "spaces/XXXXX", imageBase64: "...", fileName: "image.jpg" }
 * 처리: consultation 조회 → analyze-quote 호출 → estimates/products/storage 저장
 * 반환: { ok, projectName, grandTotal, consultationId }
 *
 * 배포: npx supabase functions deploy process-chat-estimate --no-verify-jwt
 * 시크릿: BOT_SECRET (n8n에서 x-bot-secret 헤더로 전달)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
}

const ESTIMATE_FILES_BUCKET = "estimate-files"
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview"
const VISION_ESTIMATE_PROMPT = `당신은 가구 견적서 이미지 분석 전문가입니다. 반드시 아래 순서대로 검증 후 추출을 진행하세요.

0) Pre-check:
- 문서 중앙 상단에 "견 적 서" 또는 "견적서" 타이틀이 있는지 확인.
- 없으면 다음 JSON만 출력: {"skipped": true, "reason": "Not a quotation"}

1) 회사명 매칭:
- 이미지에 "주식회사 파인드가구" 또는 "파인드가구" 텍스트가 있는지 확인.
- 없으면 다음 JSON만 출력: {"skipped": true, "reason": "Not our company"}

2) 필수 항목 체크:
- [사업자번호, 공급가액, VAT, 합계, 품명] 5개 중 3개 이상이 포함되어야 함.
- 3개 미만이면 다음 JSON만 출력: {"skipped": true, "reason": "Required fields insufficient"}

3) 추출:
- siteName, region, industry, quoteDate(YYYY-MM-DD), recipientContact, customer_name, customer_phone, total_amount
- rows[{no,name,spec,qty,unit,unitPrice,note}]
- 추출 불가 필드는 빈 문자열, null, 0 사용
- 유효한 JSON만 출력`

const SUPPLIER_FIXED = {
  bizNumber: "374-81-02631",
  address: "경기도 남양주시 화도읍 가곡로 88번길 29-2, 1동",
  contact: "031-592-7981",
}

const EXCLUDE_KEYWORDS = ["배송", "설치", "시공", "철거", "운반", "인건비", "출장", "기타", "할인", "부자재"]

function shouldExclude(name: string): boolean {
  const lower = name.toLowerCase()
  return EXCLUDE_KEYWORDS.some((k) => lower.includes(k))
}

function roundToPriceUnit(n: number): number {
  return Math.round(n / 1000) * 1000
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function getMimeType(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase()
  const map: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }
  return map[ext] ?? "image/jpeg"
}

function parseJsonBlock(text: string): Record<string, unknown> {
  let cleaned = text.trim()
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) cleaned = match[1]!.trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

interface EstimateRow {
  no: string
  name: string
  spec: string
  qty: string
  unit: string
  unitPrice: string
  note: string
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  // 봇 시크릿 검증
  const botSecret = Deno.env.get("BOT_SECRET") ?? ""
  if (botSecret) {
    const incoming = req.headers.get("x-bot-secret") ?? ""
    if (incoming !== botSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      })
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase env vars missing" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { spaceName?: string; imageBase64?: string; fileName?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  const { spaceName, imageBase64, fileName } = body
  if (!spaceName || !imageBase64 || !fileName) {
    return new Response(JSON.stringify({ error: "spaceName, imageBase64, fileName required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    })
  }

  // 1. consultation 조회 (channel_chat_id = spaceName)
  const { data: rows, error: consultErr } = await supabase
    .from("consultations")
    .select("id, project_name, metadata, status")
    .eq("channel_chat_id", spaceName)
    .eq("is_visible", true)
    .limit(1)

  if (consultErr || !rows?.length) {
    console.error("[process-chat-estimate] consultation not found:", spaceName, consultErr?.message)
    return new Response(
      JSON.stringify({ error: `상담카드를 찾을 수 없습니다. spaceName: ${spaceName}` }),
      { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }

  const consultation = rows[0]
  const consultationId = consultation.id as string
  const projectName = (consultation.project_name as string) ?? ""

  // 2. Gemini 직접 호출 (analyze-quote 의존 제거)
  const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY") ?? ""
  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY가 설정되지 않았습니다." }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }

  let parsedEstimate: Record<string, unknown>
  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: VISION_ESTIMATE_PROMPT,
      generationConfig: { maxOutputTokens: 4096 },
    })
    const isCaptureImage = /file-image|^image\.(png|jpg|jpeg)$/i.test(fileName)
    const captureHint = isCaptureImage
      ? "이 문서는 캡처된 견적서 이미지야. '견 적 서' 타이틀과 품목 리스트를 집중적으로 찾아줘. "
      : ""
    const userPrompt = `${captureHint}가장 먼저 문서 중앙 상단에 '견 적 서' 타이틀이 있는지 확인해. 없다면 견적서가 아니므로 skipped로 응답. 통과하면 '주식회사 파인드가구' 확인, 필수 항목(사업자번호·공급가액·VAT·합계·품명 중 3개 이상) 확인 후, 이 견적서 이미지에서 모든 정보를 추출하세요.`
    const result = await model.generateContent([
      userPrompt,
      { inlineData: { data: imageBase64, mimeType: getMimeType(fileName) } },
    ])
    const responseText = result.response.text?.()?.trim() ?? ""
    if (!responseText) {
      throw new Error("AI 분석 결과가 비어 있습니다.")
    }
    parsedEstimate = parseJsonBlock(responseText)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error("[process-chat-estimate] gemini failed:", detail)
    return new Response(
      JSON.stringify({ error: "AI 분석 실패", detail: detail.slice(0, 200) }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }

  if (parsedEstimate.skipped === true) {
    const reason = String(parsedEstimate.reason ?? "견적서 형식이 아닙니다.")
    console.log("[process-chat-estimate] skipped:", reason)
    return new Response(
      JSON.stringify({ ok: false, skipped: true, reason }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }

  const rowsRaw = Array.isArray(parsedEstimate.rows) ? parsedEstimate.rows : []
  const est = {
    siteName: String(parsedEstimate.siteName ?? parsedEstimate.customer_name ?? ""),
    region: String(parsedEstimate.region ?? ""),
    industry: String(parsedEstimate.industry ?? ""),
    quoteDate: String(parsedEstimate.quoteDate ?? "").trim(),
    recipientContact: String(parsedEstimate.recipientContact ?? parsedEstimate.customer_phone ?? ""),
    customer_name: String(parsedEstimate.customer_name ?? parsedEstimate.siteName ?? ""),
    customer_phone: String(parsedEstimate.customer_phone ?? parsedEstimate.recipientContact ?? ""),
    total_amount:
      typeof parsedEstimate.total_amount === "number"
        ? parsedEstimate.total_amount
        : parseInt(String(parsedEstimate.total_amount ?? 0).replace(/\D/g, ""), 10) || 0,
    rows: rowsRaw.map((r: unknown, i: number) => {
      const row = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {}
      return {
        no: String(row.no ?? i + 1),
        name: String(row.name ?? row.product_name ?? ""),
        spec: String(row.spec ?? ""),
        qty: typeof row.qty === "number" ? String(row.qty) : String(row.qty ?? "1"),
        unit: String(row.unit ?? "EA"),
        unitPrice:
          typeof row.unitPrice === "number"
            ? String(row.unitPrice)
            : String(row.unitPrice ?? row.unit_price ?? ""),
        note: String(row.note ?? ""),
      }
    }) as EstimateRow[],
  }
  const estimateRows = est.rows ?? []
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(est.quoteDate ?? "")
    ? est.quoteDate!
    : new Date().toISOString().slice(0, 10)
  const quoteDateForPayload = `${quoteDate} 00:00`

  // 3. 공급가액 / VAT / 합계 계산
  let supplyTotal = 0
  for (const r of estimateRows) {
    const qty = parseFloat(r.qty) || 1
    const unitPrice = parseFloat(String(r.unitPrice).replace(/,/g, "")) || 0
    supplyTotal += qty * unitPrice
  }
  const vat = Math.round(supplyTotal * 0.1)
  const grandTotal = est.total_amount && est.total_amount > 0
    ? est.total_amount
    : supplyTotal + vat

  const payload = {
    mode: "FINAL",
    recipientName: (est.customer_name ?? est.siteName ?? projectName ?? "").trim() || "알 수 없는 고객",
    recipientContact: (est.customer_phone ?? est.recipientContact ?? "").trim() || "",
    quoteDate: quoteDateForPayload,
    bizNumber: SUPPLIER_FIXED.bizNumber,
    address: SUPPLIER_FIXED.address,
    supplierContact: SUPPLIER_FIXED.contact,
    sealImageUrl: "",
    rows: estimateRows,
    footerNotes: "구글챗 견적서 AI 분석",
    _source: "google_chat_bot",
    _original_filename: fileName,
  }

  // 4. estimates INSERT
  const { error: estErr } = await supabase.from("estimates").insert({
    consultation_id: consultationId,
    payload: payload as unknown,
    supply_total: supplyTotal,
    vat,
    grand_total: grandTotal,
    approved_at: new Date().toISOString(),
    final_proposal_data: payload as unknown,
    is_test: false,
  })

  if (estErr) {
    console.error("[process-chat-estimate] estimates insert failed:", estErr.message)
    return new Response(
      JSON.stringify({ error: "estimates 저장 실패", detail: estErr.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    )
  }

  // 5. consultations UPDATE (estimate_amount, status)
  await supabase
    .from("consultations")
    .update({ estimate_amount: grandTotal, status: "견적" } as Record<string, unknown>)
    .eq("id", consultationId)

  // 6. products UPSERT (판매단가 반영)
  const productRows: { name: string; supply_price: number; spec: string; color: string }[] = []
  for (const r of estimateRows) {
    const name = (r.name ?? "").trim()
    if (!name || shouldExclude(name)) continue
    const unitPrice = parseFloat(String(r.unitPrice).replace(/,/g, "")) || 0
    if (unitPrice <= 0) continue
    productRows.push({
      name: name.slice(0, 255),
      supply_price: roundToPriceUnit(unitPrice),
      spec: (r.spec ?? "").trim(),
      color: "",
    })
  }
  if (productRows.length > 0) {
    await supabase
      .from("products")
      .upsert(productRows, { onConflict: "name,spec,color", ignoreDuplicates: false })
  }

  // 7. Supabase Storage 업로드
  const timestamp = Date.now()
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath = `${consultationId}/${timestamp}_${safeName}`
  const imageBytes = base64ToUint8Array(imageBase64)
  const contentType = getMimeType(fileName)

  const { error: uploadErr } = await supabase.storage
    .from(ESTIMATE_FILES_BUCKET)
    .upload(storagePath, imageBytes, { contentType, upsert: false })

  if (!uploadErr) {
    const ext = (fileName.split(".").pop() ?? "jpg").toLowerCase()

    // 8. consultation_estimate_files INSERT
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("consultation_estimate_files").insert({
      consultation_id: consultationId,
      project_name: projectName || null,
      storage_path: storagePath,
      file_name: fileName,
      file_type: ext,
      upload_type: "estimates",
      ...(quoteDate ? { quote_date: quoteDate } : {}),
    })

    // 9. estimate_pdf_url UPDATE
    await supabase
      .from("consultations")
      .update({ estimate_pdf_url: storagePath } as Record<string, unknown>)
      .eq("id", consultationId)
  } else {
    console.error("[process-chat-estimate] storage upload failed:", uploadErr.message)
  }

  console.log(`[process-chat-estimate] done: ${projectName} / ${grandTotal}원 / ${estimateRows.length}행`)

  return new Response(
    JSON.stringify({
      ok: true,
      consultationId,
      projectName,
      grandTotal,
      supplyTotal,
      vat,
      rowCount: estimateRows.length,
      productCount: productRows.length,
    }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
  )
})
