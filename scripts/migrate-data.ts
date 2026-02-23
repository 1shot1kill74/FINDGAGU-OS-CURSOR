#!/usr/bin/env npx tsx
/**
 * Google Chat Admin Data Export → 견적서 자동화 마이그레이션 파이프라인
 *
 * 루트: ~/findgagu-os-data/staging/
 * CSV: processed/spaces_enriched.csv, messages.csv, attachments.csv, customers_from_chat.csv
 * 첨부파일: Google Chat/Groups/Space {space_id}/attachments/
 *
 * 사용:
 *   npx tsx scripts/migrate-data.ts --mode preview   # 전체 스캔 → migration-preview.json
 *   npx tsx scripts/migrate-data.ts --mode preview --folder "Google Chat/Groups/Space_AAAA"  # 특정 폴더만 → migration-preview-Space_AAAA.json
 *   npx tsx scripts/migrate-data.ts --mode upload [--folder "Space_AAAA"]  # 해당 preview 파일로 upsert
 */
import 'dotenv/config'
import pLimit from 'p-limit'
import sharp from 'sharp'
import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { join, resolve, basename } from 'path'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg']

// --- 환경 설정 ---
const HOME = process.env.HOME || process.env.USERPROFILE || ''
const ROOT = resolve(HOME, 'findgagu-os-data', 'staging')
const PROCESSED_DIR = join(ROOT, 'processed')
const ATTACHMENTS_BASE = join(ROOT, 'Google Chat', 'Groups')

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
const EDGE_FUNCTION_URL = SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/analyze-quote'

const CONCURRENCY = 2
const limit = pLimit(CONCURRENCY)
const MAX_RETRIES = 3

/** 이미지 경량화: 상단 40% 크롭 + 1000px 리사이즈 + JPEG 70 (존재 여부 판별용, payload 80~90% 감소) */
async function preprocessForDetection(filePath: string, ext: string): Promise<Buffer | null> {
  if (!IMAGE_EXTS.includes(ext.toLowerCase())) return null
  try {
    const image = sharp(readFileSync(filePath))
    const meta = await image.metadata()
    const w = meta.width ?? 1000
    const h = meta.height ?? 1000
    const cropH = Math.floor(h * 0.4)
    return await image
      .extract({ left: 0, top: 0, width: w, height: cropH })
      .resize({ width: 1000 })
      .jpeg({ quality: 70 })
      .toBuffer()
  } catch {
    return null
  }
}

/** 이미지 경량화: max 1200px 리사이즈 + JPEG 80 (전체 분석용, payload 감소) */
async function preprocessForAnalysis(filePath: string, ext: string): Promise<Buffer | null> {
  if (!IMAGE_EXTS.includes(ext.toLowerCase())) return null
  try {
    const image = sharp(readFileSync(filePath))
    const meta = await image.metadata()
    const w = meta.width ?? 1000
    const pipeline = w > 1200 ? image.resize({ width: 1200 }) : image
    return await pipeline.jpeg({ quality: 80 }).toBuffer()
  } catch {
    return null
  }
}

// --- CSV 파싱 ---
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0]!.split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]!)
    const row: Record<string, string> = {}
    header.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if ((c === ',' && !inQuotes) || c === '\n') {
      result.push(current.trim().replace(/^"|"$/g, ''))
      current = ''
    } else {
      current += c
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''))
  return result
}

function loadCSV(filename: string): Record<string, string>[] {
  const path = join(PROCESSED_DIR, filename)
  if (!existsSync(path)) {
    console.warn(`[경고] 파일 없음: ${path}`)
    return []
  }
  const content = readFileSync(path, 'utf-8')
  return parseCSV(content)
}

// --- 주소 추출 정규식 ---
/** 실제 주소에 포함되어야 할 키워드 (시/도/구/동/번지/아파트 등) - 하나라도 있어야 유효한 주소로 인정 */
const ADDRESS_KEYWORDS = /(?:시|도|구|동|번지|아파트|APT|로|길|읍|면|동\s*\d|가\s*\d|층|호수|건물|빌딩|타워|센터|마을|단지)/i

const ADDRESS_PATTERNS = [
  /(?:주소|주소지|현장|위치)[:\s]*([^\n]+?)(?:\n|$)/i,
  /(경기|서울|부산|대구|인천|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)(?:시|도)?\s+[^\n]{5,80}/,
  /[\d\-]+(?:로|길|동|가)\s*[\d\-]+/,
]

