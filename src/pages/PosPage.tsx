"use client"
import { PosForm } from '@/components/PosForm'
import { MobilePosForm } from '@/components/MobilePosForm'
import { useMobileDetection } from '@/hooks/useMobileDetection'

export default function PosPage() {
  const { shouldUseMobileLayout } = useMobileDetection()

  if (shouldUseMobileLayout) {
    return <MobilePosForm />
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
        <div className="bg-primary text-primary-foreground p-4 rounded-t-lg">
            <h1 className="text-xl font-bold">Buat Transaksi Baru</h1>
            <p className="text-sm text-primary-foreground/80">
                Isi detail pesanan pelanggan pada form di bawah ini.
            </p>
        </div>
        <PosForm />
    </div>
  )
}