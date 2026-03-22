export type OrderAssetType = 'purchase_order' | 'floor_plan'

export type OrderAssetFileType = 'image' | 'pdf' | 'ppt' | 'pptx'

export interface OrderAsset {
  id: string
  consultation_id: string | null
  asset_type: OrderAssetType
  storage_type: 'cloudinary' | 'supabase'
  file_url: string
  thumbnail_url: string | null
  storage_path: string | null
  public_id: string | null
  file_name: string | null
  file_type: OrderAssetFileType | null
  site_name: string | null
  business_type: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}
