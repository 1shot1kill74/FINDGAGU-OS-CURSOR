/**
 * analyze-quote — 견적서/원가표 이미지 AI 분석 Edge Function
 * - Gemini 2.0 Flash Vision API로 텍스트 추출 및 구조화만 수행 (가격 계산 로직 없음)
 * - Input: { image: "base64_string", fileName: "string", mode?: "estimates" | "vendor_price" }
 * - Output: ParsedEstimateFromPDF | ParsedVendorPrice (시스템 metadata 구조와 동일)
 *
 * 배포: npx supabase functions deploy analyze-quote
 * 시크릿: supabase secrets set GOOGLE_GEMINI_API_KEY=xxx
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai@0.21.0"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const GEMINI_MODEL = "gemini-2.0-flash"

/** 견적서 이미지 분석 프롬프트 */
const VISION_ESTIMATE_PROMPT = `당신은 가구 견적서 이미지 분석 전문가입니다. Gemini 2.0의 향상된 비전으로 다음을 최우선 수행합니다.

**1) '파인드가구' & '김지윤' 식별**: 문서 상단·직인(도장) 근처에서 반드시 확인. 둘 다 있으면 우리 회사 판매 견적서.

**2) 표(Table) 구조**: 품목·규격·수량·단가·금액 열을 정확히 구분. 병합 셀·여러 행 구조 이해.

**추출 필드**: siteName, region, industry, quoteDate(YYYY-MM-DD), recipientContact, customer_name, customer_phone, site_location, total_amount, rows[{no,name,spec,qty,unit,unitPrice,note}]. unitPrice=판매가(원), spec="1200×600×720".

**규칙**: 추출 불가 필드는 빈 문자열·null·0. 유효한 JSON만 출력.`

/** 원가표 이미지 분석 프롬프트 */
const VISION_VENDOR_PROMPT = `당신은 원가표/가격표 이미지 분석 전문가입니다. 다음 항목을 반드시 유심히 분석하세요.

**1) 현장명 (site_name)**: "[파인드가구] 루브르"처럼 파인드가구 옆에 적힌 부분 → "루브르"만 추출해 site_name에 저장

**2) 품명 (product_name)**: 표·도면에 적힌 품명 (예: 올데이CA)

**3) 색상 (color)**: 표에 적힌 색상 (예: 기성칼라, 라이트그레이)

**4) 단가 (cost_price)**: 손글씨 "162,000" 등 수기 금액 포함, ₩·원·콤마 제거 후 숫자만

**5) 외경 사이즈 (size)**: 가로×세로×높이 형식. 도면 치수에서 가로(Width), 세로(Depth, 여러 값이면 합산 예: 700+620=1320), 높이(Height) 추출 → "1000×1320×1200"

**6) 메모 (memo)**: "상판 모번 23T", "그외 18T 라이트그레이" 등 불릿·추가 사양 텍스트. 도면 옆 인쇄/수기 메모를 그대로 추출. 줄바꿈은 공백으로.

**추가**: description에는 색상/특이사항. memo에는 상세 사양(두께·재질·색상 배치 등). quantity는 수량(EA), 없으면 1.

**출력** (유효한 JSON만, items 배열 필수):
{"items":[{"vendor_name":"","product_name":"","size":"","cost_price":숫자,"quantity":숫자,"description":"","site_name":"","color":"","memo":""}]}`

function getMimeFromFileName(fileName: string): string {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase()
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  }
  return map[ext] ?? "image/jpeg"
}

/** JSON 블록 파싱 (마크다운 코드 블록 제거) */
function parseJsonBlock(text: string): Record<string, unknown> {
  let cleaned = text.trim()
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) cleaned = match[1]!.trim()
  return JSON.parse(cleaned) as Record<string, unknown>
}

interface AnalyzeQuoteInput {
  /** 이미지 base64 (jpg/png/webp) — Vision 분석용 */
  image?: string
  /** PDF에서 추출한 텍스트 — 텍스트 분석용 (image 없을 때) */
  text?: string
  fileName: string
  mode?: "estimates" | "vendor_price" | "detect" | "unit_price"
}

/** detect 모드: 파인드가구·김지윤 키워드로 견적서 여부 판별 */
const DETECT_PROMPT = `이미지 또는 텍스트에서 '파인드가구'와 '김지윤' 키워드를 찾아라. 문서 상단·직인(도장)·헤더 근처를 집중 확인. 둘 다 있으면 우리 회사 판매 견적서.
다음 JSON만 출력: {"hasFindgagu": true/false, "hasKimJiyoon": true/false}`