function isValidAddress(candidate: string): boolean {
  const t = candidate.trim()
  if (t.length < 5) return false
  return ADDRESS_KEYWORDS.test(t)
}

function extractAddressFromMessages(messages: Record<string, string>[]): string {
  const texts = messages.map((m) => m.text || m.content || m.body || '').join('\n')
  for (const re of ADDRESS_PATTERNS) {
    const m = texts.match(re)
    const candidate = m?.[1]?.trim() ?? m?.[0]?.trim() ?? ''
    if (candidate && isValidAddress(candidate)) return candidate
  }
  return ''
}

function extractAddressFromMessagesJson(messages: unknown[]): string {
  const texts = messages
    .map((m) => (typeof m === 'object' && m !== null ? (m as Record<string, unknown>).text ?? (m as Record<string, unknown>).content ?? (m as Record<string, unknown>).body ?? '' : ''))
    .filter(Boolean)
    .join('\n')
  for (const re of ADDRESS_PATTERNS) {
    const m = texts.match(re)
    const candidate = m?.[1]?.trim() ?? m?.[0]?.trim() ?? ''
    if (candidate && isValidAddress(candidate)) return candidate
  }
  return ''
}

function extractPhoneFromMessagesJson(messages: unknown[]): string {
  const texts = messages
    .map((m) => (typeof m === 'object' && m !== null ? String((m as Record<string, unknown>).text ?? (m as Record<string, unknown>).content ?? '') : ''))
    .join('\n')
  const m = texts.match(/010[- .]?\d{3,4}[- .]?\d{4}|01[0-9]-?\d{3,4}-?\d{4}/)
  return m ? m[0]!.trim() : ''
}

// --- 데이터 조인 ---
interface SpaceData {
  space_id: string
  space_url: string
  space_name: string
  primary_phone: string
  address: string
  quoteCandidates: { fileName: string; filePath: string; ext: string }[]
  purchaseOrderCandidates: { fileName: string; filePath: string }[]
}

function joinAndExtract(): SpaceData[] {
  const spaces = loadCSV('spaces_enriched.csv')
  const messages = loadCSV('messages.csv')
  const attachments = loadCSV('attachments.csv')
  const customers = loadCSV('customers_from_chat.csv')

  const messagesBySpace = new Map<string, Record<string, string>[]>()
  for (const m of messages) {
    const sid = (m.space_id ?? m.spaceId ?? '').trim()
    if (!sid) continue
    if (!messagesBySpace.has(sid)) messagesBySpace.set(sid, [])
    messagesBySpace.get(sid)!.push(m)
  }

  const attachmentsBySpace = new Map<string, Record<string, string>[]>()
  for (const a of attachments) {
    const sid = (a.space_id ?? a.spaceId ?? '').trim()
    if (!sid) continue
    if (!attachmentsBySpace.has(sid)) attachmentsBySpace.set(sid, [])
    attachmentsBySpace.get(sid)!.push(a)
  }

  const customersBySpace = new Map<string, string>()
  for (const c of customers) {
    const sid = (c.space_id ?? c.spaceId ?? '').trim()
    const phone = (c.primary_phone ?? c.phone ?? '').trim()
    if (sid && phone) customersBySpace.set(sid, phone)
  }

  const result: SpaceData[] = []
  for (const s of spaces) {
    const spaceId = (s.space_id ?? s.spaceId ?? s.id ?? '').trim()
    const spaceUrl = (s.space_url ?? s.spaceUrl ?? s.url ?? '').trim()
    const spaceName = (s.space_name ?? s.name ?? s.display_name ?? spaceId).trim()
    if (!spaceId) continue

    const attDir = join(ATTACHMENTS_BASE, `Space ${spaceId}`, 'attachments')
    const quoteExts = ['.png', '.jpg', '.jpeg', '.pdf']
    const quoteCandidates: SpaceData['quoteCandidates'] = []
    const purchaseOrderCandidates: SpaceData['purchaseOrderCandidates'] = []

    const attList = attachmentsBySpace.get(spaceId) ?? []
    for (const a of attList) {
      const fileName = (a.file_name ?? a.fileName ?? a.name ?? '').trim()
      if (!fileName) continue
      const ext = fileName.toLowerCase().slice(fileName.lastIndexOf('.'))
      const filePath = join(attDir, fileName)
      if (quoteExts.includes(ext) && existsSync(filePath)) {
        quoteCandidates.push({ fileName, filePath, ext })
      } else if (ext === '.pptx' && existsSync(filePath)) {
        purchaseOrderCandidates.push({ fileName, filePath })
      }
    }

    result.push({
      space_id: spaceId,
      space_url: spaceUrl,
      space_name: spaceName,
      primary_phone: customersBySpace.get(spaceId) ?? '',
      address: extractAddressFromMessages(messagesBySpace.get(spaceId) ?? []),
      quoteCandidates,
      purchaseOrderCandidates,
    })
  }
  return result
}

