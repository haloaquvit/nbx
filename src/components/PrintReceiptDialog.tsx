"use client"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Transaction } from "@/types/transaction"
import { format, isValid } from "date-fns"
import { id } from "date-fns/locale/id"

// Helper function to safely format date
function safeFormatDate(date: Date | string | null | undefined, formatStr: string): string {
  if (!date) return '-';
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (!isValid(dateObj)) return '-';
    return format(dateObj, formatStr, { locale: id });
  } catch {
    return '-';
  }
}
import { Printer, X, FileDown } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompanySettings, CompanyInfo } from "@/hooks/useCompanySettings"
import { saveCompressedPDF } from "@/utils/pdfUtils"

interface PrintReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction | null
  template: 'receipt' | 'invoice'
  onClose?: () => void // Callback when user clicks close after printing
}

const ReceiptTemplate = ({ transaction, companyInfo }: { transaction: Transaction, companyInfo?: CompanyInfo | null }) => {
  const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;
  return (
    <div className="font-mono">
      <header className="text-center mb-2">
        {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="mx-auto max-h-12 mb-1" />}
        <h1 className="text-sm font-bold">{companyInfo?.name || 'Nota Transaksi'}</h1>
        <p className="text-xs">{companyInfo?.address}</p>
        <p className="text-xs">{companyInfo?.phone}</p>
      </header>
      <div className="text-xs space-y-0.5 my-2 border-y border-dashed border-black py-1">
        <div className="flex justify-between"><span>No:</span> <strong>{transaction.id}</strong></div>
        <div className="flex justify-between"><span>Tgl:</span> <span>{safeFormatDate(orderDate, "dd/MM/yy HH:mm")}</span></div>
        <div className="flex justify-between"><span>Plgn:</span> <span>{transaction.customerName}</span></div>
        <div className="flex justify-between"><span>Kasir:</span> <span>{transaction.cashierName}</span></div>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="text-left font-normal pb-1">Item</th>
            <th className="text-right font-normal pb-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {transaction.items.map((item, index) => (
            <tr key={index}>
              <td className="pt-1 align-top">
                {item.product.name}<br />
                {`${item.quantity}x @${new Intl.NumberFormat("id-ID").format(item.price)}`}
              </td>
              <td className="pt-1 text-right align-top">{new Intl.NumberFormat("id-ID").format(item.price * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 pt-1 border-t border-dashed border-black text-xs space-y-1">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.subtotal)}</span>
        </div>
        {transaction.ppnEnabled && (
          <div className="flex justify-between">
            <span>PPN ({transaction.ppnPercentage}%):</span>
            <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.ppnAmount)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t border-dashed border-black pt-1">
          <span>Total:</span>
          <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.total)}</span>
        </div>
        {/* Info metode pembayaran dan jatuh tempo */}
        <div className="mt-1 pt-1 border-t border-dashed border-black space-y-0.5">
          <div className="flex justify-between">
            <span>Metode:</span>
            <span className="font-semibold">
              {transaction.paymentStatus === 'Lunas' ? 'Tunai' :
               transaction.paymentStatus === 'Kredit' ? 'Kredit' : 'Kredit'}
            </span>
          </div>
          {transaction.paymentStatus !== 'Lunas' && transaction.dueDate && (
            <div className="flex justify-between">
              <span>Jatuh Tempo:</span>
              <span className="font-semibold">{safeFormatDate(transaction.dueDate, "dd/MM/yyyy")}</span>
            </div>
          )}
          {transaction.paymentStatus !== 'Lunas' && (
            <div className="flex justify-between">
              <span>Sisa Bayar:</span>
              <span className="font-semibold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.total - transaction.paidAmount)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="text-center mt-3 text-xs">
        Terima kasih!
      </div>
    </div>
  )
};

const InvoiceTemplate = ({ transaction, companyInfo }: { transaction: Transaction, companyInfo?: CompanyInfo | null }) => {
  const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;
  return (
    <div className="p-12 bg-white text-black min-h-[297mm]" style={{ width: '210mm', fontFamily: 'Arial, sans-serif' }}>
      <header className="flex justify-between items-start mb-12 pb-6 border-b-2 border-blue-600">
        <div className="flex items-start gap-6">
          {companyInfo?.logo && (
            <img 
              src={companyInfo.logo} 
              alt="Company Logo" 
              className="max-h-24 w-auto object-contain" 
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-blue-900 mb-2">
              {companyInfo?.name || 'PT. COMPANY NAME'}
            </h1>
            <div className="text-sm text-gray-700 space-y-1">
              <p className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center">
                  📍
                </span>
                {companyInfo?.address || 'Company Address'}
              </p>
              <p className="flex items-center gap-2">
                <span className="w-4 h-4 bg-blue-100 rounded-full flex items-center justify-center">
                  📞
                </span>
                {companyInfo?.phone || 'Company Phone'}
              </p>
            </div>
          </div>
        </div>
        <div className="text-right bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
          <h2 className="text-5xl font-bold text-blue-800 mb-4">FAKTUR PENJUALAN</h2>
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">No Faktur Penjualan:</span><br/>
              <span className="text-lg font-mono font-bold text-blue-900">{transaction.id}</span>
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">Tanggal:</span><br/>
              <span className="font-medium">{safeFormatDate(orderDate, "d MMMM yyyy")}</span>
            </p>
          </div>
        </div>
      </header>
      <div className="mb-10">
        <div className="bg-gradient-to-r from-blue-50 to-transparent p-6 rounded-lg border-l-4 border-blue-600">
          <h3 className="text-sm font-semibold text-blue-800 mb-3 uppercase tracking-wide">Ditagihkan Kepada:</h3>
          <div className="space-y-1">
            <p className="text-2xl font-bold text-gray-900">{transaction.customerName}</p>
            <p className="text-sm text-gray-600">Pelanggan</p>
          </div>
        </div>
      </div>
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-blue-600 to-blue-700 hover:bg-gradient-to-r hover:from-blue-600 hover:to-blue-700">
                <TableHead className="text-white font-bold py-4 px-6 text-left">Deskripsi Produk</TableHead>
                <TableHead className="text-white font-bold py-4 px-4 text-center">Qty</TableHead>
                <TableHead className="text-white font-bold py-4 px-4 text-right">Harga Satuan</TableHead>
                <TableHead className="text-white font-bold py-4 px-6 text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaction.items.map((item, index) => (
                <TableRow key={index} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <TableCell className="font-semibold text-gray-900 py-4 px-6">{item.product.name}</TableCell>
                  <TableCell className="text-center text-gray-700 py-4 px-4 font-medium">{item.quantity}</TableCell>
                  <TableCell className="text-right text-gray-700 py-4 px-4">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.price)}
                  </TableCell>
                  <TableCell className="text-right font-bold text-gray-900 py-4 px-6">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(item.price * item.quantity)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex justify-end mt-10">
        <div className="w-full max-w-md">
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border border-gray-200">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-300">
                <span className="text-gray-700 font-medium">Subtotal:</span>
                <span className="font-semibold text-gray-900">
                  {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.subtotal)}
                </span>
              </div>
              {transaction.ppnEnabled && (
                <div className="flex justify-between items-center py-2 border-b border-gray-300">
                  <span className="text-gray-700 font-medium">PPN ({transaction.ppnPercentage}%):</span>
                  <span className="font-semibold text-gray-900">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.ppnAmount)}
                  </span>
                </div>
              )}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg p-4 mt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xl font-bold">TOTAL TAGIHAN:</span>
                  <span className="text-2xl font-bold">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total)}
                  </span>
                </div>
              </div>
              {transaction.paymentStatus !== 'Lunas' && transaction.dueDate && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-red-800 font-semibold">JATUH TEMPO:</span>
                    <span className="text-red-900 font-bold">
                      {safeFormatDate(transaction.dueDate, "d MMMM yyyy")}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className="mt-16 pt-8 border-t-2 border-gray-200">
        <div className="flex justify-between items-start mb-8">
          <div className="text-left">
            <h4 className="text-sm font-semibold text-gray-800 mb-4">Catatan Pembayaran:</h4>
            <div className="text-xs text-gray-600 space-y-1 max-w-md">
              <p>• Pembayaran dapat dilakukan melalui transfer bank</p>
              <p>• Harap sertakan nomor faktur penjualan saat melakukan pembayaran</p>
              <p>• Konfirmasi pembayaran ke nomor telepon di atas</p>
            </div>
          </div>
        </div>
        {/* Kolom Tanda Tangan */}
        <div className="grid grid-cols-3 gap-8 mt-8 mb-8">
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-16">Penerima,</p>
            <div className="border-t border-gray-400 pt-2 mx-4">
              <p className="text-sm text-gray-600">(.................................)</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-16">Pengirim,</p>
            <div className="border-t border-gray-400 pt-2 mx-4">
              <p className="text-sm text-gray-600">(.................................)</p>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700 mb-16">Hormat Kami,</p>
            <div className="border-t border-gray-400 pt-2 mx-4">
              <p className="text-sm font-semibold text-gray-800">{transaction.cashierName}</p>
            </div>
          </div>
        </div>
        <div className="text-center py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg">
          <p className="text-lg font-semibold mb-2">Terima kasih atas kepercayaan Anda!</p>
          <p className="text-xs opacity-75 mt-2">
            Dicetak pada: {format(new Date(), "d MMMM yyyy, HH:mm", { locale: id })} WIB
          </p>
        </div>
      </footer>
    </div>
  )
}

