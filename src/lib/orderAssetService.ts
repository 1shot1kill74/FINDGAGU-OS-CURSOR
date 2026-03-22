import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import type { OrderAsset, OrderAssetFileType, OrderAssetType } from '@/types/orderAsset'
import { deleteCloudinaryImage, deleteSupabaseDocument } from '@/lib/uploadEngine'

interface OrderAssetRow {
  id: string
  consultation_id: string | null
  asset_type: string
  storage_type: string
  file_url: string
  thumbnail_url: string | null
  storage_path: string | null
  public_id: string | null
  file_name: string | null
  file_type: string | null
  site_name: string | null
  business_type: string | null
  metadata: Json | null
  created_at: string
}

export interface OrderAssetInsertPayload {
  consultation_id: string
  asset_type: OrderAssetType
  storage_type: 'cloudinary' | 'supabase'
  file_url: string
  thumbnail_url?: string | null
  storage_path?: string | null
  public_id?: string | null
  file_name?: string | null
  file_type?: OrderAssetFileType | null
  site_name?: string | null
  business_type?: string | null
  metadata?: Record<string, unknown> | null
}

function rowToOrderAsset(row: OrderAssetRow): OrderAsset {
  return {
    id: row.id,
    consultation_id: row.consultation_id,
    asset_type: row.asset_type as OrderAssetType,
    storage_type: row.storage_type as OrderAsset['storage_type'],
    file_url: row.file_url,
    thumbnail_url: row.thumbnail_url,
    storage_path: row.storage_path,
    public_id: row.public_id,
    file_name: row.file_name,
    file_type: (row.file_type as OrderAssetFileType | null) ?? null,
    site_name: row.site_name,
    business_type: row.business_type,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    created_at: row.created_at,
  }
}

const ORDER_ASSET_SELECT =
  'id, consultation_id, asset_type, storage_type, file_url, thumbnail_url, storage_path, public_id, file_name, file_type, site_name, business_type, metadata, created_at'

export async function insertOrderAsset(payload: OrderAssetInsertPayload): Promise<{ id: string } | { error: Error }> {
  const { error, data } = await supabase
    .from('order_assets')
    .insert({
      consultation_id: payload.consultation_id,
      asset_type: payload.asset_type,
      storage_type: payload.storage_type,
      file_url: payload.file_url,
      thumbnail_url: payload.thumbnail_url ?? null,
      storage_path: payload.storage_path ?? null,
      public_id: payload.public_id ?? null,
      file_name: payload.file_name ?? null,
      file_type: payload.file_type ?? null,
      site_name: payload.site_name ?? null,
      business_type: payload.business_type ?? null,
      metadata: (payload.metadata ?? null) as Json | null,
    })
    .select('id')
    .single()
  if (error) return { error: new Error(error.message) }
  return { id: (data as { id: string }).id }
}

export async function fetchOrderAssetsByConsultation(consultationId: string): Promise<OrderAsset[]> {
  const { data, error } = await supabase
    .from('order_assets')
    .select(ORDER_ASSET_SELECT)
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: false })
  if (error) return []
  return ((data ?? []) as OrderAssetRow[]).map(rowToOrderAsset)
}

export async function fetchAllOrderAssets(): Promise<OrderAsset[]> {
  const { data, error } = await supabase
    .from('order_assets')
    .select(ORDER_ASSET_SELECT)
    .order('created_at', { ascending: false })
  if (error) return []
  return ((data ?? []) as OrderAssetRow[]).map(rowToOrderAsset)
}

function parseCloudinaryPublicId(fileUrl: string): string | null {
  const match = fileUrl.match(/\/upload\/(?:[^/]+\/)?(.+)$/)
  return match?.[1] ?? null
}

export async function deleteOrderAsset(asset: OrderAsset): Promise<{ error: Error | null }> {
  const { error: dbError } = await supabase.from('order_assets').delete().eq('id', asset.id)
  if (dbError) return { error: new Error(dbError.message) }

  if (asset.storage_type === 'supabase' && asset.storage_path) {
    const ok = await deleteSupabaseDocument(asset.storage_path)
    if (!ok) return { error: new Error('DB는 삭제되었으나 Storage 원본 삭제에 실패했습니다.') }
    return { error: null }
  }

  const publicId = asset.public_id ?? parseCloudinaryPublicId(asset.file_url)
  if (publicId) {
    const ok = await deleteCloudinaryImage(publicId)
    if (!ok) return { error: new Error('DB는 삭제되었지만 Cloudinary 원본 삭제는 보안상 클라이언트에서 비활성화되어 있습니다.') }
  }
  return { error: null }
}