const QUOTE_EXTS = ['.png', '.jpg', '.jpeg', '.pdf']
const PURCHASE_ORDER_EXTS = ['.pptx']

/** 재귀적으로 폴더 내 이미지/PDF/PPTX 파일 탐색 */
function findFilesRecursive(
  dir: string,
  exts: string[]
): { fileName: string; filePath: string; ext: string }[] {
  const result: { fileName: string; filePath: string; ext: string }[] = []
  if (!existsSync(dir)) return result
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const fullPath = join(dir, e.name)
    if (e.isDirectory()) {
      result.push(...findFilesRecursive(fullPath, exts))
    } else if (e.isFile()) {
      const ext = e.name.toLowerCase().slice(e.name.lastIndexOf('.'))
      if (exts.includes(ext)) {
        result.push({ fileName: e.name, filePath: fullPath, ext })
      }
    }
  }
  return result
}

/** attachments.csv에서 export_name 목록 추출 (다른 컬럼명 폴백) */
function loadExportNamesFromCSV(folderPath: string): Set<string> {
  const candidates = [
    join(PROCESSED_DIR, 'attachments.csv'),
    join(folderPath, 'processed', 'attachments.csv'),
    join(folderPath, '..', 'processed', 'attachments.csv'),
    join(ROOT, 'processed', 'attachments.csv'),
  ]
  for (const p of candidates) {
    const resolved = resolve(p)
    if (!existsSync(resolved)) continue
    const rows = parseCSV(readFileSync(resolved, 'utf-8'))
    const names = new Set<string>()
    for (const r of rows) {
      const name = (r.export_name ?? r.exportName ?? r.file_name ?? r.fileName ?? r.name ?? '').trim()
      if (name) {
        names.add(name)
        names.add(basename(name))
      }
    }
    return names
  }
  return new Set()
}

/** --folder 모드: 재귀 탐색 + CSV export_name 매칭 */
function extractFromFolder(folderPath: string): SpaceData[] {
  const folderName = basename(folderPath)
  const spaceId = folderName.replace(/^Space\s*/i, '') || folderName
  const messagesPath = join(folderPath, 'messages.json')

  let messages: unknown[] = []
  if (existsSync(messagesPath)) {
    try {
      const raw = JSON.parse(readFileSync(messagesPath, 'utf-8'))
      messages = Array.isArray(raw) ? raw : Array.isArray(raw.messages) ? raw.messages : []
    } catch {
      console.warn(`[경고] messages.json 파싱 실패: ${messagesPath}`)
    }
  }

  const allQuoteFiles = findFilesRecursive(folderPath, QUOTE_EXTS)
  const allPurchaseFiles = findFilesRecursive(folderPath, PURCHASE_ORDER_EXTS)
  const exportNames = loadExportNamesFromCSV(folderPath)

  const quoteCandidates: SpaceData['quoteCandidates'] = []
  const purchaseOrderCandidates: SpaceData['purchaseOrderCandidates'] = []

  for (const f of allQuoteFiles) {
    const matched = exportNames.size === 0 || exportNames.has(f.fileName) || exportNames.has(basename(f.filePath))
    if (matched) quoteCandidates.push(f)
  }
  for (const f of allPurchaseFiles) {
    const matched = exportNames.size === 0 || exportNames.has(f.fileName) || exportNames.has(basename(f.filePath))
    if (matched) purchaseOrderCandidates.push({ fileName: f.fileName, filePath: f.filePath })
  }

  console.log(`  총 탐색된 이미지/PDF 개수: ${allQuoteFiles.length}개`)
  console.log(`  그 중 CSV와 매칭 성공한 개수: ${quoteCandidates.length}개`)

  if (quoteCandidates.length === 0 && allQuoteFiles.length > 0 && exportNames.size > 0) {
    const localSamples = allQuoteFiles.slice(0, 5).map((f) => f.fileName)
    const csvSamples = [...exportNames].slice(0, 5)
    console.log(`  [매칭 실패 시 비교용 샘플]`)
    console.log(`    로컬 파일명 샘플: ${localSamples.join(', ')}`)
    console.log(`    CSV export_name 샘플: ${csvSamples.join(', ')}`)
  }

  return [
    {
      space_id: spaceId,
      space_url: `folder:${folderName}`,
      space_name: folderName,
      primary_phone: extractPhoneFromMessagesJson(messages),
      address: extractAddressFromMessagesJson(messages),
      quoteCandidates,
      purchaseOrderCandidates,
    },
  ]
}

