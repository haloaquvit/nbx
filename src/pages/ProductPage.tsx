"use client"
import { ProductManagement } from '@/components/ProductManagement'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useMaterials } from '@/hooks/useMaterials' // Tambahkan ini

export default function ProductPage() {
  const { materials } = useMaterials() // Dapatkan data materials

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Manajemen Produk Percetakan</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductManagement materials={materials || []} /> {/* Pastikan selalu ada array */}
        </CardContent>
      </Card>
    </div>
  )
}