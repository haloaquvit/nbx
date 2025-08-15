"use client"
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Quotation } from "@/types/quotation"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Printer, X } from "lucide-react"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useCompanySettings, CompanyInfo } from "@/hooks/useCompanySettings"

interface PrintQuotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quotation: Quotation | null
}

const QuotationTemplate = ({ quotation, companyInfo }: { quotation: Quotation, companyInfo?: CompanyInfo | null }) => {
  const createdAt = quotation.createdAt ? new Date(quotation.createdAt) : null;
  const validUntil = quotation.validUntil ? new Date(quotation.validUntil) : null;

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
          <h2 className="text-4xl font-bold uppercase text-gray-300">PENAWARAN</h2>
          <p className="text-sm text-gray-600"><strong className="text-gray-800">No:</strong> {quotation.id}</p>
          <p className="text-sm text-gray-600"><strong className="text-gray-800">Tanggal:</strong> {createdAt ? format(createdAt, "d MMMM yyyy", { locale: id }) : 'N/A'}</p>
          <p className="text-sm text-gray-600"><strong className="text-gray-800">Berlaku Hingga:</strong> {validUntil ? format(validUntil, "d MMMM yyyy", { locale: id }) : 'N/A'}</p>
        </div>
      </header>

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-500 mb-1">PENAWARAN UNTUK:</h3>
        <p className="text-lg font-bold text-gray-800">{quotation.customerName}</p>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-primary hover:bg-primary text-primary-foreground">
            <TableHead className="text-white">Deskripsi</TableHead>
            <TableHead className="text-white text-center">Jumlah</TableHead>
            <TableHead className="text-white text-right">Harga Satuan</TableHead>
            <TableHead className="text-white text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotation.items.map((item, index) => (
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
          <div className="flex justify-between font-bold text-lg border-t-2 border-gray-200 pt-2 text-gray-900">
            <span>TOTAL PENAWARAN:</span>
            <span>{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(quotation.total)}</span>
          </div>
        </div>
      </div>

      <footer className="text-center text-xs text-gray-400 mt-16 pt-4 border-t border-gray-200">
        <p>Hormat kami, {companyInfo?.name}.</p>
        <p>Penawaran ini berlaku hingga tanggal yang tertera di atas.</p>
      </footer>
    </div>
  )
};

export function PrintQuotationDialog({ open, onOpenChange, quotation }: PrintQuotationDialogProps) {
  const { settings: companyInfo } = useCompanySettings();

  const generateQuotationPdf = () => {
    if (!quotation) return;

    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    let y = 20;

    if (companyInfo?.logo) {
      try { doc.addImage(companyInfo.logo, 'PNG', 15, y, 40, 15); } catch (e) { console.error(e); }
    }
    doc.setFontSize(18).setFont("helvetica", "bold").text(companyInfo?.name || '', 15, y + 20);
    doc.setFontSize(10).setFont("helvetica", "normal").text(companyInfo?.address || '', 15, y + 25).text(companyInfo?.phone || '', 15, y + 30);

    doc.setFontSize(22).setFont("helvetica", "bold").setTextColor(150).text("PENAWARAN", 200, y, { align: 'right' });
    doc.setFontSize(10).setTextColor(0);
    const createdAt = quotation.createdAt ? new Date(quotation.createdAt) : new Date();
    const validUntil = quotation.validUntil ? new Date(quotation.validUntil) : new Date();
    doc.text(`No: ${quotation.id}`, 200, y + 7, { align: 'right' });
    doc.text(`Tanggal: ${format(createdAt, "d MMMM yyyy", { locale: id })}`, 200, y + 12, { align: 'right' });
    doc.text(`Berlaku Hingga: ${format(validUntil, "d MMMM yyyy", { locale: id })}`, 200, y + 17, { align: 'right' });

    y += 45;
    doc.setFontSize(10).setTextColor(100).text("PENAWARAN UNTUK:", 15, y);
    doc.setFontSize(12).setFont("helvetica", "bold").setTextColor(0).text(quotation.customerName, 15, y + 5);
    y += 15;

    const tableData = quotation.items.map(item => [
      item.product.name,
      item.quantity,
      new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price),
      new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price * item.quantity)
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Deskripsi', 'Jumlah', 'Harga Satuan', 'Total']],
      body: tableData,
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didDrawPage: (data) => {
        doc.setFontSize(8).setTextColor(150).text(`Hormat kami, ${companyInfo?.name}.`, data.settings.margin.left, pageHeight - 10);
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12).setFont("helvetica", "bold").text("TOTAL PENAWARAN:", 140, finalY + 17).text(new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(quotation.total), 200, finalY + 17, { align: 'right' });

    const filename = `MDIPenawaran-${quotation.id}-${format(new Date(), 'yyyyMMdd-HHmmss')}.pdf`;
    doc.save(filename);
  };

  const handlePrint = () => {
    generateQuotationPdf();
  };

  if (!quotation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <div id="printable-area">
          <QuotationTemplate quotation={quotation} companyInfo={companyInfo} />
        </div>
        <DialogFooter className="p-4 border-t bg-muted/40 no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}><X className="mr-2 h-4 w-4" /> Tutup</Button>
          <Button onClick={handlePrint}><Printer className="mr-2 h-4 w-4" /> Cetak / Simpan PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}