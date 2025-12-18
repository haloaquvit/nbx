import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { IncomeStatementData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export const generateIncomeStatementPDF = (data: IncomeStatementData, companyName: string = 'PT AQUVIT MANUFACTURE') => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 10;

  // Header - Compact
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(11);
  doc.text('LAPORAN LABA RUGI (Income Statement)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const periodText = `Periode ${format(data.periodFrom, 'd MMMM', { locale: id })} s/d ${format(data.periodTo, 'd MMMM yyyy', { locale: id })}`;
  doc.text(periodText, pageWidth / 2, yPos, { align: 'center' });

  yPos += 3;
  doc.setFontSize(8);
  doc.text('(Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  // PENDAPATAN
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('PENDAPATAN', 14, yPos);
  yPos += 4;

  const revenueData = [
    ...data.revenue.penjualan.map(item => [item.accountName, item.formattedAmount]),
    ['Total Pendapatan', formatCurrency(data.revenue.totalRevenue), { isBold: true, isTotal: true }],
  ];

  doc.autoTable({
    startY: yPos,
    head: [],
    body: revenueData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = revenueData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (rowData[2].isTotal) {
          hookData.cell.styles.fillColor = [230, 255, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 3;

  // HARGA POKOK PENJUALAN (COGS)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('HARGA POKOK PENJUALAN', 14, yPos);
  yPos += 4;

  const cogsData = [
    ...data.cogs.bahanBaku.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.cogs.tenagaKerja.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.cogs.overhead.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ['Total Harga Pokok Penjualan', `(${formatCurrency(data.cogs.totalCOGS)})`, { isBold: true, isTotal: true }],
  ];

  doc.autoTable({
    startY: yPos,
    head: [],
    body: cogsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = cogsData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (rowData[2].isTotal) {
          hookData.cell.styles.fillColor = [255, 240, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 2;

  // LABA KOTOR
  doc.autoTable({
    startY: yPos,
    body: [[
      `LABA KOTOR (${data.grossProfitMargin.toFixed(1)}%)`,
      formatCurrency(data.grossProfit)
    ]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.5,
      fontStyle: 'bold',
      fillColor: [200, 255, 200]
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 3;

  // BEBAN OPERASIONAL
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BEBAN OPERASIONAL', 14, yPos);
  yPos += 4;

  const expensesData = [
    ...data.operatingExpenses.bebanGaji.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.bebanOperasional.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.bebanAdministrasi.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ...data.operatingExpenses.komisi.map(item => [item.accountName, `(${item.formattedAmount})`]),
    ['Total Beban Operasional', `(${formatCurrency(data.operatingExpenses.totalOperatingExpenses)})`, { isBold: true, isTotal: true }],
  ];

  doc.autoTable({
    startY: yPos,
    head: [],
    body: expensesData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = expensesData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (rowData[2].isTotal) {
          hookData.cell.styles.fillColor = [255, 230, 230];
        }
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 2;

  // LABA OPERASIONAL
  doc.autoTable({
    startY: yPos,
    body: [['LABA OPERASIONAL', formatCurrency(data.operatingIncome)]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.5,
      fontStyle: 'bold',
      fillColor: [200, 230, 255]
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 2;

  // Other Income/Expenses (if any)
  if (data.otherIncome.netOtherIncome !== 0) {
    const otherData = [
      ...data.otherIncome.pendapatanLainLain.map(item => [item.accountName, item.formattedAmount]),
      ...data.otherIncome.bebanLainLain.map(item => [item.accountName, `(${item.formattedAmount})`]),
      ['Pendapatan (Beban) Lain Bersih', formatCurrency(data.otherIncome.netOtherIncome), { isBold: true }],
    ];

    doc.autoTable({
      startY: yPos,
      head: [],
      body: otherData.map(row => [row[0], row[1]]),
      theme: 'plain',
      styles: {
        fontSize: 8,
        cellPadding: 0.5
      },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { cellWidth: 50, halign: 'right', font: 'courier' }
      },
      didParseCell: function (hookData) {
        const rowData = otherData[hookData.row.index];
        if (rowData && rowData[2] && rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 240, 240];
        }
      },
      margin: { left: 14, right: 14 }
    });

    yPos = doc.lastAutoTable.finalY + 2;
  }

  // LABA BERSIH
  const netIncomeColor = data.netIncome >= 0 ? [200, 255, 200] : [255, 200, 200];

  doc.autoTable({
    startY: yPos,
    body: [[
      `LABA BERSIH (${data.netProfitMargin.toFixed(1)}%)`,
      formatCurrency(data.netIncome)
    ]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 2,
      fontStyle: 'bold',
      fillColor: netIncomeColor
    },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 50, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  // Footer
  yPos = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Dibuat pada: ${format(data.generatedAt, 'dd MMM yyyy HH:mm', { locale: id })}`,
    pageWidth / 2,
    yPos,
    { align: 'center' }
  );

  return doc;
};

export const downloadIncomeStatementPDF = (data: IncomeStatementData, companyName?: string) => {
  const doc = generateIncomeStatementPDF(data, companyName);
  const fileName = `Laba_Rugi_${format(data.periodFrom, 'yyyyMMdd')}_${format(data.periodTo, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
