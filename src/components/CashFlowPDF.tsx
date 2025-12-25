import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CashFlowStatementData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

export interface PrinterInfo {
  name: string;
  position?: string;
}

export const generateCashFlowPDF = (
  data: CashFlowStatementData,
  companyName: string = 'PT AQUVIT MANUFACTURE',
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
  doc.text('LAPORAN ARUS KAS', pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const periodText = `Periode ${format(data.periodFrom, 'd MMMM', { locale: id })} s/d ${format(data.periodTo, 'd MMMM yyyy', { locale: id })}`;
  doc.text(periodText, pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.text('(Metode Langsung - Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;

  // AKTIVITAS OPERASI
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS OPERASI', 14, yPos);
  yPos += 5;

  // Penerimaan Kas
  const receiptsData = [
    ['Penerimaan kas dari:', ''],
    ['  Pelanggan', formatCurrency(data.operatingActivities.cashReceipts?.fromCustomers || 0)],
    ['  Pembayaran piutang', formatCurrency(data.operatingActivities.cashReceipts?.fromReceivablePayments || 0)],
    ['  Pelunasan panjar karyawan', formatCurrency(data.operatingActivities.cashReceipts?.fromAdvanceRepayment || 0)],
    ['  Penerimaan operasi lain', formatCurrency(data.operatingActivities.cashReceipts?.fromOtherOperating || 0)],
    ['Total penerimaan kas', formatCurrency(data.operatingActivities.cashReceipts?.total || 0)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: receiptsData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 0.8,
      lineColor: [200, 200, 200],
      lineWidth: 0
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'normal' },
      1: { cellWidth: 60, halign: 'right', fontStyle: 'normal', font: 'courier' }
    },
    didParseCell: function (hookData) {
      if (hookData.row.index === 0) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [0, 100, 200];
      }
      if (hookData.row.index === receiptsData.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [230, 255, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 3;

  // Pembayaran Kas
  const paymentsData: string[][] = [
    ['Pembayaran kas untuk:', ''],
    ['  Pembelian bahan baku', `(${formatCurrency(data.operatingActivities.cashPayments?.forRawMaterials || 0)})`],
    ['  Pembayaran hutang (Supplier, Bank, dll)', `(${formatCurrency(data.operatingActivities.cashPayments?.forPayablePayments || 0)})`],
    ['  Hutang Bunga', `(${formatCurrency(data.operatingActivities.cashPayments?.forInterestExpense || 0)})`],
    ['  Upah tenaga kerja langsung', `(${formatCurrency(data.operatingActivities.cashPayments?.forDirectLabor || 0)})`],
    ['  Panjar karyawan', `(${formatCurrency(data.operatingActivities.cashPayments?.forEmployeeAdvances || 0)})`],
    ['  Biaya overhead pabrik', `(${formatCurrency(data.operatingActivities.cashPayments?.forManufacturingOverhead || 0)})`],
    ['  Beban operasi lainnya', `(${formatCurrency(data.operatingActivities.cashPayments?.forOperatingExpenses || 0)})`],
  ];

  if (data.operatingActivities.cashPayments?.forTaxes > 0) {
    paymentsData.push(['  Pajak penghasilan', `(${formatCurrency(data.operatingActivities.cashPayments.forTaxes)})`]);
  }

  paymentsData.push(['Total pembayaran kas', `(${formatCurrency(data.operatingActivities.cashPayments?.total || 0)})`]);

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: paymentsData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 0.8,
      lineColor: [200, 200, 200],
      lineWidth: 0
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'normal' },
      1: { cellWidth: 60, halign: 'right', fontStyle: 'normal', font: 'courier' }
    },
    didParseCell: function (hookData) {
      if (hookData.row.index === 0) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [200, 0, 0];
      }
      if (hookData.row.index === paymentsData.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [255, 230, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 3;

  // Net Cash from Operations
  autoTable(doc, {
    startY: yPos,
    body: [['Kas Bersih dari Aktivitas Operasi', formatCurrency(data.operatingActivities.netCashFromOperations)]],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 2,
      fontStyle: 'bold',
      fillColor: [200, 230, 255]
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right', font: 'courier' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 5;

  // AKTIVITAS INVESTASI
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS INVESTASI', 14, yPos);
  yPos += 5;

  const investingData: string[][] = data.investingActivities.equipmentPurchases.length > 0
    ? data.investingActivities.equipmentPurchases.map(item => [item.description, item.formattedAmount])
    : [['Tidak ada aktivitas investasi', '-']];

  investingData.push(['Kas Bersih dari Aktivitas Investasi', formatCurrency(data.investingActivities.netCashFromInvesting)]);

  autoTable(doc, {
    startY: yPos,
    body: investingData,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 0.8
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      if (hookData.row.index === investingData.length - 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [240, 230, 255];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 5;

  // AKTIVITAS PENDANAAN
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS PENDANAAN', 14, yPos);
  yPos += 5;

  autoTable(doc, {
    startY: yPos,
    body: [
      ['Tidak ada aktivitas pendanaan', '-'],
      ['Kas Bersih dari Aktivitas Pendanaan', formatCurrency(data.financingActivities.netCashFromFinancing)]
    ],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 0.8
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      if (hookData.row.index === 1) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [230, 255, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 5;

  // NET CASH FLOW & RECONCILIATION
  const netCashColor: [number, number, number] = data.netCashFlow >= 0 ? [230, 255, 230] : [255, 230, 230];

  autoTable(doc, {
    startY: yPos,
    body: [
      ['KENAIKAN (PENURUNAN) KAS BERSIH', formatCurrency(data.netCashFlow)],
      ['Kas di awal periode', formatCurrency(data.beginningCash)],
      ['KAS DI AKHIR PERIODE', formatCurrency(data.endingCash)]
    ],
    theme: 'plain',
    styles: {
      fontSize: 10,
      cellPadding: 2
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right', font: 'courier' }
    },
    didParseCell: function (hookData) {
      if (hookData.row.index === 0) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = netCashColor;
      }
      if (hookData.row.index === 2) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fontSize = 11;
        hookData.cell.styles.fillColor = [255, 255, 200];
      }
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

export const downloadCashFlowPDF = (
  data: CashFlowStatementData,
  companyName?: string,
  printerInfo?: PrinterInfo
) => {
  const doc = generateCashFlowPDF(data, companyName, printerInfo);
  const fileName = `Laporan_Arus_Kas_${format(data.periodFrom, 'yyyyMMdd')}_${format(data.periodTo, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
