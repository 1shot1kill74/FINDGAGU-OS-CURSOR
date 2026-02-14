/** consultation_estimate_files 테이블 레코드 */
export interface ConsultationEstimateFile {
  id: string
  consultation_id: string
  project_name: string | null
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp'
  created_at: string
  /** estimates=견적서(공급가), vendor_price=외주업체 단가표(원가). 입구별 구분. */
  upload_type?: 'estimates' | 'vendor_price'
  /** 견적서 AI 인식 견적일 (YYYY-MM-DD). upload_type=estimates일 때만, 카드 날짜 표시용 */
  quote_date?: string | null
}
