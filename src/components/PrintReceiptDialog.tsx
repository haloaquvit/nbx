"use client"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Transaction } from "@/types/transaction"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
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
        <div className="flex justify-between"><span>Tgl:</span> <span>{orderDate ? format(orderDate, "dd/MM/yy HH:mm", { locale: id }) : 'N/A'}</span></div>
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
        {transaction.paymentStatus !== 'Lunas' && transaction.dueDate && (
          <div className="flex justify-between text-xs mt-1 pt-1 border-t border-dashed border-black">
            <span>Jatuh Tempo:</span>
            <span>{format(new Date(transaction.dueDate), "dd/MM/yyyy", { locale: id })}</span>
          </div>
        )}
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
          <h2 className="text-5xl font-bold text-blue-800 mb-4">INVOICE</h2>
          <div className="space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">No Invoice:</span><br/>
              <span className="text-lg font-mono font-bold text-blue-900">{transaction.id}</span>
            </p>
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-blue-800">Tanggal:</span><br/>
              <span className="font-medium">{orderDate ? format(orderDate, "d MMMM yyyy", { locale: id }) : 'N/A'}</span>
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
                      {format(new Date(transaction.dueDate), "d MMMM yyyy", { locale: id })}
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
              <p>• Harap sertakan nomor invoice saat melakukan pembayaran</p>
              <p>• Konfirmasi pembayaran ke nomor telepon di atas</p>
            </div>
          </div>
          <div className="text-right">
            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <p className="text-sm font-semibold text-blue-800 mb-4">Hormat Kami,</p>
              <div className="mt-8 pt-4 border-t border-blue-300">
                <p className="font-bold text-blue-900 text-lg">{transaction.cashierName}</p>
                <p className="text-xs text-blue-700 mt-1">Sales Representative</p>
              </div>
            </div>
          </div>
        </div>
        <div className="text-center py-6 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg">
          <p className="text-lg font-semibold mb-2">Terima kasih atas kepercayaan Anda!</p>
          <p className="text-sm opacity-90">Invoice ini dibuat secara otomatis dan sah tanpa tanda tangan</p>
          <p className="text-xs opacity-75 mt-2">
            Dicetak pada: {format(new Date(), "d MMMM yyyy, HH:mm", { locale: id })} WIB
          </p>
        </div>
      </footer>
    </div>
  )
}

