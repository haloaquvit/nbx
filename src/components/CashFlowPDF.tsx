import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { CashFlowStatementData, formatCurrency } from '@/utils/financialStatementsUtils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale/id';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export const generateCashFlowPDF = (data: CashFlowStatementData, companyName: string = 'PT AQUVIT MANUFACTURE') => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 10;

  // Header - Compact
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(companyName, pageWidth / 2, yPos, { align: 'center' });

  yPos += 5;
  doc.setFontSize(11);
  doc.text('LAPORAN ARUS KAS', pageWidth / 2, yPos, { align: 'center' });

  yPos += 4;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const periodText = `Periode ${format(data.periodFrom, 'd MMMM', { locale: id })} s/d ${format(data.periodTo, 'd MMMM yyyy', { locale: id })}`;
  doc.text(periodText, pageWidth / 2, yPos, { align: 'center' });

  yPos += 3;
  doc.setFontSize(8);
  doc.text('(Metode Langsung - Disajikan dalam Rupiah)', pageWidth / 2, yPos, { align: 'center' });

  yPos += 6;

  // AKTIVITAS OPERASI
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS OPERASI', 14, yPos);
  yPos += 4;

  // Penerimaan Kas - Compact table
  const receiptsData = [
    ['Penerimaan kas dari:', ''],
    ['  Pelanggan', formatCurrency(data.operatingActivities.cashReceipts?.fromCustomers || 0)],
    ['  Pembayaran piutang', formatCurrency(data.operatingActivities.cashReceipts?.fromReceivablePayments || 0)],
    ['  Pelunasan panjar karyawan', formatCurrency(data.operatingActivities.cashReceipts?.fromAdvanceRepayment || 0)],
    ['  Penerimaan operasi lain', formatCurrency(data.operatingActivities.cashReceipts?.fromOtherOperating || 0)],
    ['Total penerimaan kas', formatCurrency(data.operatingActivities.cashReceipts?.total || 0)],
  ];

  doc.autoTable({
    startY: yPos,
    head: [],
    body: receiptsData,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5,
      lineColor: [200, 200, 200],
      lineWidth: 0
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'normal' },
      1: { cellWidth: 60, halign: 'right', fontStyle: 'normal' }
    },
    didParseCell: function (data) {
      if (data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [0, 100, 200];
      }
      if (data.row.index === receiptsData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 255, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 2;

  // Pembayaran Kas - Compact table
  const paymentsData = [
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

  doc.autoTable({
    startY: yPos,
    head: [],
    body: paymentsData,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5,
      lineColor: [200, 200, 200],
      lineWidth: 0
    },
    columnStyles: {
      0: { cellWidth: 120, fontStyle: 'normal' },
      1: { cellWidth: 60, halign: 'right', fontStyle: 'normal' }
    },
    didParseCell: function (data) {
      if (data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = [200, 0, 0];
      }
      if (data.row.index === paymentsData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 230, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 2;

  // Net Cash from Operations - Highlighted
  doc.autoTable({
    startY: yPos,
    body: [['Kas Bersih dari Aktivitas Operasi', formatCurrency(data.operatingActivities.netCashFromOperations)]],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.5,
      fontStyle: 'bold',
      fillColor: [200, 230, 255]
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right' }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 4;

  // AKTIVITAS INVESTASI
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS INVESTASI', 14, yPos);
  yPos += 4;

  const investingData = data.investingActivities.equipmentPurchases.length > 0
    ? data.investingActivities.equipmentPurchases.map(item => [item.description, item.formattedAmount])
    : [['Tidak ada aktivitas investasi', '-']];

  investingData.push(['Kas Bersih dari Aktivitas Investasi', formatCurrency(data.investingActivities.netCashFromInvesting)]);

  doc.autoTable({
    startY: yPos,
    body: investingData,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right' }
    },
    didParseCell: function (data) {
      if (data.row.index === investingData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [240, 230, 255];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 4;

  // AKTIVITAS PENDANAAN
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('AKTIVITAS PENDANAAN', 14, yPos);
  yPos += 4;

  doc.autoTable({
    startY: yPos,
    body: [
      ['Tidak ada aktivitas pendanaan', '-'],
      ['Kas Bersih dari Aktivitas Pendanaan', formatCurrency(data.financingActivities.netCashFromFinancing)]
    ],
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right' }
    },
    didParseCell: function (data) {
      if (data.row.index === 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [230, 255, 230];
      }
    },
    margin: { left: 14, right: 14 }
  });

  yPos = doc.lastAutoTable.finalY + 4;

  // NET CASH FLOW & RECONCILIATION
  const netCashColor = data.netCashFlow >= 0 ? [230, 255, 230] : [255, 230, 230];

  doc.autoTable({
    startY: yPos,
    body: [
      ['KENAIKAN (PENURUNAN) KAS BERSIH', formatCurrency(data.netCashFlow)],
      ['Kas di awal periode', formatCurrency(data.beginningCash)],
      ['KAS DI AKHIR PERIODE', formatCurrency(data.endingCash)]
    ],
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 1.5
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 60, halign: 'right' }
    },
    didParseCell: function (data) {
      if (data.row.index === 0) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = netCashColor;
      }
      if (data.row.index === 2) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10;
        data.cell.styles.fillColor = [255, 255, 200];
      }
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

export const downloadCashFlowPDF = (data: CashFlowStatementData, companyName?: string) => {
  const doc = generateCashFlowPDF(data, companyName);
  const fileName = `Laporan_Arus_Kas_${format(data.periodFrom, 'yyyyMMdd')}_${format(data.periodTo, 'yyyyMMdd')}.pdf`;
  doc.save(fileName);
};
