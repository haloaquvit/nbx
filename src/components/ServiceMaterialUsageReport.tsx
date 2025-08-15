"use client"
import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"
import { FileDown, Package2, BarChart3, Calculator, Calendar, TrendingUp } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useMaterials } from '@/hooks/useMaterials'
import { useMaterialMovements } from '@/hooks/useMaterialMovements'
import { useTransactions } from '@/hooks/useTransactions'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

export function ServiceMaterialUsageReport() {
  const { materials } = useMaterials()
  const { stockMovements, isLoading: isMovementsLoading } = useMaterialMovements()
  const { transactions } = useTransactions()
  
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  // Get only service materials (Beli/Jasa types)
  const serviceMaterials = useMemo(() => {
    return materials?.filter(m => m.type === 'Beli' || m.type === 'Jasa') || []
  }, [materials])

  // Find selected material
  const selectedMaterial = serviceMaterials.find(m => m.id === selectedMaterialId)

  // Filter movements for selected material and date range
  const filteredMovements = useMemo(() => {
    if (!stockMovements || !selectedMaterialId || !dateRange?.from || !dateRange?.to) return []
    
    const from = startOfDay(dateRange.from)
    const to = endOfDay(dateRange.to)
    
    return stockMovements.filter(movement => {
      const movementDate = new Date(movement.createdAt)
      return movement.materialId === selectedMaterialId && 
             movementDate >= from && 
             movementDate <= to &&
             movement.type === 'OUT' // Only usage/consumption
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [stockMovements, selectedMaterialId, dateRange])

  // Calculate usage statistics
  const usageStats = useMemo(() => {
    if (!filteredMovements.length || !selectedMaterial) {
      return {
        totalUsage: 0,
        totalTransactions: 0,
        averagePerTransaction: 0,
        estimatedBill: 0,
        transactionIds: []
      }
    }

    const totalUsage = filteredMovements.reduce((sum, movement) => sum + movement.quantity, 0)
    const transactionIds = [...new Set(filteredMovements
      .filter(m => m.referenceType === 'transaction' && m.referenceId)
      .map(m => m.referenceId))]
    const totalTransactions = transactionIds.length
    const averagePerTransaction = totalTransactions > 0 ? totalUsage / totalTransactions : 0
    const estimatedBill = totalUsage * selectedMaterial.pricePerUnit

    return {
      totalUsage,
      totalTransactions,
      averagePerTransaction,
      estimatedBill,
      transactionIds
    }
  }, [filteredMovements, selectedMaterial])

  // Group by month for detailed breakdown
  const monthlyBreakdown = useMemo(() => {
    if (!filteredMovements.length || !selectedMaterial) return []

    const months = filteredMovements.reduce((acc, movement) => {
      const monthKey = format(new Date(movement.createdAt), 'yyyy-MM')
      const monthName = format(new Date(movement.createdAt), 'MMMM yyyy', { locale: id })
      
      if (!acc[monthKey]) {
        acc[monthKey] = {
          month: monthName,
          monthKey,
          usage: 0,
          transactions: new Set(),
          movements: []
        }
      }
      
      acc[monthKey].usage += movement.quantity
      if (movement.referenceId) {
        acc[monthKey].transactions.add(movement.referenceId)
      }
      acc[monthKey].movements.push(movement)
      
      return acc
    }, {} as Record<string, { 
      month: string; 
      monthKey: string;
      usage: number; 
      transactions: Set<string>;
      movements: any[]
    }>)

    return Object.values(months)
      .map(m => ({
        ...m,
        transactionCount: m.transactions.size,
        estimatedBill: m.usage * selectedMaterial.pricePerUnit
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
  }, [filteredMovements, selectedMaterial])

  // Get transaction details for enhanced reporting
  const transactionDetails = useMemo(() => {
    if (!usageStats.transactionIds.length || !transactions) return []
    
    return transactions
      .filter(t => usageStats.transactionIds.includes(t.id))
      .map(transaction => {
        const relatedMovements = filteredMovements.filter(m => m.referenceId === transaction.id)
        const totalUsage = relatedMovements.reduce((sum, m) => sum + m.quantity, 0)
        const estimatedCost = totalUsage * (selectedMaterial?.pricePerUnit || 0)
        
        return {
          ...transaction,
          materialUsage: totalUsage,
          estimatedCost,
          relatedMovements
        }
      })
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime())
  }, [usageStats.transactionIds, transactions, filteredMovements, selectedMaterial])

  const handleExportPDF = () => {
    if (!selectedMaterial) return

    const pdf = new jsPDF()
    
    // Header
    pdf.setFontSize(16)
    pdf.text(`Laporan Penggunaan ${selectedMaterial.name}`, 20, 20)
    
    // Period
    pdf.setFontSize(12)
    const periodText = dateRange?.from && dateRange?.to 
      ? `Periode: ${format(dateRange.from, 'd MMMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMMM yyyy', { locale: id })}`
      : 'Semua Periode'
    pdf.text(periodText, 20, 30)
    
    // Summary
    pdf.setFontSize(14)
    pdf.text('Ringkasan Penggunaan:', 20, 45)
    pdf.setFontSize(11)
    pdf.text(`Total Digunakan: ${usageStats.totalUsage.toLocaleString('id-ID')} ${selectedMaterial.unit}`, 25, 55)
    pdf.text(`Jumlah Transaksi: ${usageStats.totalTransactions}`, 25, 65)
    pdf.text(`Rata-rata per Transaksi: ${usageStats.averagePerTransaction.toFixed(2)} ${selectedMaterial.unit}`, 25, 75)
    pdf.text(`Estimasi Tagihan: Rp ${usageStats.estimatedBill.toLocaleString('id-ID')}`, 25, 85)
    
    // Monthly breakdown table
    if (monthlyBreakdown.length > 0) {
      const monthlyData = monthlyBreakdown.map(month => [
        month.month,
        `${month.usage.toLocaleString('id-ID')} ${selectedMaterial.unit}`,
        month.transactionCount.toString(),
        `Rp ${month.estimatedBill.toLocaleString('id-ID')}`
      ])
      
      autoTable(pdf, {
        head: [['Bulan', 'Penggunaan', 'Transaksi', 'Estimasi Tagihan']],
        body: monthlyData,
        startY: 95,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [79, 70, 229] }
      })
    }
    
    // Transaction details
    if (transactionDetails.length > 0) {
      const transactionData = transactionDetails.slice(0, 20).map(tx => [
        format(new Date(tx.orderDate), 'dd/MM/yyyy', { locale: id }),
        tx.id.substring(0, 10),
        tx.customerName,
        `${tx.materialUsage.toLocaleString('id-ID')} ${selectedMaterial.unit}`,
        `Rp ${tx.estimatedCost.toLocaleString('id-ID')}`
      ])
      
      const finalY = (pdf as any).lastAutoTable?.finalY || 140
      autoTable(pdf, {
        head: [['Tanggal', 'No. Order', 'Pelanggan', 'Penggunaan', 'Estimasi Biaya']],
        body: transactionData,
        startY: finalY + 10,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [34, 197, 94] }
      })
    }
    
    const fileName = `laporan-${selectedMaterial.name.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.pdf`
    pdf.save(fileName)
  }

  const handleExportExcel = () => {
    if (!selectedMaterial) return

    // Summary sheet
    const summaryData = [
      ['Laporan Penggunaan', selectedMaterial.name],
      ['Periode', dateRange?.from && dateRange?.to 
        ? `${format(dateRange.from, 'd MMMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMMM yyyy', { locale: id })}`
        : 'Semua Periode'
      ],
      [''],
      ['Total Digunakan', `${usageStats.totalUsage} ${selectedMaterial.unit}`],
      ['Jumlah Transaksi', usageStats.totalTransactions],
      ['Rata-rata per Transaksi', `${usageStats.averagePerTransaction.toFixed(2)} ${selectedMaterial.unit}`],
      ['Harga per Unit', `Rp ${selectedMaterial.pricePerUnit.toLocaleString('id-ID')}`],
      ['Estimasi Total Tagihan', `Rp ${usageStats.estimatedBill.toLocaleString('id-ID')}`]
    ]

    // Monthly breakdown
    const monthlyData = [
      ['Bulan', 'Penggunaan', 'Transaksi', 'Estimasi Tagihan'],
      ...monthlyBreakdown.map(month => [
        month.month,
        month.usage,
        month.transactionCount,
        month.estimatedBill
      ])
    ]

    // Transaction details
    const transactionData = [
      ['Tanggal', 'No. Order', 'Pelanggan', 'Status', 'Penggunaan', 'Estimasi Biaya'],
      ...transactionDetails.map(tx => [
        format(new Date(tx.orderDate), 'dd/MM/yyyy', { locale: id }),
        tx.id,
        tx.customerName,
        tx.status,
        tx.materialUsage,
        tx.estimatedCost
      ])
    ]

    // Create workbook
    const wb = XLSX.utils.book_new()
    
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Ringkasan')
    
    if (monthlyData.length > 1) {
      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyData)
      XLSX.utils.book_append_sheet(wb, monthlyWs, 'Per Bulan')
    }
    
    if (transactionData.length > 1) {
      const transactionWs = XLSX.utils.aoa_to_sheet(transactionData)
      XLSX.utils.book_append_sheet(wb, transactionWs, 'Detail Transaksi')
    }

    const fileName = `laporan-${selectedMaterial.name.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Laporan Penggunaan Material Jasa/Kontrak
          </CardTitle>
          <CardDescription>
            Laporan khusus untuk material jasa seperti Astragraphia dengan estimasi tagihan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end mb-6">
            <div className="flex-1 max-w-sm">
              <label className="text-sm font-medium mb-2 block">Pilih Material</label>
              <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih material jasa/kontrak..." />
                </SelectTrigger>
                <SelectContent>
                  {serviceMaterials.map(material => (
                    <SelectItem key={material.id} value={material.id}>
                      {material.name} - {material.type} (Rp{material.pricePerUnit.toLocaleString('id-ID')}/{material.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Periode</label>
              <DateRangePicker date={dateRange} onDateChange={setDateRange} />
            </div>
          </div>

          {!selectedMaterial ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Pilih Material</h3>
              <p>Pilih material jasa/kontrak untuk melihat laporan penggunaan</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-2xl font-bold text-blue-600">
                          {usageStats.totalUsage.toLocaleString('id-ID')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedMaterial.unit} digunakan
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <BarChart3 className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold text-green-600">
                          {usageStats.totalTransactions}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Transaksi
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Calculator className="h-4 w-4 text-orange-500" />
                      <div>
                        <p className="text-2xl font-bold text-orange-600">
                          {usageStats.averagePerTransaction.toFixed(1)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedMaterial.unit}/transaksi
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-2xl font-bold text-red-600">
                          Rp{usageStats.estimatedBill.toLocaleString('id-ID')}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Estimasi tagihan
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Export Buttons */}
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleExportPDF} disabled={!filteredMovements.length}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
                <Button variant="outline" onClick={handleExportExcel} disabled={!filteredMovements.length}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
              </div>

              {/* Monthly Breakdown */}
              {monthlyBreakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Penggunaan per Bulan</CardTitle>
                  </CardHeader>
                  <CardContent>
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
                          {monthlyBreakdown.map((month, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-medium">{month.month}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                  {month.usage.toLocaleString('id-ID')} {selectedMaterial.unit}
                                </Badge>
                              </TableCell>
                              <TableCell>{month.transactionCount}</TableCell>
                              <TableCell className="text-right font-semibold">
                                Rp{month.estimatedBill.toLocaleString('id-ID')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Transaction Details */}
              {transactionDetails.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Detail Transaksi</CardTitle>
                    <CardDescription>
                      Daftar transaksi yang menggunakan {selectedMaterial.name}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>No. Order</TableHead>
                            <TableHead>Pelanggan</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Penggunaan</TableHead>
                            <TableHead className="text-right">Estimasi Biaya</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactionDetails.map((transaction) => (
                            <TableRow key={transaction.id}>
                              <TableCell>
                                {format(new Date(transaction.orderDate), 'dd/MM/yyyy HH:mm', { locale: id })}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-mono text-xs">
                                  {transaction.id}
                                </Badge>
                              </TableCell>
                              <TableCell>{transaction.customerName}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">{transaction.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-semibold text-blue-600">
                                {transaction.materialUsage.toLocaleString('id-ID')} {selectedMaterial.unit}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-red-600">
                                Rp{transaction.estimatedCost.toLocaleString('id-ID')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {filteredMovements.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Tidak Ada Data</h3>
                  <p>Tidak ada penggunaan material dalam periode yang dipilih</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}