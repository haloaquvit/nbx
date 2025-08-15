"use client"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Printer, FileDown, Calendar, User, Package, CreditCard } from "lucide-react"
import { useTransactions } from "@/hooks/useTransactions"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { PrintReceiptDialog } from "@/components/PrintReceiptDialog"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"

export default function TransactionDetailPage() {
  const { id: transactionId } = useParams<{ id: string }>()
  const { transactions, isLoading } = useTransactions()
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [printTemplate, setPrintTemplate] = useState<'receipt' | 'invoice'>('receipt')

  const transaction = transactions?.find(t => t.id === transactionId)

  if (!transactionId) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">ID Transaksi tidak valid</h2>
        <Button asChild>
          <Link to="/transactions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar Transaksi
          </Link>
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline">
            <Link to="/transactions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Kembali
            </Link>
          </Button>
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96 mt-2" />
          </div>
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Transaksi tidak ditemukan</h2>
        <p className="text-muted-foreground">
          Transaksi dengan ID {transactionId} tidak dapat ditemukan.
        </p>
        <Button asChild>
          <Link to="/transactions">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Kembali ke Daftar Transaksi
          </Link>
        </Button>
      </div>
    )
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Pesanan Masuk': return 'secondary';
      case 'Proses Design': return 'default';
      case 'ACC Costumer': return 'info';
      case 'Proses Produksi': return 'warning';
      case 'Pesanan Selesai': return 'success';
      case 'Dibatalkan': return 'destructive';
      default: return 'outline';
    }
  }

  const getPaymentStatusVariant = (paidAmount: number, total: number) => {
    if (paidAmount === 0) return 'destructive';
    if (paidAmount >= total) return 'success';
    return 'warning';
  }

  const getPaymentStatusText = (paidAmount: number, total: number) => {
    if (paidAmount === 0) return 'Belum Lunas';
    if (paidAmount >= total) return 'Lunas';
    return 'Sebagian';
  }

  const handlePrintClick = (template: 'receipt' | 'invoice') => {
    setPrintTemplate(template);
    setIsPrintDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PrintReceiptDialog 
        open={isPrintDialogOpen} 
        onOpenChange={setIsPrintDialogOpen} 
        transaction={transaction} 
        template={printTemplate}
      />

      {/* Mobile and Desktop Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/transactions">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Kembali</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Detail Transaksi</h1>
            <p className="text-muted-foreground">
              #{transaction.id}
            </p>
          </div>
        </div>
        
        {/* Print Buttons - Hidden on mobile, shown on desktop */}
        <div className="hidden md:flex gap-2">
          <Button variant="outline" onClick={() => handlePrintClick('receipt')}>
            <Printer className="mr-2 h-4 w-4" />
            Cetak Thermal
          </Button>
          <Button onClick={() => handlePrintClick('invoice')}>
            <FileDown className="mr-2 h-4 w-4" />
            Cetak Invoice PDF
          </Button>
        </div>
      </div>

      {/* Mobile Print Actions - Sticky at top */}
      <div className="md:hidden sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 -mx-6 px-6 py-3">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={() => handlePrintClick('receipt')}
          >
            <Printer className="mr-2 h-4 w-4" />
            Cetak Thermal
          </Button>
          <Button 
            size="sm" 
            className="flex-1"
            onClick={() => handlePrintClick('invoice')}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Cetak Invoice
          </Button>
        </div>
      </div>

      {/* Transaction Info Cards - Mobile optimized */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Status Order</CardTitle>
            <Package className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-1 md:pt-0">
            <Badge variant={getStatusVariant(transaction.status)} className="text-xs">
              {transaction.status}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Status Bayar</CardTitle>
            <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-1 md:pt-0">
            <Badge variant={getPaymentStatusVariant(transaction.paidAmount || 0, transaction.total)} className="text-xs">
              {getPaymentStatusText(transaction.paidAmount || 0, transaction.total)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Total</CardTitle>
            <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-1 md:pt-0">
            <div className="text-lg md:text-2xl font-bold">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(transaction.total)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 md:pb-2">
            <CardTitle className="text-xs md:text-sm font-medium">Sisa</CardTitle>
            <CreditCard className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pt-1 md:pt-0">
            <div className="text-lg md:text-2xl font-bold text-red-600">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                minimumFractionDigits: 0,
              }).format(Math.max(0, transaction.total - (transaction.paidAmount || 0)))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Mobile optimized */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column - Transaction Details */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Transaksi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 md:space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Tanggal Order</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.orderDate ? format(new Date(transaction.orderDate), "d MMMM yyyy, HH:mm", { locale: id }) : 'N/A'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Target Selesai</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.finishDate ? format(new Date(transaction.finishDate), "d MMMM yyyy, HH:mm", { locale: id }) : 'Belum ditentukan'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Kasir</p>
                    <p className="text-sm text-muted-foreground">{transaction.cashierName}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Pelanggan</p>
                    <p className="text-sm text-muted-foreground">{transaction.customerName}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Items Table - Mobile optimized */}
          <Card>
            <CardHeader>
              <CardTitle>Detail Produk</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Mobile View - Card List */}
              <div className="md:hidden space-y-3">
                {transaction.items.map((item, index) => (
                  <Card key={index} className="p-3">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.product.name}</p>
                          {item.notes && (
                            <p className="text-xs text-muted-foreground">{item.notes}</p>
                          )}
                        </div>
                        <div className="text-right ml-2">
                          <p className="font-medium text-sm">
                            {new Intl.NumberFormat("id-ID", {
                              style: "currency",
                              currency: "IDR",
                              minimumFractionDigits: 0,
                            }).format(item.price * item.quantity)}
                          </p>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{item.quantity} {item.unit}</span>
                        <span>@{new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          minimumFractionDigits: 0,
                        }).format(item.price)}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              
              {/* Desktop View - Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Harga Satuan</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transaction.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            {item.notes && (
                              <p className="text-sm text-muted-foreground">{item.notes}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.quantity} {item.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(item.price)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(item.price * item.quantity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator className="my-4" />
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(transaction.subtotal)}
                  </span>
                </div>
                
                {transaction.ppnEnabled && (
                  <div className="flex justify-between">
                    <span>PPN ({transaction.ppnPercentage}%):</span>
                    <span>
                      {new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        minimumFractionDigits: 0,
                      }).format(transaction.ppnAmount)}
                    </span>
                  </div>
                )}
                
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total:</span>
                  <span>
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(transaction.total)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Payment Info */}
        <div className="space-y-4 md:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informasi Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Total Tagihan:</span>
                  <span className="text-sm font-medium">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(transaction.total)}
                  </span>
                </div>
                
                <div className="flex justify-between">
                  <span className="text-sm">Sudah Dibayar:</span>
                  <span className="text-sm font-medium text-green-600">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(transaction.paidAmount || 0)}
                  </span>
                </div>
                
                <Separator />
                
                <div className="flex justify-between">
                  <span className="font-medium">Sisa Tagihan:</span>
                  <span className={`font-bold ${
                    (transaction.total - (transaction.paidAmount || 0)) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0,
                    }).format(Math.max(0, transaction.total - (transaction.paidAmount || 0)))}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile Floating Print Button - Alternative option */}
      <div className="md:hidden fixed bottom-6 right-4 z-20">
        <div className="flex flex-col gap-2">
          <Button
            size="lg"
            className="rounded-full shadow-lg"
            onClick={() => handlePrintClick('receipt')}
          >
            <Printer className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}