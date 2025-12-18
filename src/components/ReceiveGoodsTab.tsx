"use client"
import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { supabase } from "@/integrations/supabase/client"
import { useQuery } from "@tanstack/react-query"
import { Package, Search, FileDown, Printer } from "lucide-react"
import * as XLSX from 'xlsx'
import { useCompanySettings } from "@/hooks/useCompanySettings"

interface ReceiveGoodsRecord {
  id: string
  poId: string
  materialName: string
  quantity: number
  unit: string
  receivedDate: Date
  receivedBy: string
  notes?: string
  supplierName?: string
  previousStock: number
  newStock: number
}

export function ReceiveGoodsTab() {
  const [searchTerm, setSearchTerm] = React.useState("")
  const { settings } = useCompanySettings()
  const printRef = React.useRef<HTMLDivElement>(null)

  const { data: receiveRecords, isLoading, error: queryError } = useQuery<ReceiveGoodsRecord[]>({
    queryKey: ['receiveGoods'],
    queryFn: async () => {
      console.log('Fetching receive goods records...')

      // Fetch material movements with reason 'PURCHASE'
      const { data, error } = await supabase
        .from('material_stock_movements')
        .select(`
          id,
          material_id,
          material_name,
          quantity,
          previous_stock,
          new_stock,
          reference_id,
          reference_type,
          notes,
          created_at,
          user_name,
          materials:material_id (
            unit
          )
        `)
        .eq('reason', 'PURCHASE')
        .eq('type', 'IN')
        .order('created_at', { ascending: false })

      console.log('Material movements query result:', { data, error })

      if (error) {
        console.error('Error fetching material movements:', error)
        throw new Error(error.message)
      }

      // Enrich with PO data
      const enrichedData = await Promise.all(
        (data || []).map(async (movement: any) => {
          let supplierName = undefined

          if (movement.reference_id && movement.reference_type === 'purchase_order') {
            const { data: poData } = await supabase
              .from('purchase_orders')
              .select('supplier_name')
              .eq('id', movement.reference_id)
              .single()

            supplierName = poData?.supplier_name
          }

          return {
            id: movement.id,
            poId: movement.reference_id || '-',
            materialName: movement.material_name,
            quantity: movement.quantity,
            unit: movement.materials?.unit || '',
            receivedDate: new Date(movement.created_at),
            receivedBy: movement.user_name || 'Unknown',
            notes: movement.notes,
            supplierName: supplierName,
            previousStock: movement.previous_stock,
            newStock: movement.new_stock,
          } as ReceiveGoodsRecord
        })
      )

      return enrichedData
    }
  })

  // Filter records by search term
  const filteredRecords = receiveRecords?.filter(record =>
    record.poId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.materialName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.supplierName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.receivedBy.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  // Export to Excel
  const handleExportExcel = () => {
    if (!filteredRecords || filteredRecords.length === 0) {
      alert('Tidak ada data untuk diexport')
      return
    }

    // Prepare data for Excel
    const excelData = filteredRecords.map((record, index) => ({
      'No': index + 1,
      'Tanggal Terima': format(record.receivedDate, "d MMM yyyy HH:mm", { locale: id }),
      'No. PO': record.poId,
      'Material': record.materialName,
      'Supplier': record.supplierName || '-',
      'Jumlah': `${record.quantity.toLocaleString('id-ID')} ${record.unit}`,
      'Stok Sebelum': `${record.previousStock.toLocaleString('id-ID')} ${record.unit}`,
      'Stok Setelah': `${record.newStock.toLocaleString('id-ID')} ${record.unit}`,
      'Diterima Oleh': record.receivedBy,
      'Catatan': record.notes || '-'
    }))

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(excelData)

    // Set column widths
    ws['!cols'] = [
      { wch: 5 },  // No
      { wch: 18 }, // Tanggal
      { wch: 15 }, // No. PO
      { wch: 25 }, // Material
      { wch: 20 }, // Supplier
      { wch: 15 }, // Jumlah
      { wch: 15 }, // Stok Sebelum
      { wch: 15 }, // Stok Setelah
      { wch: 20 }, // Diterima Oleh
      { wch: 30 }, // Catatan
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Penerimaan Barang')

    // Generate filename with current date
    const filename = `Penerimaan_Barang_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // Print function
  const handlePrint = () => {
    if (!printRef.current) return

    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    const companyName = settings?.companyName || 'Perusahaan'
    const companyAddress = settings?.companyAddress || ''
    const companyPhone = settings?.companyPhone || ''

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Laporan Penerimaan Barang</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            font-size: 12px;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #000;
            padding-bottom: 10px;
          }
          .header h2 { margin: 5px 0; }
          .header p { margin: 2px 0; font-size: 11px; }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f4f4f4;
            font-weight: bold;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          @media print {
            body { padding: 0; }
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>${companyName}</h2>
          ${companyAddress ? `<p>${companyAddress}</p>` : ''}
          ${companyPhone ? `<p>Telp: ${companyPhone}</p>` : ''}
          <h3 style="margin-top: 15px;">LAPORAN PENERIMAAN BARANG</h3>
          <p>Dicetak pada: ${format(new Date(), "d MMMM yyyy HH:mm", { locale: id })}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th class="text-center">No</th>
              <th>Tanggal Terima</th>
              <th>No. PO</th>
              <th>Material</th>
              <th>Supplier</th>
              <th class="text-right">Jumlah</th>
              <th class="text-right">Stok Sebelum</th>
              <th class="text-right">Stok Setelah</th>
              <th>Diterima Oleh</th>
              <th>Catatan</th>
            </tr>
          </thead>
          <tbody>
            ${filteredRecords.map((record, index) => `
              <tr>
                <td class="text-center">${index + 1}</td>
                <td>${format(record.receivedDate, "d MMM yyyy HH:mm", { locale: id })}</td>
                <td>${record.poId}</td>
                <td>${record.materialName}</td>
                <td>${record.supplierName || '-'}</td>
                <td class="text-right">${record.quantity.toLocaleString('id-ID')} ${record.unit}</td>
                <td class="text-right">${record.previousStock.toLocaleString('id-ID')} ${record.unit}</td>
                <td class="text-right">${record.newStock.toLocaleString('id-ID')} ${record.unit}</td>
                <td>${record.receivedBy}</td>
                <td>${record.notes || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()

    // Wait for content to load then print
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  return (
    <>
      {/* Hidden div for print reference */}
      <div ref={printRef} style={{ display: 'none' }} />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <div>
              <CardTitle>Penerimaan Barang</CardTitle>
              <CardDescription>
                History penerimaan barang dari Purchase Order
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      <CardContent>
        {/* Search and Actions */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari berdasarkan No. PO, material, supplier, atau penerima..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={!filteredRecords || filteredRecords.length === 0}
          >
            <FileDown className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={!filteredRecords || filteredRecords.length === 0}
          >
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal Terima</TableHead>
                <TableHead>No. PO</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-right">Stok Sebelum</TableHead>
                <TableHead className="text-right">Stok Setelah</TableHead>
                <TableHead>Diterima Oleh</TableHead>
                <TableHead>Catatan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={9}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      {format(record.receivedDate, "d MMM yyyy HH:mm", { locale: id })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.poId}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{record.materialName}</TableCell>
                    <TableCell>{record.supplierName || '-'}</TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono">
                        {record.quantity.toLocaleString('id-ID')} {record.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono text-muted-foreground">
                        {record.previousStock.toLocaleString('id-ID')} {record.unit}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-semibold text-green-600">
                        {record.newStock.toLocaleString('id-ID')} {record.unit}
                      </span>
                    </TableCell>
                    <TableCell>{record.receivedBy}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {record.notes || '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    {searchTerm ? "Tidak ditemukan penerimaan barang yang sesuai" : "Belum ada penerimaan barang"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
    </>
  )
}