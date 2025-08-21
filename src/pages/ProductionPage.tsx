"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useProduction } from "@/hooks/useProduction"
import { useProducts } from "@/hooks/useProducts"
import { useAuth } from "@/hooks/useAuth"
import { useToast } from "@/components/ui/use-toast"
import { BOMItem } from "@/types/production"
import { format } from 'date-fns'
import { validateProductForProduction } from "@/utils/productValidation"

export default function ProductionPage() {
  const { user } = useAuth()
  const { products, isLoading: isLoadingProducts } = useProducts()
  const { productions, isLoading, getBOM, processProduction } = useProduction()
  const { toast } = useToast()
  
  const [selectedProductId, setSelectedProductId] = useState<string>("")
  const [quantity, setQuantity] = useState<number>(1)
  const [consumeBOM, setConsumeBOM] = useState<boolean>(true)
  const [note, setNote] = useState<string>("")
  const [bom, setBom] = useState<BOMItem[]>([])

  // Filter only Produksi type products (finished goods)
  const finishedGoods = useMemo(() => 
    products?.filter(p => p.type === 'Produksi') || [], 
    [products]
  )

  const selectedProduct = useMemo(() => 
    finishedGoods.find(p => p.id === selectedProductId), 
    [finishedGoods, selectedProductId]
  )

  // Load BOM when product changes
  useEffect(() => {
    if (selectedProductId) {
      getBOM(selectedProductId).then(setBom).catch((error) => {
        console.error('Error loading BOM:', error)
        setBom([])
      })
    } else {
      setBom([])
    }
  }, [selectedProductId, getBOM])

  // Set default product
  useEffect(() => {
    if (!selectedProductId && finishedGoods.length > 0) {
      setSelectedProductId(finishedGoods[0].id)
    }
  }, [finishedGoods, selectedProductId])

  const handleProduction = async () => {
    if (!selectedProductId || quantity <= 0 || !user) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Lengkapi data produksi"
      })
      return
    }

    if (!selectedProduct) {
      toast({
        variant: "destructive", 
        title: "Error",
        description: "Produk tidak ditemukan"
      })
      return
    }

    // Validate product for production
    const validation = await validateProductForProduction(selectedProductId, selectedProduct.type)
    if (!validation.valid) {
      toast({
        variant: "destructive",
        title: "Validation Error", 
        description: validation.message
      })
      return
    }

    const success = await processProduction({
      productId: selectedProductId,
      quantity,
      note: note || undefined,
      consumeBOM,
      createdBy: user.id
    })

    if (success) {
      setQuantity(1)
      setNote("")
    }
  }

  if (isLoadingProducts) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading products...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-lg md:text-xl font-semibold mb-2">Produksi</div>
      <div className="text-sm text-slate-600 mb-4">
        Input produksi untuk menambah stok Finished Goods. Jika "Konsumsi BOM" aktif, sistem otomatis mengurangi bahan.
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-4 mb-6">
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-slate-600 mb-1">Produk (Finished Goods)</div>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih produk..." />
              </SelectTrigger>
              <SelectContent>
                {finishedGoods.length === 0 ? (
                  <SelectItem value="no-products" disabled>Tidak ada produk Produksi tersedia</SelectItem>
                ) : (
                  finishedGoods.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="text-xs text-slate-600 mb-1">Qty Produksi</div>
            <Input
              type="number"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value || 0))}
              placeholder="0"
              min="1"
            />
          </div>
          <div>
            <div className="text-xs text-slate-600 mb-1">Catatan (opsional)</div>
            <Input 
              value={note} 
              onChange={(e) => setNote(e.target.value)} 
              placeholder="Catatan produksi" 
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="consume-bom"
              checked={consumeBOM}
              onCheckedChange={setConsumeBOM}
            />
            <Label htmlFor="consume-bom" className="text-sm">
              Konsumsi BOM
            </Label>
          </div>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white" 
            onClick={handleProduction}
            disabled={isLoading || !selectedProductId || quantity <= 0}
          >
            {isLoading ? "Processing..." : "Proses Produksi"}
          </Button>
        </div>

        {/* BOM Preview */}
        {selectedProduct && bom && bom.length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-slate-600 mb-1">Ringkasan BOM (per 1 unit)</div>
            <div className="border rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="text-left px-3 py-2">Material</th>
                      <th className="text-left px-3 py-2">Unit</th>
                      <th className="text-left px-3 py-2">Qty per Unit</th>
                      <th className="text-left px-3 py-2">Total Qty ({quantity} unit)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bom.map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="px-3 py-2">{item.materialName}</td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2 font-medium">
                          {(item.quantity * quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              BOM hanya dikonsumsi jika opsi "Konsumsi BOM" diaktifkan.
            </div>
          </div>
        )}

        {selectedProduct && bom.length === 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
            Produk ini belum memiliki BOM (Bill of Materials). Produksi akan tetap berjalan tanpa konsumsi bahan.
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="px-4 py-3 font-medium">Riwayat Produksi Terakhir</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2">Waktu</th>
                <th className="text-left px-3 py-2">Ref</th>
                <th className="text-left px-3 py-2">Produk</th>
                <th className="text-left px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">BOM</th>
                <th className="text-left px-3 py-2">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {productions.map((record) => (
                <tr key={record.id} className="border-t">
                  <td className="px-3 py-2">
                    {format(record.createdAt, 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {record.ref}
                  </td>
                  <td className="px-3 py-2">{record.productName}</td>
                  <td className="px-3 py-2 font-medium">{record.quantity}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      record.consumeBOM 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {record.consumeBOM ? 'Ya' : 'Tidak'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {record.note || '-'}
                  </td>
                </tr>
              ))}
              {productions.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                    {isLoading ? 'Loading...' : 'Belum ada produksi'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}