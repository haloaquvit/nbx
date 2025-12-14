"use client"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ProductionRecord } from "@/types/production"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { Printer, X } from "lucide-react"
import { useCompanySettings, CompanyInfo } from "@/hooks/useCompanySettings"
import { useRef } from "react"

interface ProductionPrintDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  production: ProductionRecord | null
}

const ProductionTemplate = ({ production, companyInfo }: { production: ProductionRecord, companyInfo?: CompanyInfo | null }) => {
  const createdAt = production.createdAt ? new Date(production.createdAt) : null;

  return (
    <div className="p-8 bg-white text-black" style={{ fontFamily: 'Arial, sans-serif', maxWidth: '210mm' }}>
      {/* Header */}
      <header className="flex justify-between items-start mb-8 pb-4 border-b-2 border-gray-300">
        <div className="flex items-start gap-4">
          {companyInfo?.logo && (
            <img
              src={companyInfo.logo}
              alt="Company Logo"
              className="max-h-16 w-auto object-contain"
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {companyInfo?.name || 'Nama Perusahaan'}
            </h1>
            <div className="text-sm text-gray-600 space-y-0.5">
              <p>{companyInfo?.address || 'Alamat Perusahaan'}</p>
              <p>{companyInfo?.phone || 'Telepon Perusahaan'}</p>
            </div>
          </div>
        </div>
        <div className="text-right bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h2 className="text-2xl font-bold text-blue-800 mb-2">LAPORAN PRODUKSI</h2>
          <div className="space-y-1 text-sm">
            <p className="text-gray-700">
              <span className="font-semibold">Ref:</span><br/>
              <span className="font-mono font-bold text-blue-900">{production.ref}</span>
            </p>
            <p className="text-gray-700">
              <span className="font-semibold">Tanggal:</span><br/>
              <span className="font-medium">{createdAt ? format(createdAt, "d MMMM yyyy HH:mm", { locale: id }) : 'N/A'}</span>
            </p>
          </div>
        </div>
      </header>

      {/* Production Info */}
      <div className="mb-6">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Informasi Produksi:</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-1">Produk</p>
              <p className="text-lg font-bold text-gray-900">{production.productName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Jumlah Produksi</p>
              <p className="text-lg font-bold text-blue-600">{production.quantity} unit</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Konsumsi BOM</p>
              <p className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                production.consumeBOM
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-200 text-gray-700'
              }`}>
                {production.consumeBOM ? 'Ya - Bahan dikurangi' : 'Tidak - Tanpa konsumsi bahan'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Dicatat Oleh</p>
              <p className="text-sm font-medium text-gray-900">{production.createdByName || production.user_input_name || 'System'}</p>
            </div>
          </div>
          {production.note && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Catatan</p>
              <p className="text-sm text-gray-700 italic">{production.note}</p>
            </div>
          )}
        </div>
      </div>

      {/* BOM Details */}
      {production.consumeBOM && production.bomSnapshot && production.bomSnapshot.length > 0 && (
        <div className="mb-6">
          <h3 className="text-base font-bold text-gray-900 mb-3">Detail Konsumsi BOM (Bill of Materials)</h3>
          <div className="border border-gray-300 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Material</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Satuan</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Qty per Unit</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 bg-blue-50">Total Dikonsumsi</th>
                </tr>
              </thead>
              <tbody>
                {production.bomSnapshot.map((item, index) => (
                  <tr key={index} className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.materialName}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{item.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{item.quantity}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700 bg-blue-50">
                      {(item.quantity * production.quantity).toFixed(2)} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2 italic">
            * BOM snapshot menunjukkan bahan yang dikonsumsi saat produksi dilakukan
          </p>
        </div>
      )}

      {/* Summary Box */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-bold text-blue-900 mb-4">Ringkasan Produksi</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-blue-700 mb-1">Total Unit Diproduksi</p>
            <p className="text-3xl font-bold text-blue-900">{production.quantity}</p>
          </div>
          <div>
            <p className="text-sm text-blue-700 mb-1">Status Konsumsi BOM</p>
            <p className="text-xl font-bold text-blue-900">
              {production.consumeBOM ? `${production.bomSnapshot?.length || 0} Material` : 'Tidak Ada'}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 pt-6 border-t-2 border-gray-300">
        <div className="grid grid-cols-2 gap-8">
          <div>
            <p className="text-xs text-gray-500 mb-1">Dibuat Oleh</p>
            <div className="mt-12 border-t border-gray-400 pt-1">
              <p className="text-sm font-semibold text-gray-900">{production.createdByName || production.user_input_name || 'System'}</p>
              <p className="text-xs text-gray-500">Staff Produksi</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Disetujui Oleh</p>
            <div className="mt-12 border-t border-gray-400 pt-1">
              <p className="text-sm font-semibold text-gray-900">___________________</p>
              <p className="text-xs text-gray-500">Supervisor/Manager</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 text-center mt-6">
          Dokumen ini dicetak pada {format(new Date(), "d MMMM yyyy HH:mm:ss", { locale: id })}
        </p>
      </footer>
    </div>
  )
}

export function ProductionPrintDialog({ open, onOpenChange, production }: ProductionPrintDialogProps) {
  const { settings } = useCompanySettings()
  const printRef = useRef<HTMLDivElement>(null)

  if (!production) return null

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const content = printRef.current?.innerHTML || ''

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Produksi - ${production.ref}</title>
          <style>
            @media print {
              @page {
                size: A4;
                margin: 10mm;
              }
              body {
                margin: 0;
                padding: 0;
              }
            }
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
            }
            * {
              box-sizing: border-box;
            }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `)

    printWindow.document.close()
    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Preview Laporan Produksi - {production.ref}
          </DialogTitle>
        </DialogHeader>

        {/* Print Preview */}
        <div ref={printRef} className="border rounded-lg overflow-hidden bg-white">
          <ProductionTemplate production={production} companyInfo={settings} />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Tutup
          </Button>
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
            <Printer className="h-4 w-4 mr-2" />
            Cetak
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
