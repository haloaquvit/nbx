"use client"
import * as React from "react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { saveCompressedPDF } from "@/utils/pdfUtils"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Button } from "@/components/ui/button"
import { FileDown, Printer } from "lucide-react"
import { Transaction } from "@/types/transaction"

interface ReceivablesReportPDFProps {
  receivables: Transaction[];
  filterStatus: string;
}

export function ReceivablesReportPDF({ receivables, filterStatus }: ReceivablesReportPDFProps) {
  const getFilterLabel = (status: string) => {
    switch (status) {
      case 'overdue': return 'Jatuh Tempo';
      case 'due-soon': return 'Segera Jatuh Tempo';
      case 'normal': return 'Normal';
      case 'no-due-date': return 'Tanpa Jatuh Tempo';
      default: return 'Semua Status';
    }
  };

  const getDueStatus = (transaction: Transaction) => {
    if (!transaction.dueDate) return 'Tanpa Jatuh Tempo';
    
    const today = new Date();
    const dueDate = new Date(transaction.dueDate);
    const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Jatuh Tempo';
    if (diffDays <= 3) return 'Segera Jatuh Tempo';
    return 'Normal';
  };

  const generatePDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4'); // Portrait orientation
    
    // Company header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('LAPORAN DAFTAR PIUTANG', 105, 20, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(`Filter: ${getFilterLabel(filterStatus)}`, 105, 30, { align: 'center' });
    doc.text(`Tanggal: ${format(new Date(), 'dd MMMM yyyy', { locale: id })}`, 105, 38, { align: 'center' });
    
    // Add line separator
    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);
    
    let currentY = 55;

    // Summary Section
    const totalAmount = receivables.reduce((sum, item) => sum + item.total, 0);
    const totalPaid = receivables.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
    const totalOutstanding = totalAmount - totalPaid;
    const overdueCount = receivables.filter(t => getDueStatus(t) === 'Jatuh Tempo').length;
    const dueSoonCount = receivables.filter(t => getDueStatus(t) === 'Segera Jatuh Tempo').length;

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('RINGKASAN PIUTANG', 20, currentY);
    currentY += 10;

    const summaryData = [
      ['Total Transaksi', receivables.length.toString()],
      ['Jumlah Jatuh Tempo', overdueCount.toString()],
      ['Jumlah Segera Jatuh Tempo', dueSoonCount.toString()],
      ['Total Nilai Piutang', formatCurrency(totalAmount)],
      ['Total Sudah Dibayar', formatCurrency(totalPaid)],
      ['Total Sisa Piutang', formatCurrency(totalOutstanding)]
    ];

    autoTable(doc, {
      startY: currentY,
      head: [['Keterangan', 'Nilai']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: 70, halign: 'right' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;

    // Receivables Table
    if (receivables.length === 0) {
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text('Tidak ada data piutang sesuai filter yang dipilih.', 20, currentY);
    } else {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`DETAIL DAFTAR PIUTANG (${receivables.length} transaksi)`, 20, currentY);
      currentY += 10;

      // Prepare table data
      const tableData = receivables.map(transaction => {
        const remaining = transaction.total - (transaction.paidAmount || 0);
        const dueStatusLabel = getDueStatus(transaction);
        
        return [
          format(new Date(transaction.orderDate), 'dd/MM/yy', { locale: id }),
          transaction.id,
          transaction.customerName || '-',
          formatCurrency(transaction.total),
          formatCurrency(transaction.paidAmount || 0),
          formatCurrency(remaining),
          transaction.dueDate ? format(new Date(transaction.dueDate), 'dd/MM/yy', { locale: id }) : '-',
          dueStatusLabel,
        ];
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Tanggal', 'No. Order', 'Pelanggan', 'Total', 'Dibayar', 'Sisa', 'Jatuh Tempo', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { 
          fillColor: [71, 85, 105], 
          textColor: [255, 255, 255],
          fontSize: 9
        },
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 30 },
          2: { cellWidth: 35 },
          3: { cellWidth: 22, halign: 'right' },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 18 },
          7: { cellWidth: 23 }
        },
        didParseCell: function(data) {
          // Color overdue rows
          if (data.row.index >= 0) {
            const status = tableData[data.row.index][7];
            if (status === 'Jatuh Tempo') {
              data.cell.styles.textColor = [220, 38, 38]; // Red color
              data.cell.styles.fontStyle = 'bold';
            } else if (status === 'Segera Jatuh Tempo') {
              data.cell.styles.textColor = [245, 158, 11]; // Orange color
            }
          }
        }
      });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Dicetak pada: ${format(new Date(), 'dd MMMM yyyy HH:mm', { locale: id })}`,
        20, 280
      );
      doc.text(`Halaman ${i} dari ${pageCount}`, 190, 280, { align: 'right' });
    }

    // Save the PDF
    const fileName = `laporan-piutang-${filterStatus}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    saveCompressedPDF(doc, fileName, 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Button onClick={generatePDF} variant="outline" size="sm" disabled={receivables.length === 0}>
      <FileDown className="mr-2 h-4 w-4" />
      Cetak PDF ({receivables.length})
    </Button>
  );
}