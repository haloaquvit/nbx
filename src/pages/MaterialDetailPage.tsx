"use client"
import { useParams } from 'react-router-dom'
import { MaterialDetail } from '@/components/MaterialDetail'

export default function MaterialDetailPage() {
  const { materialId } = useParams<{ materialId: string }>()

  if (!materialId) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-semibold text-muted-foreground">Material tidak ditemukan</h1>
      </div>
    )
  }

  return <MaterialDetail materialId={materialId} />
}