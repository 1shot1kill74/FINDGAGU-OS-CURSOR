import React, { useState, useEffect, useMemo, useRef, useCallback, useId } from 'react'
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, Calculator } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  loadPriceTable,
  calculateAutoEstimate,
  getProductNames,
  getSpecsForProduct,
  type PriceTable,
  type AutoEstimateItem,
  type AutoEstimateResult,
} from '@/lib/autoEstimate'

// ─── Types ───────────────────────────────────────────────────────────────────

interface EstimateListItem {
  id: string
  grand_total: number
  supply_total: number
  approved_at: string | null
  created_at: string
  payload: Record<string, unknown>
}

interface AutoEstimateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filteredEstimateList: EstimateListItem[]
}

// ─── 콤보박스 (제품명 / 규격 공용) ──────────────────────────────────────────

interface ComboboxProps {
  value: string
  onChange: (val: string) => void
  onSelect: (val: string) => void
  suggestions: string[]
  placeholder: string
  className?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

function Combobox({ value, onChange, onSelect, suggestions, placeholder, className, onKeyDown }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)

  const visibleSuggestions = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, 20)
    const q = value.toLowerCase()
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 30)
  }, [value, suggestions])

  // 바깥 클릭 시 닫기
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        setActiveIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIdx((i) => Math.min(i + 1, visibleSuggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && visibleSuggestions[activeIdx]) {
        e.preventDefault()
        onSelect(visibleSuggestions[activeIdx]!)
        setOpen(false)
        setActiveIdx(-1)
      } else {
        onKeyDown?.(e)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIdx(-1)
    } else {
      onKeyDown?.(e)
    }
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActiveIdx(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="h-8 text-xs"
      />
      {open && visibleSuggestions.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto text-xs">
          {visibleSuggestions.map((s, i) => (
            <li
              key={s}
              className={cn(
                'cursor-pointer px-3 py-1.5 transition-colors',
                i === activeIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(s)
                setOpen(false)
                setActiveIdx(-1)
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── 매칭 배지 ───────────────────────────────────────────────────────────────

function MatchBadge({ type }: { type: AutoEstimateItem['id'] extends string ? AutoEstimateResult['rows'][0]['matchType'] : never }) {
  if (type === 'spec') return <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">✓ spec</span>
  if (type === 'base') return <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold shrink-0">△ BASE</span>
  return <span className="text-[10px] text-destructive font-semibold shrink-0">✗ 없음</span>
}

// ─── 금액 포맷 ───────────────────────────────────────────────────────────────

const w = (n: number) => Math.round(n).toLocaleString('ko-KR')
const pct = (r: number) => `${(r * 100).toFixed(1)}%`

// ─── Main Dialog ─────────────────────────────────────────────────────────────

export function AutoEstimateDialog({ open, onOpenChange, filteredEstimateList }: AutoEstimateDialogProps) {
  const uid = useId()

  // ── 가격 테이블 로딩 ───────────────────────────────────────────
  const [priceTable, setPriceTable] = useState<PriceTable | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (priceTable) return // 이미 로드됨
    loadPriceTable()
      .then((t) => setPriceTable(t))
      .catch(() => setLoadError('가격 테이블을 불러오지 못했습니다.'))
  }, [open, priceTable])

  // ── 제품 목록 ─────────────────────────────────────────────────
  const [items, setItems] = useState<AutoEstimateItem[]>([])

  // ── 입력 상태 ─────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState('')
  const [specInput, setSpecInput] = useState('')
  const [qtyInput, setQtyInput] = useState('1')
  const qtyRef = useRef<HTMLInputElement>(null)

  // ── 비교 토글 ─────────────────────────────────────────────────
  const [showComparison, setShowComparison] = useState(false)

  // ── 파생 데이터 ───────────────────────────────────────────────
  const productNames = useMemo(() => (priceTable ? getProductNames(priceTable) : []), [priceTable])
  const productCount = productNames.length
  const specSuggestions = useMemo(
    () => (priceTable ? getSpecsForProduct(priceTable, nameInput) : []),
    [priceTable, nameInput],
  )

  const result = useMemo(
    () => (priceTable && items.length > 0 ? calculateAutoEstimate(items, priceTable) : null),
    [items, priceTable],
  )

  const latestEstimate = filteredEstimateList[0] ?? null

  // ── 리셋 (닫힐 때) ────────────────────────────────────────────
  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        setItems([])
        setNameInput('')
        setSpecInput('')
        setQtyInput('1')
        setShowComparison(false)
      }
      onOpenChange(v)
    },
    [onOpenChange],
  )

  // ── 제품 추가 ─────────────────────────────────────────────────
  const handleAddItem = useCallback(() => {
    const name = nameInput.trim()
    const qty = parseInt(qtyInput, 10)
    if (!name || !qty || qty <= 0) return
    setItems((prev) => [
      ...prev,
      { id: `${uid}-${Date.now()}`, base_name: name, spec: specInput.trim(), qty },
    ])
    setNameInput('')
    setSpecInput('')
    setQtyInput('1')
  }, [nameInput, specInput, qtyInput, uid])

  // ── 제품 삭제 ─────────────────────────────────────────────────
  const handleRemoveItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl min-h-[75vh] max-h-[95vh] flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            자동 견적 계산기
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            표준 가격표 기준으로 자동 계산합니다. DB나 기존 견적서에 영향을 주지 않습니다.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-5">
          {/* 로딩 / 에러 */}
          {!priceTable && !loadError && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              가격 테이블 로드 중…
            </div>
          )}
          {loadError && (
            <p className="text-sm text-destructive text-center py-4">{loadError}</p>
          )}

          {priceTable && (
            <>
              {/* ── 제품 추가 입력 ─────────────────────────────── */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground mb-2">제품 추가</h3>
                <div className="flex gap-1.5 items-start">
                  <Combobox
                    value={nameInput}
                    onChange={setNameInput}
                    onSelect={(v) => { setNameInput(v); }}
                    suggestions={productNames}
                    placeholder={`제품명 입력 (총 ${productCount}개)`}
                    className="flex-[2]"
                    onKeyDown={(e) => { if (e.key === 'Enter') qtyRef.current?.focus() }}
                  />
                  <Combobox
                    value={specInput}
                    onChange={setSpecInput}
                    onSelect={setSpecInput}
                    suggestions={specSuggestions}
                    placeholder="규격 (선택)"
                    className="flex-[2]"
                    onKeyDown={(e) => { if (e.key === 'Enter') qtyRef.current?.focus() }}
                  />
                  <input
                    ref={qtyRef}
                    type="number"
                    min={1}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem() }}
                    placeholder="수량"
                    className="w-16 h-8 rounded-md border border-input bg-background px-2 text-xs text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 gap-1 shrink-0"
                    onClick={handleAddItem}
                    disabled={!nameInput.trim()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </Button>
                </div>
              </section>

              {/* ── 제품 목록 ─────────────────────────────────── */}
              {items.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground mb-2">추가된 제품 ({items.length}개)</h3>
                  <div className="rounded-md border border-border overflow-hidden">
                    {/* 헤더 */}
                    <div className="grid grid-cols-[1fr_1fr_3rem_7rem_7rem_5rem_2rem] gap-x-2 px-3 py-1.5 bg-muted/50 text-[10px] font-semibold text-muted-foreground border-b border-border">
                      <span>제품명</span>
                      <span>규격</span>
                      <span className="text-right">수량</span>
                      <span className="text-right">단가</span>
                      <span className="text-right">금액</span>
                      <span className="text-center">매칭</span>
                      <span />
                    </div>
                    {/* 행 */}
                    {result?.rows.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1fr_1fr_3rem_7rem_7rem_5rem_2rem] gap-x-2 px-3 py-1.5 text-xs border-b border-border/60 last:border-0 items-center"
                      >
                        <span className="truncate font-medium">{row.base_name}</span>
                        <span className="truncate text-muted-foreground">{row.spec || '—'}</span>
                        <span className="text-right">{row.qty}</span>
                        <span className={cn('text-right', row.unit_price === 0 && 'text-destructive')}>
                          {row.unit_price === 0 ? '0' : w(row.unit_price)}
                        </span>
                        <span className="text-right font-medium">{w(row.amount)}</span>
                        <span className="text-center">
                          <MatchBadge type={row.matchType} />
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(row.id)}
                          className="flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* 매칭 없음 경고 */}
                  {result && result.rows.some((r) => r.matchType === 'none') && (
                    <p className="text-[10px] text-destructive mt-1.5">
                      ✗ 없음 항목은 단가를 찾지 못했습니다. 가격 테이블에 등록되지 않은 제품입니다.
                    </p>
                  )}
                </section>
              )}

              {/* ── 계산 결과 ─────────────────────────────────── */}
              {result && result.supply_total > 0 && (
                <section className="rounded-md border border-border p-4 bg-muted/20 space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">공급가액</span>
                    <span className="font-medium tabular-nums">{w(result.supply_total)}원</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">배송비 ({pct(result.delivery_rate)})</span>
                    <span className="tabular-nums">{w(result.delivery_cost)}원</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">설치비 ({pct(result.install_rate)})</span>
                    <span className="tabular-nums">{w(result.install_cost)}원</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">부가세 (10%)</span>
                    <span className="tabular-nums">{w(result.vat)}원</span>
                  </div>
                  <div className="border-t border-border/60 pt-2 mt-2 flex justify-between items-center">
                    <span className="font-semibold">최종 합계</span>
                    <span className="text-lg font-bold text-primary tabular-nums">{w(result.grand_total)}원</span>
                  </div>
                </section>
              )}

              {/* ── 기존 견적과 비교하기 ─────────────────────── */}
              {result && result.supply_total > 0 && (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowComparison((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline w-full justify-center py-1.5"
                  >
                    {showComparison ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    기존 견적과 비교하기
                  </button>

                  {showComparison && (
                    <ComparisonPanel result={result} latestEstimate={latestEstimate} />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── 비교 패널 ───────────────────────────────────────────────────────────────

function ComparisonPanel({
  result,
  latestEstimate,
}: {
  result: AutoEstimateResult
  latestEstimate: EstimateListItem | null
}) {
  const engineTotal = result.grand_total
  const engineSupply = result.supply_total

  const actualTotal = latestEstimate ? Number(latestEstimate.grand_total ?? 0) : null
  const actualSupply = latestEstimate ? Number(latestEstimate.supply_total ?? 0) : null

  function diffSign(engine: number, actual: number) {
    const d = engine - actual
    return d >= 0 ? `+${w(d)}` : w(d)
  }
  function diffPct(engine: number, actual: number) {
    if (actual === 0) return 'N/A'
    return `${(((engine - actual) / actual) * 100).toFixed(1)}%`
  }

  if (!latestEstimate) {
    return (
      <div className="mt-3 rounded-md border border-border p-4 bg-muted/20 text-center text-sm text-muted-foreground">
        저장된 기존 견적이 없습니다. 먼저 견적을 작성해 주세요.
      </div>
    )
  }

  const latestDate = (() => {
    const raw = (latestEstimate.payload?.quoteDate) as string | undefined
    const d = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw) : new Date(latestEstimate.created_at)
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
  })()

  return (
    <div className="mt-3 rounded-md border border-border overflow-hidden text-xs">
      {/* 헤더 */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 px-4 py-2 bg-muted/50 border-b border-border font-semibold text-[10px] text-muted-foreground">
        <span />
        <span className="text-right">기존 견적 ({latestDate})</span>
        <span className="text-right">엔진 계산</span>
        <span className="text-right">차이</span>
      </div>
      {/* 공급가 행 */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 px-4 py-2 border-b border-border/60 items-center">
        <span className="text-muted-foreground shrink-0">공급가액</span>
        <span className="text-right tabular-nums">{actualSupply !== null ? `${w(actualSupply)}원` : '—'}</span>
        <span className="text-right tabular-nums">{w(engineSupply)}원</span>
        <span className={cn(
          'text-right tabular-nums',
          actualSupply !== null && engineSupply > actualSupply && 'text-red-600 dark:text-red-400',
          actualSupply !== null && engineSupply < actualSupply && 'text-emerald-600 dark:text-emerald-400',
        )}>
          {actualSupply !== null ? `${diffSign(engineSupply, actualSupply)} (${diffPct(engineSupply, actualSupply)})` : '—'}
        </span>
      </div>
      {/* 최종 합계 행 */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 px-4 py-2.5 items-center bg-muted/10 font-semibold">
        <span className="shrink-0">최종 합계</span>
        <span className="text-right tabular-nums">{actualTotal !== null ? `${w(actualTotal)}원` : '—'}</span>
        <span className="text-right tabular-nums text-primary">{w(engineTotal)}원</span>
        <span className={cn(
          'text-right tabular-nums',
          actualTotal !== null && engineTotal > actualTotal && 'text-red-600 dark:text-red-400',
          actualTotal !== null && engineTotal < actualTotal && 'text-emerald-600 dark:text-emerald-400',
        )}>
          {actualTotal !== null ? `${diffSign(engineTotal, actualTotal)} (${diffPct(engineTotal, actualTotal)})` : '—'}
        </span>
      </div>
      <p className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border/60 bg-muted/5">
        * 기존 견적: {latestEstimate.approved_at ? '발행됨' : '임시저장'} ·
        엔진 계산은 표준 가격표 기반이며 실제 견적과 다를 수 있습니다.
      </p>
    </div>
  )
}
