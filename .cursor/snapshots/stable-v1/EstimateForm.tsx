/**
 * 견적서 표준 양식 — 예산 기획(PROPOSAL) / 확정 견적(FINAL) 듀얼 모드
 * - PROPOSAL: 예산 기획안, 범위 단가·패키지·면책 문구
 * - FINAL: 표준 견적서, 승인 시 저장·상담 상태 견적발송
 */

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EstimateMode = 'PROPOSAL' | 'FINAL'

/** 천 단위 콤마 포맷 (표시용) */
function formatNumber(n: number): string {
  if (Number.isNaN(n) || n === 0) return '0'
  return Math.round(n).toLocaleString('ko-KR')
}

/** 문자열을 숫자로 파싱 (입력용) */
function parseNum(s: string): number {
  const v = parseFloat(String(s).replace(/,/g, ''))
  return Number.isNaN(v) ? 0 : v
}

export interface EstimateRow {
  no: string
  name: string
  spec: string
  qty: string
  unit: string
  unitPrice: string
  /** PROPOSAL 모드: 범위 단가 시 최대값 (비우면 고정 단가) */
  unitPriceMax?: string
  note: string
}

/** 공간별/패키지별 예산 (PROPOSAL 전용) */
export interface EstimatePackage {
  id: string
  name: string
  amountMin: string
  amountMax: string
}

export interface EstimateFormData {
  /** 예산 기획 vs 확정 견적 */
  mode: EstimateMode
  /** 수신자: 상호/성함 */
  recipientName: string
  /** 수신자: 연락처 */
  recipientContact: string
  /** 견적일시 (표시/입력) */
  quoteDate: string
  /** 공급자: 사업자번호 */
  bizNumber: string
  /** 공급자: 주소 */
  address: string
  /** 공급자: 연락처 */
  supplierContact: string
  /** 대표자 직인 이미지 URL (빈 값이면 placeholder 영역만) */
  sealImageUrl: string
  /** 견적 행 목록 */
  rows: EstimateRow[]
  /** 공간별/패키지별 예산 (PROPOSAL 시 사용) */
  packages?: EstimatePackage[]
  /** 특이사항 및 입금계좌 정보 */
  footerNotes: string
}

const SUPPLIER_DEFAULT = {
  company: 'FINDGAGU',
  representative: '김지윤',
}

const COLUMNS = ['번호', '품명', '규격', '수량', '단위', '단가', '금액(공급가)', '비고'] as const

function createEmptyRow(index: number): EstimateRow {
  return {
    no: String(index + 1),
    name: '',
    spec: '',
    qty: '',
    unit: '',
    unitPrice: '',
    note: '',
  }
}

const DEFAULT_ROWS_COUNT = 8

export interface EstimateFormProps {
  /** 초기 데이터 (없으면 빈 폼) */
  initialData?: Partial<EstimateFormData>
  /** 초기 모드 (없으면 FINAL) */
  initialMode?: EstimateMode
  /** 승인 시 콜백 — FINAL 모드에서만 호출, PDF 저장/전송·상담 상태 업데이트 */
  onApproved?: (data: EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }) => void
  /** PROPOSAL → FINAL 전환 시 콜백 (데이터 유지한 채 모드만 전환) */
  onConvertToFinal?: (data: EstimateFormData) => void
  /** true 시 하단 승인/전환 버튼 숨김 (풀스크린 모달 헤더 버튼 사용 시) */
  hideInternalActions?: boolean
  className?: string
}

export interface EstimateFormHandle {
  getCurrentData: () => EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }
  requestApprove: () => void
}

function createEmptyPackage(): EstimatePackage {
  return { id: crypto.randomUUID(), name: '', amountMin: '', amountMax: '' }
}

