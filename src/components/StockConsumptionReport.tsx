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
import { supabase } from '@/integrations/supabase/client'
import { FileText, Download, Calendar, TrendingDown, TrendingUp, Package, CalendarDays, FileSpreadsheet } from 'lucide-react'
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns'
import { id } from 'date-fns/locale/id'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { useBranch } from '@/contexts/BranchContext'

interface StockReportItem {
  productId: string
  productName: string
  productType: string
  unit: string
  startingStock: number
  totalIn: number
  totalOut: number
  endingStock: number
  netMovement: number
  productions: number
  purchases: number
  sales: number
}

export const StockConsumptionReport = () => {
  const [filterType, setFilterType] = useState<'monthly' | 'dateRange'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [reportData, setReportData] = useState<StockReportItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { currentBranch } = useBranch()

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

  const generateReport = async (fromDate: Date, toDate: Date): Promise<StockReportItem[]> => {
    // Get all products
    let productsQuery = supabase
      .from('products')
      .select('id, name, type, unit, current_stock')
      .order('name')

    if (currentBranch?.id) {
      productsQuery = productsQuery.eq('branch_id', currentBranch.id)
    }

    const { data: products, error: productsError } = await productsQuery
    if (productsError) throw productsError

    // Get production records in date range (MASUK dari produksi)
    let productionsQuery = supabase
      .from('production_records')
      .select('product_id, quantity, created_at')
      .gte('created_at', fromDate.toISOString())
      .lte('created_at', toDate.toISOString())
      .gt('quantity', 0) // Only positive quantities (actual production, not error)

    if (currentBranch?.id) {
      productionsQuery = productionsQuery.eq('branch_id', currentBranch.id)
    }

    const { data: productionRecords, error: productionError } = await productionsQuery
    if (productionError) console.warn('Production query error:', productionError)

    // Get transactions in date range (KELUAR dari penjualan)
    let transactionsQuery = supabase
      .from('transactions')
      .select('id, items, order_date, status')
      .gte('order_date', fromDate.toISOString())
      .lte('order_date', toDate.toISOString())
      .in('status', ['Selesai', 'Diproses', 'Proses Produksi', 'Dikirim'])

    if (currentBranch?.id) {
      transactionsQuery = transactionsQuery.eq('branch_id', currentBranch.id)
    }

    const { data: transactions, error: transactionsError } = await transactionsQuery
    if (transactionsError) console.warn('Transactions query error:', transactionsError)

    // Get production records BEFORE start date to calculate starting stock
    let priorProductionsQuery = supabase
      .from('production_records')
      .select('product_id, quantity')
      .lt('created_at', fromDate.toISOString())
      .gt('quantity', 0)

    if (currentBranch?.id) {
      priorProductionsQuery = priorProductionsQuery.eq('branch_id', currentBranch.id)
    }

    const { data: priorProductions } = await priorProductionsQuery

    // Get transactions BEFORE start date
    let priorTransactionsQuery = supabase
      .from('transactions')
      .select('id, items')
      .lt('order_date', fromDate.toISOString())
      .in('status', ['Selesai', 'Diproses', 'Proses Produksi', 'Dikirim'])

    if (currentBranch?.id) {
      priorTransactionsQuery = priorTransactionsQuery.eq('branch_id', currentBranch.id)
    }

    const { data: priorTransactions } = await priorTransactionsQuery

    // Calculate production totals per product (in period)
    const productionByProduct: Record<string, number> = {}
    productionRecords?.forEach(record => {
      if (record.product_id) {
        productionByProduct[record.product_id] = (productionByProduct[record.product_id] || 0) + Number(record.quantity)
      }
    })

    // Calculate prior production totals
    const priorProductionByProduct: Record<string, number> = {}
    priorProductions?.forEach(record => {
      if (record.product_id) {
        priorProductionByProduct[record.product_id] = (priorProductionByProduct[record.product_id] || 0) + Number(record.quantity)
      }
    })

    // Calculate sales totals per product (in period)
    const salesByProduct: Record<string, number> = {}
    transactions?.forEach(transaction => {
      const items = typeof transaction.items === 'string'
        ? JSON.parse(transaction.items)
        : transaction.items

      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const productId = item.product?.id || item.productId
          const quantity = Number(item.quantity || 0)
          if (productId && quantity > 0) {
            salesByProduct[productId] = (salesByProduct[productId] || 0) + quantity
          }
        })
      }
    })

    // Calculate prior sales totals
    const priorSalesByProduct: Record<string, number> = {}
    priorTransactions?.forEach(transaction => {
      const items = typeof transaction.items === 'string'
        ? JSON.parse(transaction.items)
        : transaction.items

      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const productId = item.product?.id || item.productId
          const quantity = Number(item.quantity || 0)
          if (productId && quantity > 0) {
            priorSalesByProduct[productId] = (priorSalesByProduct[productId] || 0) + quantity
          }
        })
      }
    })

    // Build report data
    const reports: StockReportItem[] = []

    for (const product of products || []) {
      // Skip service products
      if (product.type === 'Jasa') continue

      const currentStock = Number(product.current_stock) || 0
      const periodProduction = productionByProduct[product.id] || 0
      const periodSales = salesByProduct[product.id] || 0
      const priorProduction = priorProductionByProduct[product.id] || 0
      const priorSales = priorSalesByProduct[product.id] || 0

      // Calculate starting stock
      // Current stock = Starting + Production - Sales (for the period)
      // So: Starting = Current - Production + Sales (for remaining period after toDate)
      // But we need starting at fromDate...

      // Better approach:
      // Ending stock = Current stock (at report generation time)
      // Total IN = Production in period
      // Total OUT = Sales in period
      // Starting stock = Ending - IN + OUT = Current - periodProduction + periodSales

      const totalIn = periodProduction
      const totalOut = periodSales
      const endingStock = currentStock
      const startingStock = endingStock - totalIn + totalOut

      const netMovement = totalIn - totalOut

      reports.push({
        productId: product.id,
        productName: product.name,
        productType: product.type || 'Stock',
        unit: product.unit || 'pcs',
        startingStock: Math.max(0, startingStock),
        totalIn,
        totalOut,
        endingStock,
        netMovement,
        productions: periodProduction,
        purchases: 0, // Can be enhanced to track PO receipts
        sales: periodSales,
      })
    }

    return reports
      .filter(r => r.totalIn > 0 || r.totalOut > 0 || r.endingStock > 0)
      .sort((a, b) => a.productName.localeCompare(b.productName))
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
        toDate.setHours(23, 59, 59, 999)
      }

      const data = await generateReport(fromDate, toDate)
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
      return `Laporan Stock Produk - ${monthName} ${selectedYear}`
    } else {
      return `Laporan Stock Produk - ${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }
  }

  const handlePrintPDF = () => {
    const doc = new jsPDF('landscape')
    const title = getReportTitle()

    // Add title
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 22)

    // Add generation info
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 14, 30)
    doc.text(`Cabang: ${currentBranch?.name || 'Semua Cabang'}`, 14, 36)

    // Prepare table data
    const tableData = reportData.map(item => [
      item.productName,
      item.productType,
      item.unit,
      item.startingStock.toString(),
      item.totalIn > 0 ? `+${item.totalIn}` : '-',
      item.totalOut > 0 ? `-${item.totalOut}` : '-',
      item.endingStock.toString(),
      item.netMovement > 0 ? `+${item.netMovement}` : item.netMovement.toString()
    ])

    autoTable(doc, {
      head: [['Nama Produk', 'Jenis', 'Satuan', 'Stock Awal', 'Masuk', 'Keluar', 'Stock Akhir', 'Net']],
      body: tableData,
      startY: 44,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 25 },
        2: { cellWidth: 20 },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right' },
        6: { cellWidth: 25, halign: 'right' },
        7: { cellWidth: 25, halign: 'right' }
      }
    })

    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan:', 14, finalY)

    const totalProducts = reportData.length
    const totalStockIn = reportData.reduce((sum, item) => sum + item.totalIn, 0)
    const totalStockOut = reportData.reduce((sum, item) => sum + item.totalOut, 0)
    const lowStockCount = reportData.filter(item => item.endingStock <= 5).length

    doc.setFont('helvetica', 'normal')
    doc.text(`Total Produk: ${totalProducts}`, 14, finalY + 8)
    doc.text(`Total Masuk: ${totalStockIn}`, 14, finalY + 16)
    doc.text(`Total Keluar: ${totalStockOut}`, 14, finalY + 24)
    doc.text(`Produk Stock Rendah (≤5): ${lowStockCount}`, 14, finalY + 32)

    // Save PDF
    const filename = filterType === 'monthly'
      ? `Laporan-Stock-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.pdf`
      : `Laporan-Stock-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.pdf`
    doc.save(filename)
  }

  const handleExportExcel = () => {
    const title = getReportTitle()

    const excelData = reportData.map(item => ({
      'Nama Produk': item.productName,
      'Jenis': item.productType,
      'Satuan': item.unit,
      'Stock Awal': item.startingStock,
      'Masuk (Produksi)': item.totalIn,
      'Keluar (Penjualan)': item.totalOut,
      'Stock Akhir': item.endingStock,
      'Net Movement': item.netMovement,
    }))

    const ws = XLSX.utils.json_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`]], { origin: 'A2' })
    XLSX.utils.sheet_add_aoa(ws, [[`Cabang: ${currentBranch?.name || 'Semua Cabang'}`]], { origin: 'A3' })
    XLSX.utils.sheet_add_aoa(ws, [['']], { origin: 'A4' })

    const headers = ['Nama Produk', 'Jenis', 'Satuan', 'Stock Awal', 'Masuk (Produksi)', 'Keluar (Penjualan)', 'Stock Akhir', 'Net Movement']
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A5' })

    const dataRows = excelData.map(item => Object.values(item))
    XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A6' })

    // Add summary
    const summaryRow = dataRows.length + 7
    XLSX.utils.sheet_add_aoa(ws, [['Ringkasan:']], { origin: `A${summaryRow}` })
    XLSX.utils.sheet_add_aoa(ws, [[`Total Produk: ${reportData.length}`]], { origin: `A${summaryRow + 1}` })
    XLSX.utils.sheet_add_aoa(ws, [[`Total Masuk: ${reportData.reduce((sum, item) => sum + item.totalIn, 0)}`]], { origin: `A${summaryRow + 2}` })
    XLSX.utils.sheet_add_aoa(ws, [[`Total Keluar: ${reportData.reduce((sum, item) => sum + item.totalOut, 0)}`]], { origin: `A${summaryRow + 3}` })

    ws['!cols'] = [
      { wch: 40 },
      { wch: 12 },
      { wch: 10 },
      { wch: 12 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 15 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan Stock')

    const filename = filterType === 'monthly'
      ? `Laporan-Stock-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.xlsx`
      : `Laporan-Stock-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.xlsx`

    XLSX.writeFile(wb, filename)
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
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Laporan Stock Produk
          </CardTitle>
          <CardDescription>
            Laporan pergerakan stock produk berdasarkan periode waktu.
            <br />
            <strong>Stock Awal</strong> = Stock di awal periode | <strong>Masuk</strong> = Dari produksi | <strong>Keluar</strong> = Penjualan | <strong>Stock Akhir</strong> = Stock di akhir periode
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
                <>
                  <Button variant="outline" onClick={handlePrintPDF}>
                    <Download className="mr-2 h-4 w-4" />
                    Cetak PDF
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </>
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
                <span>{reportData.length} Produk</span>
                <span>|</span>
                <span className="text-green-600">+{reportData.reduce((sum, item) => sum + item.totalIn, 0)} Masuk</span>
                <span>|</span>
                <span className="text-red-600">-{reportData.reduce((sum, item) => sum + item.totalOut, 0)} Keluar</span>
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
                    <TableHead className="text-right">Stock Awal</TableHead>
                    <TableHead className="text-right">Masuk (Produksi)</TableHead>
                    <TableHead className="text-right">Keluar (Penjualan)</TableHead>
                    <TableHead className="text-right">Stock Akhir</TableHead>
                    <TableHead className="text-right">Net Movement</TableHead>
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
                      <TableCell className="text-right font-mono">
                        {item.startingStock}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.totalIn > 0 && (
                          <div className="flex items-center justify-end gap-1 text-green-600">
                            <TrendingUp className="h-3 w-3" />
                            <span className="font-mono">+{item.totalIn}</span>
                          </div>
                        )}
                        {item.totalIn === 0 && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.totalOut > 0 && (
                          <div className="flex items-center justify-end gap-1 text-red-600">
                            <TrendingDown className="h-3 w-3" />
                            <span className="font-mono">-{item.totalOut}</span>
                          </div>
                        )}
                        {item.totalOut === 0 && <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {item.endingStock}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono font-medium ${item.netMovement > 0 ? 'text-green-600' :
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
            <h3 className="text-lg font-medium mb-2">Belum Ada Data Stock</h3>
            <p className="text-muted-foreground mb-4">
              Klik "Generate Laporan" untuk melihat pergerakan stock produk dalam periode yang dipilih.
            </p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Keterangan:</strong></p>
              <p>Stock Awal = Stock produk di awal periode filter</p>
              <p>Masuk = Jumlah produk dari produksi</p>
              <p>Keluar = Jumlah produk yang terjual</p>
              <p>Stock Akhir = Stock produk di akhir periode</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
