/**
 * 가구 시공사례 이미지 자산 — 공통 속성 기반 일괄 업로드
 * - ImageAssetUploadForm 컴포넌트 사용 (standalone 모드)
 * - 여러 장 동시 선택(multiple) 또는 드래그 앤 드롭
 * - [지역, 업종, 컬러칩, 제품명 등] 한 번 입력 → 모든 사진에 공통 적용
 */
import { ImageAssetUploadForm } from '@/components/image/ImageAssetUploadForm'

export default function ImageAssetUpload() {
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <ImageAssetUploadForm variant="standalone" />
    </div>
  )
}
