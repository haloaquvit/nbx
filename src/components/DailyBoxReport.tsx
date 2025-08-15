"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useDailyReport } from "@/hooks/useDailyReport"
import { CalendarDays, Printer, Download, TrendingUp, TrendingDown, DollarSign, Clock } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { useAuth } from "@/hooks/useAuth"

export function DailyBoxReport() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const { data: dailyReport, isLoading } = useDailyReport(selectedDate)
  const { user } = useAuth()

  const handlePrint = () => {
    if (!dailyReport) return
    
    // Create print content
    const printContent = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px; color: #333;">MATAHARI DIGITAL PRINTING</h1>
          <h2 style="margin: 10px 0; font-size: 18px; color: #666;">LAPORAN HARIAN</h2>
          <p style="margin: 5px 0; font-size: 14px;">Tanggal: ${format(selectedDate, 'dd MMMM yyyy', { locale: id })}</p>
        </div>

        <!-- Header Summary -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px; gap: 20px;">
          <div style="flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Total Penjualan</h3>
            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #2563eb;">
              ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.totalSales)}
            </p>
          </div>
          <div style="flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Kas Masuk</h3>
            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #16a34a;">
              ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.cashIn)}
            </p>
          </div>
          <div style="flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Kas Keluar</h3>
            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #dc2626;">
              ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.cashOut)}
            </p>
          </div>
          <div style="flex: 1; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #333;">Kas Bersih</h3>
            <p style="margin: 0; font-size: 20px; font-weight: bold; color: #7c3aed;">
              ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.netCash)}
            </p>
          </div>
        </div>

        <!-- Sales Summary -->
        <div style="margin-bottom: 30px;">
          <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
            Ringkasan Penjualan Hari Ini
          </h3>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Penjualan Tunai</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
                ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalCash)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Penjualan Kredit</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
                ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalCredit)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Total Penjualan</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">
                ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalSales)}
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f8f9fa; font-weight: bold;">Jumlah Transaksi</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">
                ${dailyReport.salesSummary.transactionCount} transaksi
              </td>
            </tr>
          </table>
        </div>

        <!-- Cash Flow by Account -->
        ${dailyReport.cashFlowByAccount.length > 0 ? `
          <div style="margin-bottom: 30px;">
            <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
              Arus Kas per Akun
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: #f8f9fa;">
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Nama Akun</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Kas Masuk</th>
                  <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Kas Keluar</th>
                </tr>
              </thead>
              <tbody>
                ${dailyReport.cashFlowByAccount.map(flow => `
                  <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${flow.accountName}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #16a34a;">
                      ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(flow.cashIn)}
                    </td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #dc2626;">
                      ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(flow.cashOut)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- Transaction Details -->
        <div>
          <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">
            Detail Transaksi (${dailyReport.transactions.length} transaksi)
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f8f9fa;">
                <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">No Order</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Waktu</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Customer</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: right;">Total</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: right;">Dibayar</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: right;">Sisa</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: center;">Status</th>
                <th style="padding: 6px; border: 1px solid #ddd; text-align: left;">Kasir</th>
              </tr>
            </thead>
            <tbody>
              ${dailyReport.transactions.map(trans => `
                <tr>
                  <td style="padding: 6px; border: 1px solid #ddd;">${trans.orderNumber}</td>
                  <td style="padding: 6px; border: 1px solid #ddd;">${trans.time}</td>
                  <td style="padding: 6px; border: 1px solid #ddd;">${trans.customerName}</td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">
                    ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(trans.total)}
                  </td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">
                    ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(trans.paidAmount)}
                  </td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">
                    ${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(trans.remaining)}
                  </td>
                  <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">
                    <span style="padding: 2px 6px; border-radius: 4px; font-size: 10px; 
                                 background: ${trans.paymentStatus === 'Lunas' ? '#dcfce7; color: #166534' : '#fef3c7; color: #92400e'};">
                      ${trans.paymentStatus}
                    </span>
                  </td>
                  <td style="padding: 6px; border: 1px solid #ddd;">${trans.cashierName}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666;">
          <p>Dicetak pada: ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: id })}</p>
        </div>
      </div>
    `

    // Open print window
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Laporan Harian - ${format(selectedDate, 'dd-MM-yyyy')}</title>
            <style>
              @media print {
                body { margin: 0; }
                @page { margin: 1cm; }
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }

  const exportToCSV = () => {
    if (!dailyReport) return

    const csvContent = [
      ['Laporan Harian - Matahari Digital Printing'],
      ['Tanggal', format(selectedDate, 'dd/MM/yyyy')],
      [''],
      ['RINGKASAN'],
      ['Total Penjualan', dailyReport.totalSales],
      ['Kas Masuk', dailyReport.cashIn],
      ['Kas Keluar', dailyReport.cashOut],
      ['Kas Bersih', dailyReport.netCash],
      [''],
      ['DETAIL TRANSAKSI'],
      ['No Order', 'Waktu', 'Customer', 'Total', 'Dibayar', 'Sisa', 'Status', 'Kasir'],
      ...dailyReport.transactions.map(trans => [
        trans.orderNumber,
        trans.time,
        trans.customerName,
        trans.total,
        trans.paidAmount,
        trans.remaining,
        trans.paymentStatus,
        trans.cashierName
      ])
    ]

    const csv = csvContent.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Laporan_Harian_${format(selectedDate, 'yyyy-MM-dd')}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Date Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Laporan Harian Box View
          </CardTitle>
          <CardDescription>
            Pilih tanggal untuk melihat laporan harian
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="report-date">Tanggal Laporan</Label>
              <Input
                id="report-date"
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="w-48"
              />
            </div>
            <Button
              variant="secondary" 
              onClick={() => setSelectedDate(new Date('2020-01-01'))}
              className="mb-6"
            >
              Lihat Semua Data
            </Button>
            <div className="flex gap-2">
              <Button 
                onClick={handlePrint} 
                disabled={!dailyReport || isLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button 
                onClick={exportToCSV} 
                disabled={!dailyReport || isLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <div className="text-center py-4 text-sm text-muted-foreground">
              Memuat data laporan untuk {format(selectedDate, 'dd MMMM yyyy', { locale: id })}...
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!dailyReport && !isLoading && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Tidak ada data laporan</p>
                <p className="text-sm">
                  Belum ada data transaksi atau kas untuk tanggal {format(selectedDate, 'dd MMMM yyyy', { locale: id })}
                </p>
                <p className="text-xs mt-2">
                  Coba pilih tanggal lain atau lakukan transaksi terlebih dahulu
                </p>
              </div>
            </CardContent>
          </Card>
          
        </div>
      )}

      {/* Daily Report Content */}
      {dailyReport && !isLoading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-blue-600" />
                  Total Penjualan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {new Intl.NumberFormat('id-ID', { 
                    style: 'currency', 
                    currency: 'IDR',
                    minimumFractionDigits: 0 
                  }).format(dailyReport.totalSales)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dailyReport.salesSummary.transactionCount} transaksi
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  Kas Masuk
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {new Intl.NumberFormat('id-ID', { 
                    style: 'currency', 
                    currency: 'IDR',
                    minimumFractionDigits: 0 
                  }).format(dailyReport.cashIn)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Tunai + Piutang
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  Kas Keluar
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {new Intl.NumberFormat('id-ID', { 
                    style: 'currency', 
                    currency: 'IDR',
                    minimumFractionDigits: 0 
                  }).format(dailyReport.cashOut)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Transfer + Biaya
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-purple-600" />
                  Kas Bersih
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${dailyReport.netCash >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {new Intl.NumberFormat('id-ID', { 
                    style: 'currency', 
                    currency: 'IDR',
                    minimumFractionDigits: 0 
                  }).format(dailyReport.netCash)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Hari ini
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sales Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Ringkasan Penjualan Hari Ini</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Penjualan Tunai</div>
                  <div className="text-xl font-bold text-green-600">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalCash)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Penjualan Kredit</div>
                  <div className="text-xl font-bold text-orange-600">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalCredit)}
                  </div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">Total Penjualan</div>
                  <div className="text-xl font-bold text-blue-600">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(dailyReport.salesSummary.totalSales)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cash Flow by Account */}
          {dailyReport.cashFlowByAccount.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Arus Kas per Akun</CardTitle>
                <CardDescription>Akun yang memiliki transaksi hari ini</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Akun</TableHead>
                        <TableHead className="text-right">Kas Masuk</TableHead>
                        <TableHead className="text-right">Kas Keluar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyReport.cashFlowByAccount.map((flow, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{flow.accountName}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(flow.cashIn)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(flow.cashOut)}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Detail Transaksi ({dailyReport.transactions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyReport.transactions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Tidak ada transaksi pada tanggal ini</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No Order</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Dibayar</TableHead>
                        <TableHead className="text-right">Sisa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Kasir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyReport.transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="font-medium">{transaction.orderNumber}</TableCell>
                          <TableCell>{transaction.time}</TableCell>
                          <TableCell>{transaction.customerName}</TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(transaction.total)}
                          </TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(transaction.paidAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(transaction.remaining)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={transaction.paymentStatus === 'Lunas' ? 'default' : 'secondary'}>
                              {transaction.paymentStatus}
                            </Badge>
                          </TableCell>
                          <TableCell>{transaction.cashierName}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}