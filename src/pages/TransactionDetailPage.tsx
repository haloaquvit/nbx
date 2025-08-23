"use client"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Printer, FileDown, Calendar, User, Package, CreditCard, Truck, FileText } from "lucide-react"
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionDeliveryInfo } from "@/hooks/useDeliveries"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { PrintReceiptDialog } from "@/components/PrintReceiptDialog"
import { DeliveryManagement } from "@/components/DeliveryManagement"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useToast } from "@/components/ui/use-toast"

export default function TransactionDetailPage() {
  const { id: transactionId } = useParams<{ id: string }>()
  const { transactions, isLoading } = useTransactions()
  const { data: deliveryInfo, isLoading: isLoadingDelivery } = useTransactionDeliveryInfo(transactionId || '')
  const { toast } = useToast()
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [printTemplate, setPrintTemplate] = useState<'receipt' | 'invoice'>('receipt')
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)

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
      case 'Siap Antar': return 'default';
      case 'Diantar Sebagian': return 'secondary';
      case 'Selesai': return 'success';
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

  const generateDeliveryNote = () => {
    if (!transaction) return;
    
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SURAT JALAN', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('AQUVIT', 105, 30, { align: 'center' });
    
    // Line separator
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);
    
    // Transaction info
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Informasi Pesanan:', 20, 50);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`No. Order: ${transaction.id}`, 20, 58);
    doc.text(`Pelanggan: ${transaction.customerName}`, 20, 66);
    doc.text(`Tanggal: ${format(new Date(transaction.orderDate), 'dd MMMM yyyy', { locale: id })}`, 20, 74);
    doc.text(`Kasir: ${transaction.cashierName}`, 20, 82);
    
    // Calculate delivery info
    const getDeliveryInfo = (productId: string) => {
      if (deliveryInfo?.deliveries && deliveryInfo.deliveries.length > 0) {
        let totalDelivered = 0;
        deliveryInfo.deliveries.forEach(delivery => {
          const deliveredItem = delivery.items?.find(item => item.productId === productId);
          if (deliveredItem) {
            totalDelivered += deliveredItem.quantityDelivered || 0;
          }
        });
        return totalDelivered;
      }
      return 0;
    };
    
    // Items table with delivery info
    const tableData = transaction.items.map((item, index) => {
      const deliveredQty = getDeliveryInfo(item.product.id);
      const remainingQty = item.quantity - deliveredQty;
      
      return [
        (index + 1).toString(),
        item.product.name,
        `${item.quantity} ${item.unit}`,
        `${deliveredQty} ${item.unit}`,
        `${remainingQty} ${item.unit}`,
        '___________'
      ];
    });
    
    autoTable(doc, {
      startY: 95,
      head: [['No', 'Produk', 'Pesan', 'Dikirim', 'Sisa', 'Diterima']],
      body: tableData,
      theme: 'grid',
      headStyles: { 
        fillColor: [71, 85, 105], 
        textColor: [255, 255, 255],
        fontSize: 12,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 11
      },
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 25, halign: 'center' },
        4: { cellWidth: 25, halign: 'center' },
        5: { cellWidth: 30, halign: 'center' }
      }
    });
    
    // Notes section
    let currentY = (doc as any).lastAutoTable.finalY + 15;
    
    if (transaction.notes && transaction.notes.trim()) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Catatan:', 20, currentY);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const notesLines = doc.splitTextToSize(transaction.notes, 150);
      doc.text(notesLines, 20, currentY + 8);
      
      currentY += 8 + (notesLines.length * 5) + 10;
    }
    
    // Individual item notes
    const itemsWithNotes = transaction.items.filter(item => item.notes && item.notes.trim());
    if (itemsWithNotes.length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Keterangan Item:', 20, currentY);
      currentY += 8;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      itemsWithNotes.forEach((item, index) => {
        const text = `${index + 1}. ${item.product.name}: ${item.notes}`;
        const textLines = doc.splitTextToSize(text, 150);
        doc.text(textLines, 25, currentY);
        currentY += textLines.length * 5 + 2;
      });
      currentY += 10;
    }
    
    // Signature section
    const finalY = currentY;
    
    doc.setFontSize(10);
    doc.text('Yang Mengirim:', 30, finalY);
    doc.text('Yang Menerima:', 125, finalY);
    
    // Signature boxes
    doc.rect(30, finalY + 5, 45, 18);
    doc.rect(125, finalY + 5, 45, 18);
    
    doc.setFontSize(8);
    doc.text('Nama:', 32, finalY + 28);
    doc.text('Tanggal:', 32, finalY + 34);
    doc.text('TTD:', 32, finalY + 40);
    
    doc.text('Nama:', 127, finalY + 28);
    doc.text('Tanggal:', 127, finalY + 34);
    doc.text('TTD:', 127, finalY + 40);
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(`Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 105, 280, { align: 'center' });
    
    // Save PDF
    doc.save(`surat-jalan-${transaction.id}.pdf`);
    
    toast({
      title: "Surat Jalan Dicetak",
      description: `Surat jalan untuk order ${transaction.id} berhasil dibuat`
    });
  };

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
          <Button asChild variant="outline" size="lg" className="px-6">
            <Link to="/transactions">
              <ArrowLeft className="mr-2 h-5 w-5" />
              <span>Kembali</span>
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Detail Transaksi</h1>
            <p className="text-muted-foreground">
              #{transaction.id}
            </p>
          </div>
        </div>
        
        {/* Action Buttons - Hidden on mobile, shown on desktop */}
        <div className="hidden md:flex gap-2">
          {/* Show delivery button if transaction is ready for delivery and not office sale */}
          {deliveryInfo && !transaction?.isOfficeSale && (
            transaction?.status === 'Siap Antar' || 
            transaction?.status === 'Diantar Sebagian'
          ) && (
            <Button 
              variant="outline" 
              className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              onClick={() => setShowDeliveryForm(true)}
            >
              <Truck className="mr-2 h-4 w-4" />
              Input Pengantaran
            </Button>
          )}
          <Button variant="outline" onClick={generateDeliveryNote}>
            <FileText className="mr-2 h-4 w-4" />
            Surat Jalan
          </Button>
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

      {/* Mobile Actions - Sticky at top */}
      <div className="md:hidden sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 -mx-6 px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {/* Show delivery button if transaction is ready for delivery and not office sale */}
          {deliveryInfo && !transaction?.isOfficeSale && (
            transaction?.status === 'Siap Antar' || 
            transaction?.status === 'Diantar Sebagian'
          ) && (
            <Button 
              variant="outline"
              size="sm" 
              className="flex-shrink-0 bg-green-50 border-green-200 text-green-700"
              onClick={() => setShowDeliveryForm(true)}
            >
              <Truck className="mr-2 h-4 w-4" />
              Antar
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-shrink-0"
            onClick={generateDeliveryNote}
          >
            <FileText className="mr-2 h-4 w-4" />
            Surat Jalan
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-shrink-0"
            onClick={() => handlePrintClick('receipt')}
          >
            <Printer className="mr-2 h-4 w-4" />
            Thermal
          </Button>
          <Button 
            size="sm" 
            className="flex-1"
            onClick={() => handlePrintClick('invoice')}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Invoice
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

      {/* Delivery Management Section */}
      {showDeliveryForm && deliveryInfo && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Input Pengantaran</CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowDeliveryForm(false)}
                >
                  Tutup
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DeliveryManagement 
                transaction={deliveryInfo}
                onClose={() => {
                  setShowDeliveryForm(false)
                  // Refresh data when delivery is updated
                  window.location.reload()
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

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