// --- Edge Function 호출 (FormData) ---
interface AnalyzeResult {
  category?: string
  result?: { type: string; data: unknown }
  error?: string
  /** Pre-check 실패 시 (견적서 아님, 회사 불일치, 필수 항목 부족) */
  skipped?: boolean
  reason?: string
}

interface ExistsResult {
  exists?: 'YES' | 'NO'
  error?: string
}

/** FormData로 Edge Function 호출 (503 시 재시도) */
async function callEdgeFunction(
  fileBuffer: Buffer,
  fileName: string,
  mode: 'exists' | 'estimates'
): Promise<Record<string, unknown>> {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const formData = new FormData()
    const mime = fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
    formData.append('file', new Blob([fileBuffer], { type: mime }), fileName)
    formData.append('fileName', fileName)
    formData.append('mode', mode)

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: formData,
      })

      let json: Record<string, unknown>
      try {
        json = (await res.json()) as Record<string, unknown>
      } catch {
        json = { error: `HTTP ${res.status}` }
      }

      if (!res.ok) {
        if (res.status === 503 && attempt < MAX_RETRIES) {
          lastErr = new Error(String(json.error ?? `HTTP ${res.status}`))
          await new Promise((r) => setTimeout(r, 2000 * attempt))
          continue
        }
        throw new Error(String(json.error ?? `HTTP ${res.status}`))
      }
      return json
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000 * attempt))
        continue
      }
      throw lastErr
    }
  }
  throw lastErr ?? new Error('Unknown error')
}

/** 1단계: 견적서 존재 여부 YES/NO (경량 이미지, 503 최소화) */
async function callExists(filePath: string, fileName: string, ext: string): Promise<ExistsResult> {
  const preprocessed = await preprocessForDetection(filePath, ext)
  const buffer = preprocessed ?? readFileSync(filePath)
  const sendName = preprocessed ? fileName.replace(/\.[^.]+$/, '.jpg') : fileName
  const json = await callEdgeFunction(buffer, sendName, 'exists')
  return json as ExistsResult
}

/** 2단계: 전체 견적서 분석 (이미지는 경량화, PDF는 원본) */
async function callAnalyzeQuote(filePath: string, fileName: string, ext: string): Promise<AnalyzeResult> {
  const preprocessed = await preprocessForAnalysis(filePath, ext)
  const buffer = preprocessed ?? readFileSync(filePath)
  const sendName = preprocessed ? fileName.replace(/\.[^.]+$/, '.jpg') : fileName
  const json = await callEdgeFunction(buffer, sendName, 'estimates')
  return json as AnalyzeResult
}

// --- Preview 모드 ---
interface MigrationPreviewItem {
  space_id: string
  space_url: string
  space_name: string
  primary_phone: string
  address: string
  quoteAnalyses: {
    fileName: string
    filePath: string
    result: AnalyzeResult
  }[]
  purchaseOrderPaths: { fileName: string; filePath: string }[]
}

function getPreviewFilename(folderArg: string | null): string {
  if (!folderArg) return 'migration-preview.json'
  const folderName = basename(folderArg.replace(/\/$/, '')) || folderArg.replace(/[/\\]/g, '_')
  const safe = folderName.replace(/\s+/g, '_') || 'folder'
  return `migration-preview-${safe}.json`
}