export function PrintReceiptDialog({ open, onOpenChange, transaction, template }: PrintReceiptDialogProps) {
  const { settings: companyInfo } = useCompanySettings();

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
    
    // Invoice title and info in white
    doc.setFontSize(28).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("INVOICE", pageWidth - margin, 25, { align: 'right' });
    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : new Date();
    doc.setFontSize(11).setTextColor(255, 255, 255);
    doc.text(`No: ${transaction.id}`, pageWidth - margin, 33, { align: 'right' });
    doc.text(`Tanggal: ${format(orderDate, "d MMMM yyyy", { locale: id })}`, pageWidth - margin, 39, { align: 'right' });
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
      doc.text(format(new Date(transaction.dueDate), "d MMMM yyyy", { locale: id }), pageWidth - margin - 5, summaryY + 6, { align: 'right' });
      summaryY += 12;
      doc.setTextColor(0); // Reset color to black
    }
    
    // Professional footer with signature
    let footerY = summaryY + 30;
    
    // Payment notes
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(100, 100, 100);
    doc.text("Catatan Pembayaran:", margin, footerY);
    doc.text("• Pembayaran dapat dilakukan melalui transfer bank", margin, footerY + 5);
    doc.text("• Harap sertakan nomor invoice saat melakukan pembayaran", margin, footerY + 10);
    doc.text("• Konfirmasi pembayaran ke nomor telepon di atas", margin, footerY + 15);
    
    // Signature section with background
    const sigX = pageWidth - 80;
    doc.setFillColor(59, 130, 246, 0.1);
    doc.roundedRect(sigX - 10, footerY - 5, 70, 30, 3, 3, 'F');
    
    doc.setFontSize(11).setFont("helvetica", "normal").setTextColor(59, 130, 246);
    doc.text("Hormat Kami,", sigX, footerY + 5);
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(0, 0, 0);
    doc.text((transaction.cashierName || ""), sigX, footerY + 18);
    doc.setFontSize(9).setFont("helvetica", "normal").setTextColor(100, 100, 100);
    doc.text("Sales Representative", sigX, footerY + 23);
    
    // Thank you footer
    const thankYouY = pageHeight - 30;
    doc.setFillColor(59, 130, 246);
    doc.rect(0, thankYouY - 5, pageWidth, 20, 'F');
    doc.setFontSize(14).setFont("helvetica", "bold").setTextColor(255, 255, 255);
    doc.text("Terima kasih atas kepercayaan Anda!", pageWidth / 2, thankYouY + 3, { align: 'center' });
    doc.setFontSize(8).setFont("helvetica", "normal");
    doc.text(`Dicetak pada: ${format(new Date(), "d MMMM yyyy, HH:mm", { locale: id })} WIB`, pageWidth / 2, thankYouY + 9, { align: 'center' });

    const filename = `MDIInvoice-${transaction.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
    saveCompressedPDF(doc, filename, 100);
  };

  const handleThermalPrint = () => {
    const printWindow = window.open('', '_blank');
    const printableArea = document.getElementById('printable-area')?.innerHTML;
    printWindow?.document.write(`<html><head><title>Cetak Nota</title><style>body{font-family:monospace;font-size:10pt;margin:0;padding:3mm;width:78mm;} table{width:100%;border-collapse:collapse;} td,th{padding:1px;} .text-center{text-align:center;} .text-right{text-align:right;} .font-bold{font-weight:bold;} .border-y{border-top:1px dashed;border-bottom:1px dashed;} .border-b{border-bottom:1px dashed;} .py-1{padding-top:4px;padding-bottom:4px;} .mb-1{margin-bottom:4px;} .mb-2{margin-bottom:8px;} .mt-2{margin-top:8px;} .mt-3{margin-top:12px;} .mx-auto{margin-left:auto;margin-right:auto;} .max-h-12{max-height:48px;} .flex{display:flex;} .justify-between{justify-content:space-between;}</style></head><body>${printableArea}</body></html>`);
    printWindow?.document.close();
    printWindow?.focus();
    printWindow?.print();
  };

  // Fungsi cetak Dot Matrix
  const handleDotMatrixPrint = () => {
    const printWindow = window.open('', '_blank');
    const printableArea = document.getElementById('printable-area')?.innerHTML;
    printWindow?.document.write(`
      <html>
        <head>
          <title>Cetak Dot Matrix</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 10pt;
              margin: 0;
              padding: 10mm;
              width: 210mm;
              background: #fff;
            }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 2px; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .border-y { border-top: 1px dashed; border-bottom: 1px dashed; }
            .border-b { border-bottom: 1px dashed; }
            .py-1 { padding-top: 4px; padding-bottom: 4px; }
            .mb-1 { margin-bottom: 4px; }
            .mb-2 { margin-bottom: 8px; }
            .mt-2 { margin-top: 8px; }
            .mt-3 { margin-top: 12px; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .max-h-12 { max-height: 48px; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            @media print {
              body { width: 210mm; }
            }
          </style>
        </head>
        <body>
          ${printableArea}
        </body>
      </html>
    `);
    printWindow?.document.close();
    printWindow?.focus();
    printWindow?.print();
  };

  // Fungsi cetak Rawbt Thermal 80mm
  const handleRawbtPrint = () => {
    if (!transaction) return;

    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : null;
    
    // Format teks untuk printer thermal 80mm sesuai template preview
    let receiptText = '';
    
    // Header - exactly like preview
    receiptText += '\x1B\x40'; // ESC @ (Initialize printer)
    receiptText += '\x1B\x61\x01'; // Center alignment
    receiptText += (companyInfo?.name || 'Nota Transaksi') + '\n';
    if (companyInfo?.address) {
      receiptText += companyInfo.address + '\n';
    }
    if (companyInfo?.phone) {
      receiptText += companyInfo.phone + '\n';
    }
    receiptText += '\x1B\x61\x00'; // Left alignment
    
    // Transaction info section - with border
    receiptText += '--------------------------------\n';
    receiptText += `No: ${transaction.id}\n`;
    receiptText += `Tgl: ${orderDate ? format(orderDate, "dd/MM/yy HH:mm", { locale: id }) : 'N/A'}\n`;
    receiptText += `Plgn: ${transaction.customerName}\n`;
    receiptText += `Kasir: ${transaction.cashierName}\n`;
    receiptText += '--------------------------------\n';
    
    // Items header - exactly like preview
    receiptText += 'Item                        Total\n';
    receiptText += '--------------------------------\n';
    
    // Items - format like preview
    transaction.items.forEach((item) => {
      // First line: product name
      receiptText += item.product.name + '\n';
      
      // Second line: quantity x @price, then total on right
      const qtyPrice = `${item.quantity}x @${new Intl.NumberFormat("id-ID").format(item.price)}`;
      const itemTotal = new Intl.NumberFormat("id-ID").format(item.price * item.quantity);
      
      // Calculate spacing to align total to right (32 chars total width)
      const spacing = 32 - qtyPrice.length - itemTotal.length;
      receiptText += qtyPrice + ' '.repeat(Math.max(0, spacing)) + itemTotal + '\n';
    });
    
    receiptText += '--------------------------------\n';
    
    // Subtotal - exactly like preview format
    const subtotalText = 'Subtotal:';
    const subtotalAmount = new Intl.NumberFormat("id-ID", { 
      style: "currency", 
      currency: "IDR",
      minimumFractionDigits: 0
    }).format(transaction.subtotal);
    const subtotalSpacing = 32 - subtotalText.length - subtotalAmount.length;
    receiptText += subtotalText + ' '.repeat(Math.max(0, subtotalSpacing)) + subtotalAmount + '\n';
    
    // PPN if enabled
    if (transaction.ppnEnabled) {
      const ppnText = `PPN (${transaction.ppnPercentage}%):`;
      const ppnAmount = new Intl.NumberFormat("id-ID", { 
        style: "currency", 
        currency: "IDR",
        minimumFractionDigits: 0
      }).format(transaction.ppnAmount);
      const ppnSpacing = 32 - ppnText.length - ppnAmount.length;
      receiptText += ppnText + ' '.repeat(Math.max(0, ppnSpacing)) + ppnAmount + '\n';
    }
    
    receiptText += '--------------------------------\n';
    
    // Total - bold format exactly like preview
    const totalText = 'Total:';
    const totalAmount = new Intl.NumberFormat("id-ID", { 
      style: "currency", 
      currency: "IDR",
      minimumFractionDigits: 0
    }).format(transaction.total);
    const totalSpacing = 32 - totalText.length - totalAmount.length;
    
    receiptText += '\x1B\x45\x01'; // Bold on
    receiptText += totalText + ' '.repeat(Math.max(0, totalSpacing)) + totalAmount + '\n';
    receiptText += '\x1B\x45\x00'; // Bold off
    
    // Thank you message
    receiptText += '\n';
    receiptText += '\x1B\x61\x01'; // Center alignment
    receiptText += 'Terima kasih!\n';
    receiptText += '\x1B\x61\x00'; // Left alignment
    
    receiptText += '\n\n\n'; // Feed paper
    receiptText += '\x1D\x56\x41'; // Cut paper

    // Multiple approaches untuk RawBT
    const handleRawbtConnection = () => {
      const encodedText = encodeURIComponent(receiptText);
      // Method 1: Coba rawbt:// protocol
      const rawbtUrl = `rawbt:${encodedText}`;
      const link = document.createElement('a');
      link.href = rawbtUrl;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // Method 2: Fallback dengan window.open ke RawBT web interface (jika ada)
      setTimeout(() => {
        try {
          window.open(`http://localhost:8080/?data=${encodedText}`, '_rawbt');
        } catch (e) {
          // Method 3: Copy ke clipboard sebagai fallback terakhir
          navigator.clipboard?.writeText(receiptText).then(() => {
            const userChoice = confirm(
              'RawBT tidak terdeteksi!\n\n' +
              'Teks nota sudah disalin ke clipboard.\n' +
              'Klik OK untuk membuka RawBT secara manual, atau Cancel untuk menggunakan cara lain.\n\n' +
              'Instruksi:\n' +
              '1. Buka aplikasi RawBT\n' +
              '2. Paste (Ctrl+V) di area teks\n' +
              '3. Klik Send/Print'
            );
            if (userChoice) {
              try {
                window.open('ms-windows-store://pdp/?ProductId=9NBLGGH5Z3VL', '_blank');
              } catch (e) {
                alert('Silakan buka aplikasi RawBT secara manual dan paste teks yang sudah disalin.');
              }
            }
          }).catch(() => {
            alert(
              'Tidak dapat mengakses RawBT atau clipboard.\n\n' +
              'Silakan:\n' +
              '1. Install aplikasi RawBT\n' +
              '2. Copy teks nota secara manual\n' +
              '3. Paste di RawBT untuk mencetak'
            );
          });
        }
      }, 1000);
    };
    handleRawbtConnection();
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
    doc.text(`Tgl: ${orderDate ? format(orderDate, "dd/MM/yy HH:mm", { locale: id }) : 'N/A'}`, 5, currentY);
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
        <DialogFooter className="p-4 border-t bg-muted/40 no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="mr-2 h-4 w-4" /> Tutup</Button>
          <Button variant="outline" onClick={handlePdfDownload}><FileDown className="mr-2 h-4 w-4" /> Simpan PDF</Button>
          <Button variant="outline" onClick={handleDotMatrixPrint}><Printer className="mr-2 h-4 w-4" /> Cetak Dot Matrix</Button>
          <Button onClick={handleRawbtPrint}><Printer className="mr-2 h-4 w-4" /> Cetak Rawbt Thermal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}