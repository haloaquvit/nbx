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
import { useStockMovements } from '@/hooks/useStockMovements'
import { useTransactions } from '@/hooks/useTransactions'
import { useProducts } from '@/hooks/useProducts'
import { StockConsumptionReport as ReportType } from '@/types/stockMovement'
import { FileText, Download, Calendar, TrendingDown, TrendingUp, Package, CalendarDays } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { id } from 'date-fns/locale/id'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export const StockConsumptionReport = () => {
  const [filterType, setFilterType] = useState<'monthly' | 'dateRange'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [reportData, setReportData] = useState<ReportType[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  const { getMonthlyConsumptionReport, getMovementsByDateRange } = useStockMovements()
  const { transactions } = useTransactions()
  const { products } = useProducts()

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

  const generateReportFromTransactions = (fromDate: Date, toDate: Date): ReportType[] => {
    if (!transactions || !products) return []

    // Filter transactions in date range
    const filteredTransactions = transactions.filter(transaction => {
      const transactionDate = new Date(transaction.orderDate)
      return transactionDate >= fromDate && transactionDate <= toDate
    })

    // Extract product usage from transactions
    const productUsage: Record<string, {
      productId: string
      productName: string
      productType: string
      unit: string
      totalConsumed: number
      transactions: any[]
    }> = {}

    filteredTransactions.forEach(transaction => {
      // Only count transactions that actually consumed products (completed or in production)
      if (transaction.status === 'Selesai' || transaction.status === 'Proses Produksi') {
        transaction.items?.forEach((item: any) => {
          const productId = item.product?.id || item.productId
          const productName = item.product?.name || item.name || 'Unknown Product'
          const quantity = Number(item.quantity || 0)

          if (productId && quantity > 0) {
            if (!productUsage[productId]) {
              const product = products.find(p => p.id === productId)
              productUsage[productId] = {
                productId,
                productName,
                productType: product?.type || 'Stock',
                unit: product?.unit || 'pcs',
                totalConsumed: 0,
                transactions: []
              }
            }

            productUsage[productId].totalConsumed += quantity
            productUsage[productId].transactions.push({
              transactionId: transaction.id,
              transactionDate: transaction.orderDate,
              quantity: quantity,
              customerName: transaction.customerName
            })
          }
        })
      }
    })

    // Create report for each product
    const reports: ReportType[] = []

    // Include all products, even those without usage
    const allProducts = products || []
    
    allProducts.forEach(product => {
      const usage = productUsage[product.id] || {
        productId: product.id,
        productName: product.name,
        productType: product.type || 'Stock',  
        unit: product.unit || 'pcs',
        totalConsumed: 0,
        transactions: []
      }

      // For both Stock and Beli type products, consumption/usage is OUT movement
      // Stock: reduces physical stock, Beli: tracks usage (both are OUT) 
      let totalIn = 0
      let totalOut = 0

      if (product.type === 'Stock') {
        totalOut = usage.totalConsumed // Stock products are consumed (OUT)
      } else if (product.type === 'Beli') {
        totalIn = usage.totalConsumed // Beli products are acquired (IN)
      }

      const netMovement = totalIn - totalOut
      const endingStock = Number(product.currentStock) || 0
      const startingStock = endingStock - netMovement

      reports.push({
        productId: product.id,
        productName: product.name,
        productType: product.type || 'Stock',
        unit: product.unit || 'pcs',
        totalIn,
        totalOut,
        netMovement,
        startingStock: Math.max(0, startingStock), // Don't show negative starting stock
        endingStock,
        movements: usage.transactions.map(t => ({
          id: `${t.transactionId}-${Date.now()}`,
          productId: product.id,
          productName: product.name,
          type: 'OUT', // Both Stock and Beli products are consumed/used (OUT)
          reason: 'PRODUCTION',
          quantity: t.quantity,
          previousStock: 0,
          newStock: 0,
          notes: `Transaction ${t.transactionId} - ${t.customerName}`,
          referenceId: t.transactionId,
          referenceType: 'transaction',
          userId: '',
          userName: '',
          createdAt: new Date(t.transactionDate)
        }))
      })
    })

    return reports
      .filter(report => report.movements.length > 0 || report.productType !== 'Jasa') // Show products with movements or non-Jasa products
      .sort((a, b) => a.productName.localeCompare(b.productName))
  }

  const generateReportFromMovements = async (fromDate: Date, toDate: Date): Promise<ReportType[]> => {
    // Get movements in date range
    const movements = await getMovementsByDateRange(fromDate, toDate)
    
    // Get all products from supabase
    const { supabase } = await import('@/integrations/supabase/client')
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, type, unit, current_stock')
    
    if (productsError) throw new Error(productsError.message)

    // Group movements by product
    const productMovements = movements.reduce((acc, movement) => {
      if (!acc[movement.productId]) {
        acc[movement.productId] = []
      }
      acc[movement.productId].push(movement)
      return acc
    }, {} as Record<string, any[]>)

    // Create report for each product
    const reports: ReportType[] = []
    
    for (const product of products || []) {
      const productMovs = productMovements[product.id] || []
      
      // Include all products, even those without movements
      const totalIn = productMovs
        .filter(m => m.type === 'IN')
        .reduce((sum, m) => sum + m.quantity, 0)
        
      const totalOut = productMovs
        .filter(m => m.type === 'OUT')
        .reduce((sum, m) => sum + m.quantity, 0)

      const netMovement = totalIn - totalOut
      const endingStock = Number(product.current_stock) || 0
      const startingStock = endingStock - netMovement

      reports.push({
        productId: product.id,
        productName: product.name,
        productType: product.type || 'Stock',
        unit: product.unit || 'pcs',
        totalIn,
        totalOut,
        netMovement,
        startingStock,
        endingStock,
        movements: productMovs
      })
    }

    return reports.sort((a, b) => a.productName.localeCompare(b.productName))
  }

  const handleGenerateReport = async () => {
    setIsLoading(true)
    try {
      let data: ReportType[]
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
      
      // Use transaction data as primary source
      data = generateReportFromTransactions(fromDate, toDate)
      
      // If no data from transactions, try stock movements (fallback)
      if (data.length === 0) {
        try {
          if (filterType === 'monthly') {
            data = await getMonthlyConsumptionReport(selectedYear, selectedMonth)
          } else {
            data = await generateReportFromMovements(fromDate, toDate)
          }
        } catch (error) {
          console.warn('Stock movements not available, using transaction data only:', error)
        }
      }
      
      setReportData(data)
    } catch (error) {
      console.error('Error generating report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getReportTitle = () => {
    if (filterType === 'monthly') {
      const monthName = months.find(m => m.value === selectedMonth)?.label
      return `Laporan Konsumsi Barang - ${monthName} ${selectedYear}`
    } else {
      return `Laporan Konsumsi Barang - ${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }
  }

  const handlePrintReport = () => {
    const doc = new jsPDF()
    const title = getReportTitle()
    
    // Add title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 22)
    
    // Add generation date and data source
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 14, 30)
    doc.text(`Sumber Data: Transaksi (Status: Selesai & Proses Produksi)`, 14, 36)
    
    // Prepare table data
    const tableData = reportData.map(item => [
      item.productName,
      item.productType,
      item.unit,
      item.startingStock.toString(),
      item.totalIn.toString(),
      item.totalOut.toString(),
      item.endingStock.toString(),
      item.netMovement > 0 ? `+${item.netMovement}` : item.netMovement.toString()
    ])
    
    // Add table
    ;(doc as any).autoTable({
      head: [['Nama Produk', 'Jenis', 'Sat.', 'Awal', 'Masuk', 'Keluar', 'Akhir', 'Net']],
      body: tableData,
      startY: 44,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [66, 139, 202] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 20 },
        2: { cellWidth: 15 },
        3: { cellWidth: 15 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
        6: { cellWidth: 15 },
        7: { cellWidth: 20 }
      }
    })
    
    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan:', 14, finalY)
    
    const totalProducts = reportData.length
    const totalMovements = reportData.reduce((sum, item) => sum + item.movements.length, 0)
    const lowStockCount = reportData.filter(item => item.endingStock <= 5).length
    
    doc.setFont('helvetica', 'normal')
    doc.text(`• Total Produk: ${totalProducts}`, 14, finalY + 8)
    doc.text(`• Total Pergerakan: ${totalMovements}`, 14, finalY + 16)
    doc.text(`• Produk Stock Rendah: ${lowStockCount}`, 14, finalY + 24)
    
    // Save PDF with dynamic filename
    const filename = filterType === 'monthly' 
      ? `Laporan-Konsumsi-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.pdf`
      : `Laporan-Konsumsi-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.pdf`
    doc.save(filename)
  }

  const getStockStatusColor = (stock: number) => {
    if (stock <= 5) return 'bg-red-100 text-red-800'
    if (stock <= 10) return 'bg-yellow-100 text-yellow-800'
    return 'bg-green-100 text-green-800'
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Stock': return 'bg-purple-100 text-purple-800'
      case 'Beli': return 'bg-orange-100 text-orange-800'
      default: return 'bg-purple-100 text-purple-800'
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Laporan Konsumsi Barang Bulanan
          </CardTitle>
          <CardDescription>
            Laporan konsumsi barang berdasarkan data transaksi dalam periode tertentu. 
            Menampilkan produk yang digunakan dalam transaksi yang sudah selesai atau dalam proses produksi.
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
              {reportData.length > 0 && (
                <Button variant="outline" onClick={handlePrintReport}>
                  <Download className="mr-2 h-4 w-4" />
                  Cetak PDF
                </Button>
              )}
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

      {reportData.length > 0 && !isLoading && (
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
              <div className="flex gap-2 text-sm text-muted-foreground items-center">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  Data Transaksi
                </Badge>
                <span>{reportData.length} Produk</span>
                <span>•</span>
                <span>{reportData.reduce((sum, item) => sum + item.movements.length, 0)} Transaksi</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Produk</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead className="text-center">Stock Awal</TableHead>
                    <TableHead className="text-center">Masuk</TableHead>
                    <TableHead className="text-center">Keluar</TableHead>
                    <TableHead className="text-center">Stock Akhir</TableHead>
                    <TableHead className="text-center">Net Movement</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item) => (
                    <TableRow key={item.productId}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-muted-foreground">{item.unit}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={getTypeColor(item.productType)}>
                          {item.productType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        {item.startingStock}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.totalIn > 0 && (
                          <div className="flex items-center justify-center gap-1 text-green-600">
                            <TrendingUp className="h-3 w-3" />
                            <span className="font-mono">{item.totalIn}</span>
                          </div>
                        )}
                        {item.totalIn === 0 && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.totalOut > 0 && (
                          <div className="flex items-center justify-center gap-1 text-red-600">
                            <TrendingDown className="h-3 w-3" />
                            <span className="font-mono">{item.totalOut}</span>
                          </div>
                        )}
                        {item.totalOut === 0 && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-center font-mono font-medium">
                        {item.endingStock}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`font-mono font-medium ${
                          item.netMovement > 0 ? 'text-green-600' : 
                          item.netMovement < 0 ? 'text-red-600' : 'text-muted-foreground'
                        }`}>
                          {item.netMovement > 0 ? `+${item.netMovement}` : item.netMovement}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className={getStockStatusColor(item.endingStock)}>
                          {item.endingStock <= 5 ? 'Rendah' :
                           item.endingStock <= 10 ? 'Sedang' : 'Baik'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {reportData.length === 0 && !isLoading && (
        <Card>
          <CardContent className="text-center py-12">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Belum Ada Data Konsumsi</h3>
            <p className="text-muted-foreground mb-4">
              Tidak ada transaksi dengan status "Selesai" atau "Proses Produksi" dalam periode yang dipilih.
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>💡 <strong>Tips:</strong></p>
              <p>• Laporan ini menampilkan produk yang digunakan dalam transaksi</p>
              <p>• Hanya transaksi dengan status "Selesai" atau "Proses Produksi" yang dihitung</p>
              <p>• Coba pilih periode yang berbeda atau periksa status transaksi Anda</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}