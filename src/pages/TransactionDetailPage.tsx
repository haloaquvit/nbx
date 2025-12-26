"use client"
import { useParams, Link, useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Printer, FileDown, Calendar, User, Package, CreditCard, Truck, FileText, MapPin, Phone } from "lucide-react"
import { useTransactions } from "@/hooks/useTransactions"
import { useTransactionDeliveryInfo } from "@/hooks/useDeliveries"
import { useCustomers } from "@/hooks/useCustomers"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { DeliveryManagement } from "@/components/DeliveryManagement"
import { DeliveryCompletionDialog } from "@/components/DeliveryCompletionDialog"
import { Delivery } from "@/types/delivery"
import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useToast } from "@/components/ui/use-toast"
import { useCompanySettings } from "@/hooks/useCompanySettings"

export default function TransactionDetailPage() {
  const { id: transactionId } = useParams<{ id: string }>()
  const { transactions, isLoading } = useTransactions()
  const { data: deliveryInfo, isLoading: isLoadingDelivery } = useTransactionDeliveryInfo(transactionId || '')
  const { customers } = useCustomers()
  const { toast } = useToast()
  const { settings: companyInfo } = useCompanySettings()
  const navigate = useNavigate()
  const [showDeliveryForm, setShowDeliveryForm] = useState(false)
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false)
  const [completedDelivery, setCompletedDelivery] = useState<Delivery | null>(null)
  const [completedTransaction, setCompletedTransaction] = useState<any>(null)

  // Handle delivery completion
  const handleDeliveryCompleted = (delivery: Delivery, transaction: any) => {
    setCompletedDelivery(delivery)
    setCompletedTransaction(transaction)
    setCompletionDialogOpen(true)
    setShowDeliveryForm(false) // Close the form dialog
  }

  const transaction = transactions?.find(t => t.id === transactionId)
  const customer = customers?.find(c => c.id === transaction?.customerId)

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
    if (paidAmount === 0) return 'Kredit';
    if (paidAmount >= total) return 'Tunai';
    return 'Kredit';
  }

  // Generate PDF Invoice - langsung tanpa dialog
  const handleGenerateInvoicePdf = () => {
    if (!transaction) return;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;

    // Currency formatting function
    const formatCurrency = (amount: number): string => {
      return new Intl.NumberFormat("id-ID", { 
        style: "currency", 
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    // Add logo with better proportions
    const logoWidth = 25;
    const logoHeight = 20;
    if (companyInfo?.logo) {
      try {
        doc.addImage(companyInfo.logo, 'PNG', margin, 12, logoWidth, logoHeight, undefined, 'FAST');
      } catch (e) { console.error(e); }
    }
    
    // Company info
    doc.setFontSize(18).setFont("helvetica", "bold").text(companyInfo?.name || '', margin, 32);
    doc.setFontSize(10).setFont("helvetica", "normal").text(companyInfo?.address || '', margin, 38).text(companyInfo?.phone || '', margin, 43);
    doc.setDrawColor(200).line(margin, 48, pageWidth - margin, 48);
    
    // Faktur Penjualan header
    doc.setFontSize(18).setFont("helvetica", "bold").setTextColor(150).text("FAKTUR PENJUALAN", pageWidth - margin, 32, { align: 'right' });
    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : new Date();
    doc.setFontSize(11).setTextColor(0).text(`No: ${transaction.id}`, pageWidth - margin, 38, { align: 'right' }).text(`Tanggal: ${format(orderDate, "d MMMM yyyy", { locale: id })}`, pageWidth - margin, 43, { align: 'right' });
    
    // Customer info
    let y = 55;
    doc.setFontSize(10).setTextColor(100).text("DITAGIHKAN KEPADA:", margin, y);
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(0).text(transaction.customerName, margin, y + 6);
    y += 16;
    
    // Items table
    const tableData = transaction.items.map(item => [item.product.name, item.quantity, formatCurrency(item.price), formatCurrency(item.price * item.quantity)]);
    autoTable(doc, {
      startY: y,
      head: [['Deskripsi', 'Jumlah', 'Harga Satuan', 'Total']],
      body: tableData,
      theme: 'plain',
      headStyles: { fillColor: [240, 240, 240], textColor: [50, 50, 50], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 10 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didDrawPage: (data) => { doc.setFontSize(8).setTextColor(150).text(`Halaman ${data.pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' }); }
    });
    
    // Summary
    const finalY = (doc as any).lastAutoTable.finalY;
    let summaryY = finalY + 10;
    doc.setFontSize(10).setFont("helvetica", "normal").text("Subtotal:", 140, summaryY);
    doc.text(formatCurrency(transaction.subtotal), pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 5;
    
    if (transaction.ppnEnabled) {
      doc.text(`PPN (${transaction.ppnPercentage}%):`, 140, summaryY);
      doc.text(formatCurrency(transaction.ppnAmount), pageWidth - margin, summaryY, { align: 'right' });
      summaryY += 5;
    }
    
    doc.setDrawColor(200).line(140, summaryY, pageWidth - margin, summaryY);
    summaryY += 7;
    doc.setFontSize(12).setFont("helvetica", "bold").text("TOTAL:", 140, summaryY);
    doc.text(formatCurrency(transaction.total), pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 10;
    
    // Payment Information
    doc.setDrawColor(200).line(140, summaryY, pageWidth - margin, summaryY);
    summaryY += 7;
    doc.setFontSize(10).setFont("helvetica", "normal").text("Status Pembayaran:", 140, summaryY);
    doc.text(getPaymentStatusText(transaction.paidAmount || 0, transaction.total), pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 5;
    doc.text("Jumlah Dibayar:", 140, summaryY);
    doc.text(formatCurrency(transaction.paidAmount || 0), pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 5;
    
    if (transaction.total > (transaction.paidAmount || 0)) {
      doc.text("Sisa Tagihan:", 140, summaryY);
      doc.text(formatCurrency(transaction.total - (transaction.paidAmount || 0)), pageWidth - margin, summaryY, { align: 'right' });
      summaryY += 5;
    }
    
    // Signature
    let signatureY = summaryY + 15;
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text("Hormat Kami", margin, signatureY);
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text((transaction.cashierName || ""), margin, signatureY + 8);
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text("Terima kasih atas kepercayaan Anda.", margin, signatureY + 20);

    const filename = `Faktur_Penjualan-${transaction.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
    doc.save(filename);
  };

  // Cetak Thermal - langsung print tanpa dialog
  const handleThermalPrint = () => {
    if (!transaction) return;
    
    // Buat preview content thermal receipt
    const receiptContent = `
      <div class="font-mono w-full max-w-sm mx-auto">
        <header class="text-center mb-2">
          ${companyInfo?.logo ? `<img src="${companyInfo.logo}" alt="Logo" class="mx-auto max-h-6 max-w-12 mb-1 object-contain" />` : ''}
          <h1 class="text-sm font-bold break-words">${companyInfo?.name || 'Nota Transaksi'}</h1>
          <p class="text-xs break-words">${companyInfo?.address || ''}</p>
          <p class="text-xs break-words">${companyInfo?.phone || ''}</p>
        </header>
        <div class="text-xs space-y-0.5 my-2 border-y border-dashed border-black py-1">
          <div class="flex justify-between"><span>No:</span> <strong>${transaction.id}</strong></div>
          <div class="flex justify-between"><span>Tgl:</span> <span>${transaction.orderDate ? format(new Date(transaction.orderDate), "dd/MM/yy HH:mm", { locale: id }) : 'N/A'}</span></div>
          <div class="flex justify-between"><span>Plgn:</span> <span>${transaction.customerName}</span></div>
          <div class="flex justify-between"><span>Kasir:</span> <span>${transaction.cashierName}</span></div>
        </div>
        <div class="w-full text-xs overflow-x-auto">
          <table class="w-full min-w-full">
            <thead>
              <tr class="border-b border-dashed border-black">
                <th class="text-left font-normal pb-1 pr-2">Item</th>
                <th class="text-right font-normal pb-1">Total</th>
              </tr>
            </thead>
            <tbody>
              ${transaction.items.map(item => `
                <tr>
                  <td class="pt-1 align-top pr-2">
                    <div class="break-words">${item.product.name}</div>
                    <div class="whitespace-nowrap">${item.quantity}x @${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}</div>
                  </td>
                  <td class="pt-1 text-right align-top whitespace-nowrap">${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price * item.quantity)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="mt-2 pt-1 border-t border-dashed border-black text-xs space-y-1">
          <div class="flex justify-between">
            <span>Subtotal:</span>
            <span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.subtotal)}</span>
          </div>
          ${transaction.ppnEnabled ? `
            <div class="flex justify-between">
              <span>PPN (${transaction.ppnPercentage}%):</span>
              <span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.ppnAmount)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between font-semibold border-t border-dashed border-black pt-1">
            <span>Total:</span>
            <span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.total)}</span>
          </div>
          <div class="border-t border-dashed border-black pt-1 space-y-1">
            <div class="flex justify-between items-center">
              <span>Status:</span>
              <span class="text-right break-words ${getPaymentStatusText(transaction.paidAmount || 0, transaction.total) === 'Lunas' ? 'font-semibold' : ''}">${getPaymentStatusText(transaction.paidAmount || 0, transaction.total)}</span>
            </div>
            <div class="flex justify-between items-center">
              <span>Jumlah Bayar:</span>
              <span class="text-right whitespace-nowrap">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.paidAmount || 0)}</span>
            </div>
            ${transaction.total > (transaction.paidAmount || 0) ? `
              <div class="flex justify-between items-center">
                <span>Sisa Tagihan:</span>
                <span class="text-right whitespace-nowrap">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.total - (transaction.paidAmount || 0))}</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="text-center mt-3 text-xs">
          Terima kasih!
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow?.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Nota Thermal</title>
          <meta charset="UTF-8">
          <style>
            /* Reset dan setup untuk thermal printer */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            /* Setup halaman untuk thermal 80mm */
            @page {
              size: 80mm auto;
              margin: 0;
            }

            @media print {
              body {
                width: 80mm;
                margin: 0 auto;
              }
            }

            /* Font optimal untuk thermal printer */
            body {
              font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
              font-size: 9pt;
              line-height: 1.3;
              margin: 0;
              padding: 3mm 2mm;
              width: 80mm;
              background: white;
              color: black;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              margin: 2px 0;
            }

            td, th {
              padding: 1px 2px;
              font-size: 8pt;
              vertical-align: top;
            }

            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }
            .font-normal { font-weight: normal; }
            .border-y {
              border-top: 1px dashed black;
              border-bottom: 1px dashed black;
            }
            .border-b {
              border-bottom: 1px dashed black;
            }
            .border-t {
              border-top: 1px dashed black;
            }
            .py-1 {
              padding-top: 2px;
              padding-bottom: 2px;
            }
            .pt-1 {
              padding-top: 2px;
            }
            .pb-1 {
              padding-bottom: 2px;
            }
            .pr-2 {
              padding-right: 4px;
            }
            .mb-1 {
              margin-bottom: 2px;
            }
            .mb-2 {
              margin-bottom: 4px;
            }
            .mt-2 {
              margin-top: 4px;
            }
            .mt-3 {
              margin-top: 6px;
            }
            .my-2 {
              margin-top: 4px;
              margin-bottom: 4px;
            }
            .mx-auto {
              margin-left: auto;
              margin-right: auto;
            }
            .max-h-6 {
              max-height: 12mm;
            }
            .max-w-12 {
              max-width: 20mm;
            }
            .object-contain {
              object-fit: contain;
              display: block;
            }
            .flex {
              display: flex;
            }
            .justify-between {
              justify-content: space-between;
            }
            .space-y-0\\.5 > * + * {
              margin-top: 1px;
            }
            .space-y-1 > * + * {
              margin-top: 2px;
            }
            .break-words {
              word-break: break-word;
              hyphens: auto;
            }
            .whitespace-nowrap {
              white-space: nowrap;
            }
            .align-top {
              vertical-align: top;
            }
            .w-full {
              width: 100%;
            }
            .min-w-full {
              min-width: 100%;
            }
            .overflow-x-auto {
              overflow-x: auto;
            }
            header h1 {
              font-size: 10pt;
              margin: 1px 0;
              font-weight: bold;
            }
            header p {
              font-size: 8pt;
              margin: 1px 0;
            }

            /* Prevent page breaks */
            table, .flex, .border-y, .border-t {
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body onload="window.print(); window.onafterprint = function(){ window.close(); }">
          ${receiptContent}
        </body>
      </html>
    `);
    printWindow?.document.close();
    printWindow?.focus();
    printWindow?.print();
  };

  // Cetak Dot Matrix - optimal untuk continuous form
  const handleDotMatrixPrint = () => {
    if (!transaction) return;
    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;

    const dotMatrixContent = `
      <div style="width: 100%; max-width: 241mm;">
        <!-- Header Section -->
        <table style="width: 100%; border-bottom: 0.5px solid #000; margin-bottom: 4mm; padding-bottom: 2mm;">
          <tr>
            <td style="width: 60%; vertical-align: top; padding-right: 10mm;">
              <div style="font-size: 15.5pt; font-weight: bold; margin-bottom: 2mm;">${companyInfo?.name || 'NAMA PERUSAHAAN'}</div>
              <div style="font-size: 10.5pt; line-height: 1.5;">
                ${companyInfo?.address || ''}<br/>
                ${companyInfo?.phone ? `Telp: ${companyInfo.phone}` : ''}${companyInfo?.email ? ` | Email: ${companyInfo.email}` : ''}
              </div>
            </td>
            <td style="width: 40%; vertical-align: top; text-align: right;">
              <div style="font-size: 17.5pt; font-weight: bold; letter-spacing: 1px;">FAKTUR PENJUALAN</div>
              <div style="font-size: 10.5pt; margin-top: 2mm; line-height: 1.5;">
                <strong>No:</strong> ${transaction.id}<br/>
                <strong>Tanggal:</strong> ${orderDate ? format(orderDate, "dd MMMM yyyy", { locale: id }) : 'N/A'}
              </div>
            </td>
          </tr>
        </table>

        <!-- Customer Info -->
        <table style="width: 100%; margin-bottom: 4mm;">
          <tr>
            <td style="width: 50%; vertical-align: top;">
              <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 1mm;">KEPADA:</div>
              <div style="font-size: 11.5pt; font-weight: bold;">${transaction.customerName}</div>
              <div style="font-size: 10.5pt;">Pelanggan</div>
            </td>
            <td style="width: 50%; vertical-align: top; text-align: right;">
              <div style="font-size: 10.5pt;"><strong>Kasir:</strong> ${transaction.cashierName}</div>
              ${transaction.dueDate ? `<div style="font-size: 10.5pt;"><strong>Jatuh Tempo:</strong> ${format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: id })}</div>` : ''}
            </td>
          </tr>
        </table>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 4mm;">
          <thead>
            <tr style="border-top: 0.5px solid #000; border-bottom: 0.5px solid #000;">
              <th style="text-align: left; padding: 2mm 1mm; font-size: 10.5pt; width: 50%;">DESKRIPSI</th>
              <th style="text-align: center; padding: 2mm 1mm; font-size: 10.5pt; width: 10%;">QTY</th>
              <th style="text-align: right; padding: 2mm 1mm; font-size: 10.5pt; width: 20%;">HARGA</th>
              <th style="text-align: right; padding: 2mm 1mm; font-size: 10.5pt; width: 20%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${transaction.items.map((item, idx) => `
              <tr>
                <td style="padding: 1.5mm 1mm; font-size: 10.5pt; border-bottom: 0.5px dotted #999;">${item.product.name}${item.notes ? `<br/><small style="font-size: 9.5pt;">${item.notes}</small>` : ''}</td>
                <td style="text-align: center; padding: 1.5mm 1mm; font-size: 10.5pt; border-bottom: 0.5px dotted #999;">${item.quantity} ${item.unit}</td>
                <td style="text-align: right; padding: 1.5mm 1mm; font-size: 10.5pt; border-bottom: 0.5px dotted #999;">${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(item.price)}</td>
                <td style="text-align: right; padding: 1.5mm 1mm; font-size: 10.5pt; font-weight: bold; border-bottom: 0.5px dotted #999;">${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0 }).format(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Summary Section -->
        <table style="width: 100%; border-top: 0.5px solid #000; padding-top: 3mm;">
          <tr>
            <td style="width: 60%; vertical-align: top; padding-right: 10mm;">
              <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 2mm;">CATATAN PEMBAYARAN:</div>
              <div style="font-size: 9.5pt; line-height: 1.5;">
                • Pembayaran dapat dilakukan melalui transfer bank<br/>
                • Harap sertakan nomor faktur penjualan saat melakukan pembayaran<br/>
                • Konfirmasi pembayaran ke nomor di atas
              </div>
            </td>
            <td style="width: 40%; vertical-align: top;">
              <table style="width: 100%; font-size: 10.5pt;">
                <tr>
                  <td style="padding: 1mm 2mm; text-align: left;">Subtotal:</td>
                  <td style="padding: 1mm 2mm; text-align: right; font-weight: bold;">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.subtotal)}</td>
                </tr>
                ${transaction.ppnEnabled ? `
                <tr>
                  <td style="padding: 1mm 2mm; text-align: left;">PPN (${transaction.ppnPercentage}%):</td>
                  <td style="padding: 1mm 2mm; text-align: right; font-weight: bold;">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.ppnAmount)}</td>
                </tr>
                ` : ''}
                <tr style="border-top: 0.5px solid #000; border-bottom: 0.5px solid #000;">
                  <td style="padding: 2mm; text-align: left; font-size: 12.5pt; font-weight: bold;">TOTAL:</td>
                  <td style="padding: 2mm; text-align: right; font-size: 12.5pt; font-weight: bold;">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <div style="margin-top: 10mm; border-top: 0.5px solid #ccc; padding-top: 3mm;">
          <table style="width: 100%;">
            <tr>
              <td style="width: 50%; text-align: center; vertical-align: bottom;">
                <div style="font-size: 10.5pt; margin-bottom: 15mm;">Hormat Kami,</div>
                <div style="border-top: 0.5px solid #000; display: inline-block; padding-top: 1mm; min-width: 50mm;">
                  <strong style="font-size: 10.5pt;">${transaction.cashierName}</strong>
                </div>
              </td>
              <td style="width: 50%; text-align: center; font-size: 9.5pt; vertical-align: bottom;">
                Dicetak: ${format(new Date(), "dd MMMM yyyy, HH:mm", { locale: id })} WIB
              </td>
            </tr>
          </table>
        </div>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    printWindow?.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Dot Matrix - Faktur Penjualan ${transaction.id}</title>
          <meta charset="UTF-8">
          <style>
            /* Reset */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            /* Page setup untuk continuous form 9.5 inch */
            @page {
              size: 241mm auto;  /* 9.5 inch width, auto height */
              margin: 8mm 6mm;
            }

            @media print {
              body {
                width: 241mm;
                margin: 0 auto;
              }
              /* Force black text for dot matrix */
              * {
                color: #000 !important;
                background: transparent !important;
              }
            }

            /* Font optimal untuk dot matrix */
            body {
              font-family: 'Courier New', 'Courier', monospace;
              font-size: 10pt;
              line-height: 1.4;
              margin: 0;
              padding: 8mm 6mm;
              width: 241mm;
              background: white;
              color: black;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            /* Typography */
            strong, b {
              font-weight: bold;
            }

            /* Table optimization */
            table {
              width: 100%;
              border-collapse: collapse;
            }

            td, th {
              vertical-align: top;
            }

            /* Prevent page breaks */
            table, tr, td, th {
              page-break-inside: avoid;
            }

            /* Line heights untuk efisiensi */
            small {
              font-size: 8pt;
              line-height: 1.2;
            }
          </style>
        </head>
        <body onload="window.print(); window.onafterprint = function(){ window.close(); }">
          ${dotMatrixContent}
        </body>
      </html>
    `);
    printWindow?.document.close();
  };

  // Fungsi cetak Rawbt Thermal 80mm
  const handleRawbtPrint = () => {
    if (!transaction) return;

    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;
    
    const formatCurrency = (amount: number): string => {
      if (amount === null || amount === undefined || isNaN(amount)) {
        return "Rp 0";
      }
      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      let result = new Intl.NumberFormat("id-ID", { 
        style: "currency", 
        currency: "IDR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numAmount);
      result = result.replace(/\u00A0/g, ' ');
      return result;
    };

    const formatNumber = (amount: number): string => {
      if (amount === null || amount === undefined || isNaN(amount)) {
        return "0";
      }
      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      let result = new Intl.NumberFormat("id-ID", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numAmount);
      result = result.replace(/\u00A0/g, ' ');
      return result;
    };
    
    let receiptText = '';
    receiptText += '\x1B\x40';
    receiptText += '\x1B\x61\x01';
    receiptText += (companyInfo?.name || 'Nota Transaksi') + '\n';
    if (companyInfo?.address) {
      receiptText += companyInfo.address + '\n';
    }
    if (companyInfo?.phone) {
      receiptText += companyInfo.phone + '\n';
    }
    receiptText += '\x1B\x61\x00';
    receiptText += '--------------------------------\n';
    receiptText += `No: ${transaction.id}\n`;
    receiptText += `Tgl: ${orderDate ? format(orderDate, "dd/MM/yy HH:mm", { locale: id }) : 'N/A'}\n`;
    receiptText += `Plgn: ${transaction.customerName}\n`;
    receiptText += `Kasir: ${transaction.cashierName}\n`;
    receiptText += '--------------------------------\n';
    receiptText += 'Item                        Total\n';
    receiptText += '--------------------------------\n';
    
    transaction.items.forEach((item) => {
      receiptText += item.product.name + '\n';
      const qtyPrice = `${item.quantity}x @${formatNumber(item.price)}`;
      const itemTotal = formatNumber(item.price * item.quantity);
      const spacing = 32 - qtyPrice.length - itemTotal.length;
      receiptText += qtyPrice + ' '.repeat(Math.max(0, spacing)) + itemTotal + '\n';
    });
    
    receiptText += '--------------------------------\n';
    const subtotalText = 'Subtotal:';
    const subtotalAmount = formatCurrency(transaction.subtotal);
    const subtotalSpacing = 32 - subtotalText.length - subtotalAmount.length;
    receiptText += subtotalText + ' '.repeat(Math.max(0, subtotalSpacing)) + subtotalAmount + '\n';
    
    if (transaction.ppnEnabled) {
      const ppnText = `PPN (${transaction.ppnPercentage}%):`;
      const ppnAmount = formatCurrency(transaction.ppnAmount);
      const ppnSpacing = 32 - ppnText.length - ppnAmount.length;
      receiptText += ppnText + ' '.repeat(Math.max(0, ppnSpacing)) + ppnAmount + '\n';
    }
    
    receiptText += '--------------------------------\n';
    const totalText = 'Total:';
    const totalAmount = formatCurrency(transaction.total);
    const totalSpacing = 32 - totalText.length - totalAmount.length;
    
    receiptText += '\x1B\x45\x01';
    receiptText += totalText + ' '.repeat(Math.max(0, totalSpacing)) + totalAmount + '\n';
    receiptText += '\x1B\x45\x00';
    receiptText += '--------------------------------\n';
    
    const statusText = 'Status:';
    const statusValue = getPaymentStatusText(transaction.paidAmount || 0, transaction.total);
    const statusSpacing = 32 - statusText.length - statusValue.length;
    receiptText += statusText + ' '.repeat(Math.max(0, statusSpacing)) + statusValue + '\n';
    
    const paidText = 'Jumlah Bayar:';
    const paidAmount = formatCurrency(transaction.paidAmount || 0);
    const paidSpacing = 32 - paidText.length - paidAmount.length;
    receiptText += paidText + ' '.repeat(Math.max(0, paidSpacing)) + paidAmount + '\n';
    
    if (transaction.total > (transaction.paidAmount || 0)) {
      const remainingText = 'Sisa Tagihan:';
      const remainingAmount = formatCurrency(transaction.total - (transaction.paidAmount || 0));
      const remainingSpacing = 32 - remainingText.length - remainingAmount.length;
      receiptText += remainingText + ' '.repeat(Math.max(0, remainingSpacing)) + remainingAmount + '\n';
    }
    
    receiptText += '\n';
    receiptText += '\x1B\x61\x01';
    receiptText += 'Terima kasih!\n';
    receiptText += '\x1B\x61\x00';
    receiptText += '\n\n\n';
    receiptText += '\x1D\x56\x41';

    const encodedText = encodeURIComponent(receiptText);
    const rawbtUrl = `rawbt:${encodedText}`;
    
    try {
      window.location.href = rawbtUrl;
    } catch (error) {
      console.error('Failed to open RawBT protocol:', error);
    }
    
    setTimeout(() => {
      navigate('/transactions');
    }, 500);
  };


  return (
    <div className="space-y-6">
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
          {/* Show delivery button if transaction has delivery info and not office sale */}
          {deliveryInfo && !transaction?.isOfficeSale && (
            <Button 
              variant="outline" 
              className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
              onClick={() => setShowDeliveryForm(true)}
            >
              <Truck className="mr-2 h-4 w-4" />
              Input Pengantaran
            </Button>
          )}
          <Button variant="outline" onClick={handleGenerateInvoicePdf}>
            <FileDown className="mr-2 h-4 w-4" />
            Simpan PDF
          </Button>
          <Button variant="outline" onClick={handleThermalPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Cetak Thermal
          </Button>
          <Button variant="outline" onClick={handleDotMatrixPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Cetak Dot Matrix
          </Button>
          <Button onClick={handleRawbtPrint}>
            <Printer className="mr-2 h-4 w-4" />
            Rawbt Thermal
          </Button>
        </div>
      </div>

      {/* Mobile Actions - Sticky at top */}
      <div className="md:hidden sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40 -mx-6 px-6 py-3">
        <div className="flex gap-2 overflow-x-auto">
          {/* Show delivery button if transaction has delivery info and not office sale */}
          {deliveryInfo && !transaction?.isOfficeSale && (
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
            className="flex-1 min-w-0"
            onClick={handleGenerateInvoicePdf}
          >
            <FileDown className="mr-1 h-3 w-3" />
            <span className="text-xs">PDF</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 min-w-0"
            onClick={handleThermalPrint}
          >
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Thermal</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 min-w-0"
            onClick={handleDotMatrixPrint}
          >
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Dot Matrix</span>
          </Button>
          <Button 
            size="sm" 
            className="flex-1 min-w-0"
            onClick={handleRawbtPrint}
          >
            <Printer className="mr-1 h-3 w-3" />
            <span className="text-xs">Rawbt</span>
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
                          <Link 
                            to={`/products/${item.product.id}`}
                            className="font-medium text-sm text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {item.product.name}
                          </Link>
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
                            <Link 
                              to={`/products/${item.product.id}`}
                              className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {item.product.name}
                            </Link>
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

          {/* Customer Address Card */}
          <Card>
            <CardHeader>
              <CardTitle>Alamat Pelanggan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{transaction.customerName}</p>
                </div>
              </div>

              {customer?.phone && (
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                  </div>
                </div>
              )}

              {(customer?.full_address || customer?.address) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {customer.full_address || customer.address}
                    </p>
                  </div>
                </div>
              )}

              {!customer && (
                <p className="text-sm text-muted-foreground italic">
                  Data pelanggan tidak ditemukan
                </p>
              )}
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
                onDeliveryCreated={handleDeliveryCompleted}
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
            onClick={handleThermalPrint}
          >
            <Printer className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Delivery Completion Dialog */}
      <DeliveryCompletionDialog
        open={completionDialogOpen}
        onOpenChange={setCompletionDialogOpen}
        delivery={completedDelivery}
        transaction={completedTransaction}
      />
    </div>
  )
}