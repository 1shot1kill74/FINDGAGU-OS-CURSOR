import React from 'react'
import { MeasurementSection } from '@/components/Consultation/MeasurementSection'
import type { OrderDocument } from '@/types/orderDocument'

interface ConsultationMeasurementTabProps {
  consultationId: string
  projectName: string
  orderDocuments: OrderDocument[]
  measurementDrawingPath?: string
  onOrderDocumentsChange: (data: OrderDocument[] | null) => void
}

export function ConsultationMeasurementTab({
  consultationId,
  projectName,
  orderDocuments,
  measurementDrawingPath,
  onOrderDocumentsChange,
}: ConsultationMeasurementTabProps) {
  return (
    <MeasurementSection
      consultationId={consultationId}
      projectName={projectName}
      orderDocuments={orderDocuments}
      measurementDrawingPath={measurementDrawingPath}
      onOrderDocumentsChange={(data) => onOrderDocumentsChange(data ?? [])}
    />
  )
}
