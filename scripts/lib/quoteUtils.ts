/**
 * scripts/lib/quoteUtils.ts
 *
 * 모든 분석 스크립트가 공유하는 유틸리티 모음
 */

import fs from "fs"
import path from "path"

// ─── 경로 상수 ─────────────────────────────────────────────────

export const BASE_DIR = "/Users/findgagu/findgagu-os-data"
export const INPUT_DIR = path.join(BASE_DIR, "parsed-quotes")
export const MIN_SAMPLES = 5

// ─── 타입 ──────────────────────────────────────────────────────

export interface Row {
  name?: unknown
  spec?: unknown
  qty?: unknown
  unitPrice?: unknown
}

export interface ParsedData {
  rows?: Row[]
  supply_total?: number
  grand_total?: number
  vat_amount?: number
  [key: string]: unknown
}

export interface QuoteEntry {
  filePath: string
  parsed: {
    space_id?: string
    source_image?: string
    data?: ParsedData
  }
}

// ─── 데이터 변환 ───────────────────────────────────────────────

export function toNumber(val: unknown): number {
  if (typeof val === "number") return val
  if (typeof val === "string") return Number(val.replace(/,/g, "")) || 0
  return 0
}

export function normalizeName(raw: string): string {
  const slashIdx = raw.indexOf("/")
  let base = slashIdx !== -1 ? raw.slice(0, slashIdx) : raw
  base = base.replace(/[()（）[\]]/g, "").trim().replace(/\s+/g, " ")
  return base
}

export function normalizeSpec(raw: string): string {
  return raw
    .replace(/[()（）[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

// ─── 파일 로딩 ─────────────────────────────────────────────────

export function collectJsonFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    if (fs.statSync(fullPath).isDirectory()) {
      results.push(...collectJsonFiles(fullPath))
    } else if (entry.endsWith(".json")) {
      results.push(fullPath)
    }
  }
  return results
}

export function loadAllEntries(dir: string): QuoteEntry[] {
  const files = collectJsonFiles(dir)
  const results: QuoteEntry[] = []
  for (const filePath of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"))
      results.push({ filePath, parsed })
    } catch {
      // skip invalid JSON
    }
  }
  return results
}

// ─── 통계 함수 ─────────────────────────────────────────────────

export function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

export function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length)
}

// ─── 출력 헬퍼 ─────────────────────────────────────────────────

export const pct = (n: number) => `${(n * 100).toFixed(1)}%`
export const won = (n: number) => Math.round(n).toLocaleString("ko-KR")

/** 한글 포함 문자열을 지정 폭으로 패딩 (한글 1자 = 2칸) */
export function pad(s: string, len: number, right = false): string {
  const displayLen = [...s].reduce((w, c) => w + (c.charCodeAt(0) > 127 ? 2 : 1), 0)
  const spaces = Math.max(0, len - displayLen)
  return right ? " ".repeat(spaces) + s : s + " ".repeat(spaces)
}
