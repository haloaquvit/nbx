"use client"
import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { DateRange } from "react-day-picker"
import { FileDown, Package2 } from 'lucide-react'
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns'
import { id } from 'date-fns/locale/id'
import { useMaterialMovements } from '@/hooks/useMaterialMovements'
import { useTransactions } from '@/hooks/useTransactions'
import { useMaterials } from '@/hooks/useMaterials'
import { MaterialMovement } from '@/types/materialMovement'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function MaterialMovementReport() {
  const { stockMovements, isLoading: isMovementsLoading } = useMaterialMovements()
  const { transactions } = useTransactions()
  const { materials } = useMaterials()
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  })

  // Enhanced material movements with transaction linking
  const enrichedMovements = useMemo(() => {
    if (!stockMovements || !dateRange?.from || !dateRange?.to) return []
    
    const from = startOfDay(dateRange.from)
    const to = endOfDay(dateRange.to)
    
    // Filter by date range
    const filteredMovements = stockMovements.filter(movement => {
      const movementDate = new Date(movement.createdAt)
      return movementDate >= from && movementDate <= to
    })

    // Enrich with transaction data
    return filteredMovements.map(movement => {
      let transactionData = null
      let transactionId = '-'
      
      // Try to find related transaction
      if (movement.referenceType === 'transaction' && movement.referenceId) {
        const transaction = transactions?.find(t => t.id === movement.referenceId)
        if (transaction) {
          transactionData = transaction
          transactionId = transaction.id
        }
      } else if (movement.referenceType === 'purchase_order') {
        transactionId = movement.referenceId || '-'
      }

      return {
        ...movement,
        transactionData,
        transactionId,
      }
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [stockMovements, transactions, dateRange])

  // Generate actual material movements from transactions (only for production status)
  const transactionBasedMovements = useMemo(() => {
    if (!transactions || !dateRange?.from || !dateRange?.to) return []
    
    const from = startOfDay(dateRange.from)
    const to = endOfDay(dateRange.to)
    
    const movements: any[] = []
    
    // Process transactions in date range that are in production or completed
    transactions.forEach(transaction => {
      const transactionDate = new Date(transaction.orderDate)
      if (transactionDate >= from && transactionDate <= to) {
        // Only show material movements for transactions that actually went into production
        if (transaction.status === 'Proses Produksi' || transaction.status === 'Pesanan Selesai') {
          
          // For each item in transaction, calculate material usage
          transaction.items.forEach(item => {
            if (item.product.materials && item.product.materials.length > 0) {
              item.product.materials.forEach(productMaterial => {
                const totalMaterialUsed = productMaterial.quantity * item.quantity
                const material = materials?.find(m => m.id === productMaterial.materialId)
                const materialName = material?.name || `Material untuk ${item.product.name}`
                
                movements.push({
                  id: `${transaction.id}-${item.product.id}-${productMaterial.materialId}`,
                  materialId: productMaterial.materialId,
                  materialName: materialName,
                  type: material?.type === 'Stock' ? 'OUT' : 'IN',
                  reason: material?.type === 'Stock' ? 'PRODUCTION_CONSUMPTION' : 'PRODUCTION_ACQUISITION',
                  quantity: totalMaterialUsed,
                  referenceId: transaction.id,
                  referenceType: 'transaction' as const,
                  notes: `${material?.type === 'Stock' ? 'Dikonsumsi' : 'Diperoleh'} untuk produksi ${item.product.name} (${item.quantity} unit)`,
                  userId: transaction.cashierId,
                  userName: transaction.cashierName,
                  createdAt: transaction.orderDate.toISOString(),
                  transactionData: transaction,
                  transactionId: transaction.id
                })
              })
            }
          })
        }
      }
    })
    
    return movements.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [transactions, materials, dateRange])

  // Combine both data sources (prioritize transaction-based for accuracy)
  const allMovements = useMemo(() => {
    const combined = [...transactionBasedMovements]
    
    // Add non-transaction movements (like manual adjustments, purchases)
    enrichedMovements.forEach(movement => {
      if (movement.referenceType !== 'transaction') {
        combined.push(movement)
      }
    })
    
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [enrichedMovements, transactionBasedMovements])

  const handleExportPDF = () => {
    const pdf = new jsPDF()
    
    // Title
    pdf.setFontSize(16)
    pdf.text('Laporan Pergerakan Penggunaan Bahan', 20, 20)
    
    // Date range
    pdf.setFontSize(12)
    const dateRangeText = dateRange?.from && dateRange?.to 
      ? `Periode: ${format(dateRange.from, 'd MMMM yyyy', { locale: id })} - ${format(dateRange.to, 'd MMMM yyyy', { locale: id })}`
      : 'Semua Data'
    pdf.text(dateRangeText, 20, 30)
    
    // Table data
    const tableData = allMovements.map(movement => [
      format(new Date(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: id }),
      movement.materialName,
      movement.type === 'IN' ? 'Masuk' : 'Keluar',
      movement.reason === 'PURCHASE' ? 'Pembelian' : 
      movement.reason === 'PRODUCTION_CONSUMPTION' ? 'Produksi' :
      movement.reason === 'ADJUSTMENT' ? 'Penyesuaian' : movement.reason,
      movement.type === 'IN' ? `+${movement.quantity}` : `-${movement.quantity}`,
      movement.transactionId || '-',
      movement.userName || 'System',
      movement.notes || ''
    ])
    
    // Generate table
    autoTable(pdf, {
      head: [['Tanggal', 'Material', 'Jenis', 'Alasan', 'Jumlah', 'Transaksi', 'User', 'Keterangan']],
      body: tableData,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    })
    
    // Save
    const fileName = `pergerakan-bahan-${format(new Date(), 'yyyy-MM-dd')}.pdf`
    pdf.save(fileName)
  }

  if (isMovementsLoading) {
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package2 className="h-5 w-5" />
              Pergerakan Penggunaan Bahan
            </CardTitle>
            <CardDescription>
              Riwayat semua pergerakan stok material dari transaksi dan aktivitas lainnya
            </CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <DateRangePicker 
              date={dateRange} 
              onDateChange={setDateRange}
            />
            <Button 
              variant="outline" 
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
        {allMovements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Tidak ada pergerakan material dalam periode yang dipilih
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Transaksi</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Keterangan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allMovements.map((movement, index) => (
                  <TableRow key={movement.id || index}>
                    <TableCell>
                      {format(new Date(movement.createdAt), 'dd/MM/yyyy HH:mm', { locale: id })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {movement.materialName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={movement.type === 'IN' ? 'default' : 'secondary'}>
                        {movement.type === 'IN' ? 'Masuk' : 'Keluar'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {movement.reason === 'PURCHASE' ? 'Pembelian' : 
                       movement.reason === 'PRODUCTION_CONSUMPTION' ? 'Produksi' :
                       movement.reason === 'ADJUSTMENT' ? 'Penyesuaian' : 
                       movement.reason}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={movement.type === 'IN' ? 'text-green-600' : 'text-red-600'}>
                        {movement.type === 'IN' ? '+' : '-'}{movement.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      {movement.transactionId !== '-' ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          {movement.transactionId}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>{movement.userName || 'System'}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={movement.notes}>
                      {movement.notes || ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}