"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { FileDown, Printer } from "lucide-react"
import { PurchaseOrder } from "@/types/purchaseOrder"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { useCompanySettings } from "@/hooks/useCompanySettings"
import { createCompressedPDF } from "@/utils/pdfUtils"

interface PurchaseOrderPDFProps {
  purchaseOrder: PurchaseOrder
  children?: React.ReactNode
}

export function PurchaseOrderPDF({ purchaseOrder, children }: PurchaseOrderPDFProps) {
  const { settings } = useCompanySettings()
  const printRef = React.useRef<HTMLDivElement>(null)

  const handlePrintPDF = async () => {
    if (!printRef.current) return

    try {
      await createCompressedPDF(
        printRef.current,
        `PO-${purchaseOrder.id}.pdf`,
        [210, 297], // A4 format
        100 // Max 100KB
      )
    } catch (error) {
      console.error('Error generating PDF:', error)
    }
  }

  return (
    <>
      <Button
        onClick={handlePrintPDF}
        size="sm"
        variant="outline"
        className="gap-2"
      >
        <FileDown className="h-4 w-4" />
        Cetak PO
      </Button>

      {/* Hidden printable content */}
      <div className="fixed -left-[9999px] top-0">
        <div ref={printRef} className="w-[794px] bg-white p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              {settings?.logo && (
                <img 
                  src={settings.logo} 
                  alt="Company Logo" 
                  className="h-16 w-auto mb-4"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {settings?.companyName || 'PT. Aquavit'}
                </h1>
                <p className="text-sm text-gray-600">
                  {settings?.address || 'Alamat Perusahaan'}
                </p>
                <p className="text-sm text-gray-600">
                  Telp: {settings?.phone || '-'} | Email: {settings?.email || '-'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-900">PURCHASE ORDER</h2>
              <p className="text-sm font-semibold">No. PO: {purchaseOrder.id}</p>
              <p className="text-sm">Tanggal: {format(purchaseOrder.createdAt, "dd MMMM yyyy", { locale: id })}</p>
            </div>
          </div>

          {/* Supplier Info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Kepada:</h3>
              <div className="bg-gray-50 p-4 rounded">
                <p className="font-medium">{purchaseOrder.supplierName || 'Supplier'}</p>
                {purchaseOrder.supplierContact && (
                  <p className="text-sm text-gray-600">{purchaseOrder.supplierContact}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Detail Request:</h3>
              <div className="space-y-1">
                <p className="text-sm">Pemohon: {purchaseOrder.requestedBy}</p>
                {purchaseOrder.expectedDeliveryDate && (
                  <p className="text-sm">
                    Target Kirim: {format(purchaseOrder.expectedDeliveryDate, "dd MMMM yyyy", { locale: id })}
                  </p>
                )}
                <p className="text-sm">Status: {purchaseOrder.status}</p>
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div className="mb-8">
            <h3 className="font-semibold text-gray-900 mb-4">Detail Pembelian:</h3>
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">No</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Nama Barang</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">Jumlah</th>
                  <th className="border border-gray-300 px-4 py-2 text-center">Satuan</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Harga Satuan</th>
                  <th className="border border-gray-300 px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-4 py-2">1</td>
                  <td className="border border-gray-300 px-4 py-2">{purchaseOrder.materialName}</td>
                  <td className="border border-gray-300 px-4 py-2 text-center">{purchaseOrder.quantity}</td>
                  <td className="border border-gray-300 px-4 py-2 text-center">{purchaseOrder.unit}</td>
                  <td className="border border-gray-300 px-4 py-2 text-right">
                    {purchaseOrder.unitPrice ? `Rp ${purchaseOrder.unitPrice.toLocaleString('id-ID')}` : '-'}
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right font-semibold">
                    {purchaseOrder.totalCost ? `Rp ${purchaseOrder.totalCost.toLocaleString('id-ID')}` : '-'}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={5} className="border border-gray-300 px-4 py-2 text-right font-semibold">
                    GRAND TOTAL:
                  </td>
                  <td className="border border-gray-300 px-4 py-2 text-right font-bold">
                    {purchaseOrder.totalCost ? `Rp ${purchaseOrder.totalCost.toLocaleString('id-ID')}` : 'Rp 0'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {purchaseOrder.notes && (
            <div className="mb-8">
              <h3 className="font-semibold text-gray-900 mb-2">Catatan:</h3>
              <p className="text-sm bg-gray-50 p-4 rounded">{purchaseOrder.notes}</p>
            </div>
          )}

          {/* Terms */}
          <div className="mb-8">
            <h3 className="font-semibold text-gray-900 mb-2">Syarat & Ketentuan:</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Barang harus sesuai dengan spesifikasi yang diminta</li>
              <li>• Pengiriman sesuai dengan jadwal yang telah disepakati</li>
              <li>• Pembayaran akan dilakukan setelah barang diterima dengan baik</li>
              <li>• Harap konfirmasi penerimaan PO ini dalam 2 x 24 jam</li>
            </ul>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 mt-12">
            <div className="text-center">
              <p className="font-semibold mb-16">Diajukan oleh:</p>
              <div className="border-t border-gray-400">
                <p className="mt-2 text-sm">{purchaseOrder.requestedBy}</p>
                <p className="text-xs text-gray-600">Staff</p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold mb-16">Disetujui oleh:</p>
              <div className="border-t border-gray-400">
                <p className="mt-2 text-sm">_______________</p>
                <p className="text-xs text-gray-600">Manager</p>
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold mb-16">Supplier:</p>
              <div className="border-t border-gray-400">
                <p className="mt-2 text-sm">_______________</p>
                <p className="text-xs text-gray-600">{purchaseOrder.supplierName}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-300 text-center">
            <p className="text-xs text-gray-500">
              Dokumen ini dibuat secara elektronik dan sah tanpa tanda tangan basah
            </p>
          </div>
        </div>
      </div>
    </>
  )
}