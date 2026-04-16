/**
 * Cloudinary-Supabase 하이브리드 이미지 서비스
 * 구현은 `imageAsset*.ts` 모듈에 분리되어 있으며, 이 파일은 기존 `@/lib/imageAssetService` import 경로 호환용 barrel입니다.
 */
export type { ImageExportOptions, ImageAssetExportItem } from '@/types/imageExport'

export { generateFileName, getBaseAltTextFromDisplayName } from '@/lib/imageNaming'
export type { ProjectDataForFileName } from '@/lib/imageNaming'

export {
  computeFileHash,
  checkDuplicateByHash,
  getCloudinaryUploadOptions,
  isCloudinaryConfigured,
  isMockPublicId,
  uploadConstructionImageDual,
  uploadConstructionImageDualWithProgress,
  buildCloudinaryUrl,
  CLOUDINARY_CHAT_THUMB,
  buildCloudinaryUrlWithTransformation,
  getAssetUrl,
  getSyncStatus,
} from '@/lib/imageAssetCloudinary'

export {
  buildExternalDisplayName,
  buildBroadExternalDisplayName,
  getExternalDisplayNameFromImageAssetMeta,
  getBroadExternalDisplayNameFromImageAssetMeta,
} from '@/lib/imageAssetMeta'

export { rowToProjectAsset } from '@/lib/imageAssetProjectRows'

export type { ImageAssetSpaceBackfillResult } from '@/lib/imageAssetBackfill'
export {
  backfillImageAssetSpaceMetadata,
  backfillImageAssetBroadExternalDisplayNames,
  backfillImageAssetPublicWatermarks,
} from '@/lib/imageAssetBackfill'

export type {
  ImageAssetTreeYear,
  ImageAssetTreeRegion,
  ImageAssetTreeMeta,
  ProjectAssetUpdatePatch,
} from '@/lib/imageAssetProjectOperations'
export {
  fetchAllProjectAssets,
  fetchImageAssetsByBusinessType,
  fetchImageAssetTreeData,
  fetchApprovedProjectAssets,
  updateProjectAsset,
  updateProjectAssets,
  getBaseAltText,
  toMarkdownImageLine,
  buildImageExportPayload,
  ensureCanDelete,
  ensureCanUpdate,
  getDeleteSteps,
} from '@/lib/imageAssetProjectOperations'

export type {
  ShowroomImageAsset,
  ShowroomSiteOverride,
  ShowroomSiteOverrideSectionKey,
} from '@/lib/imageAssetShowroom'
export {
  getShowroomAssetGroupKey,
  getShowroomImagePreviewUrl,
  collectConsultationImagesForSiteRow,
  mapPublicShowroomRpcRowToShowroomAsset,
  fetchShowroomImageAssets,
  fetchShowroomSiteOverrides,
  saveShowroomSiteOverride,
  updateImageAssetConsultation,
  updateImageAssetBeforeAfter,
  updateImageAssetIndustry,
  updateImageAssetLocation,
  updateImageAssetTagColor,
  incrementImageAssetViewCount,
  incrementImageAssetShareCount,
  computeAiScoreFromEngagement,
  computeAndUpdateAiScores,
} from '@/lib/imageAssetShowroom'
