export type EstimateMode = 'PROPOSAL' | 'FINAL'

export interface EstimateRow {
  no: string
  name: string
  spec: string
  qty: string
  unit: string
  unitPrice: string
  unitPriceMax?: string
  note?: string
  adjusted?: boolean
  costPrice?: string
  color?: string
  costEstimated?: boolean
  aiUncertain?: boolean
  aiReason?: string
  is_confirmed?: boolean
}

export interface EstimateFormData {
  mode: EstimateMode
  recipientName: string
  recipientContact: string
  quoteDate: string
  bizNumber: string
  address: string
  supplierContact: string
  sealImageUrl: string
  rows: EstimateRow[]
  footerNotes: string
}

export interface EstimateFormHandle {
  getCurrentData: () => EstimateFormData & { supplyTotal: number; vat: number; grandTotal: number }
  requestApprove: () => void
}

function parseNum(value: string | number | null | undefined): number {
  const parsed = parseFloat(String(value ?? '').replace(/,/g, ''))
  return Number.isNaN(parsed) ? 0 : parsed
}

export function createEmptyRow(index: number): EstimateRow {
  return {
    no: String(index + 1),
    name: '',
    spec: '',
    qty: '',
    unit: '',
    unitPrice: '',
    note: '',
    costPrice: '',
    color: '',
  }
}

export function computeProposalTotals(data: EstimateFormData) {
  const rows = data.rows ?? []
  const qtyList = rows.map((row) => parseNum(row.qty))
  const rowAmounts = rows.map((row, index) => {
    const qty = qtyList[index]
    const minPrice = parseNum(row.unitPrice)
    const maxPrice = row.unitPriceMax ? parseNum(row.unitPriceMax) : minPrice
    return qty * Math.min(minPrice, maxPrice)
  })
  const rowAmountsMax = rows.map((row, index) => {
    const qty = qtyList[index]
    const minPrice = parseNum(row.unitPrice)
    const maxPrice = row.unitPriceMax ? parseNum(row.unitPriceMax) : minPrice
    return qty * Math.max(minPrice, maxPrice)
  })
  const supplyTotal = rowAmounts.reduce((sum, value) => sum + value, 0)
  const supplyTotalMax = rowAmountsMax.reduce((sum, value) => sum + value, 0)
  const vat = Math.round(supplyTotal * 0.1)
  const vatMax = Math.round(supplyTotalMax * 0.1)

  return {
    rowAmounts,
    rowAmountsMax,
    supplyTotal,
    supplyTotalMax,
    vat,
    vatMax,
    grandTotal: supplyTotal + vat,
    grandTotalMax: supplyTotalMax + vatMax,
  }
}

export function computeFinalTotals(data: EstimateFormData) {
  const rows = data.rows ?? []
  const qtyList = rows.map((row) => parseNum(row.qty))
  const rowAmounts = rows.map((row, index) => qtyList[index] * parseNum(row.unitPrice))
  const supplyTotal = rowAmounts.reduce((sum, value) => sum + value, 0)
  const vat = Math.round(supplyTotal * 0.1)

  return {
    rowAmounts,
    supplyTotal,
    vat,
    grandTotal: supplyTotal + vat,
  }
}
