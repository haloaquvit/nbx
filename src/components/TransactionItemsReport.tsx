"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTransactions } from '@/hooks/useTransactions'
import { FileText, Download, Calendar, Package, CalendarDays, ShoppingCart, ListChecks } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { id } from 'date-fns/locale/id'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

interface TransactionItem {
  transactionId: string
  transactionDate: Date
  customerName: string
  itemName: string
  quantity: number
  unit: string
  price: number
  total: number
  status: string
  cashierName: string
}

interface MaterialUsage {
  materialId: string
  materialName: string
  materialUnit: string
  totalUsed: number
  transactions: {
    transactionId: string
    transactionDate: Date
    customerName: string
    productName: string
    productQuantity: number
    materialQuantity: number
  }[]
}

export const TransactionItemsReport = () => {
  const [filterType, setFilterType] = useState<'monthly' | 'dateRange'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [reportData, setReportData] = useState<TransactionItem[]>([])
  const [materialUsageData, setMaterialUsageData] = useState<MaterialUsage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const { transactions } = useTransactions()

  const months = [
    { value: 1, label: 'Januari' },
    { value: 2, label: 'Februari' },
    { value: 3, label: 'Maret' },
    { value: 4, label: 'April' },
    { value: 5, label: 'Mei' },
    { value: 6, label: 'Juni' },
    { value: 7, label: 'Juli' },
    { value: 8, label: 'Agustus' },
    { value: 9, label: 'September' },
    { value: 10, label: 'Oktober' },
    { value: 11, label: 'November' },
    { value: 12, label: 'Desember' },
  ]

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  const extractMaterialUsage = (transactionList: any[], fromDate: Date, toDate: Date): MaterialUsage[] => {
    const materialUsageMap: Record<string, MaterialUsage> = {}
    
    transactionList?.forEach(transaction => {
      const transactionDate = new Date(transaction.orderDate)
      
      // Filter by date range
      if (transactionDate >= fromDate && transactionDate <= toDate) {
        // Extract materials from each item in transaction
        transaction.items?.forEach((item: any) => {
          const productName = item.product?.name || item.name || 'Unknown Product'
          const productQuantity = Number(item.quantity || 0)
          
          // Extract materials from product BOM (Bill of Materials)
          if (item.product?.materials && Array.isArray(item.product.materials)) {
            item.product.materials.forEach((material: any) => {
              const materialId = material.materialId || material.id
              const materialName = material.materialName || material.name || 'Unknown Material'
              const materialUnit = material.unit || 'pcs'
              const materialQuantityPerProduct = Number(material.quantity || 0)
              const totalMaterialQuantity = materialQuantityPerProduct * productQuantity
              
              if (materialId && totalMaterialQuantity > 0) {
                if (!materialUsageMap[materialId]) {
                  materialUsageMap[materialId] = {
                    materialId,
                    materialName,
                    materialUnit,
                    totalUsed: 0,
                    transactions: []
                  }
                }
                
                materialUsageMap[materialId].totalUsed += totalMaterialQuantity
                materialUsageMap[materialId].transactions.push({
                  transactionId: transaction.id,
                  transactionDate: transactionDate,
                  customerName: transaction.customerName || 'Customer',
                  productName: productName,
                  productQuantity: productQuantity,
                  materialQuantity: totalMaterialQuantity
                })
              }
            })
          }
        })
      }
    })

    return Object.values(materialUsageMap).sort((a, b) => b.totalUsed - a.totalUsed)
  }

  const extractTransactionItems = (transactionList: any[], fromDate: Date, toDate: Date): TransactionItem[] => {
    const items: TransactionItem[] = []
    
    transactionList?.forEach(transaction => {
      const transactionDate = new Date(transaction.orderDate)
      
      // Filter by date range
      if (transactionDate >= fromDate && transactionDate <= toDate) {
        // Extract each item from transaction
        transaction.items?.forEach((item: any) => {
          items.push({
            transactionId: transaction.id,
            transactionDate: transactionDate,
            customerName: transaction.customerName || 'Customer',
            itemName: item.product?.name || item.name || 'Unknown Item',
            quantity: Number(item.quantity || 0),
            unit: item.product?.unit || item.unit || 'pcs',
            price: Number(item.product?.basePrice || item.price || 0),
            total: Number(item.quantity || 0) * Number(item.product?.basePrice || item.price || 0),
            status: transaction.status,
            cashierName: transaction.cashierName || 'Unknown'
          })
        })
      }
    })

    return items.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime())
  }

  const handleGenerateReport = async () => {
    setIsLoading(true)
    try {
      let fromDate: Date
      let toDate: Date
      
      if (filterType === 'monthly') {
        fromDate = startOfMonth(new Date(selectedYear, selectedMonth - 1))
        toDate = endOfMonth(new Date(selectedYear, selectedMonth - 1))
      } else {
        fromDate = new Date(startDate)
        toDate = new Date(endDate)
        toDate.setHours(23, 59, 59, 999) // End of day
      }
      
      const items = extractTransactionItems(transactions || [], fromDate, toDate)
      const materialUsage = extractMaterialUsage(transactions || [], fromDate, toDate)
      setReportData(items)
      setMaterialUsageData(materialUsage)
    } catch (error) {
      console.error('Error generating report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getReportTitle = () => {
    if (filterType === 'monthly') {
      const monthName = months.find(m => m.value === selectedMonth)?.label
      return `Laporan Item Keluar - ${monthName} ${selectedYear}`
    } else {
      return `Laporan Item Keluar - ${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }
  }

  const handlePrintReport = () => {
    const doc = new jsPDF('landscape') // Use landscape for more columns
    const title = getReportTitle()
    
    // Add title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 22)
    
    // Add generation date
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 14, 30)
    
    // Prepare table data
    const tableData = reportData.map(item => [
      format(item.transactionDate, 'dd/MM/yyyy'),
      item.transactionId,
      item.customerName,
      item.itemName,
      item.quantity.toString(),
      item.unit,
      `Rp ${item.price.toLocaleString()}`,
      `Rp ${item.total.toLocaleString()}`,
      item.status,
      item.cashierName
    ])
    
    // Add table
    ;(doc as any).autoTable({
      head: [['Tanggal', 'No. Transaksi', 'Customer', 'Item', 'Qty', 'Unit', 'Harga', 'Total', 'Status', 'Kasir']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
      columnStyles: {
        0: { cellWidth: 25 }, // Tanggal
        1: { cellWidth: 35 }, // No. Transaksi
        2: { cellWidth: 40 }, // Customer
        3: { cellWidth: 60 }, // Item
        4: { cellWidth: 20 }, // Qty
        5: { cellWidth: 20 }, // Unit
        6: { cellWidth: 30 }, // Harga
        7: { cellWidth: 35 }, // Total
        8: { cellWidth: 25 }, // Status
        9: { cellWidth: 30 }  // Kasir
      }
    })
    
    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan:', 14, finalY)
    
    const totalItems = reportData.length
    const totalQuantity = reportData.reduce((sum, item) => sum + item.quantity, 0)
    const totalValue = reportData.reduce((sum, item) => sum + item.total, 0)
    const uniqueTransactions = new Set(reportData.map(item => item.transactionId)).size
    
    doc.setFont('helvetica', 'normal')
    doc.text(`• Total Item: ${totalItems}`, 14, finalY + 8)
    doc.text(`• Total Quantity: ${totalQuantity}`, 14, finalY + 16)
    doc.text(`• Total Nilai: Rp ${totalValue.toLocaleString()}`, 14, finalY + 24)
    doc.text(`• Total Transaksi: ${uniqueTransactions}`, 14, finalY + 32)
    
    // Save PDF with dynamic filename
    const filename = filterType === 'monthly' 
      ? `Laporan-Item-Keluar-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.pdf`
      : `Laporan-Item-Keluar-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.pdf`
    doc.save(filename)
  }

  const handlePrintMaterialUsageReport = () => {
    const doc = new jsPDF()
    const title = `Laporan Pemakaian Bahan - ${filterType === 'monthly' 
      ? `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
      : `${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }`
    
    // Add title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 22)
    
    // Add generation date
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 14, 30)
    
    // Prepare table data
    const tableData = materialUsageData.map(material => [
      material.materialName,
      material.totalUsed.toString(),
      material.materialUnit,
      material.transactions.length.toString(),
      material.transactions.map(t => t.productName).filter((v, i, a) => a.indexOf(v) === i).join(', ')
    ])
    
    // Add table
    ;(doc as any).autoTable({
      head: [['Nama Bahan', 'Total Terpakai', 'Satuan', 'Jumlah Transaksi', 'Produk Terkait']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [139, 69, 19] }, // Brown color for materials
      columnStyles: {
        0: { cellWidth: 60 }, // Nama Bahan
        1: { cellWidth: 30 }, // Total Terpakai
        2: { cellWidth: 25 }, // Satuan
        3: { cellWidth: 25 }, // Jumlah Transaksi
        4: { cellWidth: 50 }  // Produk Terkait
      }
    })
    
    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan:', 14, finalY)
    
    const totalMaterials = materialUsageData.length
    const totalUsage = materialUsageData.reduce((sum, material) => sum + material.totalUsed, 0)
    const totalTransactions = materialUsageData.reduce((sum, material) => sum + material.transactions.length, 0)
    
    doc.setFont('helvetica', 'normal')
    doc.text(`• Total Jenis Bahan: ${totalMaterials}`, 14, finalY + 8)
    doc.text(`• Total Pemakaian: ${totalUsage}`, 14, finalY + 16)
    doc.text(`• Total Transaksi: ${totalTransactions}`, 14, finalY + 24)
    
    // Save PDF with dynamic filename
    const filename = filterType === 'monthly' 
      ? `Laporan-Pemakaian-Bahan-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.pdf`
      : `Laporan-Pemakaian-Bahan-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.pdf`
    doc.save(filename)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Selesai': return 'bg-green-100 text-green-800'
      case 'Proses Produksi': return 'bg-blue-100 text-blue-800'
      case 'Pending': return 'bg-yellow-100 text-yellow-800'
      case 'Dibatalkan': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Laporan Item Keluar dari Transaksi
          </CardTitle>
          <CardDescription>
            Laporan semua item yang sudah keluar dari data transaksi dalam periode tertentu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {/* Filter Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Jenis Filter</Label>
              <Select value={filterType} onValueChange={(value: 'monthly' | 'dateRange') => setFilterType(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Bulanan</SelectItem>
                  <SelectItem value="dateRange">Rentang Tanggal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Monthly Filter */}
            {filterType === 'monthly' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Bulan</Label>
                  <Select value={selectedMonth.toString()} onValueChange={(value) => setSelectedMonth(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map(month => (
                        <SelectItem key={month.value} value={month.value.toString()}>
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tahun</Label>
                  <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(Number(value))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Date Range Filter */}
            {filterType === 'dateRange' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Tanggal Mulai
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Tanggal Selesai
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button onClick={handleGenerateReport} disabled={isLoading}>
                <Calendar className="mr-2 h-4 w-4" />
                {isLoading ? 'Generating...' : 'Generate Laporan'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(reportData.length > 0 || materialUsageData.length > 0) && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Hasil Laporan - {filterType === 'monthly' 
                  ? `${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
                  : `${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
                }
              </span>
              <div className="flex gap-2 text-sm text-muted-foreground">
                <span>{reportData.length} Item</span>
                <span>•</span>
                <span>{materialUsageData.length} Bahan</span>
                <span>•</span>
                <span>{new Set(reportData.map(item => item.transactionId)).size} Transaksi</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="items" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="items" className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  Item Keluar ({reportData.length})
                </TabsTrigger>
                <TabsTrigger value="materials" className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Pemakaian Bahan ({materialUsageData.length})
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="items" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Detail Item Keluar</h3>
                  {reportData.length > 0 && (
                    <Button variant="outline" onClick={handlePrintReport}>
                      <Download className="mr-2 h-4 w-4" />
                      Cetak PDF Item
                    </Button>
                  )}
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>No. Transaksi</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-center">Harga</TableHead>
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead>Kasir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reportData.map((item, index) => (
                        <TableRow key={`${item.transactionId}-${index}`}>
                          <TableCell className="font-mono">
                            {format(item.transactionDate, 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="font-mono">
                            {item.transactionId}
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.customerName}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.itemName}</div>
                              <div className="text-sm text-muted-foreground">{item.unit}</div>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="text-center font-mono">
                            Rp {item.price.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center font-mono font-medium">
                            Rp {item.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className={getStatusColor(item.status)}>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.cashierName}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="materials" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Ringkasan Pemakaian Bahan</h3>
                  {materialUsageData.length > 0 && (
                    <Button variant="outline" onClick={handlePrintMaterialUsageReport}>
                      <Download className="mr-2 h-4 w-4" />
                      Cetak PDF Bahan
                    </Button>
                  )}
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Bahan</TableHead>
                        <TableHead className="text-center">Total Terpakai</TableHead>
                        <TableHead className="text-center">Satuan</TableHead>
                        <TableHead className="text-center">Jumlah Transaksi</TableHead>
                        <TableHead>Produk Terkait</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialUsageData.map((material) => (
                        <TableRow key={material.materialId}>
                          <TableCell className="font-medium">
                            {material.materialName}
                          </TableCell>
                          <TableCell className="text-center font-mono font-bold text-blue-600">
                            {material.totalUsed}
                          </TableCell>
                          <TableCell className="text-center">
                            {material.materialUnit}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">
                              {material.transactions.length}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {material.transactions
                                .map(t => t.productName)
                                .filter((v, i, a) => a.indexOf(v) === i)
                                .slice(0, 3)
                                .map((productName, index) => (
                                  <div key={index} className="text-sm text-muted-foreground">
                                    • {productName}
                                  </div>
                                ))}
                              {material.transactions.map(t => t.productName).filter((v, i, a) => a.indexOf(v) === i).length > 3 && (
                                <div className="text-xs text-muted-foreground">
                                  +{material.transactions.map(t => t.productName).filter((v, i, a) => a.indexOf(v) === i).length - 3} lainnya
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Material Usage Details */}
                {materialUsageData.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-md font-medium">Detail Pemakaian Per Bahan</h4>
                    <div className="grid gap-4">
                      {materialUsageData.slice(0, 5).map((material) => ( // Show top 5 materials
                        <Card key={material.materialId}>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex justify-between">
                              <span>{material.materialName}</span>
                              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                                Total: {material.totalUsed} {material.materialUnit}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              {material.transactions.slice(0, 3).map((transaction, index) => (
                                <div key={index} className="flex justify-between text-sm border-b pb-1">
                                  <div>
                                    <span className="font-medium">{transaction.productName}</span>
                                    <span className="text-muted-foreground ml-2">
                                      ({transaction.customerName})
                                    </span>
                                  </div>
                                  <span className="font-mono text-blue-600">
                                    {transaction.materialQuantity} {material.materialUnit}
                                  </span>
                                </div>
                              ))}
                              {material.transactions.length > 3 && (
                                <div className="text-xs text-muted-foreground text-center">
                                  +{material.transactions.length - 3} transaksi lainnya
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{reportData.length}</div>
                  <div className="text-sm text-muted-foreground">Total Item</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{materialUsageData.length}</div>
                  <div className="text-sm text-muted-foreground">Jenis Bahan</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{reportData.reduce((sum, item) => sum + item.quantity, 0)}</div>
                  <div className="text-sm text-muted-foreground">Total Quantity</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">Rp {reportData.reduce((sum, item) => sum + item.total, 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">Total Nilai</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{new Set(reportData.map(item => item.transactionId)).size}</div>
                  <div className="text-sm text-muted-foreground">Total Transaksi</div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {reportData.length === 0 && !isLoading && (
        <Card>
          <CardContent className="text-center py-12">
            <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada Data</h3>
            <p className="text-muted-foreground">
              Pilih periode dan klik "Generate Laporan" untuk melihat item yang keluar dari transaksi.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}