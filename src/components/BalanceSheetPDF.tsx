import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { BalanceSheetData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export const generateBalanceSheetPDF = (data: BalanceSheetData, companyName: string = 'PT AQUVIT MANUFACTURE', asOfDate: Date) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 10;

  // Header - Compact
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(11);
  doc.text('NERACA (Balance Sheet)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Per ${format(asOfDate, 'd MMMM yyyy', { locale: id })}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 3;
  doc.setFontSize(8);
  doc.text('(Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  // Two columns layout
  const colWidth = (pageWidth - 28) / 2;
  const leftX = 14;
  const rightX = leftX + colWidth + 4;

  // ========== LEFT COLUMN: ASET ==========
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('ASET', leftX, yPos);
  yPos += 4;

  // Aset Lancar
  const currentAssetsData = [
    ['Aset Lancar', '', { isHeader: true }],
    ...data.assets.currentAssets.kasBank.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.currentAssets.piutangUsaha.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.currentAssets.persediaan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.currentAssets.panjarKaryawan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['Total Aset Lancar', formatCurrency(data.assets.currentAssets.totalCurrentAssets), { isBold: true }],
  ];

  doc.autoTable({
    startY: yPos,
    head: [],
    body: currentAssetsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = currentAssetsData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isHeader) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 8;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 240, 240];
        }
      }
    },
    margin: { left: leftX, right: pageWidth - leftX - colWidth }
  });

  let leftYPos = doc.lastAutoTable.finalY + 2;

  // Aset Tetap
  const fixedAssetsData = [
    ['Aset Tetap', '', { isHeader: true }],
    ...data.assets.fixedAssets.peralatan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.fixedAssets.akumulasiPenyusutan.map(item => [`  (${item.accountName})`, `(${item.formattedBalance})`]),
    ['Total Aset Tetap', formatCurrency(data.assets.fixedAssets.totalFixedAssets), { isBold: true }],
  ];

  doc.autoTable({
    startY: leftYPos,
    head: [],
    body: fixedAssetsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = fixedAssetsData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isHeader) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 8;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 240, 240];
        }
      }
    },
    margin: { left: leftX, right: pageWidth - leftX - colWidth }
  });

  leftYPos = doc.lastAutoTable.finalY + 2;

  // Total Aset
  doc.autoTable({
    startY: leftYPos,
    body: [['TOTAL ASET', formatCurrency(data.assets.totalAssets)]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1,
      fontStyle: 'bold',
      fillColor: [200, 220, 255]
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    margin: { left: leftX, right: pageWidth - leftX - colWidth }
  });

  // ========== RIGHT COLUMN: KEWAJIBAN & EKUITAS ==========
  let rightYPos = yPos;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('KEWAJIBAN & EKUITAS', rightX, rightYPos);
  rightYPos += 4;

  // Kewajiban Lancar
  const liabilitiesData = [
    ['Kewajiban Lancar', '', { isHeader: true }],
    ...data.liabilities.currentLiabilities.hutangUsaha.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.liabilities.currentLiabilities.hutangGaji.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.liabilities.currentLiabilities.hutangPajak.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['Total Kewajiban', formatCurrency(data.liabilities.totalLiabilities), { isBold: true }],
  ];

  doc.autoTable({
    startY: rightYPos,
    head: [],
    body: liabilitiesData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = liabilitiesData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isHeader) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 8;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [255, 240, 240];
        }
      }
    },
    margin: { left: rightX }
  });

  rightYPos = doc.lastAutoTable.finalY + 2;

  // Ekuitas
  const equityData = [
    ['Ekuitas', '', { isHeader: true }],
    ...data.equity.modalPemilik.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['  Laba Rugi Ditahan', formatCurrency(data.equity.labaRugiDitahan)],
    ['Total Ekuitas', formatCurrency(data.equity.totalEquity), { isBold: true }],
  ];

  doc.autoTable({
    startY: rightYPos,
    head: [],
    body: equityData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 7.5,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      const rowData = equityData[hookData.row.index];
      if (rowData && rowData[2]) {
        if (rowData[2].isHeader) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 8;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 255, 240];
        }
      }
    },
    margin: { left: rightX }
  });

  rightYPos = doc.lastAutoTable.finalY + 2;

  // Total Kewajiban & Ekuitas
  doc.autoTable({
    startY: rightYPos,
    body: [['TOTAL KEWAJIBAN & EKUITAS', formatCurrency(data.totalLiabilitiesEquity)]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1,
      fontStyle: 'bold',
      fillColor: [255, 220, 200]
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    margin: { left: rightX }
  });

  // Balance Status
  const finalY = Math.max(doc.lastAutoTable.finalY, leftYPos) + 4;
  doc.setFontSize(8);
  doc.setFont('helvetica', data.isBalanced ? 'bold' : 'normal');
  doc.setTextColor(data.isBalanced ? 0 : 255, data.isBalanced ? 150 : 0, 0);
  doc.text(
    data.isBalanced ? '✓ Neraca Seimbang' : '✗ Neraca Tidak Seimbang',
    pageWidth / 2,
    finalY,
    { align: 'center' }
  );

  // Footer
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.text(
    `Dibuat pada: ${format(data.generatedAt, 'dd MMM yyyy HH:mm', { locale: id })}`,
    pageWidth / 2,
    finalY + 3,
    { align: 'center' }
  );

  return doc;
};

export const downloadBalanceSheetPDF = (data: BalanceSheetData, asOfDate: Date, companyName?: string) => {
  const doc = generateBalanceSheetPDF(data, companyName, asOfDate);
  const fileName = `Neraca_${format(asOfDate, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
