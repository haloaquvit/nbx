"use client"
import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"
import { ArrowLeft, Package, TrendingDown, BarChart3, ShoppingCart, FileText } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useMaterials } from '@/hooks/useMaterials'
import { useMaterialMovements } from '@/hooks/useMaterialMovements'

interface MaterialDetailProps {
  materialId: string
}

export function MaterialDetail({ materialId }: MaterialDetailProps) {
  const navigate = useNavigate()
  const { materials, isLoading: isMaterialsLoading } = useMaterials()
  const { stockMovements, isLoading: isMovementsLoading } = useMaterialMovements()
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  // Find the material
  const material = materials?.find(m => m.id === materialId)

  // Filter stock movements for this material and date range
  const materialMovements = useMemo(() => {
    if (!stockMovements || !dateRange?.from || !dateRange?.to) return []
    
    const from = startOfDay(dateRange.from)
    const to = endOfDay(dateRange.to)
    
    return stockMovements.filter(movement => {
      const movementDate = new Date(movement.createdAt)
      return movement.materialId === materialId && 
             movementDate >= from && 
             movementDate <= to
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [stockMovements, materialId, dateRange])

  // Calculate usage statistics for service materials
  const usageStats = useMemo(() => {
    if (!materialMovements || materialMovements.length === 0 || !material) {
      return {
        totalUsage: 0,
        totalTransactions: 0,
        averagePerTransaction: 0,
        estimatedBill: 0
      }
    }

    const totalUsage = materialMovements
      .filter(m => m.type === 'OUT') // Only count usage/consumption
      .reduce((sum, movement) => sum + movement.quantity, 0)
    
    const totalTransactions = new Set(
      materialMovements
        .filter(m => m.referenceType === 'transaction' && m.referenceId)
        .map(m => m.referenceId)
    ).size

    const averagePerTransaction = totalTransactions > 0 ? totalUsage / totalTransactions : 0
    const estimatedBill = totalUsage * (material.pricePerUnit || 0)

    return {
      totalUsage,
      totalTransactions,
      averagePerTransaction,
      estimatedBill
    }
  }, [materialMovements, material])

  // Group movements by month for monthly billing estimation
  const monthlyUsage = useMemo(() => {
    if (!materialMovements || materialMovements.length === 0 || !material) return []

    const months = materialMovements
      .filter(m => m.type === 'OUT')
      .reduce((acc, movement) => {
        const monthKey = format(new Date(movement.createdAt), 'yyyy-MM')
        const monthName = format(new Date(movement.createdAt), 'MMMM yyyy', { locale: id })
        
        if (!acc[monthKey]) {
          acc[monthKey] = {
            month: monthName,
            usage: 0,
            transactions: new Set()
          }
        }
        
        acc[monthKey].usage += movement.quantity
        if (movement.referenceId) {
          acc[monthKey].transactions.add(movement.referenceId)
        }
        
        return acc
      }, {} as Record<string, { month: string; usage: number; transactions: Set<string> }>)

    return Object.values(months)
      .map(m => ({
        ...m,
        transactionCount: m.transactions.size,
        estimatedBill: m.usage * (material.pricePerUnit || 0)
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
  }, [materialMovements, material])

  if (isMaterialsLoading || isMovementsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
          <div className="space-y-2">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-48 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-32 bg-gray-200 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (!material) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </Button>
        </div>
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-muted-foreground mb-4">Material Tidak Ditemukan</h1>
          <p className="text-muted-foreground mb-4">
            Material dengan ID "{materialId}" tidak ditemukan dalam sistem.
          </p>
          <Link to="/materials">
            <Button>Kembali ke Daftar Bahan</Button>
          </Link>
        </div>
      </div>
    )
  }

  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'OUT': return 'bg-red-100 text-red-800'
      case 'IN': return 'bg-green-100 text-green-800'
      case 'ADJUSTMENT': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'OUT': return 'Keluar'
      case 'IN': return 'Masuk'
      case 'ADJUSTMENT': return 'Penyesuaian'
      default: return type
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{material.name}</h1>
          <p className="text-muted-foreground">
            Detail bahan dan riwayat pemakaian
          </p>
        </div>
      </div>

      {/* Material Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Informasi Bahan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Jenis</Label>
              <Badge variant={material.type === 'Stock' ? 'default' : 'secondary'}>
                {material.type}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">
                {material.type === 'Stock' ? 'Stok Saat Ini' : 'Total Digunakan'}
              </Label>
              <p className="text-2xl font-semibold">
                {material.stock.toLocaleString('id-ID')} {material.unit}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">
                {material.type === 'Stock' ? 'Stok Minimum' : 'Tipe Kontrak'}
              </Label>
              <p className="text-lg">
                {material.type === 'Stock' 
                  ? `${material.minStock.toLocaleString('id-ID')} ${material.unit}`
                  : 'Jasa/Kontrak'
                }
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-muted-foreground">Harga per Unit</Label>
              <p className="text-lg">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(material.pricePerUnit)}
              </p>
            </div>
            {material.description && (
              <div className="space-y-2 col-span-full">
                <Label className="text-sm font-medium text-muted-foreground">Deskripsi</Label>
                <p className="text-sm">{material.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Service/Contract Material Usage Report - Only show for Beli/Jasa types */}
      {(material.type === 'Beli' || material.type === 'Jasa') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Laporan Penggunaan & Estimasi Tagihan
            </CardTitle>
            <CardDescription>
              Analisis penggunaan {material.name} dan estimasi biaya berdasarkan kontrak
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Total Digunakan</div>
                <div className="text-2xl font-bold text-blue-600">
                  {usageStats.totalUsage.toLocaleString('id-ID')} {material.unit}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Jumlah Transaksi</div>
                <div className="text-2xl font-bold text-green-600">
                  {usageStats.totalTransactions}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Rata-rata per Transaksi</div>
                <div className="text-2xl font-bold text-orange-600">
                  {usageStats.averagePerTransaction.toLocaleString('id-ID', { maximumFractionDigits: 2 })} {material.unit}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Estimasi Tagihan</div>
                <div className="text-2xl font-bold text-red-600">
                  {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(usageStats.estimatedBill)}
                </div>
              </div>
            </div>

            {/* Monthly Usage Breakdown */}
            {monthlyUsage.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Penggunaan per Bulan</h3>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bulan</TableHead>
                        <TableHead>Penggunaan</TableHead>
                        <TableHead>Transaksi</TableHead>
                        <TableHead className="text-right">Estimasi Tagihan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyUsage.map((month, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{month.month}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700">
                              {month.usage.toLocaleString('id-ID')} {material.unit}
                            </Badge>
                          </TableCell>
                          <TableCell>{month.transactionCount}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(month.estimatedBill)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Riwayat Pergerakan</CardTitle>
            <CardDescription>
              Pilih rentang tanggal untuk melihat riwayat pemakaian bahan
            </CardDescription>
          </div>
          <DateRangePicker date={dateRange} onDateChange={setDateRange} />
        </CardHeader>
        <CardContent>
          {materialMovements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Tidak ada pergerakan material dalam periode yang dipilih
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Alasan</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Transaksi</TableHead>
                    <TableHead>Keterangan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialMovements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>
                        {format(new Date(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: id })}
                      </TableCell>
                      <TableCell>
                        <Badge className={getMovementTypeColor(movement.type)}>
                          {getMovementTypeLabel(movement.type)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {movement.reason === 'PRODUCTION_CONSUMPTION' ? (
                          <Badge variant="outline">Produksi</Badge>
                        ) : movement.reason === 'PURCHASE' ? (
                          <Badge variant="outline">Pembelian</Badge>
                        ) : movement.reason === 'ADJUSTMENT' ? (
                          <Badge variant="outline">Penyesuaian</Badge>
                        ) : (
                          <Badge variant="outline">{movement.reason}</Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${
                        movement.type === 'OUT' ? 'text-red-600' :
                        movement.type === 'IN' ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {movement.type === 'OUT' ? '-' : '+'}
                        {movement.quantity.toLocaleString('id-ID')}
                      </TableCell>
                      <TableCell>
                        {movement.referenceId ? (
                          <Badge variant="outline" className="font-mono text-xs">
                            {movement.referenceId.slice(0, 8)}...
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {movement.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}