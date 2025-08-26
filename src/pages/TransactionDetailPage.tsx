"use client"
import { useParams, Link, useNavigate } from "react-router-dom"
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
import { DeliveryManagement } from "@/components/DeliveryManagement"
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
  const { toast } = useToast()
  const { settings: companyInfo } = useCompanySettings()
  const navigate = useNavigate()
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
    
    // Invoice header
    doc.setFontSize(22).setFont("helvetica", "bold").setTextColor(150).text("INVOICE", pageWidth - margin, 32, { align: 'right' });
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

    const filename = `Invoice-${transaction.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
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
          <title>Cetak Thermal Receipt</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 9pt;
              margin: 0;
              padding: 2mm;
              width: 78mm;
              background: #fff;
              line-height: 1.2;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            td, th {
              padding: 1px 2px;
              font-size: 8pt;
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
            @page {
              size: 80mm auto;
              margin: 2mm;
            }
            @media print {
              body {
                width: 76mm;
                font-size: 8pt;
              }
              .max-h-6 {
                max-height: 10mm;
              }
              .max-w-12 {
                max-width: 18mm;
              }
            }
          </style>
        </head>
        <body>
          ${receiptContent}
        </body>
      </html>
    `);
    printWindow?.document.close();
    printWindow?.focus();
    printWindow?.print();
  };

  // Cetak Dot Matrix - khusus untuk LX-310 tanpa logo
  const handleDotMatrixPrint = () => {
    if (!transaction) return;
    
    // Version khusus LX-310 - tanpa logo, nama perusahaan diperbesar
    const invoiceContent = `
      <div class="p-8 bg-white text-black">
        <header class="flex justify-between items-center mb-4 pb-2 border-b-2 border-gray-200">
          <div class="ml-2">
            <div class="company-logo-text-compact">
              <h1 class="text-2xl font-bold text-gray-800 mb-1 tracking-wide">${companyInfo?.name}</h1>
              <div class="company-tagline text-sm font-semibold text-gray-600 mb-1">━━━ PROFESSIONAL SERVICES ━━━</div>
            </div>
            <div class="ml-1">
              <p class="text-sm text-gray-500 leading-tight">${companyInfo?.address}</p>
              <p class="text-sm text-gray-500 leading-tight">${companyInfo?.phone}</p>
            </div>
          </div>
          <div class="text-right">
            <h2 class="text-4xl font-bold uppercase text-gray-300">INVOICE</h2>
            <p class="text-lg text-gray-600"><strong class="text-gray-800">No:</strong> ${transaction.id}</p>
            <p class="text-lg text-gray-600"><strong class="text-gray-800">Tanggal:</strong> ${transaction.orderDate ? format(new Date(transaction.orderDate), "d MMMM yyyy", { locale: id }) : 'N/A'}</p>
          </div>
        </header>
        <div class="mb-4">
          <h3 class="text-base font-semibold text-gray-500 mb-1">DITAGIHKAN KEPADA:</h3>
          <p class="text-xl font-bold text-gray-800">${transaction.customerName}</p>
        </div>
        <table class="w-full border-collapse border border-gray-200">
          <thead>
            <tr class="bg-gray-100">
              <th class="text-gray-600 font-bold border border-gray-200 p-3 text-left text-base">Deskripsi</th>
              <th class="text-gray-600 font-bold border border-gray-200 p-3 text-center text-base">Jumlah</th>
              <th class="text-gray-600 font-bold border border-gray-200 p-3 text-right text-base">Harga Satuan</th>
              <th class="text-gray-600 font-bold border border-gray-200 p-3 text-right text-base">Total</th>
            </tr>
          </thead>
          <tbody>
            ${transaction.items.map(item => `
              <tr>
                <td class="border border-gray-200 p-3 font-medium text-gray-800 text-base">${item.product.name}</td>
                <td class="border border-gray-200 p-3 text-center text-gray-600 text-base">${item.quantity}</td>
                <td class="border border-gray-200 p-3 text-right text-gray-600 text-base">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price)}</td>
                <td class="border border-gray-200 p-3 text-right font-medium text-gray-800 text-base">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(item.price * item.quantity)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="flex justify-end mt-6">
          <div class="w-full max-w-sm text-gray-700 space-y-3">
            <div class="flex justify-between text-lg"><span>Subtotal:</span><span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.subtotal)}</span></div>
            ${transaction.ppnEnabled ? `
              <div class="flex justify-between text-lg"><span>PPN (${transaction.ppnPercentage}%):</span><span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.ppnAmount)}</span></div>
            ` : ''}
            <div class="flex justify-between font-bold text-xl border-t-2 border-gray-200 pt-3 text-gray-900"><span>TOTAL:</span><span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.total)}</span></div>
            <div class="border-t-2 border-gray-200 pt-3 space-y-3">
              <div class="flex justify-between font-medium text-lg">
                <span>Status Pembayaran:</span>
                <span class="${getPaymentStatusText(transaction.paidAmount || 0, transaction.total) === 'Lunas' ? 'text-green-600 font-semibold' : 'text-orange-600 font-semibold'}">${getPaymentStatusText(transaction.paidAmount || 0, transaction.total)}</span>
              </div>
              <div class="flex justify-between text-lg">
                <span>Jumlah Dibayar:</span>
                <span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.paidAmount || 0)}</span>
              </div>
              ${transaction.total > (transaction.paidAmount || 0) ? `
                <div class="flex justify-between font-medium text-red-600 text-lg">
                  <span>Sisa Tagihan:</span>
                  <span>${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(transaction.total - (transaction.paidAmount || 0))}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        <footer class="text-center text-xs text-gray-400 mt-16 pt-4 border-t border-gray-200">
          <div class="flex flex-col items-center gap-2">
            <span class="font-bold text-gray-700">Hormat Kami</span>
            <span class="font-semibold text-gray-800">${transaction.cashierName}</span>
          </div>
          <p class="mt-4">Terima kasih atas kepercayaan Anda.</p>
        </footer>
      </div>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.left = '-9999px';
    iframe.style.top = '-9999px';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak Dot Matrix</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 12pt; margin: 0; padding: 10mm; width: 9.5in; background: #fff; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 3px; font-size: 11pt; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .border-y { border-top: 1px dashed; border-bottom: 1px dashed; }
            .border-b { border-bottom: 1px dashed; }
            .border-t { border-top: 1px dashed; }
            .border-t-2 { border-top: 2px solid; }
            .border-b-2 { border-bottom: 2px solid; }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .items-start { align-items: flex-start; }
            .justify-between { justify-content: space-between; }
            .gap-4 { gap: 8px; }
            .gap-6 { gap: 12px; }
            .ml-2 { margin-left: 4px; }
            .ml-4 { margin-left: 8px; }
            .mb-1 { margin-bottom: 2px; }
            .mb-4 { margin-bottom: 8px; }
            .mb-8 { margin-bottom: 16px; }
            .mt-8 { margin-top: 16px; }
            .mt-16 { margin-top: 32px; }
            .pt-2 { padding-top: 4px; }
            .pt-4 { padding-top: 8px; }
            .pb-2 { padding-bottom: 4px; }
            .pb-4 { padding-bottom: 8px; }
            .p-2 { padding: 4px; }
            .text-xs { font-size: 9pt; }
            .text-sm { font-size: 10pt; }
            .text-base { font-size: 12pt; }
            .text-lg { font-size: 14pt; }
            .text-2xl { font-size: 16pt; }
            .text-3xl { font-size: 20pt; }
            .text-4xl { font-size: 24pt; }
            .text-5xl { font-size: 30pt; }
            .text-xl { font-size: 16pt; }
            .leading-tight { line-height: 1.1; }
            .tracking-wide { letter-spacing: 0.025em; }
            .company-logo-text {
              border: 2px solid #374151;
              padding: 8px 12px;
              background-color: #f9fafb;
              border-radius: 4px;
            }
            .company-logo-text-compact {
              border: 2px solid #374151;
              padding: 6px 8px;
              background-color: #f9fafb;
              border-radius: 4px;
            }
            .company-tagline {
              text-align: center;
              font-family: 'Courier New', Courier, monospace;
            }
            .text-gray-300 { color: #d1d5db; }
            .text-gray-400 { color: #9ca3af; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-600 { color: #4b5563; }
            .text-gray-700 { color: #374151; }
            .text-gray-800 { color: #1f2937; }
            .text-gray-900 { color: #111827; }
            .text-green-600 { color: #059669; }
            .text-orange-600 { color: #ea580c; }
            .text-red-600 { color: #dc2626; }
            .bg-gray-100 { background-color: #f3f4f6; }
            .border-gray-200 { border-color: #e5e7eb; }
            .uppercase { text-transform: uppercase; }
            .w-full { width: 100%; }
            .max-w-xs { max-width: 200px; }
            .space-y-2 > * + * { margin-top: 4px; }
            .flex-col { flex-direction: column; }
            .border { border: 1px solid; }
            .border-b-2 { border-bottom: 2px solid; }
            .border-collapse { border-collapse: collapse; }
            .border-radius { border-radius: 4px; }
            .bg-gray-50 { background-color: #f9fafb; }
            @page { size: 9.5in 11in; margin: 10mm; }
            @media print {
              body { width: 9.5in; height: 11in; font-size: 11pt; }
              .company-logo-text {
                border: 2px solid #000 !important;
                background-color: #fff !important;
                print-color-adjust: exact;
              }
              td, th { font-size: 10pt; }
            }
          </style>
        </head>
        <body>
          ${invoiceContent}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
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
            onClick={handleThermalPrint}
          >
            <Printer className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  )
}