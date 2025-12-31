import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BalanceSheetData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

export interface PrinterInfo {
  name: string;
  position?: string;
}

export const generateBalanceSheetPDF = (
  data: BalanceSheetData,
  companyName: string = 'PT AQUVIT MANUFACTURE',
  asOfDate: Date,
  printerInfo?: PrinterInfo
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 12;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;
  doc.setFontSize(12);
  doc.text('NERACA (Balance Sheet)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Per ${format(asOfDate, 'd MMMM yyyy', { locale: id })}`, pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.text('(Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;

  // Two columns layout
  const colWidth = (pageWidth - 28) / 2;
  const leftX = 14;
  const rightX = leftX + colWidth + 4;

  // ========== LEFT COLUMN: ASET ==========
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ASET', leftX, yPos);
  yPos += 5;

  // Aset Lancar
  // Calculate total Kas dan Setara Kas
  const totalKasSetaraKas = data.assets.currentAssets.kasBank.reduce((sum, item) => sum + item.balance, 0);

  const currentAssetsData: any[] = [
    ['Aset Lancar', '', { isHeader: true }],
    // Kas dan Setara Kas sebagai sub-header
    ...(data.assets.currentAssets.kasBank.length > 0 ? [
      ['  Kas dan Setara Kas', '', { isSubHeader: true }],
      ...data.assets.currentAssets.kasBank.map(item => [`    ${item.accountName}`, item.formattedBalance]),
      ['  Total Kas dan Setara Kas', formatCurrency(totalKasSetaraKas), { isSubTotal: true }],
    ] : []),
    ...data.assets.currentAssets.piutangUsaha.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...(data.assets.currentAssets.piutangPajak || []).map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.currentAssets.persediaan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.currentAssets.panjarKaryawan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['Total Aset Lancar', formatCurrency(data.assets.currentAssets.totalCurrentAssets), { isBold: true }],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: currentAssetsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.8
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
          hookData.cell.styles.fontSize = 9;
        }
        if (rowData[2].isSubHeader) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fontSize = 8;
        }
        if (rowData[2].isSubTotal) {
          hookData.cell.styles.fontStyle = 'italic';
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

  let leftYPos = (doc as any).lastAutoTable.finalY + 3;

  // Aset Tetap
  const fixedAssetsData: any[] = [
    ['Aset Tetap', '', { isHeader: true }],
    ...data.assets.fixedAssets.peralatan.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.assets.fixedAssets.akumulasiPenyusutan.map(item => [`  (${item.accountName})`, `(${item.formattedBalance})`]),
    ['Total Aset Tetap', formatCurrency(data.assets.fixedAssets.totalFixedAssets), { isBold: true }],
  ];

  autoTable(doc, {
    startY: leftYPos,
    head: [],
    body: fixedAssetsData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.8
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
          hookData.cell.styles.fontSize = 9;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 240, 240];
        }
      }
    },
    margin: { left: leftX, right: pageWidth - leftX - colWidth }
  });

  leftYPos = (doc as any).lastAutoTable.finalY + 3;

  // Total Aset
  autoTable(doc, {
    startY: leftYPos,
    body: [['TOTAL ASET', formatCurrency(data.assets.totalAssets)]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 1.5,
      fontStyle: 'bold',
      fillColor: [200, 220, 255]
    },
    columnStyles: {
      0: { cellWidth: colWidth * 0.65 },
      1: { cellWidth: colWidth * 0.35, halign: 'right', font: 'courier' }
    },
    margin: { left: leftX, right: pageWidth - leftX - colWidth }
  });

  const leftFinalY = (doc as any).lastAutoTable.finalY;

  // ========== RIGHT COLUMN: KEWAJIBAN & EKUITAS ==========
  let rightYPos = yPos;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('KEWAJIBAN & EKUITAS', rightX, rightYPos);
  rightYPos += 5;

  // Kewajiban Lancar
  const liabilitiesData: any[] = [
    ['Kewajiban Lancar', '', { isHeader: true }],
    ...data.liabilities.currentLiabilities.hutangUsaha.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.liabilities.currentLiabilities.hutangGaji.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ...data.liabilities.currentLiabilities.hutangPajak.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['Total Kewajiban', formatCurrency(data.liabilities.totalLiabilities), { isBold: true }],
  ];

  autoTable(doc, {
    startY: rightYPos,
    head: [],
    body: liabilitiesData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.8
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
          hookData.cell.styles.fontSize = 9;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [255, 240, 240];
        }
      }
    },
    margin: { left: rightX }
  });

  rightYPos = (doc as any).lastAutoTable.finalY + 3;

  // Ekuitas
  const equityData: any[] = [
    ['Ekuitas', '', { isHeader: true }],
    ...data.equity.modalPemilik.map(item => [`  ${item.accountName}`, item.formattedBalance]),
    ['  Laba Ditahan (Akun)', formatCurrency(data.equity.labaDitahanAkun)],
    ['  Laba Tahun Berjalan', formatCurrency(data.equity.labaTahunBerjalan)],
    ['  Total Laba Ditahan', formatCurrency(data.equity.totalLabaDitahan), { isBold: true }],
    ['Total Ekuitas', formatCurrency(data.equity.totalEquity), { isBold: true }],
  ];

  autoTable(doc, {
    startY: rightYPos,
    head: [],
    body: equityData.map(row => [row[0], row[1]]),
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.8
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
          hookData.cell.styles.fontSize = 9;
        }
        if (rowData[2].isBold) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [240, 255, 240];
        }
      }
    },
    margin: { left: rightX }
  });

  rightYPos = (doc as any).lastAutoTable.finalY + 3;

  // Total Kewajiban & Ekuitas
  autoTable(doc, {
    startY: rightYPos,
    body: [['TOTAL KEWAJIBAN & EKUITAS', formatCurrency(data.totalLiabilitiesEquity)]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 1.5,
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
  let yPosBottom = Math.max((doc as any).lastAutoTable.finalY, leftFinalY) + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', data.isBalanced ? 'bold' : 'normal');
  doc.setTextColor(data.isBalanced ? 0 : 255, data.isBalanced ? 150 : 0, 0);
  doc.text(
    data.isBalanced ? '✓ Neraca Seimbang' : '✗ Neraca Tidak Seimbang',
    pageWidth / 2,
    yPosBottom,
    { align: 'center' }
  );

  // Show selisih if not balanced
  if (!data.isBalanced) {
    yPosBottom += 5;
    doc.setFontSize(9);
    doc.setTextColor(255, 0, 0);
    doc.text(
      `Selisih: ${formatCurrency(data.selisih)}`,
      pageWidth / 2,
      yPosBottom,
      { align: 'center' }
    );
  }

  // Signature Section - positioned at bottom of page
  const signatureY = pageHeight - 55;
  const signatureWidth = 50;
  const startX = 20;
  const gap = (pageWidth - 40 - signatureWidth * 3) / 2;

  doc.setTextColor(0, 0, 0);
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

export const downloadBalanceSheetPDF = (
  data: BalanceSheetData,
  asOfDate: Date,
  companyName?: string,
  printerInfo?: PrinterInfo
) => {
  const doc = generateBalanceSheetPDF(data, companyName, asOfDate, printerInfo);
  const fileName = `Neraca_${format(asOfDate, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
