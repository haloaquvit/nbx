"use client"
import { MobileWarehouseView } from '@/components/MobileWarehouseView'
import { useMobileDetection } from '@/hooks/useMobileDetection'
import { Navigate } from 'react-router-dom'

export default function WarehousePage() {
  const { shouldUseMobileLayout } = useMobileDetection()

  // For desktop, redirect to materials page
  if (!shouldUseMobileLayout) {
    return <Navigate to="/materials" replace />
  }

  // Mobile view
  return <MobileWarehouseView />
}
