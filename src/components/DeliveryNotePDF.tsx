"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { FileDown } from "lucide-react"
import { Delivery, TransactionDeliveryInfo } from "@/types/delivery"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { useCompanySettings } from "@/hooks/useCompanySettings"
import { useTransactions } from "@/hooks/useTransactions"

interface DeliveryNotePDFProps {
  delivery: Delivery
  transactionInfo?: TransactionDeliveryInfo
  children?: React.ReactNode
}

export function DeliveryNotePDF({ delivery, transactionInfo, children }: DeliveryNotePDFProps) {
  const { settings } = useCompanySettings()
  const { transactions } = useTransactions()
  const printRef = React.useRef<HTMLDivElement>(null)

  // Get transaction info if not provided
  const transaction = transactionInfo || transactions?.find(t => t.id === delivery.transactionId)

  const handlePrintPDF = async () => {
    if (!printRef.current) return

    try {
      // Create canvas from the print element
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      })

      // Create PDF with A4 half size (A5-like)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [148, 210] // Half A4 width
      })

      const imgWidth = 148 // Half A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight)
      pdf.save(`Surat-Jalan-${delivery.transactionId}-${delivery.deliveryNumber}.pdf`)
    } catch (error) {
      console.error('Error generating PDF:', error)
    }
  }

  if (!transaction) {
    return (
      <Button disabled size="sm" variant="outline">
        Loading...
      </Button>
    )
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
        PDF
      </Button>

      {/* Hidden printable content - Half A4 size */}
      <div className="fixed -left-[9999px] top-0">
        <div ref={printRef} className="w-[560px] bg-white p-6" style={{ fontSize: '12px' }}>
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              {settings?.logo && (
                <img 
                  src={settings.logo} 
                  alt="Company Logo" 
                  className="h-12 w-auto mb-3"
                />
              )}
              <div>
                <h1 className="text-lg font-bold text-gray-900">
                  {settings?.companyName || 'PT. Aquavit'}
                </h1>
                <p className="text-xs text-gray-600">
                  {settings?.address || 'Alamat Perusahaan'}
                </p>
                <p className="text-xs text-gray-600">
                  Telp: {settings?.phone || '-'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold text-gray-900">SURAT JALAN</h2>
              <p className="text-xs font-medium">No: {delivery.transactionId}-{delivery.deliveryNumber}</p>
            </div>
          </div>

          {/* Customer & Delivery Info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Kepada Yth:</h3>
              <div className="bg-gray-50 p-3 rounded text-xs">
                <p className="font-medium">{transaction.customerName}</p>
                <p className="text-gray-600">Customer</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span>Tanggal:</span>
                <span className="font-medium">{format(delivery.deliveryDate, "dd/MM/yyyy", { locale: id })}</span>
              </div>
              <div className="flex justify-between">
                <span>Jam:</span>
                <span className="font-medium">{format(delivery.deliveryDate, "HH:mm", { locale: id })}</span>
              </div>
              <div className="flex justify-between">
                <span>Driver:</span>
                <span className="font-medium">{delivery.driverName || '-'}</span>
              </div>
              {delivery.helperName && (
                <div className="flex justify-between">
                  <span>Helper:</span>
                  <span className="font-medium">{delivery.helperName}</span>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">No</th>
                  <th className="border border-gray-300 px-2 py-1 text-left">Nama Barang</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">Qty</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">Satuan</th>
                  <th className="border border-gray-300 px-2 py-1 text-center">Dimensi</th>
                </tr>
              </thead>
              <tbody>
                {delivery.items.map((item, index) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-2 py-1">{index + 1}</td>
                    <td className="border border-gray-300 px-2 py-1">{item.productName}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.quantityDelivered}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">{item.unit}</td>
                    <td className="border border-gray-300 px-2 py-1 text-center">
                      {item.width && item.height ? `${item.width} x ${item.height}` : '-'}
                    </td>
                  </tr>
                ))}
                {/* Add empty rows to fill space */}
                {Array.from({ length: Math.max(0, 3 - delivery.items.length) }).map((_, index) => (
                  <tr key={`empty-${index}`}>
                    <td className="border border-gray-300 px-2 py-1 h-6">{delivery.items.length + index + 1}</td>
                    <td className="border border-gray-300 px-2 py-1"></td>
                    <td className="border border-gray-300 px-2 py-1"></td>
                    <td className="border border-gray-300 px-2 py-1"></td>
                    <td className="border border-gray-300 px-2 py-1"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Catatan:</h3>
            <div className="bg-gray-50 p-3 rounded min-h-[60px]">
              <p className="text-xs">{delivery.notes || 'Barang sudah diterima dalam kondisi baik'}</p>
            </div>
          </div>

          {/* Important Notes */}
          <div className="mb-6">
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
              <p className="text-xs text-yellow-800 font-medium">Penting:</p>
              <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                <li>• Barang yang sudah diterima tidak dapat dikembalikan</li>
                <li>• Harap periksa kondisi barang sebelum menandatangani</li>
                <li>• Simpan surat jalan ini sebagai bukti pengiriman</li>
              </ul>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-6">
            <div className="text-center">
              <p className="text-xs font-semibold mb-12">Yang Mengirim</p>
              <div className="border-t border-gray-400">
                <p className="mt-2 text-xs">{delivery.driverName || '_______________'}</p>
                <p className="text-xs text-gray-600">Driver</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold mb-12">Yang Menerima</p>
              <div className="border-t border-gray-400">
                <p className="mt-2 text-xs">_______________</p>
                <p className="text-xs text-gray-600">{transaction.customerName}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-3 border-t border-gray-300 text-center">
            <p className="text-xs text-gray-500">
              Dicetak pada: {format(new Date(), "dd MMMM yyyy, HH:mm", { locale: id })} WIB
            </p>
          </div>
        </div>
      </div>
    </>
  )
}