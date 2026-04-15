import { useCallback, useState } from 'react'
import type { DetailPanelTab } from '@/pages/consultation/consultationManagementTypes'

/** 상담 관리 우측 상세 패널의 활성 탭 상태 */
export function useConsultationDetailPanelTab() {
  const [detailPanelTab, setDetailPanelTab] = useState<DetailPanelTab>('history')
  const openEstimateTab = useCallback(() => {
    setDetailPanelTab('estimate')
  }, [])
  return { detailPanelTab, setDetailPanelTab, openEstimateTab }
}
