/** image_assets / project_images 통합 조회·백필에서 공유하는 상수 */
export const BUCKET = 'construction-assets'

export const MOCK_PUBLIC_ID_PREFIX = 'mock_'

export const IMAGE_ASSET_MANAGEMENT_SELECT =
  'id, created_at, cloudinary_url, thumbnail_url, site_name, is_main, product_name, color_name, location, business_type, category, ai_score, view_count, internal_score, share_count, is_consultation, metadata'

export const IMAGE_ASSET_MANAGEMENT_CATEGORIES = ['책상', '의자', '책장', '사물함', '상담/실측', '기타'] as const

export const IMAGE_ASSET_PAGE_SIZE = 500
