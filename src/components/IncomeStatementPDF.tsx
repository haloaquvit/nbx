import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IncomeStatementData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

export interface PrinterInfo {
  name: string;
  position?: string;
}

export const generateIncomeStatementPDF = (
  data: IncomeStatementData,
  companyName: string = 'PT AQUVIT MANUFACTURE',
  printerInfo?: PrinterInfo
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 12;

  // Header - Compact
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;
  doc.setFontSize(12);
  doc.text('LAPORAN LABA RUGI', pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('(Income Statement)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  const periodText = `Periode ${format(data.periodFrom, 'd MMMM', { locale: id })} s/d ${format(data.periodTo, 'd MMMM yyyy', { locale: id })}`;
  doc.text(periodText, pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.text('(Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;

  // PENDAPATAN
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PENDAPATAN', 14, yPos);
  yPos += 5;

  const revenueData: any[] = [
    ...data.revenue.penjualan.map(item => [item.accountName, item.formattedAmount]),
    ['Total Pendapatan', formatCurrency(data.revenue.totalRevenue), { isBold: true, isTotal: true }],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: revenueData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.2
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = revenueData[hookData.row.index];
      if (rowData && rowData[2]) {
        const meta = rowData[2] as { isBold?: boolean; isTotal?: boolean };
        if (meta.isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (meta.isTotal) {
          hookData.cell.styles.fillColor = [230, 255, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 4;

  // HARGA POKOK PENJUALAN (COGS)
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('HARGA POKOK PENJUALAN', 14, yPos);
  yPos += 5;

  const cogsData: any[] = [
    ...data.cogs.bahanBaku.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.cogs.tenagaKerja.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.cogs.overhead.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ['Total Harga Pokok Penjualan', `(${formatCurrency(data.cogs.totalCOGS)})`, { isBold: true, isTotal: true }],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: cogsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.2
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = cogsData[hookData.row.index];
      if (rowData && rowData[2]) {
        const meta = rowData[2] as { isBold?: boolean; isTotal?: boolean };
        if (meta.isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (meta.isTotal) {
          hookData.cell.styles.fillColor = [255, 240, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 3;

  // LABA KOTOR
  autoTable(doc, {
    startY: yPos,
    body: [[
      `LABA KOTOR (${data.grossProfitMargin.toFixed(1)}%)`,
      formatCurrency(data.grossProfit)
    ]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 2,
      fontStyle: 'bold',
      fillColor: [200, 255, 200]
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 4;

  // BEBAN OPERASIONAL
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('BEBAN OPERASIONAL', 14, yPos);
  yPos += 5;

  const expensesData: any[] = [
    ...data.operatingExpenses.bebanGaji.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.bebanOperasional.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.bebanAdministrasi.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.komisi.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ['Total Beban Operasional', `(${formatCurrency(data.operatingExpenses.totalOperatingExpenses)})`, { isBold: true, isTotal: true }],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: expensesData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.2
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = expensesData[hookData.row.index];
      if (rowData && rowData[2]) {
        const meta = rowData[2] as { isBold?: boolean; isTotal?: boolean };
        if (meta.isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (meta.isTotal) {
          hookData.cell.styles.fillColor = [255, 230, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 3;

  // LABA OPERASIONAL
  autoTable(doc, {
    startY: yPos,
    body: [['LABA OPERASIONAL', formatCurrency(data.operatingIncome)]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 2,
      fontStyle: 'bold',
      fillColor: [200, 230, 255]
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 3;

  // Other Income/Expenses (if any)
  if (data.otherIncome.netOtherIncome !== 0) {
    const otherData: any[] = [
      ...data.otherIncome.pendapatanLainLain.map(item => [item.accountName, item.formattedAmount]),
      ...data.otherIncome.bebanLainLain.map(item => [item.accountName, `(${item.formattedAmount})`]),
      ['Pendapatan (Beban) Lain Bersih', formatCurrency(data.otherIncome.netOtherIncome), { isBold: true }],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [],
      body: otherData.map(row => [row[0], row[1]]),
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 1.2
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 50, halign: 'right', font: 'courier' }
      },
      didParseCell: function (hookData) {
        const rowData = otherData[hookData.row.index];
        if (rowData && rowData[2]) {
          const meta = rowData[2] as { isBold?: boolean };
          if (meta.isBold) {
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fillColor = [240, 240, 240];
          }
        }
      },
      margin: { left: 14, right: 14 }
    });

    yPos = (doc as any).lastAutoTable.finalY + 3;
  }

  // LABA BERSIH
  const netIncomeColor: [number, number, number] = data.netIncome >= 0 ? [200, 255, 200] : [255, 200, 200];

  autoTable(doc, {
    startY: yPos,
    body: [[
      `LABA BERSIH (${data.netProfitMargin.toFixed(1)}%)`,
      formatCurrency(data.netIncome)
    ]],
    theme: 'plain',
    styles: {
      fontSize: 11,
      cellPadding: 2.5,
      fontStyle: 'bold',
      fillColor: netIncomeColor
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  // Signature Section - positioned at bottom of page
  const signatureY = pageHeight - 55;
  const signatureWidth = 50;
  const startX = 20;
  const gap = (pageWidth - 40 - signatureWidth * 3) / 2;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  // Get printer name
  const printerName = printerInfo?.name || '(_________________)';

  // Dibuat oleh - with printer name auto-filled
  doc.text('Dibuat oleh,', startX, signatureY);
  doc.line(startX, signatureY + 20, startX + signatureWidth, signatureY + 20);
  doc.setFont('helvetica', 'bold');
  doc.text(printerName, startX, signatureY + 26);
  if (printerInfo?.position) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(printerInfo.position, startX, signatureY + 31);
  }

  // Disetujui oleh
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Disetujui oleh,', startX + signatureWidth + gap, signatureY);
  doc.line(startX + signatureWidth + gap, signatureY + 20, startX + signatureWidth * 2 + gap, signatureY + 20);
  doc.text('(_________________)', startX + signatureWidth + gap, signatureY + 26);

  // Mengetahui
  doc.text('Mengetahui,', startX + (signatureWidth + gap) * 2, signatureY);
  doc.line(startX + (signatureWidth + gap) * 2, signatureY + 20, startX + signatureWidth * 3 + gap * 2, signatureY + 20);
  doc.text('(_________________)', startX + (signatureWidth + gap) * 2, signatureY + 26);

  // Footer
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Dicetak oleh: ${printerInfo?.name || '-'} | Tanggal cetak: ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: id })}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

  return doc;
};

export const downloadIncomeStatementPDF = (
  data: IncomeStatementData,
  companyName?: string,
  printerInfo?: PrinterInfo
) => {
  const doc = generateIncomeStatementPDF(data, companyName, printerInfo);
  const fileName = `Laba_Rugi_${format(data.periodFrom, 'yyyyMMdd')}_${format(data.periodTo, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