async function runPreview(folderArg: string | null): Promise<void> {
  let spaces: SpaceData[]
  if (folderArg) {
    const folderPath = folderArg.startsWith('/') ? folderArg : join(ROOT, folderArg)
    if (!existsSync(folderPath)) {
      console.error(`폴더가 없습니다: ${folderPath}`)
      process.exit(1)
    }
    console.log(`[1/2] 폴더 모드: ${folderArg} (messages.json + attachments/)`)
    spaces = extractFromFolder(folderPath)
  } else {
    console.log('[1/2] 데이터 조인 및 추출 (전체 CSV 스캔)...')
    spaces = joinAndExtract()
  }
  console.log(`  → ${spaces.length}개 스페이스 로드`)

  const totalQuotes = spaces.reduce((s, sp) => s + sp.quoteCandidates.length, 0)
  console.log(`[2/2] AI 분석 (견적서 후보 ${totalQuotes}건, 동시 ${CONCURRENCY}개)...`)

  const preview: MigrationPreviewItem[] = []
  let processed = 0

  for (const sp of spaces) {
    const quoteAnalyses: MigrationPreviewItem['quoteAnalyses'] = []
    for (const q of sp.quoteCandidates) {
      const task = limit(async () => {
        try {
          const isImage = IMAGE_EXTS.includes(q.ext.toLowerCase())
          if (isImage) {
            const existsRes = await callExists(q.filePath, q.fileName, q.ext)
            if (existsRes.exists === 'NO') {
              processed++
              process.stdout.write(`\r  ${processed}/${totalQuotes} 처리 중...`)
              console.log(`\n  [SKIP] Not a quotation: ${q.fileName}`)
              return { fileName: q.fileName, filePath: q.filePath, result: { skipped: true, reason: 'Not a quotation' } }
            }
          }
          const result = await callAnalyzeQuote(q.filePath, q.fileName, q.ext)
          processed++
          process.stdout.write(`\r  ${processed}/${totalQuotes} 처리 중...`)
          if (result.skipped) {
            const reason = result.reason || 'Not a quotation'
            console.log(`\n  [SKIP] ${reason}: ${q.fileName}`)
          }
          return { fileName: q.fileName, filePath: q.filePath, result }
        } catch (err) {
          processed++
          process.stdout.write(`\r  ${processed}/${totalQuotes} 처리 중...`)
          return {
            fileName: q.fileName,
            filePath: q.filePath,
            result: { error: err instanceof Error ? err.message : String(err) },
          }
        }
      })
      quoteAnalyses.push(await task)
    }

    preview.push({
      space_id: sp.space_id,
      space_url: sp.space_url,
      space_name: sp.space_name,
      primary_phone: sp.primary_phone,
      address: sp.address,
      quoteAnalyses,
      purchaseOrderPaths: sp.purchaseOrderCandidates.map((p) => ({ fileName: p.fileName, filePath: p.filePath })),
    })
  }

  const outputName = getPreviewFilename(folderArg)
  console.log(`\n  → 완료. ${outputName} 저장 중...`)
  const outputPath = join(ROOT, outputName)
  writeFileSync(outputPath, JSON.stringify(preview, null, 2), 'utf-8')
  console.log(`  → 저장 완료: ${outputPath}`)
}

