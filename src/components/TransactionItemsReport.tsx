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
import { Download, Calendar, Package, CalendarDays, ShoppingCart, Truck, Store, Navigation, FileSpreadsheet, User } from 'lucide-react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { id } from 'date-fns/locale/id'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { useBranch } from '@/contexts/BranchContext'

interface SoldProduct {
  transactionId: string
  transactionDate: Date
  soldDate: Date // Tanggal laku (delivery date, order date untuk laku kantor, atau retasi date)
  customerName: string
  productName: string
  quantity: number
  unit: string
  price: number
  total: number
  source: 'delivery' | 'office_sale' | 'retasi' // Sumber: pengantaran, laku kantor, atau retasi
  driverName?: string
  retasiNumber?: string
  retasiKe?: number // Retasi ke-berapa (1, 2, 3, dst)
  cashierName: string
  isBonus: boolean
}

export const TransactionItemsReport = () => {
  const [filterType, setFilterType] = useState<'monthly' | 'dateRange'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [itemFilter, setItemFilter] = useState<'all' | 'regular' | 'bonus'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'delivery' | 'office_sale' | 'retasi'>('all')
  const [driverKasirFilter, setDriverKasirFilter] = useState<string>('all')
  const [availableDriversKasir, setAvailableDriversKasir] = useState<string[]>([])
  const [retasiKeFilter, setRetasiKeFilter] = useState<string>('all')
  const [availableRetasiKe, setAvailableRetasiKe] = useState<{value: string, label: string}[]>([])
  const [reportData, setReportData] = useState<SoldProduct[]>([])
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

      const items: SoldProduct[] = []

      // 1. Fetch delivered items from delivery_items table
      if (sourceFilter === 'all' || sourceFilter === 'delivery') {
        let deliveryQuery = supabase
          .from('deliveries')
          .select(`
            id,
            transaction_id,
            delivery_date,
            driver_id,
            driver:profiles!deliveries_driver_id_fkey(full_name),
            delivery_items(
              id,
              product_id,
              product_name,
              quantity_delivered,
              unit
            ),
            transaction:transactions!deliveries_transaction_id_fkey(
              id,
              customer_name,
              order_date,
              cashier_id,
              retasi_id,
              cashier:profiles!transactions_cashier_id_fkey(full_name),
              items
            )
          `)
          .gte('delivery_date', fromDate.toISOString())
          .lte('delivery_date', toDate.toISOString())

        if (currentBranch?.id) {
          deliveryQuery = deliveryQuery.eq('branch_id', currentBranch.id)
        }

        const { data: deliveryData, error: deliveryError } = await deliveryQuery

        if (deliveryError) {
          console.error('Error fetching deliveries:', deliveryError)
        } else if (deliveryData) {
          // Collect retasi_ids from delivery transactions to get retasi_ke info
          const deliveryRetasiIds = [...new Set(
            deliveryData
              .map((d: any) => d.transaction?.retasi_id)
              .filter(Boolean)
          )]

          // Fetch retasi details for deliveries
          let deliveryRetasiMap: Record<string, any> = {}
          if (deliveryRetasiIds.length > 0) {
            const { data: deliveryRetasiDetails } = await supabase
              .from('retasi')
              .select('id, retasi_number, retasi_ke, driver_name')
              .in('id', deliveryRetasiIds)

            if (deliveryRetasiDetails) {
              deliveryRetasiDetails.forEach(r => {
                deliveryRetasiMap[r.id] = r
              })
            }
          }

          deliveryData.forEach((delivery: any) => {
            const deliveryDate = new Date(delivery.delivery_date)
            const transaction = delivery.transaction
            const transactionItems = transaction?.items || []

            // Get retasi info for this delivery's transaction
            const retasiInfo = transaction?.retasi_id ? deliveryRetasiMap[transaction.retasi_id] : null
            const retasiNumberDisplay = retasiInfo
              ? `${retasiInfo.retasi_number} (ke-${retasiInfo.retasi_ke})`
              : undefined

            delivery.delivery_items?.forEach((item: any) => {
              // Find matching transaction item to get price and isBonus info
              const matchingTxItem = transactionItems.find((ti: any) =>
                ti.product?.id === item.product_id || ti.productId === item.product_id
              )

              // Detect bonus from product name or transaction item
              const isBonus = item.product_name?.includes('BONUS') ||
                              item.product_name?.includes('(BONUS)') ||
                              Boolean(matchingTxItem?.isBonus)

              // Apply item filter
              if (itemFilter === 'regular' && isBonus) return
              if (itemFilter === 'bonus' && !isBonus) return

              const price = matchingTxItem?.price || matchingTxItem?.product?.basePrice || 0

              items.push({
                transactionId: delivery.transaction_id,
                transactionDate: new Date(transaction?.order_date || delivery.delivery_date),
                soldDate: deliveryDate,
                customerName: transaction?.customer_name || 'Unknown',
                productName: item.product_name,
                quantity: item.quantity_delivered,
                unit: item.unit || 'pcs',
                price: price,
                total: item.quantity_delivered * price,
                source: 'delivery',
                driverName: delivery.driver?.full_name,
                retasiNumber: retasiNumberDisplay,
                retasiKe: retasiInfo?.retasi_ke,
                cashierName: transaction?.cashier?.full_name || 'Unknown',
                isBonus: isBonus
              })
            })
          })
        }
      }

      // 2. Fetch office sale transactions (laku kantor)
      if (sourceFilter === 'all' || sourceFilter === 'office_sale') {
        let officeSaleQuery = supabase
          .from('transactions')
          .select(`
            id,
            customer_name,
            order_date,
            items,
            cashier_id,
            cashier:profiles!transactions_cashier_id_fkey(full_name)
          `)
          .eq('is_office_sale', true)
          .gte('order_date', fromDate.toISOString())
          .lte('order_date', toDate.toISOString())

        if (currentBranch?.id) {
          officeSaleQuery = officeSaleQuery.eq('branch_id', currentBranch.id)
        }

        const { data: officeSaleData, error: officeSaleError } = await officeSaleQuery

        if (officeSaleError) {
          console.error('Error fetching office sales:', officeSaleError)
        } else if (officeSaleData) {
          officeSaleData.forEach((transaction: any) => {
            const orderDate = new Date(transaction.order_date)
            const transactionItems = transaction.items || []

            transactionItems.forEach((item: any) => {
              const productName = item.product?.name || item.name || 'Unknown Item'
              const isBonus = Boolean(item.isBonus) || productName.includes('BONUS')

              // Apply item filter
              if (itemFilter === 'regular' && isBonus) return
              if (itemFilter === 'bonus' && !isBonus) return

              const price = item.price || item.product?.basePrice || 0
              const quantity = item.quantity || 0

              items.push({
                transactionId: transaction.id,
                transactionDate: orderDate,
                soldDate: orderDate, // For office sale, sold date = order date
                customerName: transaction.customer_name || 'Walk-in Customer',
                productName: productName,
                quantity: quantity,
                unit: item.unit || item.product?.unit || 'pcs',
                price: price,
                total: quantity * price,
                source: 'office_sale',
                driverName: undefined,
                cashierName: transaction.cashier?.full_name || 'Unknown',
                isBonus: isBonus
              })
            })
          })
        }
      }

      // 3. Fetch retasi transactions (from Driver POS - transactions with retasi_id)
      // Driver POS = MUST have retasi (driver can't sell without active retasi)
      // Regular POS = NO retasi
      if (sourceFilter === 'all' || sourceFilter === 'retasi') {
        // Get transactions that have retasi_id (from Driver POS)
        let retasiQuery = supabase
          .from('transactions')
          .select(`
            id,
            customer_name,
            order_date,
            items,
            retasi_id,
            retasi_number,
            cashier_name
          `)
          .not('retasi_id', 'is', null)
          .gte('order_date', fromDate.toISOString())
          .lte('order_date', toDate.toISOString())

        if (currentBranch?.id) {
          retasiQuery = retasiQuery.eq('branch_id', currentBranch.id)
        }

        const { data: retasiTransactions, error: retasiError } = await retasiQuery

        console.log('Retasi Transactions (Driver POS):', { retasiTransactions, retasiError })

        if (retasiError) {
          console.error('Error fetching retasi transactions:', retasiError)
        } else if (retasiTransactions && retasiTransactions.length > 0) {
          // Get retasi details for display
          const retasiIds = [...new Set(retasiTransactions.map(t => t.retasi_id).filter(Boolean))]

          let retasiDetailsMap: Record<string, any> = {}
          if (retasiIds.length > 0) {
            const { data: retasiDetails } = await supabase
              .from('retasi')
              .select('id, retasi_number, retasi_ke, driver_name')
              .in('id', retasiIds)

            if (retasiDetails) {
              retasiDetails.forEach(r => {
                retasiDetailsMap[r.id] = r
              })
            }
          }

          // Skip transactions already counted in delivery
          const deliveryTransactionIds = new Set(items.filter(i => i.source === 'delivery').map(i => i.transactionId))

          retasiTransactions.forEach((transaction: any) => {
            // Skip if already counted in delivery
            if (deliveryTransactionIds.has(transaction.id)) return

            const orderDate = new Date(transaction.order_date)
            const transactionItems = transaction.items || []
            const retasiInfo = retasiDetailsMap[transaction.retasi_id]

            transactionItems.forEach((item: any) => {
              // Skip sales metadata items
              if (item._isSalesMeta) return

              const productName = item.product?.name || item.name || 'Unknown Item'
              const isBonus = Boolean(item.isBonus) || productName.includes('BONUS')

              // Apply item filter
              if (itemFilter === 'regular' && isBonus) return
              if (itemFilter === 'bonus' && !isBonus) return

              const price = item.price || item.product?.basePrice || 0
              const quantity = item.quantity || 0

              // Format retasi number with "ke-X" suffix
              const retasiNumberDisplay = retasiInfo
                ? `${retasiInfo.retasi_number} (ke-${retasiInfo.retasi_ke})`
                : (transaction.retasi_number || '-')

              items.push({
                transactionId: transaction.id,
                transactionDate: orderDate,
                soldDate: orderDate,
                customerName: transaction.customer_name || 'Customer Retasi',
                productName: productName,
                quantity: quantity,
                unit: item.unit || item.product?.unit || 'pcs',
                price: price,
                total: quantity * price,
                source: 'retasi',
                retasiNumber: retasiNumberDisplay,
                retasiKe: retasiInfo?.retasi_ke,
                driverName: retasiInfo?.driver_name || transaction.cashier_name,
                cashierName: transaction.cashier_name || 'Unknown',
                isBonus: isBonus
              })
            })
          })
        }
      }

      // Sort by sold date (newest first)
      items.sort((a, b) => b.soldDate.getTime() - a.soldDate.getTime())

      // Extract unique driver/kasir names for filter dropdown
      const uniqueDriversKasir = [...new Set(
        items.map(item => {
          if (item.source === 'delivery' || item.source === 'retasi') {
            return item.driverName || ''
          }
          return item.cashierName || ''
        }).filter(Boolean)
      )].sort()
      setAvailableDriversKasir(uniqueDriversKasir)

      // Extract unique retasi_ke values for filter dropdown
      const uniqueRetasiKe = [...new Set(
        items
          .filter(item => item.retasiKe !== undefined && item.retasiKe !== null)
          .map(item => item.retasiKe as number)
      )].sort((a, b) => a - b)
      setAvailableRetasiKe(uniqueRetasiKe.map(ke => ({
        value: ke.toString(),
        label: `Retasi Ke-${ke}`
      })))

      // Apply filters
      let filteredItems = items

      // Apply driver/kasir filter if selected
      if (driverKasirFilter !== 'all') {
        filteredItems = filteredItems.filter(item => {
          if (item.source === 'delivery' || item.source === 'retasi') {
            return item.driverName === driverKasirFilter
          }
          return item.cashierName === driverKasirFilter
        })
      }

      // Apply retasi ke filter if selected
      if (retasiKeFilter !== 'all') {
        const filterKe = parseInt(retasiKeFilter)
        filteredItems = filteredItems.filter(item => item.retasiKe === filterKe)
      }

      setReportData(filteredItems)
    } catch (error) {
      console.error('Error generating report:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getReportTitle = () => {
    const itemFilterText = itemFilter === 'all' ? '' : itemFilter === 'regular' ? ' (Reguler)' : ' (Bonus)'
    const sourceText = sourceFilter === 'all' ? '' :
                       sourceFilter === 'delivery' ? ' - Pengantaran' :
                       sourceFilter === 'office_sale' ? ' - Laku Kantor' : ' - Retasi'

    if (filterType === 'monthly') {
      const monthName = months.find(m => m.value === selectedMonth)?.label
      return `Laporan Produk Laku${itemFilterText}${sourceText} - ${monthName} ${selectedYear}`
    } else {
      return `Laporan Produk Laku${itemFilterText}${sourceText} - ${format(new Date(startDate), 'dd MMM yyyy', { locale: id })} s/d ${format(new Date(endDate), 'dd MMM yyyy', { locale: id })}`
    }
  }

  const handlePrintReport = () => {
    const doc = new jsPDF('landscape')
    const title = getReportTitle()

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 14, 22)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`, 14, 30)
    doc.text(`Sumber: Pengantaran + Laku Kantor + Retasi`, 14, 36)

    const tableData = reportData.map(item => [
      format(item.soldDate, 'dd/MM/yyyy'),
      item.transactionId.substring(0, 8) + '...',
      item.customerName,
      item.isBonus ? `${item.productName} [BONUS]` : item.productName,
      item.quantity.toString(),
      item.unit,
      `Rp ${item.price.toLocaleString()}`,
      `Rp ${item.total.toLocaleString()}`,
      item.source === 'delivery' ? 'Diantar' : item.source === 'office_sale' ? 'Laku Kantor' : 'Retasi',
      item.retasiNumber || '-',
      item.source === 'delivery' ? (item.driverName || '-') :
      item.source === 'retasi' ? (item.driverName || '-') : item.cashierName
    ])

    autoTable(doc, {
      head: [['Tanggal', 'No. Transaksi', 'Customer', 'Produk', 'Qty', 'Unit', 'Harga', 'Total', 'Sumber', 'Retasi', 'Supir/Kasir']],
      body: tableData,
      startY: 42,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [66, 139, 202] },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 22 },
        2: { cellWidth: 30 },
        3: { cellWidth: 40 },
        4: { cellWidth: 12 },
        5: { cellWidth: 12 },
        6: { cellWidth: 22 },
        7: { cellWidth: 25 },
        8: { cellWidth: 18 },
        9: { cellWidth: 35 },
        10: { cellWidth: 28 }
      }
    })

    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Ringkasan:', 14, finalY)

    const totalItems = reportData.length
    const totalQuantity = reportData.reduce((sum, item) => sum + item.quantity, 0)
    const totalValue = reportData.reduce((sum, item) => sum + item.total, 0)
    const uniqueTransactions = new Set(reportData.map(item => item.transactionId)).size
    const deliveryItems = reportData.filter(item => item.source === 'delivery').length
    const officeSaleItems = reportData.filter(item => item.source === 'office_sale').length
    const retasiItems = reportData.filter(item => item.source === 'retasi').length
    const regularItems = reportData.filter(item => !item.isBonus).length
    const bonusItems = reportData.filter(item => item.isBonus).length

    doc.setFont('helvetica', 'normal')
    doc.text(`• Total Produk: ${totalItems} (Diantar: ${deliveryItems}, Laku Kantor: ${officeSaleItems}, Retasi: ${retasiItems})`, 14, finalY + 8)
    if (itemFilter === 'all') {
      doc.text(`• Produk Reguler: ${regularItems}, Produk Bonus: ${bonusItems}`, 14, finalY + 16)
      doc.text(`• Total Quantity: ${totalQuantity}`, 14, finalY + 24)
      doc.text(`• Total Nilai: Rp ${totalValue.toLocaleString()}`, 14, finalY + 32)
      doc.text(`• Total Transaksi: ${uniqueTransactions}`, 14, finalY + 40)
    } else {
      doc.text(`• Total Quantity: ${totalQuantity}`, 14, finalY + 16)
      doc.text(`• Total Nilai: Rp ${totalValue.toLocaleString()}`, 14, finalY + 24)
      doc.text(`• Total Transaksi: ${uniqueTransactions}`, 14, finalY + 32)
    }

    const filterSuffix = itemFilter === 'regular' ? '-Reguler' : itemFilter === 'bonus' ? '-Bonus' : ''
    const sourceSuffix = sourceFilter === 'delivery' ? '-Pengantaran' :
                         sourceFilter === 'office_sale' ? '-LakuKantor' :
                         sourceFilter === 'retasi' ? '-Retasi' : ''
    const filename = filterType === 'monthly'
      ? `Laporan-Produk-Laku${filterSuffix}${sourceSuffix}-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.pdf`
      : `Laporan-Produk-Laku${filterSuffix}${sourceSuffix}-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.pdf`
    doc.save(filename)
  }

  const handleExportExcel = () => {
    const title = getReportTitle()

    // Prepare data for Excel
    const excelData = reportData.map(item => ({
      'Tanggal Laku': format(item.soldDate, 'dd/MM/yyyy'),
      'No. Transaksi': item.transactionId.substring(0, 8) + '...',
      'Customer': item.customerName,
      'Produk': item.isBonus ? `${item.productName} [BONUS]` : item.productName,
      'Qty': item.quantity,
      'Unit': item.unit,
      'Harga': item.price,
      'Total': item.total,
      'Sumber': item.source === 'delivery' ? 'Diantar' : item.source === 'office_sale' ? 'Laku Kantor' : 'Retasi',
      'Retasi': item.retasiNumber || '-',
      'Supir/Kasir': item.source === 'delivery' || item.source === 'retasi' ? (item.driverName || '-') : item.cashierName
    }))

    // Create workbook and worksheet
    const ws = XLSX.utils.json_to_sheet(excelData)

    // Add title row at the beginning
    XLSX.utils.sheet_add_aoa(ws, [[title]], { origin: 'A1' })
    XLSX.utils.sheet_add_aoa(ws, [[`Digenerate pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`]], { origin: 'A2' })
    XLSX.utils.sheet_add_aoa(ws, [['']], { origin: 'A3' })

    // Re-add data with header starting from row 4
    const headers = ['Tanggal Laku', 'No. Transaksi', 'Customer', 'Produk', 'Qty', 'Unit', 'Harga', 'Total', 'Sumber', 'Retasi', 'Supir/Kasir']
    XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A4' })

    // Add data rows starting from row 5
    const dataRows = excelData.map(item => Object.values(item))
    XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: 'A5' })

    // Add summary at the end
    const totalItems = reportData.length
    const totalQuantity = reportData.reduce((sum, item) => sum + item.quantity, 0)
    const totalValue = reportData.reduce((sum, item) => sum + item.total, 0)
    const uniqueTransactions = new Set(reportData.map(item => item.transactionId)).size
    const deliveryItems = reportData.filter(item => item.source === 'delivery').length
    const officeSaleItems = reportData.filter(item => item.source === 'office_sale').length
    const retasiItems = reportData.filter(item => item.source === 'retasi').length

    const summaryStartRow = 5 + excelData.length + 2
    XLSX.utils.sheet_add_aoa(ws, [
      ['Ringkasan:'],
      [`Total Produk: ${totalItems} (Diantar: ${deliveryItems}, Laku Kantor: ${officeSaleItems}, Retasi: ${retasiItems})`],
      [`Total Quantity: ${totalQuantity}`],
      [`Total Nilai: Rp ${totalValue.toLocaleString()}`],
      [`Total Transaksi: ${uniqueTransactions}`]
    ], { origin: `A${summaryStartRow}` })

    // Set column widths
    ws['!cols'] = [
      { wch: 12 }, // Tanggal
      { wch: 15 }, // No. Transaksi
      { wch: 25 }, // Customer
      { wch: 35 }, // Produk
      { wch: 8 },  // Qty
      { wch: 10 }, // Unit
      { wch: 15 }, // Harga
      { wch: 18 }, // Total
      { wch: 15 }, // Sumber
      { wch: 25 }, // Retasi
      { wch: 20 }  // Supir/Kasir
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produk Laku')

    // Generate filename
    const filterSuffix = itemFilter === 'regular' ? '-Reguler' : itemFilter === 'bonus' ? '-Bonus' : ''
    const sourceSuffix = sourceFilter === 'delivery' ? '-Pengantaran' :
                         sourceFilter === 'office_sale' ? '-LakuKantor' :
                         sourceFilter === 'retasi' ? '-Retasi' : ''
    const filename = filterType === 'monthly'
      ? `Laporan-Produk-Laku${filterSuffix}${sourceSuffix}-${months.find(m => m.value === selectedMonth)?.label}-${selectedYear}.xlsx`
      : `Laporan-Produk-Laku${filterSuffix}${sourceSuffix}-${format(new Date(startDate), 'dd-MM-yyyy')}-to-${format(new Date(endDate), 'dd-MM-yyyy')}.xlsx`

    XLSX.writeFile(wb, filename)
  }

  const getSourceBadge = (source: 'delivery' | 'office_sale' | 'retasi', retasiNumber?: string) => {
    if (source === 'delivery') {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-300">
          <Truck className="h-3 w-3 mr-1" />
          Diantar
        </Badge>
      )
    }
    if (source === 'retasi') {
      return (
        <Badge variant="secondary" className="bg-purple-100 text-purple-800 border-purple-300">
          <Navigation className="h-3 w-3 mr-1" />
          {retasiNumber ? `Retasi ${retasiNumber}` : 'Retasi'}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">
        <Store className="h-3 w-3 mr-1" />
        Laku Kantor
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Laporan Produk Laku
          </CardTitle>
          <CardDescription>
            Laporan produk yang sudah laku berdasarkan pengantaran, laku kantor, dan retasi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {/* Filter Type Selection */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Jenis Filter</Label>
                <Select value={filterType} onValueChange={(value: 'monthly' | 'dateRange') => setFilterType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Bulanan</SelectItem>
                    <SelectItem value="dateRange">Rentang Tanggal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Filter Produk</Label>
                <Select value={itemFilter} onValueChange={(value: 'all' | 'regular' | 'bonus') => setItemFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Produk</SelectItem>
                    <SelectItem value="regular">Produk Reguler</SelectItem>
                    <SelectItem value="bonus">Produk Bonus</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Sumber</Label>
                <Select value={sourceFilter} onValueChange={(value: 'all' | 'delivery' | 'office_sale' | 'retasi') => setSourceFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Sumber</SelectItem>
                    <SelectItem value="delivery">Pengantaran</SelectItem>
                    <SelectItem value="office_sale">Laku Kantor</SelectItem>
                    <SelectItem value="retasi">Retasi</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Navigation className="h-3 w-3" />
                  Retasi Ke
                </Label>
                <Select value={retasiKeFilter} onValueChange={setRetasiKeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Retasi</SelectItem>
                    {availableRetasiKe.map(item => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <User className="h-3 w-3" />
                  Supir/Kasir
                </Label>
                <Select value={driverKasirFilter} onValueChange={setDriverKasirFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Semua" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Supir/Kasir</SelectItem>
                    {availableDriversKasir.map(name => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              <div className="flex gap-2 text-sm text-muted-foreground flex-wrap">
                <span>{reportData.length} Produk</span>
                <span>•</span>
                <span className="text-blue-600">{reportData.filter(i => i.source === 'delivery').length} Diantar</span>
                <span>•</span>
                <span className="text-green-600">{reportData.filter(i => i.source === 'office_sale').length} Laku Kantor</span>
                <span>•</span>
                <span className="text-purple-600">{reportData.filter(i => i.source === 'retasi').length} Retasi</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Detail Produk Laku</h3>
              {reportData.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handlePrintReport}>
                    <Download className="mr-2 h-4 w-4" />
                    Cetak PDF
                  </Button>
                  <Button variant="outline" onClick={handleExportExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal Laku</TableHead>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-center">Harga</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Sumber</TableHead>
                    <TableHead>Retasi</TableHead>
                    <TableHead>Supir/Kasir</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((item, index) => (
                    <TableRow key={`${item.transactionId}-${index}`}>
                      <TableCell className="font-mono">
                        {format(item.soldDate, 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {item.transactionId.substring(0, 8)}...
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.customerName}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {item.productName}
                            {item.isBonus && (
                              <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 border-orange-300">
                                BONUS
                              </Badge>
                            )}
                          </div>
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
                        {getSourceBadge(item.source, item.retasiNumber)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {item.retasiNumber || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {item.source === 'delivery' || item.source === 'retasi'
                          ? (item.driverName || '-')
                          : item.cashierName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mt-6">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{reportData.length}</div>
                  <div className="text-sm text-muted-foreground">Total Produk</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-blue-600">{reportData.filter(item => item.source === 'delivery').length}</div>
                  <div className="text-sm text-muted-foreground">Diantar</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{reportData.filter(item => item.source === 'office_sale').length}</div>
                  <div className="text-sm text-muted-foreground">Laku Kantor</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-purple-600">{reportData.filter(item => item.source === 'retasi').length}</div>
                  <div className="text-sm text-muted-foreground">Retasi</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{reportData.reduce((sum, item) => sum + item.quantity, 0)}</div>
                  <div className="text-sm text-muted-foreground">Total Qty</div>
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
                  <div className="text-sm text-muted-foreground">Transaksi</div>
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
              Pilih periode dan klik "Generate Laporan" untuk melihat produk yang laku.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Laporan ini menampilkan produk dari pengantaran, laku kantor, dan retasi.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
