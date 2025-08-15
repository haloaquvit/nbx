"use client"
import { ServiceMaterialUsageReport } from '@/components/ServiceMaterialUsageReport'

export default function ServiceMaterialReportPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Laporan Penggunaan Material Jasa/Kontrak</h1>
        <p className="text-muted-foreground">
          Laporan khusus untuk tracking penggunaan dan estimasi tagihan material jasa seperti Astragraphia
        </p>
      </div>
      <ServiceMaterialUsageReport />
    </div>
  )
}