// --- Upload 모드 ---
async function runUpload(folderArg: string | null): Promise<void> {
  const outputName = getPreviewFilename(folderArg)
  const previewPath = join(ROOT, outputName)
  if (!existsSync(previewPath)) {
    console.error(`${outputName}이 없습니다. 먼저 --mode preview${folderArg ? ` --folder "${folderArg}"` : ''}를 실행하세요.`)
    process.exit(1)
  }

  const preview = JSON.parse(readFileSync(previewPath, 'utf-8')) as MigrationPreviewItem[]
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  console.log(`[Upload] ${preview.length}개 스페이스 → consultations/estimates upsert`)

  for (let i = 0; i < preview.length; i++) {
    const item = preview[i]!
    const best = item.quoteAnalyses.find((a) => a.result?.result?.type === 'Estimates' && a.result?.result?.data)
    const data = best?.result?.result?.data as {
      siteName?: string
      recipientContact?: string
      site_location?: string
      total_amount?: number
      rows?: { no: string; name: string; spec: string; qty: string; unit: string; unitPrice: string; note?: string }[]
    } | undefined

    const companyName = data?.siteName || item.space_name || '(미지정)'
    const contact = data?.recipientContact || item.primary_phone || ''
    const address = data?.site_location || item.address || ''

    const { data: list } = await supabase.from('consultations').select('id, metadata')
    const existing = list?.find((c) => (c.metadata as Record<string, unknown>)?.space_url === item.space_url)

    const consultationPayload = {
      company_name: companyName,
      contact: contact || '번호 미등록',
      manager_name: '',
      expected_revenue: data?.total_amount ?? 0,
      status: '상담중',
      is_visible: true,
      is_test: true,
      metadata: {
        space_url: item.space_url,
        space_id: item.space_id,
        migration_source: 'google_chat_export',
        site_location: address,
        purchase_order_paths: item.purchaseOrderPaths.map((p) => p.filePath),
      },
    }

    if (existing) {
      await supabase.from('consultations').update(consultationPayload).eq('id', existing!.id)
      console.log(`  [${i + 1}/${preview.length}] 업데이트: ${companyName} (${existing!.id})`)

      if (data?.rows?.length && data.rows.some((r) => r.name || r.unitPrice)) {
        const payload = {
          recipientName: companyName,
          recipientContact: contact,
          rows: data.rows.map((r) => ({
            no: r.no,
            name: r.name,
            spec: r.spec,
            qty: r.qty,
            unit: r.unit,
            unitPrice: r.unitPrice,
            note: r.note ?? '',
          })),
        }
        const { data: estList } = await supabase
          .from('estimates')
          .select('id')
          .eq('consultation_id', existing!.id)
        if (estList?.length) {
          await supabase
            .from('estimates')
            .update({ payload: payload as object, approved_at: new Date().toISOString() })
            .eq('consultation_id', existing!.id)
        } else {
          await supabase.from('estimates').insert({
            id: randomUUID(),
            consultation_id: existing!.id,
            payload: payload as object,
            approved_at: new Date().toISOString(),
          })
        }
      }
    } else {
      const { data: inserted, error } = await supabase
        .from('consultations')
        .insert({ id: randomUUID(), ...consultationPayload })
        .select('id')
        .single()

      if (error) {
        console.error(`  [${i + 1}/${preview.length}] 오류: ${companyName}`, error.message)
        continue
      }

      console.log(`  [${i + 1}/${preview.length}] 신규: ${companyName} (${inserted!.id})`)

      if (data?.rows?.length && data.rows.some((r) => r.name || r.unitPrice)) {
        const payload = {
          recipientName: companyName,
          recipientContact: contact,
          rows: data.rows.map((r) => ({
            no: r.no,
            name: r.name,
            spec: r.spec,
            qty: r.qty,
            unit: r.unit,
            unitPrice: r.unitPrice,
            note: r.note ?? '',
          })),
        }
        await supabase.from('estimates').insert({
          id: randomUUID(),
          consultation_id: inserted!.id,
          payload: payload as object,
          approved_at: new Date().toISOString(),
        })
      }
    }
  }

  console.log('  → Upload 완료')
}

// --- 인자 파싱 ---
function parseArgs(): { mode: string | null; folder: string | null } {
  const args = process.argv.slice(2)
  let mode: string | null = null
  let folder: string | null = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[++i]
    } else if (args[i]?.startsWith('--mode=')) {
      mode = args[i]!.split('=')[1] ?? null
    } else if (args[i] === '--folder' && args[i + 1]) {
      folder = args[++i]
    } else if (args[i]?.startsWith('--folder=')) {
      folder = args[i]!.split('=')[1] ?? null
    }
  }
  return { mode, folder }
}

// --- Main ---
async function main() {
  const { mode, folder } = parseArgs()

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('.env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정하세요.')
    process.exit(1)
  }

  if (!existsSync(ROOT)) {
    console.error(`루트 폴더가 없습니다: ${ROOT}`)
    process.exit(1)
  }

  if (mode === 'preview') {
    await runPreview(folder)
  } else if (mode === 'upload') {
    await runUpload(folder)
  } else {
    console.error('사용: npx tsx scripts/migrate-data.ts --mode preview | upload [--folder "폴더경로"]')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