/** unit_price 모드: {품목, 단가, 수량} 형태 추출 */
const UNIT_PRICE_PROMPT = `당신은 PDF/이미지 문서에서 품목·단가·수량 표를 분석하는 전문가입니다.
**추출 형식** (유효한 JSON만 출력): {"items":[{"품목":"제품명","단가":숫자,"수량":숫자}]}
품목=제품/품명, 단가=원가(원) ₩·콤마 제거, 수량=EA 개수(없으면 1). 표·도면·수기 메모에서 모든 품목 행 추출.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS })
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS, "Content-Type": "application/json" } }
    )
  }

  try {
    const apiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY")
    if (!apiKey?.trim()) {
      console.error("[analyze-quote] GOOGLE_GEMINI_API_KEY 미설정")
      return new Response(
        JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY가 설정되지 않았습니다." }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    let body: AnalyzeQuoteInput
    try {
      body = (await req.json()) as AnalyzeQuoteInput
    } catch (parseErr) {
      console.error("[analyze-quote] JSON parse error:", parseErr)
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const { image, text, fileName, mode = "estimates" } = body
    if (!fileName || typeof fileName !== "string") {
      return new Response(
        JSON.stringify({ error: "fileName is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }
    if (!image && !text) {
      return new Response(
        JSON.stringify({ error: "image (base64) or text is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const sysPrompt =
      mode === "detect"
        ? DETECT_PROMPT
        : mode === "unit_price"
          ? UNIT_PRICE_PROMPT
          : mode === "estimates"
            ? VISION_ESTIMATE_PROMPT
            : VISION_VENDOR_PROMPT
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: sysPrompt,
      generationConfig: { maxOutputTokens: 4096 },
    })

    let result: { response: { text?: () => string } }
    if (image && typeof image === "string") {
      const mimeType = getMimeFromFileName(fileName)
      const userPrompt =
        mode === "detect"
          ? '이 이미지에 "파인드가구"와 "김지윤"이 둘 다 보이는지 확인하세요.'
          : mode === "unit_price"
            ? "이 문서 이미지에서 품목·단가·수량 표를 추출하세요."
            : mode === "estimates"
              ? "이 견적서 이미지에서 모든 정보를 추출하세요."
              : "이 원가 명세서 이미지에서 표와 도면 옆 수기 메모를 모두 분석해, 모든 품목을 items 배열로 추출하세요."
      result = await model.generateContent([
        userPrompt,
        { inlineData: { data: image, mimeType } },
      ])
    } else if (text && typeof text === "string") {
      const textPrompt =
        mode === "detect"
          ? '이 텍스트에 "파인드가구"와 "김지윤"이 둘 다 포함되어 있는지 확인하세요.'
          : mode === "unit_price"
            ? `${UNIT_PRICE_PROMPT}\n위 형식으로 추출. 유효한 JSON만 출력.`
            : mode === "estimates"
              ? `가구 견적서 문서 분석. 판매 견적서 등록. 품목 단가는 판매가(unitPrice) 추출. 파인드가구·김지윤 확인. 텍스트에서 JSON 추출: siteName, region, industry, quoteDate(YYYY-MM-DD), recipientContact, customer_name, customer_phone, site_location, total_amount, rows[{no,name,spec,qty,unit,unitPrice,note}]. unitPrice=공급가(원). 유효한 JSON만 출력.`
              : `매입 원가 등록. 아래 항목 모두 추출: site_name, product_name(또는 품목), color, cost_price(또는 단가), quantity(또는 수량, 없으면 1), size(외경 가로×세로×높이), memo(상판 모번 23T·그외 18T 라이트그레이 등 상세 사양). items 배열. 출력 형식: {"items":[{"product_name":"","size":"","cost_price":숫자,"quantity":숫자,"description":"","site_name":"","color":"","memo":""}]} 유효한 JSON만 출력.`
      result = await model.generateContent([`${textPrompt}\n\n---\n\n${text.slice(0, 15000)}`])
    } else {
      return new Response(
        JSON.stringify({ error: "image or text is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const response = result.response
    const text = response.text?.()?.trim() ?? ""
    if (!text) {
      console.error("[analyze-quote] Gemini API 응답이 비어 있습니다.")
      return new Response(
        JSON.stringify({ error: "AI 분석 결과가 비어 있습니다." }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const parsed = parseJsonBlock(text)

    if (mode === "detect") {
      const hasFindgagu = parsed?.hasFindgagu === true
      const hasKimJiyoon = parsed?.hasKimJiyoon === true
      const category = hasFindgagu && hasKimJiyoon ? "Estimates" : "VendorPrice"
      return new Response(
        JSON.stringify({ category }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    if (mode === "unit_price") {
      const raw = Array.isArray(parsed.items) ? parsed.items : []
      const items = raw.map((r: unknown) => {
        const row = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {}
        const 단가 =
          typeof row.단가 === "number"
            ? row.단가
            : parseInt(String(row.단가 ?? row.cost_price ?? 0).replace(/\D/g, ""), 10) || 0
        const 수량 =
          typeof row.수량 === "number"
            ? row.수량
            : parseInt(String(row.수량 ?? row.quantity ?? 1).replace(/\D/g, ""), 10) || 1
        return {
          품목: String(row.품목 ?? row.product_name ?? ""),
          단가,
          수량,
        }
      })
      return new Response(
        JSON.stringify({ items }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    if (mode === "estimates") {
      const rowsRaw = Array.isArray(parsed.rows) ? parsed.rows : []
      const rows = rowsRaw.map((r: unknown, i: number) => {
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
      })

      const today = new Date().toISOString().slice(0, 10)
      const quoteDate = String(parsed.quoteDate ?? "").trim()
      const validDate = /^\d{4}-\d{2}-\d{2}$/.test(quoteDate) ? quoteDate : today
      const customerName = String(parsed.customer_name ?? parsed.siteName ?? "").trim()
      const customerPhone = String(parsed.customer_phone ?? parsed.recipientContact ?? "").trim()
      const siteLocation = String(parsed.site_location ?? parsed.region ?? "").trim()
      let totalAmount = typeof parsed.total_amount === "number" ? parsed.total_amount : 0
      if (totalAmount <= 0 && typeof parsed.total_amount === "string") {
        totalAmount = parseInt(String(parsed.total_amount).replace(/\D/g, ""), 10) || 0
      }

      const estimateData = {
        siteName: String(parsed.siteName ?? customerName ?? ""),
        region: String(parsed.region ?? ""),
        industry: String(parsed.industry ?? ""),
        quoteDate: validDate,
        recipientContact: customerPhone || String(parsed.recipientContact ?? ""),
        customer_name: customerName || undefined,
        customer_phone: customerPhone || undefined,
        site_location: siteLocation || undefined,
        total_amount: totalAmount > 0 ? totalAmount : undefined,
        rows:
          rows.length > 0
            ? rows
            : [{ no: "1", name: "", spec: "", qty: "1", unit: "EA", unitPrice: "", note: "" }],
      }

      return new Response(
        JSON.stringify({ category: "Estimates", result: { type: "Estimates", data: estimateData } }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      )
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : []
    const items = rawItems.map((r: unknown) => {
      const row = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {}
      const costVal = row.cost_price ?? row.cost ?? row.단가
      const cost =
        typeof costVal === "number"
          ? costVal
          : parseInt(String(costVal ?? 0).replace(/\D/g, ""), 10) || 0
      const qtyVal = row.quantity ?? row.qty ?? row.수량
      const qty =
        typeof qtyVal === "number"
          ? qtyVal
          : parseInt(String(qtyVal ?? 1).replace(/\D/g, ""), 10) || 1
      return {
        vendor_name: "",
        product_name: String(row.product_name ?? row.productName ?? row.품목 ?? ""),
        size: String(row.size ?? row.spec ?? ""),
        cost_price: cost,
        quantity: qty,
        description: String(row.description ?? row.note ?? ""),
        site_name: String(row.site_name ?? "").trim() || undefined,
        color: String(row.color ?? "").trim() || undefined,
        quote_date: String(row.quote_date ?? "").trim() || undefined,
        memo: String(row.memo ?? "").trim() || undefined,
      }
    })

    if (items.length === 0) {
      items.push({
        vendor_name: "",
        product_name: String(parsed.product_name ?? parsed.품목 ?? ""),
        size: String(parsed.size ?? parsed.spec ?? ""),
        cost_price:
          parseInt(String(parsed.cost_price ?? parsed.cost ?? parsed.단가 ?? 0).replace(/\D/g, ""), 10) || 0,
        quantity: 1,
        description: String(parsed.description ?? ""),
        site_name: String(parsed.site_name ?? "").trim() || undefined,
        color: String(parsed.color ?? "").trim() || undefined,
        quote_date: undefined,
        memo: String(parsed.memo ?? "").trim() || undefined,
      })
    }

    return new Response(
      JSON.stringify({ category: "VendorPrice", result: { type: "VendorPrice", data: { items } } }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[analyze-quote] Error:", err)
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({
        error: "이미지 분석에 실패했습니다.",
        detail: message.slice(0, 200),
      }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    )
  }
})
