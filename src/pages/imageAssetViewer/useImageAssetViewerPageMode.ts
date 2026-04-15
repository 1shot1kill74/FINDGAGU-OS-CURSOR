/** 현재는 관리자 창고(`/image-assets`)만 유지 */
export function useImageAssetViewerPageMode() {
  return {
    pageTitle: '이미지 자산 관리',
    pageDescription: '고객에게 보낼 사진을 고르고 선별 공유 링크를 만드는 작업 화면입니다.',
    isBankView: false,
  }
}
