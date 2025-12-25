"use client"
import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"
import { FileDown, Package2, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { useMaterialMovements } from '@/hooks/useMaterialMovements'
import { useMaterials } from '@/hooks/useMaterials'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface MaterialSummary {
  materialId: string
  materialName: string
  materialType: string
  unit: string
  openingStock: number
  totalIn: number
  totalOut: number
  closingStock: number
  purchaseQty: number
  productionQty: number
  errorQty: number
  adjustmentQty: number
}

export default function MaterialUsageSummaryReport() {
  const { stockMovements, isLoading: isMovementsLoading } = useMaterialMovements()
  const { materials, isLoading: isMaterialsLoading } = useMaterials()

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  const [sortConfig, setSortConfig] = useState<{ key: keyof MaterialSummary; direction: 'asc' | 'desc' }>({
    key: 'materialName',
    direction: 'asc'
  })

  // Calculate summary per material
  const materialSummaries = useMemo(() => {
    if (!stockMovements || !materials || !dateRange?.from || !dateRange?.to) return []

    const from = startOfDay(dateRange.from)
    const to = endOfDay(dateRange.to)

    // Initialize summary map with all materials
    const summaryMap = new Map<string, MaterialSummary>()

    materials.forEach(material => {
      summaryMap.set(material.id, {
        materialId: material.id,
        materialName: material.name,
        materialType: material.type,
        unit: material.unit,
        openingStock: 0,
        totalIn: 0,
        totalOut: 0,
        closingStock: material.stock || 0,
        purchaseQty: 0,
        productionQty: 0,
        errorQty: 0,
        adjustmentQty: 0
      })
    })

    // Sort movements by date to calculate running balance
    const sortedMovements = [...stockMovements].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    // Calculate opening stock (stock before the date range)
    sortedMovements.forEach(movement => {
      const movementDate = new Date(movement.createdAt)
      const summary = summaryMap.get(movement.materialId)

      if (!summary) return

      if (movementDate < from) {
        // Movements before date range affect opening stock
        if (movement.type === 'IN') {
          summary.openingStock = movement.newStock
        } else if (movement.type === 'OUT') {
          summary.openingStock = movement.newStock
        } else if (movement.type === 'ADJUSTMENT') {
          summary.openingStock = movement.newStock
        }
      }
    })

    // Calculate movements within date range
    sortedMovements.forEach(movement => {
      const movementDate = new Date(movement.createdAt)

      if (movementDate >= from && movementDate <= to) {
        const summary = summaryMap.get(movement.materialId)

        if (!summary) return

        // Sum by type
        if (movement.type === 'IN') {
          summary.totalIn += movement.quantity
        } else if (movement.type === 'OUT') {
          summary.totalOut += movement.quantity
        }

        // Sum by reason
        switch (movement.reason) {
          case 'PURCHASE':
            summary.purchaseQty += movement.quantity
            break
          case 'PRODUCTION_CONSUMPTION':
            summary.productionQty += movement.quantity
            break
          case 'PRODUCTION_ERROR':
            summary.errorQty += movement.quantity
            break
          case 'ADJUSTMENT':
          case 'PRODUCTION_DELETE_RESTORE':
            summary.adjustmentQty += movement.quantity * (movement.type === 'IN' ? 1 : -1)
            break
        }

        // Update closing stock from the last movement
        summary.closingStock = movement.newStock
      }
    })

    // Filter out materials with no movements and convert to array
    const summariesArray = Array.from(summaryMap.values()).filter(
      s => s.totalIn > 0 || s.totalOut > 0 || s.openingStock > 0
    )

    // Sort by configured column
    summariesArray.sort((a, b) => {
      const aValue = a[sortConfig.key]
      const bValue = b[sortConfig.key]

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc'
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue)
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
      }

      return 0
    })

    return summariesArray
  }, [stockMovements, materials, dateRange, sortConfig])

  // Calculate totals
  const totals = useMemo(() => {
    return materialSummaries.reduce(
      (acc, curr) => ({
        totalIn: acc.totalIn + curr.totalIn,
        totalOut: acc.totalOut + curr.totalOut,
        purchaseQty: acc.purchaseQty + curr.purchaseQty,
        productionQty: acc.productionQty + curr.productionQty,
        errorQty: acc.errorQty + curr.errorQty,
      }),
      { totalIn: 0, totalOut: 0, purchaseQty: 0, productionQty: 0, errorQty: 0 }
    )
  }, [materialSummaries])

  const handleSort = (key: keyof MaterialSummary) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handleExportPDF = () => {
    const pdf = new jsPDF('landscape')
    const pageWidth = pdf.internal.pageSize.getWidth()

    // Header
    pdf.setFontSize(18)
    pdf.setFont('helvetica', 'bold')
    pdf.text('LAPORAN RANGKUMAN PENGGUNAAN BAHAN', pageWidth / 2, 15, { align: 'center' })

    // Date range
    pdf.setFontSize(11)
    pdf.setFont('helvetica', 'normal')
    const dateRangeText = dateRange?.from && dateRange?.to
      ? `Periode: ${format(dateRange.from, 'd MMMM yyyy', { locale: idLocale })} - ${format(dateRange.to, 'd MMMM yyyy', { locale: idLocale })}`
      : 'Semua Data'
    pdf.text(dateRangeText, pageWidth / 2, 22, { align: 'center' })

    // Print date
    pdf.setFontSize(9)
    pdf.text(`Dicetak: ${format(new Date(), 'd MMMM yyyy HH:mm', { locale: idLocale })}`, pageWidth / 2, 28, { align: 'center' })

    // Table data
    const tableData = materialSummaries.map(summary => [
      summary.materialName,
      summary.materialType,
      summary.unit,
      summary.openingStock.toLocaleString('id-ID'),
      summary.purchaseQty.toLocaleString('id-ID'),
      summary.productionQty.toLocaleString('id-ID'),
      summary.errorQty.toLocaleString('id-ID'),
      summary.totalIn.toLocaleString('id-ID'),
      summary.totalOut.toLocaleString('id-ID'),
      summary.closingStock.toLocaleString('id-ID'),
    ])

    // Add totals row
    tableData.push([
      'TOTAL',
      '',
      '',
      '',
      totals.purchaseQty.toLocaleString('id-ID'),
      totals.productionQty.toLocaleString('id-ID'),
      totals.errorQty.toLocaleString('id-ID'),
      totals.totalIn.toLocaleString('id-ID'),
      totals.totalOut.toLocaleString('id-ID'),
      '',
    ])

    // Generate table
    autoTable(pdf, {
      head: [[
        'Nama Bahan',
        'Tipe',
        'Satuan',
        'Stok Awal',
        'Pembelian',
        'Produksi',
        'Rusak',
        'Total Masuk',
        'Total Keluar',
        'Stok Akhir'
      ]],
      body: tableData,
      startY: 35,
      styles: {
        fontSize: 9,
        cellPadding: 3
      },
      headStyles: {
        fillColor: [79, 70, 229],
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 50 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'right', cellWidth: 25 },
        4: { halign: 'right', cellWidth: 25 },
        5: { halign: 'right', cellWidth: 25 },
        6: { halign: 'right', cellWidth: 20 },
        7: { halign: 'right', cellWidth: 25 },
        8: { halign: 'right', cellWidth: 25 },
        9: { halign: 'right', cellWidth: 25 },
      },
      didParseCell: (data) => {
        // Style the totals row
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [240, 240, 240]
        }
      },
      foot: [[
        { content: `Total ${materialSummaries.length} item bahan`, colSpan: 10, styles: { halign: 'center', fontStyle: 'italic', fontSize: 8 } }
      ]]
    })

    // Save
    const fileName = `rangkuman-penggunaan-bahan-${format(new Date(), 'yyyy-MM-dd')}.pdf`
    pdf.save(fileName)
  }

  if (isMovementsLoading || isMaterialsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Rangkuman Penggunaan Bahan
            </CardTitle>
            <CardDescription>
              Ringkasan pergerakan stok bahan per item dalam periode tertentu
            </CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <DateRangePicker
              date={dateRange}
              onDateChange={setDateRange}
            />
            <Button
              variant="default"
              onClick={handleExportPDF}
              className="flex items-center gap-2"
            >
              <FileDown className="h-4 w-4" />
              Export PDF
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                <span className="text-sm text-green-700">Total Masuk</span>
              </div>
              <div className="text-2xl font-bold text-green-800 mt-1">
                {totals.totalIn.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-red-50 border-red-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-600" />
                <span className="text-sm text-red-700">Total Keluar</span>
              </div>
              <div className="text-2xl font-bold text-red-800 mt-1">
                {totals.totalOut.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package2 className="h-5 w-5 text-blue-600" />
                <span className="text-sm text-blue-700">Pembelian</span>
              </div>
              <div className="text-2xl font-bold text-blue-800 mt-1">
                {totals.purchaseQty.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Package2 className="h-5 w-5 text-purple-600" />
                <span className="text-sm text-purple-700">Produksi</span>
              </div>
              <div className="text-2xl font-bold text-purple-800 mt-1">
                {totals.productionQty.toLocaleString('id-ID')}
              </div>
            </CardContent>
          </Card>
        </div>

        {materialSummaries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Tidak ada pergerakan bahan dalam periode yang dipilih
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('materialName')}
                  >
                    <div className="flex items-center gap-1">
                      Nama Bahan
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('openingStock')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stok Awal
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right text-blue-600">Pembelian</TableHead>
                  <TableHead className="text-right text-purple-600">Produksi</TableHead>
                  <TableHead className="text-right text-orange-600">Rusak</TableHead>
                  <TableHead
                    className="text-right text-green-600 cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('totalIn')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Masuk
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right text-red-600 cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('totalOut')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Keluar
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer hover:bg-muted"
                    onClick={() => handleSort('closingStock')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stok Akhir
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialSummaries.map((summary) => (
                  <TableRow key={summary.materialId}>
                    <TableCell className="font-medium">
                      {summary.materialName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={summary.materialType === 'Stock' ? 'default' : 'secondary'}>
                        {summary.materialType}
                      </Badge>
                    </TableCell>
                    <TableCell>{summary.unit}</TableCell>
                    <TableCell className="text-right font-mono">
                      {summary.openingStock.toLocaleString('id-ID')}
                    </TableCell>
                    <TableCell className="text-right font-mono text-blue-600">
                      {summary.purchaseQty > 0 ? `+${summary.purchaseQty.toLocaleString('id-ID')}` : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-purple-600">
                      {summary.productionQty > 0 ? summary.productionQty.toLocaleString('id-ID') : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-orange-600">
                      {summary.errorQty > 0 ? summary.errorQty.toLocaleString('id-ID') : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className="text-green-600 font-medium">
                        +{summary.totalIn.toLocaleString('id-ID')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className="text-red-600 font-medium">
                        -{summary.totalOut.toLocaleString('id-ID')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {summary.closingStock.toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell colSpan={3}>TOTAL</TableCell>
                  <TableCell className="text-right">-</TableCell>
                  <TableCell className="text-right text-blue-600">
                    +{totals.purchaseQty.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right text-purple-600">
                    {totals.productionQty.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    {totals.errorQty.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    +{totals.totalIn.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    -{totals.totalOut.toLocaleString('id-ID')}
                  </TableCell>
                  <TableCell className="text-right">-</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground text-center">
          Menampilkan {materialSummaries.length} item bahan dengan pergerakan dalam periode yang dipilih
        </div>
      </CardContent>
    </Card>
  )
}