export const EstimateForm = forwardRef<EstimateFormHandle, EstimateFormProps>(function EstimateForm(
  { initialData, initialMode = 'FINAL', onApproved, onConvertToFinal, hideInternalActions, className },
  ref
) {
  const [mode, setMode] = useState<EstimateMode>(initialData?.mode ?? initialMode)
  const [recipientName, setRecipientName] = useState(initialData?.recipientName ?? '')
  const [recipientContact, setRecipientContact] = useState(initialData?.recipientContact ?? '')
  const [quoteDate, setQuoteDate] = useState(
    initialData?.quoteDate ?? new Date().toISOString().slice(0, 16).replace('T', ' ')
  )
  const [bizNumber, setBizNumber] = useState(initialData?.bizNumber ?? '')
  const [address, setAddress] = useState(initialData?.address ?? '')
  const [supplierContact, setSupplierContact] = useState(initialData?.supplierContact ?? '')
  const [sealImageUrl, setSealImageUrl] = useState(initialData?.sealImageUrl ?? '')
  const [footerNotes, setFooterNotes] = useState(initialData?.footerNotes ?? '')
  const [approved, setApproved] = useState(false)

  const [rows, setRows] = useState<EstimateRow[]>(() => {
    if (initialData?.rows?.length) return initialData.rows
    return Array.from({ length: DEFAULT_ROWS_COUNT }, (_, i) => createEmptyRow(i))
  })

  const [packages, setPackages] = useState<EstimatePackage[]>(() => {
    if (initialData?.packages?.length) return initialData.packages
    return [createEmptyPackage()]
  })

  const updateRow = useCallback((index: number, field: keyof EstimateRow, value: string) => {
    setRows((prev) => {
      const next = [...prev]
      const row = next[index] as Record<string, unknown>
      row[field] = value
      next[index] = { ...next[index], ...row } as EstimateRow
      return next
    })
  }, [])

  const updatePackage = useCallback((index: number, field: keyof EstimatePackage, value: string) => {
    setPackages((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }, [])

  const addPackage = useCallback(() => {
    setPackages((prev) => [...prev, createEmptyPackage()])
  }, [])

  /** 행별 금액 — FINAL: 단일값, PROPOSAL: 단일 또는 min~max */
  const { rowAmounts, rowAmountsMax, supplyTotal, supplyTotalMax, vat, vatMax, grandTotal, grandTotalMax, isRange } = useMemo(() => {
    const qtyList = rows.map((r) => parseNum(r.qty))
    const singleAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const p = parseNum(r.unitPrice)
      return q * p
    })
    const minAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      return q * Math.min(pMin, pMax)
    })
    const maxAmounts = rows.map((r, i) => {
      const q = qtyList[i]
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      return q * Math.max(pMin, pMax)
    })
    const hasRowRange = rows.some((r) => r.unitPriceMax && parseNum(r.unitPriceMax) > 0)
    const packageMin = packages.reduce((s, p) => s + parseNum(p.amountMin), 0)
    const packageMax = packages.reduce((s, p) => s + Math.max(parseNum(p.amountMin), parseNum(p.amountMax)), 0)
    const totalMin = minAmounts.reduce((a, b) => a + b, 0) + packageMin
    const totalMax = maxAmounts.reduce((a, b) => a + b, 0) + (packageMax > packageMin ? packageMax : packageMin)
    const useRange = mode === 'PROPOSAL' && (hasRowRange || packageMax > 0)
    const total = useRange ? totalMin : singleAmounts.reduce((a, b) => a + b, 0)
    const totalMaxVal = useRange ? totalMax : total
    const vatVal = Math.round(total * 0.1)
    const vatMaxVal = Math.round(totalMaxVal * 0.1)
    return {
      rowAmounts: useRange ? minAmounts : singleAmounts,
      rowAmountsMax: useRange ? maxAmounts : singleAmounts,
      supplyTotal: total,
      supplyTotalMax: totalMaxVal,
      vat: vatVal,
      vatMax: vatMaxVal,
      grandTotal: total + vatVal,
      grandTotalMax: totalMaxVal + vatMaxVal,
      isRange: useRange,
    }
  }, [rows, packages, mode])

  const handleApprove = useCallback(() => {
    setApproved(true)
    const data: EstimateFormData = {
      mode: 'FINAL',
      recipientName,
      recipientContact,
      quoteDate,
      bizNumber,
      address,
      supplierContact,
      sealImageUrl,
      rows,
      packages: mode === 'PROPOSAL' ? packages : undefined,
      footerNotes,
    }
    onApproved?.({
      ...data,
      supplyTotal: supplyTotal,
      vat,
      grandTotal,
    })
  }, [
    recipientName,
    recipientContact,
    quoteDate,
    bizNumber,
    address,
    supplierContact,
    sealImageUrl,
    rows,
    packages,
    mode,
    footerNotes,
    supplyTotal,
    vat,
    grandTotal,
    onApproved,
  ])

  /** 예산 기획안 → 확정 견적서 전환: 데이터 유지, 범위는 중간값으로 */
  const handleConvertToFinal = useCallback(() => {
    const convertedRows: EstimateRow[] = rows.map((r) => {
      const q = parseNum(r.qty)
      const pMin = parseNum(r.unitPrice)
      const pMax = r.unitPriceMax ? parseNum(r.unitPriceMax) : pMin
      const mid = pMin && (pMax > pMin) ? Math.round((pMin + pMax) / 2) : pMin || pMax
      return { ...r, unitPrice: String(mid), unitPriceMax: undefined }
    })
    const data: EstimateFormData = {
      mode: 'FINAL',
      recipientName,
      recipientContact,
      quoteDate,
      bizNumber,
      address,
      supplierContact,
      sealImageUrl,
      rows: convertedRows,
      packages,
      footerNotes,
    }
    setRows(convertedRows)
    setMode('FINAL')
    onConvertToFinal?.(data)
  }, [rows, recipientName, recipientContact, quoteDate, bizNumber, address, supplierContact, sealImageUrl, packages, footerNotes, onConvertToFinal])

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow(prev.length)])
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getCurrentData: () => {
        const data: EstimateFormData = {
          mode,
          recipientName,
          recipientContact,
          quoteDate,
          bizNumber,
          address,
          supplierContact,
          sealImageUrl,
          rows,
          packages: mode === 'PROPOSAL' ? packages : undefined,
          footerNotes,
        }
        return { ...data, supplyTotal: supplyTotal, vat, grandTotal }
      },
      requestApprove: () => handleApprove(),
    }),
    [
      recipientName,
      recipientContact,
      quoteDate,
      bizNumber,
      address,
      supplierContact,
      sealImageUrl,
      rows,
      packages,
      mode,
      footerNotes,
      supplyTotal,
      vat,
      grandTotal,
      handleApprove,
    ]
  )

  return (
    <article
      className={cn('mx-auto max-w-4xl bg-card text-card-foreground border border-border rounded-lg shadow-sm overflow-hidden', className)}
      aria-label={mode === 'PROPOSAL' ? '예산 기획안' : '견적서'}
    >
      {/* ——— 0. 듀얼 모드 스위치 ——— */}
      <div className="flex items-center gap-2 p-4 border-b border-border bg-muted/30">
        <span className="text-sm font-medium text-muted-foreground">모드</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode('PROPOSAL')}
            className={cn('px-3 py-1.5 text-sm font-medium transition-colors', mode === 'PROPOSAL' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
          >
            예산 기획(PROPOSAL)
          </button>
          <button
            type="button"
            onClick={() => setMode('FINAL')}
            className={cn('px-3 py-1.5 text-sm font-medium transition-colors', mode === 'FINAL' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}
          >
            확정 견적(FINAL)
          </button>
        </div>
      </div>

      {/* ——— 1. 상단 헤더 ——— */}
      <header className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 p-6 border-b border-border">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {mode === 'PROPOSAL' ? '예산 기획안' : '견적서'}
          </h1>
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">상호/성함</span>
              <Input
                className="max-w-xs inline-flex h-9"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="수신자 상호 또는 성함"
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">연락처</span>
              <Input
                className="max-w-xs inline-flex h-9"
                value={recipientContact}
                onChange={(e) => setRecipientContact(e.target.value)}
                placeholder="연락처"
              />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-muted-foreground">견적일시</span>
              <Input
                className="max-w-xs inline-flex h-9"
                type="datetime-local"
                value={quoteDate.replace(' ', 'T')}
                onChange={(e) => setQuoteDate(e.target.value.replace('T', ' '))}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col md:items-end gap-3">
          <div className="text-sm text-right space-y-1">
            <p><span className="text-muted-foreground">사업자번호</span> <Input className="inline-flex h-8 w-36 text-right" value={bizNumber} onChange={(e) => setBizNumber(e.target.value)} placeholder="000-00-00000" /></p>
            <p><span className="text-muted-foreground">상호</span> {SUPPLIER_DEFAULT.company}</p>
            <p><span className="text-muted-foreground">대표자</span> {SUPPLIER_DEFAULT.representative}</p>
            <p><span className="text-muted-foreground">주소</span> <Input className="inline-flex h-8 w-48 text-right" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" /></p>
            <p><span className="text-muted-foreground">연락처</span> <Input className="inline-flex h-8 w-36 text-right" value={supplierContact} onChange={(e) => setSupplierContact(e.target.value)} placeholder="연락처" /></p>
          </div>
          <div className="w-20 h-20 border-2 border-dashed border-muted-foreground/40 rounded flex items-center justify-center bg-muted/30">
            {sealImageUrl ? (
              <img src={sealImageUrl} alt="대표자 직인" className="w-16 h-16 object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">직인</span>
            )}
          </div>
        </div>
      </header>

      {/* ——— 2. 메인 견적 테이블 ——— */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              {COLUMNS.map((col) => (
                <th
                  key={col}
                  className={cn(
                    'border border-border px-2 py-2 text-left font-semibold',
                    (col === '단가' || col === '금액(공급가)') && 'text-right'
                  )}
                >
                  {col}
                </th>
              ))}
              {mode === 'PROPOSAL' && (
                <th className="border border-border px-2 py-2 text-right font-semibold">단가(최대)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b border-border">
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent" value={row.no} onChange={(e) => updateRow(idx, 'no', e.target.value)} />
                </td>
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent" value={row.name} onChange={(e) => updateRow(idx, 'name', e.target.value)} />
                </td>
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent" value={row.spec} onChange={(e) => updateRow(idx, 'spec', e.target.value)} />
                </td>
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={row.qty} onChange={(e) => updateRow(idx, 'qty', e.target.value)} />
                </td>
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent" value={row.unit} onChange={(e) => updateRow(idx, 'unit', e.target.value)} placeholder="EA" />
                </td>
                <td className="border border-border p-0 text-right">
                  <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={row.unitPrice} onChange={(e) => updateRow(idx, 'unitPrice', e.target.value)} placeholder={mode === 'PROPOSAL' ? '최소' : ''} />
                </td>
                <td className="border border-border px-2 py-2 text-right tabular-nums font-medium">
                  {isRange && rowAmounts[idx] !== rowAmountsMax[idx]
                    ? `${formatNumber(rowAmounts[idx])}~${formatNumber(rowAmountsMax[idx])}`
                    : formatNumber(rowAmounts[idx])}
                </td>
                <td className="border border-border p-0">
                  <Input className="h-9 border-0 rounded-none bg-transparent" value={row.note} onChange={(e) => updateRow(idx, 'note', e.target.value)} />
                </td>
                {mode === 'PROPOSAL' && (
                  <td className="border border-border p-0 text-right">
                    <Input className="h-9 border-0 rounded-none bg-transparent text-right" inputMode="numeric" value={row.unitPriceMax ?? ''} onChange={(e) => updateRow(idx, 'unitPriceMax', e.target.value)} placeholder="최대" />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-b border-border">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>+ 행 추가</Button>
      </div>

      {/* ——— 2-2. PROPOSAL: 공간별/패키지별 예산 ——— */}
      {mode === 'PROPOSAL' && (
        <div className="px-4 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground mb-2">공간별 / 패키지별 예산</h3>
          <div className="space-y-2">
            {packages.map((pkg, idx) => (
              <div key={pkg.id} className="flex flex-wrap items-center gap-2">
                <Input className="w-32 min-w-0" value={pkg.name} onChange={(e) => updatePackage(idx, 'name', e.target.value)} placeholder="예: 강의실 A" />
                <span className="text-muted-foreground text-sm">금액</span>
                <Input className="w-24 text-right" inputMode="numeric" value={pkg.amountMin} onChange={(e) => updatePackage(idx, 'amountMin', e.target.value)} placeholder="최소" />
                <span className="text-muted-foreground">~</span>
                <Input className="w-24 text-right" inputMode="numeric" value={pkg.amountMax} onChange={(e) => updatePackage(idx, 'amountMax', e.target.value)} placeholder="최대" />
                <span className="text-sm text-muted-foreground">원</span>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addPackage}>+ 패키지 추가</Button>
          </div>
        </div>
      )}

      {/* ——— 3. 하단 요약 및 안내 ——— */}
      <footer className="p-6 space-y-4">
        <div className="flex justify-end">
          <div className="border border-border rounded-md bg-muted/30 px-4 py-3 min-w-[220px] space-y-1 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">공급가액 합계</span>
              <span className="tabular-nums font-medium">
                {isRange ? `${formatNumber(supplyTotal)}~${formatNumber(supplyTotalMax)}원` : `${formatNumber(supplyTotal)}원`}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">부가세(10%)</span>
              <span className="tabular-nums font-medium">
                {isRange ? `${formatNumber(vat)}~${formatNumber(vatMax)}원` : `${formatNumber(vat)}원`}
              </span>
            </p>
            <p className="flex justify-between gap-4 border-t border-border pt-2 mt-2 font-semibold">
              <span>총 합계액</span>
              <span className="tabular-nums">
                {isRange ? `${formatNumber(grandTotal)}~${formatNumber(grandTotalMax)}원` : `${formatNumber(grandTotal)}원`}
              </span>
            </p>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">특이사항 및 입금계좌 정보</label>
          <textarea
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={footerNotes}
            onChange={(e) => setFooterNotes(e.target.value)}
            placeholder="입금 계좌, 특이사항 등을 입력하세요."
          />
        </div>

        {mode === 'PROPOSAL' && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2">
            ※ 실측 결과에 따라 금액 증감 가능
          </p>
        )}
        {mode === 'FINAL' && (
          <p className="text-xs text-muted-foreground">본 견적은 발행일로부터 7일간 유효함.</p>
        )}

        {/* PROPOSAL: 확정 견적서로 전환 | FINAL: 승인 (hideInternalActions 시 모달 헤더에서 처리) */}
        {!hideInternalActions && (
          <div className="flex flex-wrap gap-2 items-center pt-2">
            {mode === 'PROPOSAL' ? (
              <Button type="button" onClick={handleConvertToFinal}>
                확정 견적서로 전환
              </Button>
            ) : (
              <>
                <Button type="button" onClick={handleApprove} disabled={approved}>
                  {approved ? '승인 완료' : '승인'}
                </Button>
                {approved && (
                  <span className="text-sm text-muted-foreground">PDF 저장 및 전송을 진행할 수 있습니다.</span>
                )}
              </>
            )}
          </div>
        )}
      </footer>
    </article>
  )
})

export default EstimateForm
