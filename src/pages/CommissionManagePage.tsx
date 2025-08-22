"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/use-toast"
import { useProducts } from "@/hooks/useProducts"
import { useCommissionRules } from "@/hooks/useCommissions"
import { useAuth } from "@/hooks/useAuth"
import { Loader2, Save, Calculator } from "lucide-react"
import { canManageCash } from '@/utils/roleUtils'

type RateRow = {
  productId: string
  sku: string
  name: string
  salesRate: number
  driverRate: number
  helperRate: number
}

export default function CommissionManagePage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { products, isLoading: loadingProducts } = useProducts()
  const { rules, isLoading: loadingRules, updateCommissionRate } = useCommissionRules()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Check if user can manage commissions (admin, owner, cashier)
  const canManage = canManageCash(user)

  const initial = useMemo<RateRow[]>(() => {
    if (!products || !rules) return []
    
    return products.map(p => {
      const sales = rules.find(r => r.productId === p.id && r.role === "sales")
      const driver = rules.find(r => r.productId === p.id && r.role === "driver")
      const helper = rules.find(r => r.productId === p.id && r.role === "helper")
      
      return {
        productId: p.id,
        sku: p.sku || p.id.substring(0, 8),
        name: p.name,
        salesRate: sales?.ratePerQty ?? 0,
        driverRate: driver?.ratePerQty ?? 0,
        helperRate: helper?.ratePerQty ?? 0,
      }
    })
  }, [products, rules])

  const [rows, setRows] = useState<RateRow[]>(initial)

  // Update rows when initial data changes
  useMemo(() => {
    setRows(initial)
  }, [initial])

  const updateRow = (index: number, field: keyof RateRow, value: number) => {
    const newRows = [...rows]
    newRows[index] = { ...newRows[index], [field]: value }
    setRows(newRows)
  }

  const saveCommissions = async () => {
    if (!canManage) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Anda tidak memiliki akses untuk mengubah komisi"
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Save all commission rates
      for (const row of rows) {
        if (row.salesRate !== initial.find(i => i.productId === row.productId)?.salesRate) {
          await updateCommissionRate(row.productId, "sales", row.salesRate)
        }
        if (row.driverRate !== initial.find(i => i.productId === row.productId)?.driverRate) {
          await updateCommissionRate(row.productId, "driver", row.driverRate)
        }
        if (row.helperRate !== initial.find(i => i.productId === row.productId)?.helperRate) {
          await updateCommissionRate(row.productId, "helper", row.helperRate)
        }
      }

      toast({
        title: "Berhasil",
        description: "Pengaturan komisi berhasil disimpan"
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menyimpan pengaturan komisi"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!canManage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Akses Ditolak</CardTitle>
            <CardDescription className="text-center">
              Anda tidak memiliki akses untuk mengelola komisi
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              Fitur ini hanya dapat diakses oleh Admin, Owner, atau Kasir
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (loadingProducts || loadingRules) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-4 text-blue-600 animate-spin" />
            <p className="text-lg font-medium">Memuat data...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardHeader className="py-6 px-6">
            <CardTitle className="flex items-center gap-3 text-2xl font-bold">
              <Calculator className="h-8 w-8" />
              Pengaturan Komisi
            </CardTitle>
            <CardDescription className="text-blue-100 text-lg mt-2">
              Atur komisi per produk untuk Sales, Driver, dan Helper
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Save Button */}
        <div className="flex justify-between items-center">
          <div className="text-sm text-slate-600">
            Komisi dihitung otomatis saat pengantaran diselesaikan (per produk dan per qty)
          </div>
          <Button
            onClick={saveCommissions}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Simpan Pengaturan
              </>
            )}
          </Button>
        </div>

        {/* Commission Table */}
        <Card>
          <CardHeader>
            <CardTitle>Daftar Produk & Komisi</CardTitle>
            <CardDescription>
              Masukkan nilai komisi dalam Rupiah per quantity untuk setiap produk
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg bg-white overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">SKU</th>
                    <th className="text-left px-4 py-3 font-semibold">Nama Produk</th>
                    <th className="text-left px-4 py-3 font-semibold">Komisi Sales / Qty</th>
                    <th className="text-left px-4 py-3 font-semibold">Komisi Driver / Qty</th>
                    <th className="text-left px-4 py-3 font-semibold">Komisi Helper / Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.productId} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{row.sku}</td>
                      <td className="px-4 py-3 font-medium">{row.name}</td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          className="w-40"
                          value={row.salesRate}
                          onChange={(e) => updateRow(index, 'salesRate', Number(e.target.value) || 0)}
                          placeholder="0"
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          className="w-40"
                          value={row.driverRate}
                          onChange={(e) => updateRow(index, 'driverRate', Number(e.target.value) || 0)}
                          placeholder="0"
                          min="0"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          className="w-40"
                          value={row.helperRate}
                          onChange={(e) => updateRow(index, 'helperRate', Number(e.target.value) || 0)}
                          placeholder="0"
                          min="0"
                        />
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                        Tidak ada produk ditemukan
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">📋 Cara Kerja Komisi:</p>
              <ul className="space-y-1 ml-4">
                <li>• <strong>Sales:</strong> Komisi dihitung saat transaksi dibuat</li>
                <li>• <strong>Driver & Helper:</strong> Komisi dihitung saat pengantaran selesai</li>
                <li>• <strong>Perhitungan:</strong> Komisi per qty × Jumlah produk yang diantar</li>
                <li>• <strong>Laporan:</strong> Lihat detail komisi di halaman Laporan Komisi</li>
              </ul>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}