export function PrintReceiptDialog({ open, onOpenChange, transaction, template, onClose }: PrintReceiptDialogProps) {
  const { settings: companyInfo } = useCompanySettings();

  // Handle close button click
  const handleClose = () => {
    onOpenChange(false);
    if (onClose) {
      onClose();
    }
  };

  const generateInvoicePdf = () => {
    if (!transaction) return;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const margin = 20;

    // Modern header with blue accent
    doc.setFillColor(59, 130, 246); // Blue color
    doc.rect(0, 0, pageWidth, 50, 'F');
    
    // Company logo and info
    const logoWidth = 35;
    const logoHeight = 14;
    if (companyInfo?.logo) {
      try {
        doc.addImage(companyInfo.logo, 'PNG', margin, 15, logoWidth, logoHeight, undefined, 'FAST');
      } catch (e) { console.error(e); }
    }
    
    // Company name in white
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20).setFont("helvetica", "bold").text(companyInfo?.name || 'PT. COMPANY NAME', margin + logoWidth + 10, 25);
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text(companyInfo?.address || 'Company Address', margin + logoWidth + 10, 32);
    doc.text(companyInfo?.phone || 'Company Phone', margin + logoWidth + 10, 37);
    
    // Faktur Penjualan title and info in white
    doc.setFontSize(24).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("FAKTUR PENJUALAN", pageWidth - margin, 25, { align: 'right' });
    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : new Date();
    doc.setFontSize(11).setTextColor(255, 255, 255);
    doc.text(`No: ${transaction.id}`, pageWidth - margin, 33, { align: 'right' });
    doc.text(`Tanggal: ${safeFormatDate(orderDate, "d MMMM yyyy")}`, pageWidth - margin, 39, { align: 'right' });
    // Customer info section with background
    let y = 65;
    doc.setTextColor(0, 0, 0);
    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 3, 3, 'F');
    
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(59, 130, 246);
    doc.text("DITAGIHKAN KEPADA:", margin + 5, y + 8);
    doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text(transaction.customerName, margin + 5, y + 16);
    y += 35;
    const tableData = transaction.items.map(item => [item.product.name, item.quantity, new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price), new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price * item.quantity)]);
    // Professional table with better styling
    autoTable(doc, {
      startY: y,
      head: [['Deskripsi Produk', 'Qty', 'Harga Satuan', 'Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { 
        fillColor: [59, 130, 246], 
        textColor: [255, 255, 255], 
        fontStyle: 'bold', 
        fontSize: 11,
        halign: 'center'
      },
      bodyStyles: { 
        fontSize: 10,
        cellPadding: 6
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: { 
        0: { cellWidth: 70, halign: 'left' }, 
        1: { cellWidth: 25, halign: 'center' }, 
        2: { cellWidth: 40, halign: 'right' }, 
        3: { cellWidth: 45, halign: 'right', fontStyle: 'bold' } 
      },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => { 
        doc.setFontSize(8).setTextColor(150);
        doc.text(`Halaman ${data.pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }
    });
    // Modern summary section with background
    const finalY = (doc as any).lastAutoTable.finalY;
    let summaryY = finalY + 15;
    
    // Summary background
    const summaryWidth = 80;
    const summaryX = pageWidth - margin - summaryWidth;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(summaryX, summaryY - 5, summaryWidth, 35, 3, 3, 'F');
    
    doc.setFontSize(11).setFont("helvetica", "normal").setTextColor(0, 0, 0);
    doc.text("Subtotal:", summaryX + 5, summaryY + 3);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.subtotal), pageWidth - margin - 5, summaryY + 3, { align: 'right' });
    summaryY += 7;
    
    if (transaction.ppnEnabled) {
      doc.text(`PPN (${transaction.ppnPercentage}%):`, summaryX + 5, summaryY);
      doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.ppnAmount), pageWidth - margin - 5, summaryY, { align: 'right' });
      summaryY += 7;
    }
    
    // Total with blue background
    doc.setFillColor(59, 130, 246);
    doc.roundedRect(summaryX, summaryY, summaryWidth, 12, 3, 3, 'F');
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("TOTAL TAGIHAN:", summaryX + 5, summaryY + 8);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total), pageWidth - margin - 5, summaryY + 8, { align: 'right' });
    summaryY += 15;
    
    // Due date with red background if payment is not complete
    if (transaction.paymentStatus !== 'Lunas' && transaction.dueDate) {
      summaryY += 5;
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(summaryX, summaryY, summaryWidth, 10, 3, 3, 'F');
      doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(185, 28, 28);
      doc.text("JATUH TEMPO:", summaryX + 5, summaryY + 6);
      doc.text(safeFormatDate(transaction.dueDate, "d MMMM yyyy"), pageWidth - margin - 5, summaryY + 6, { align: 'right' });
      summaryY += 12;
      doc.setTextColor(0); // Reset color to black
    }
    
    // Professional footer with signature
    let footerY = summaryY + 25;

    // Payment notes
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(100, 100, 100);
    doc.text("Catatan Pembayaran:", margin, footerY);
    doc.text("• Pembayaran dapat dilakukan melalui transfer bank", margin, footerY + 5);
    doc.text("• Harap sertakan nomor faktur penjualan saat melakukan pembayaran", margin, footerY + 10);
    doc.text("• Konfirmasi pembayaran ke nomor telepon di atas", margin, footerY + 15);

    // Signature section - 3 columns
    const sigY = footerY + 30;
    const colWidth = (pageWidth - 2 * margin) / 3;

    // Column 1: Penerima
    doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(0, 0, 0);
    doc.text("Penerima,", margin + colWidth / 2, sigY, { align: 'center' });
    doc.line(margin + 10, sigY + 25, margin + colWidth - 10, sigY + 25);
    doc.setFontSize(9).setTextColor(100, 100, 100);
    doc.text("(..............................)", margin + colWidth / 2, sigY + 30, { align: 'center' });

    // Column 2: Pengirim
    doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(0, 0, 0);
    doc.text("Pengirim,", margin + colWidth + colWidth / 2, sigY, { align: 'center' });
    doc.line(margin + colWidth + 10, sigY + 25, margin + 2 * colWidth - 10, sigY + 25);
    doc.setFontSize(9).setTextColor(100, 100, 100);
    doc.text("(..............................)", margin + colWidth + colWidth / 2, sigY + 30, { align: 'center' });

    // Column 3: Hormat Kami
    doc.setFontSize(10).setFont("helvetica", "normal").setTextColor(0, 0, 0);
    doc.text("Hormat Kami,", margin + 2 * colWidth + colWidth / 2, sigY, { align: 'center' });
    doc.line(margin + 2 * colWidth + 10, sigY + 25, pageWidth - margin - 10, sigY + 25);
    doc.setFontSize(10).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text((transaction.cashierName || ""), margin + 2 * colWidth + colWidth / 2, sigY + 30, { align: 'center' });

    // Thank you footer
    const thankYouY = pageHeight - 30;
    doc.setFillColor(59, 130, 246);
    doc.rect(0, thankYouY - 5, pageWidth, 20, 'F');
    doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("Terima kasih atas kepercayaan Anda!", pageWidth / 2, thankYouY + 3, { align: 'center' });
    doc.setFontSize(8).setFont("helvetica", "normal");
    doc.text(`Dicetak pada: ${format(new Date(), "d MMMM yyyy, HH:mm", { locale: id })} WIB`, pageWidth / 2, thankYouY + 9, { align: 'center' });

    const filename = `Faktur_Penjualan-${transaction.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
    saveCompressedPDF(doc, filename, 100);
  };

  const handleThermalPrint = () => {
    const printWindow = window.open('', '_blank');
    const printableArea = document.getElementById('printable-area')?.innerHTML;
    printWindow?.document.write(`
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

            /* Typography untuk printer thermal */
            h1 {
              font-size: 12pt;
              font-weight: bold;
              margin-bottom: 2px;
            }

            p, div, span {
              font-size: 9pt;
            }

            strong {
              font-weight: bold;
            }

            /* Table styling */
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 2px 0;
            }

            td, th {
              padding: 1px 2px;
              text-align: left;
              vertical-align: top;
            }

            /* Utility classes */
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
            .font-bold { font-weight: bold !important; }
            .font-semibold { font-weight: 600 !important; }
            .font-mono { font-family: 'Courier New', monospace !important; }

            /* Borders - dashed untuk thermal */
            .border-y {
              border-top: 1px dashed black;
              border-bottom: 1px dashed black;
            }
            .border-t {
              border-top: 1px dashed black;
            }
            .border-b {
              border-bottom: 1px dashed black;
            }

            /* Spacing */
            .py-1 { padding-top: 2px; padding-bottom: 2px; }
            .pt-1 { padding-top: 2px; }
            .pb-1 { padding-bottom: 2px; }
            .mt-1 { margin-top: 2px; }
            .mt-2 { margin-top: 4px; }
            .mt-3 { margin-top: 6px; }
            .mb-1 { margin-bottom: 2px; }
            .mb-2 { margin-bottom: 4px; }
            .my-2 { margin-top: 4px; margin-bottom: 4px; }
            .mx-auto { margin-left: auto; margin-right: auto; }

            /* Flexbox */
            .flex {
              display: flex;
              align-items: flex-start;
            }
            .justify-between {
              justify-content: space-between;
            }
            .align-top {
              vertical-align: top;
            }

            /* Image sizing */
            .max-h-12 {
              max-height: 32px;
              width: auto;
            }

            /* Text sizes */
            .text-xs { font-size: 8pt; }
            .text-sm { font-size: 9pt; }

            /* Space optimization */
            .space-y-0\.5 > * + * { margin-top: 1px; }
            .space-y-1 > * + * { margin-top: 2px; }

            /* Prevent page breaks */
            table, .flex, .border-y, .border-t {
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body onload="window.print(); window.onafterprint = function(){ window.close(); }">
          ${printableArea}
        </body>
      </html>
    `);
    printWindow?.document.close();
  };

  // Fungsi cetak Dot Matrix
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
                <strong>Tanggal:</strong> ${safeFormatDate(orderDate, "dd MMMM yyyy")}<br/>
                <strong>Status:</strong> ${transaction.paymentStatus === 'Lunas' ? 'Tunai' : 'Kredit'}
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
              ${transaction.dueDate ? `<div style="font-size: 10.5pt;"><strong>Jatuh Tempo:</strong> ${safeFormatDate(transaction.dueDate, "dd/MM/yyyy")}</div>` : ''}
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
                <tr>
                  <td style="padding: 1mm 2mm; text-align: left;">Dibayar:</td>
                  <td style="padding: 1mm 2mm; text-align: right; font-weight: bold;">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.paidAmount || 0)}</td>
                </tr>
                <tr>
                  <td style="padding: 1mm 2mm; text-align: left; font-weight: bold;">Sisa:</td>
                  <td style="padding: 1mm 2mm; text-align: right; font-weight: bold;">${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total - (transaction.paidAmount || 0))}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Status Bayar Section -->
        <table style="width: 100%; margin-top: 4mm; border: 0.5px solid #000;">
          <tr>
            <td style="width: 50%; padding: 2mm 3mm; font-size: 11pt; font-weight: bold; background: ${transaction.paymentStatus === 'Lunas' ? '#d4edda' : '#fff3cd'};">
              STATUS: ${transaction.paymentStatus === 'Lunas' ? 'LUNAS' : 'BELUM LUNAS'}
            </td>
            <td style="width: 50%; padding: 2mm 3mm; font-size: 10.5pt; text-align: right;">
              ${transaction.paymentStatus !== 'Lunas' ? `<strong>Sisa Bayar: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(transaction.total - (transaction.paidAmount || 0))}</strong>` : 'Pembayaran Lengkap'}
            </td>
          </tr>
        </table>

        <!-- Footer dengan Tanda Tangan -->
        <div style="margin-top: 8mm; border-top: 0.5px solid #ccc; padding-top: 3mm;">
          <!-- Tanda Tangan Section - 3 Kolom -->
          <table style="width: 100%; margin-bottom: 5mm;">
            <tr>
              <td style="width: 33%; text-align: center; vertical-align: top; padding: 2mm;">
                <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 20mm;">Penerima,</div>
                <div style="border-top: 0.5px solid #000; display: inline-block; padding-top: 1mm; min-width: 45mm;">
                  <span style="font-size: 9.5pt; color: #666;">(..............................)</span>
                </div>
              </td>
              <td style="width: 33%; text-align: center; vertical-align: top; padding: 2mm;">
                <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 20mm;">Pengirim,</div>
                <div style="border-top: 0.5px solid #000; display: inline-block; padding-top: 1mm; min-width: 45mm;">
                  <span style="font-size: 9.5pt; color: #666;">(..............................)</span>
                </div>
              </td>
              <td style="width: 33%; text-align: center; vertical-align: top; padding: 2mm;">
                <div style="font-size: 10.5pt; font-weight: bold; margin-bottom: 20mm;">Hormat Kami,</div>
                <div style="border-top: 0.5px solid #000; display: inline-block; padding-top: 1mm; min-width: 45mm;">
                  <strong style="font-size: 10.5pt;">${transaction.cashierName}</strong>
                </div>
              </td>
            </tr>
          </table>

          <!-- Printed Date -->
          <div style="text-align: center; font-size: 9.5pt; color: #666; padding-top: 2mm; border-top: 0.5px dashed #ccc;">
            Dicetak: ${format(new Date(), "dd MMMM yyyy, HH:mm", { locale: id })} WIB
          </div>
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
  // RawBT URL Scheme: rawbt:base64,[base64_encoded_data]
  // Dokumentasi: https://rawbt.ru/en/docs/
  const handleRawbtPrint = () => {
    if (!transaction) return;

    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;

    // Format teks untuk printer thermal 80mm - PLAIN TEXT (RawBT akan handle ESC/POS)
    let receiptText = '';

    // Header - center
    receiptText += '[C]<b>' + (companyInfo?.name || 'Nota Transaksi') + '</b>\n';
    if (companyInfo?.address) {
      receiptText += '[C]' + companyInfo.address + '\n';
    }
    if (companyInfo?.phone) {
      receiptText += '[C]' + companyInfo.phone + '\n';
    }
    receiptText += '[C]================================\n';

    // Transaction info section - left align
    receiptText += '[L]No: ' + transaction.id + '\n';
    receiptText += '[L]Tgl: ' + safeFormatDate(orderDate, "dd/MM/yy HH:mm") + '\n';
    receiptText += '[L]Plgn: ' + transaction.customerName + '\n';
    receiptText += '[L]Kasir: ' + transaction.cashierName + '\n';
    receiptText += '[C]================================\n';

    // Items header
    receiptText += '[L]<b>Item</b>[R]<b>Total</b>\n';
    receiptText += '[C]--------------------------------\n';

    // Items - format seperti struk
    transaction.items.forEach((item) => {
      // Product name
      receiptText += '[L]' + item.product.name + '\n';
      // Quantity x price = total
      const qtyPrice = item.quantity + 'x @' + new Intl.NumberFormat("id-ID").format(item.price);
      const itemTotal = new Intl.NumberFormat("id-ID").format(item.price * item.quantity);
      receiptText += '[L]  ' + qtyPrice + '[R]' + itemTotal + '\n';
    });

    receiptText += '[C]--------------------------------\n';

    // Subtotal
    const subtotalAmount = new Intl.NumberFormat("id-ID").format(transaction.subtotal);
    receiptText += '[L]Subtotal:[R]Rp ' + subtotalAmount + '\n';

    // PPN if enabled
    if (transaction.ppnEnabled) {
      const ppnAmount = new Intl.NumberFormat("id-ID").format(transaction.ppnAmount);
      receiptText += '[L]PPN (' + transaction.ppnPercentage + '%):[R]Rp ' + ppnAmount + '\n';
    }

    receiptText += '[C]================================\n';

    // Total - bold
    const totalAmount = new Intl.NumberFormat("id-ID").format(transaction.total);
    receiptText += '[L]<b>TOTAL:</b>[R]<b>Rp ' + totalAmount + '</b>\n';

    // Payment info
    receiptText += '[C]--------------------------------\n';
    if (transaction.paidAmount > 0) {
      const paidAmount = new Intl.NumberFormat("id-ID").format(transaction.paidAmount);
      receiptText += '[L]Dibayar:[R]Rp ' + paidAmount + '\n';
    }
    const sisaBayar = transaction.total - (transaction.paidAmount || 0);
    if (sisaBayar > 0) {
      const sisaAmount = new Intl.NumberFormat("id-ID").format(sisaBayar);
      receiptText += '[L]<b>Sisa:</b>[R]<b>Rp ' + sisaAmount + '</b>\n';
    }
    receiptText += '[L]Status:[R]' + (transaction.paymentStatus === 'Lunas' ? 'LUNAS' : 'BELUM LUNAS') + '\n';

    // Thank you message
    receiptText += '[C]================================\n';
    receiptText += '[C]<b>Terima kasih!</b>\n';
    receiptText += '[C]' + format(new Date(), "dd/MM/yy HH:mm", { locale: id }) + '\n';
    receiptText += '\n\n\n'; // Feed paper

    // Convert to Base64 for RawBT URL scheme
    const base64Data = btoa(unescape(encodeURIComponent(receiptText)));

    // RawBT URL scheme format: rawbt:base64,{base64_data}
    // Alternative format: intent://... for Android
    const rawbtUrl = 'rawbt:base64,' + base64Data;

    // Try to open RawBT app
    window.location.href = rawbtUrl;
  };

  const handlePdfDownload = () => {
    if (template === 'invoice') {
      generateInvoicePdf();
    } else {
      generateReceiptPdf();
    }
  };

  const generateReceiptPdf = () => {
    if (!transaction) return;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 200] // 80mm width thermal receipt
    });

    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;

    // Header
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(companyInfo?.name || 'Nota Transaksi', 40, 10, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    if (companyInfo?.address) {
      doc.text(companyInfo.address, 40, 16, { align: 'center' });
    }
    if (companyInfo?.phone) {
      doc.text(companyInfo.phone, 40, 21, { align: 'center' });
    }

    // Transaction details
    let currentY = 30;
    doc.setFontSize(8);
    doc.text(`No: ${transaction.id}`, 5, currentY);
    currentY += 4;
    doc.text(`Tgl: ${safeFormatDate(orderDate, "dd/MM/yy HH:mm")}`, 5, currentY);
    currentY += 4;
    doc.text(`Plgn: ${transaction.customerName}`, 5, currentY);
    currentY += 4;
    doc.text(`Kasir: ${transaction.cashierName}`, 5, currentY);
    currentY += 8;

    // Items
    doc.text('Item', 5, currentY);
    doc.text('Total', 75, currentY, { align: 'right' });
    currentY += 4;

    // Line separator
    doc.line(5, currentY, 75, currentY);
    currentY += 4;

    transaction.items.forEach((item) => {
      doc.text(item.product.name, 5, currentY);
      currentY += 3;
      doc.text(`${item.quantity}x @${new Intl.NumberFormat("id-ID").format(item.price)}`, 5, currentY);
      doc.text(new Intl.NumberFormat("id-ID").format(item.price * item.quantity), 75, currentY, { align: 'right' });
      currentY += 5;
    });

    // Line separator
    doc.line(5, currentY, 75, currentY);
    currentY += 4;

    // Totals
    doc.text('Subtotal:', 5, currentY);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.subtotal), 75, currentY, { align: 'right' });
    currentY += 4;

    if (transaction.ppnEnabled) {
      doc.text(`PPN (${transaction.ppnPercentage}%):`, 5, currentY);
      doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.ppnAmount), 75, currentY, { align: 'right' });
      currentY += 4;
    }

    // Final total
    doc.setFont('helvetica', 'bold');
    doc.text('Total:', 5, currentY);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.total), 75, currentY, { align: 'right' });
    currentY += 8;

    // Thank you message
    doc.setFont('helvetica', 'normal');
    doc.text('Terima kasih!', 40, currentY, { align: 'center' });

    // Save the PDF
    doc.save(`nota-${transaction.id}.pdf`);
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <div id="printable-area" className={template === 'receipt' ? 'p-1 bg-white text-black' : ''}>
          {template === 'receipt' ? (<div style={{ width: '80mm' }}><ReceiptTemplate transaction={transaction} companyInfo={companyInfo} /></div>) : (<InvoiceTemplate transaction={transaction} companyInfo={companyInfo} />)}
        </div>
        <DialogFooter className="p-4 border-t bg-muted/40 no-print flex-wrap gap-2">
          <Button variant="outline" onClick={handlePdfDownload}><FileDown className="mr-2 h-4 w-4" /> Simpan PDF</Button>
          <Button variant="outline" onClick={handleDotMatrixPrint}><Printer className="mr-2 h-4 w-4" /> Dot Matrix</Button>
          <Button onClick={handleRawbtPrint} className="bg-blue-600 hover:bg-blue-700"><Printer className="mr-2 h-4 w-4" /> RawBT</Button>
          <Button variant="secondary" onClick={handleClose}><X className="mr-2 h-4 w-4" /> Selesai</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}