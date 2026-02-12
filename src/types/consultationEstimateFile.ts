/** consultation_estimate_files 테이블 레코드 */
export interface ConsultationEstimateFile {
  id: string
  consultation_id: string
  project_name: string | null
  storage_path: string
  file_name: string
  file_type: 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp'
  created_at: string
}
