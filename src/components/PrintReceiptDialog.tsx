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
    <div className="p-8 bg-white text-black">
      <header className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-200">
        <div>
          {companyInfo?.logo && <img src={companyInfo.logo} alt="Logo" className="max-h-20 mb-4" />}
          <h1 className="text-2xl font-bold text-gray-800">{companyInfo?.name}</h1>
          <p className="text-sm text-gray-500">{companyInfo?.address}</p>
          <p className="text-sm text-gray-500">{companyInfo?.phone}</p>
        </div>
        <div className="text-right">
          <h2 className="text-4xl font-bold uppercase text-gray-300">INVOICE</h2>
          <p className="text-sm text-gray-600"><strong className="text-gray-800">No:</strong> {transaction.id}</p>
          <p className="text-sm text-gray-600"><strong className="text-gray-800">Tanggal:</strong> {orderDate ? format(orderDate, "d MMMM yyyy", { locale: id }) : 'N/A'}</p>
        </div>
      </header>
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 mb-1">DITAGIHKAN KEPADA:</h3>
        <p className="text-lg font-bold text-gray-800">{transaction.customerName}</p>
      </div>
      <Table>
        <TableHeader><TableRow className="bg-gray-100 hover:bg-gray-100"><TableHead className="text-gray-600 font-bold">Deskripsi</TableHead><TableHead className="text-gray-600 font-bold text-center">Jumlah</TableHead><TableHead className="text-gray-600 font-bold text-right">Harga Satuan</TableHead><TableHead className="text-gray-600 font-bold text-right">Total</TableHead></TableRow></TableHeader>
        <TableBody>
          {transaction.items.map((item, index) => (
            <TableRow key={index} className="border-b-gray-200">
              <TableCell className="font-medium text-gray-800">{item.product.name}</TableCell>
              <TableCell className="text-center text-gray-600">{item.quantity}</TableCell>
              <TableCell className="text-right text-gray-600">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price)}</TableCell>
              <TableCell className="text-right font-medium text-gray-800">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price * item.quantity)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex justify-end mt-8">
        <div className="w-full max-w-xs text-gray-700 space-y-2">
          <div className="flex justify-between"><span>Subtotal:</span><span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.subtotal)}</span></div>
          {transaction.ppnEnabled && (
            <div className="flex justify-between"><span>PPN ({transaction.ppnPercentage}%):</span><span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.ppnAmount)}</span></div>
          )}
          <div className="flex justify-between font-bold text-lg border-t-2 border-gray-200 pt-2 text-gray-900"><span>TOTAL:</span><span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.total)}</span></div>
        </div>
      </div>
      <footer className="text-center text-xs text-gray-400 mt-16 pt-4 border-t border-gray-200">
        <div className="flex flex-col items-center gap-2">
          <span className="font-bold text-gray-700">Hormat Kami</span>
          <span className="font-semibold text-gray-800">{transaction.cashierName}</span>
        </div>
        <p className="mt-4">Terima kasih atas kepercayaan Anda.</p>
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
    const margin = 15;

    const logoWidth = 40;
    const logoHeight = 16;
    if (companyInfo?.logo) {
      try {
        doc.addImage(companyInfo.logo, 'PNG', margin, 12, logoWidth, logoHeight, undefined, 'FAST');
      } catch (e) { console.error(e); }
    }
    doc.setFontSize(18).setFont("helvetica", "bold").text(companyInfo?.name || '', margin, 32);
    doc.setFontSize(10).setFont("helvetica", "normal").text(companyInfo?.address || '', margin, 38).text(companyInfo?.phone || '', margin, 43);
    doc.setDrawColor(200).line(margin, 48, pageWidth - margin, 48);
    doc.setFontSize(22).setFont("helvetica", "bold").setTextColor(150).text("INVOICE", pageWidth - margin, 32, { align: 'right' });
    const orderDate = transaction.orderDate ? new Date(transaction.orderDate) : new Date();
    doc.setFontSize(11).setTextColor(0).text(`No: ${transaction.id}`, pageWidth - margin, 38, { align: 'right' }).text(`Tanggal: ${format(orderDate, "d MMMM yyyy", { locale: id })}`, pageWidth - margin, 43, { align: 'right' });
    let y = 55;
    doc.setFontSize(10).setTextColor(100).text("DITAGIHKAN KEPADA:", margin, y);
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(0).text(transaction.customerName, margin, y + 6);
    y += 16;
    const tableData = transaction.items.map(item => [item.product.name, item.quantity, new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price), new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price * item.quantity)]);
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
    const finalY = (doc as any).lastAutoTable.finalY;
    let summaryY = finalY + 10;
    doc.setFontSize(10).setFont("helvetica", "normal").text("Subtotal:", 140, summaryY);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.subtotal), pageWidth - margin, summaryY, { align: 'right' });
    summaryY += 5;
    if (transaction.ppnEnabled) {
      doc.text(`PPN (${transaction.ppnPercentage}%):`, 140, summaryY);
      doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.ppnAmount), pageWidth - margin, summaryY, { align: 'right' });
      summaryY += 5;
    }
    doc.setDrawColor(200).line(140, summaryY, pageWidth - margin, summaryY);
    summaryY += 7;
    doc.setFontSize(12).setFont("helvetica", "bold").text("TOTAL:", 140, summaryY);
    doc.text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(transaction.total), pageWidth - margin, summaryY, { align: 'right' });
    // Signature & Thank you
    let signatureY = summaryY + 25;
    doc.setFontSize(12).setFont("helvetica", "normal");
    doc.text("Hormat Kami", margin, signatureY);
    doc.setFontSize(10).setFont("helvetica", "bold");
    doc.text((transaction.cashierName || ""), margin, signatureY + 8);
    doc.setFontSize(10).setFont("helvetica", "normal");
    doc.text("Terima kasih atas kepercayaan Anda.", margin, signatureY + 20);

    const filename = `MDIInvoice-${transaction.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
    doc.save(filename);
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