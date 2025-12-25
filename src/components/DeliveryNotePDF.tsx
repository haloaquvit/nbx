"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileDown, Printer, Download } from "lucide-react"
import { Delivery, TransactionDeliveryInfo } from "@/types/delivery"
import { format, isValid } from "date-fns"
import { id } from "date-fns/locale/id"

// Helper function to safely format date
function safeFormatDate(date: Date | string | null | undefined, formatStr: string): string {
  if (!date) return '-';
  try {
    const dateObj = date instanceof Date ? date : new Date(date);
    if (!isValid(dateObj)) return '-';
    return format(dateObj, formatStr, { locale: id });
  } catch {
    return '-';
  }
}
import { useCompanySettings } from "@/hooks/useCompanySettings"
import { useTransactions } from "@/hooks/useTransactions"
import { createCompressedPDF } from "@/utils/pdfUtils"

interface DeliveryNotePDFProps {
  delivery: Delivery
  transactionInfo?: TransactionDeliveryInfo
  children?: React.ReactNode
}

export function DeliveryNotePDF({ delivery, transactionInfo, children }: DeliveryNotePDFProps) {
  const { settings } = useCompanySettings()
  const { transactions } = useTransactions()
  const printRef = React.useRef<HTMLDivElement>(null)
  const dotMatrixRef = React.useRef<HTMLDivElement>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  // Get transaction info if not provided
  const transaction = transactionInfo || transactions?.find(t => t.id === delivery.transactionId)

  const handlePrintPDF = async () => {
    if (!printRef.current) {
      console.error('Print ref is null')
      return
    }

    try {
      console.log('Starting PDF generation...', {
        element: printRef.current,
        width: printRef.current.offsetWidth,
        height: printRef.current.offsetHeight
      })
      
      await createCompressedPDF(
        printRef.current,
        `Surat-Jalan-${delivery.transactionId}-${delivery.deliveryNumber}.pdf`,
        [210, 297], // A4 size (210mm x 297mm)
        200 // Max 200KB for A4
      )
      console.log('PDF generation completed successfully')
      setIsDialogOpen(false)
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Gagal membuat PDF: ' + (error as Error).message)
    }
  }

  const handleDotMatrixPrint = () => {
    if (!dotMatrixRef.current) {
      console.error('Dot matrix ref is null')
      return
    }

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Cetak Dot Matrix</title>
            <style>
              body {
                font-family: 'Courier New', Courier, monospace;
                font-size: 10pt;
                margin: 0;
                padding: 10mm;
                width: 210mm;
                background: #fff;
              }
              table { width: 100%; border-collapse: collapse; }
              td, th { padding: 2px; }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .border-y { border-top: 1px dashed; border-bottom: 1px dashed; }
              .border-b { border-bottom: 1px dashed; }
              .py-1 { padding-top: 4px; padding-bottom: 4px; }
              .mb-1 { margin-bottom: 4px; }
              .mb-2 { margin-bottom: 8px; }
              .mt-2 { margin-top: 8px; }
              .mt-3 { margin-top: 12px; }
              .mx-auto { margin-left: auto; margin-right: auto; }
              .max-h-12 { max-height: 48px; }
              .flex { display: flex; }
              .justify-between { justify-content: space-between; }
              @media print {
                body { width: 210mm; }
              }
            </style>
          </head>
          <body>
            ${dotMatrixRef.current.innerHTML}
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
      printWindow.close()
      setIsDialogOpen(false)
    }
  }

  const handleButtonClick = () => {
    setIsDialogOpen(true)
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
      {children ? (
        <div onClick={handleButtonClick} className="cursor-pointer">
          {children}
        </div>
      ) : (
        <Button
          onClick={handleButtonClick}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <FileDown className="h-4 w-4" />
          PDF
        </Button>
      )}

      {/* Print Format Selection Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih Format Cetak</DialogTitle>
            <DialogDescription>
              Pilih format cetak untuk surat jalan {delivery.transactionId}-{delivery.deliveryNumber}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={handleDotMatrixPrint}
              className="justify-start gap-3 h-12"
              variant="outline"
            >
              <Printer className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Cetak Dot Matrix</div>
                <div className="text-xs text-muted-foreground">Format sesuai faktur dot matrix</div>
              </div>
            </Button>
            <Button
              onClick={handlePrintPDF}
              className="justify-start gap-3 h-12"
              variant="outline"
            >
              <Download className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Download PDF</div>
                <div className="text-xs text-muted-foreground">Format PDF 8.5" x 5.5"</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden printable content - Full A4 size */}
      <div className="fixed -left-[9999px] top-0 z-[-1]">
        <div ref={printRef} className="w-[794px] h-auto bg-white p-8 border" style={{ fontSize: '14px', minHeight: '1123px' }}>
          {/* Header */}
          <div className="flex justify-between items-start mb-8 pb-6 border-b-2 border-gray-200">
            <div>
              {settings?.logo && (
                <img 
                  src={settings.logo} 
                  alt="Company Logo" 
                  className="h-16 w-auto mb-4"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  {settings?.name || 'PT. AQUAVIT'}
                </h1>
                <p className="text-sm text-gray-600">
                  {settings?.address || 'Alamat Perusahaan'}
                </p>
                <p className="text-sm text-gray-600">
                  Telp: {settings?.phone || '-'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-3xl font-bold text-gray-300 mb-4">SURAT JALAN</h2>
              <div className="text-sm text-gray-600 space-y-1">
                <p><strong className="text-gray-800">No:</strong> {delivery.transactionId}-{delivery.deliveryNumber}</p>
                <p><strong className="text-gray-800">Tanggal:</strong> {safeFormatDate(delivery.deliveryDate, "d MMMM yyyy")}</p>
                <p><strong className="text-gray-800">Jam:</strong> {safeFormatDate(delivery.deliveryDate, "HH:mm")} WIB</p>
              </div>
            </div>
          </div>

          {/* Customer & Delivery Info */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Dikirim Kepada:</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-lg font-bold text-gray-900">{transaction.customerName}</p>
                <p className="text-sm text-gray-600 mt-1">Customer</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-600">Driver:</span>
                <span className="font-medium text-gray-900">{delivery.driverName || '-'}</span>
              </div>
              {delivery.helperName && (
                <div className="flex justify-between border-b border-gray-200 pb-2">
                  <span className="text-gray-600">Helper:</span>
                  <span className="font-medium text-gray-900">{delivery.helperName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span className="font-medium text-green-600">Siap Dikirim</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daftar Barang</h3>
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left text-gray-700 font-semibold">No</th>
                  <th className="border border-gray-300 px-4 py-3 text-left text-gray-700 font-semibold">Nama Barang</th>
                  <th className="border border-gray-300 px-4 py-3 text-center text-gray-700 font-semibold">Antar</th>
                  <th className="border border-gray-300 px-4 py-3 text-center text-gray-700 font-semibold">Satuan</th>
                  <th className="border border-gray-300 px-4 py-3 text-center text-gray-700 font-semibold">Total Antar</th>
                  <th className="border border-gray-300 px-4 py-3 text-center text-gray-700 font-semibold">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {delivery.items.map((item, index) => {
                  // FIXED: Calculate historical cumulative totals up to and including this delivery
                  // Get the delivery summary item for baseline data
                  const deliverySummaryItem = transaction.deliverySummary?.find(ds => ds.productId === item.productId)
                  const orderedQuantity = deliverySummaryItem?.orderedQuantity || 0
                  
                  // Calculate cumulative delivered quantity up to and including this delivery
                  // by finding all deliveries for this product up to this delivery's creation date
                  const deliveryCreatedAt = delivery.createdAt ? new Date(delivery.createdAt).getTime() : Date.now()
                  const cumulativeDeliveredAtThisPoint = transaction.deliveries
                    ? transaction.deliveries
                        .filter(d => {
                          const dCreatedAt = d.createdAt ? new Date(d.createdAt).getTime() : 0
                          return !isNaN(dCreatedAt) && !isNaN(deliveryCreatedAt) && dCreatedAt <= deliveryCreatedAt
                        })
                        .reduce((sum, d) => {
                          const productItem = d.items.find(di => di.productId === item.productId)
                          return sum + (productItem?.quantityDelivered || 0)
                        }, 0)
                    : item.quantityDelivered // Fallback to current delivery quantity if no deliveries array
                  
                  // Calculate remaining quantity at this point in time
                  // For history view without complete transaction data, show 0 remaining
                  const remainingAtThisPoint = transaction.deliverySummary 
                    ? orderedQuantity - cumulativeDeliveredAtThisPoint
                    : 0
                  
                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="border border-gray-300 px-4 py-3 text-center">{index + 1}</td>
                      <td className="border border-gray-300 px-4 py-3 font-medium text-gray-800">{item.productName}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center font-medium">{item.quantityDelivered}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center text-gray-600">{item.unit}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center font-medium text-blue-600">{cumulativeDeliveredAtThisPoint}</td>
                      <td className="border border-gray-300 px-4 py-3 text-center font-medium text-orange-600">{remainingAtThisPoint}</td>
                    </tr>
                  )
                })}
                {/* Add empty rows to fill space */}
                {Array.from({ length: Math.max(0, 5 - delivery.items.length) }).map((_, index) => (
                  <tr key={`empty-${index}`}>
                    <td className="border border-gray-300 px-4 py-3 h-12 text-center text-gray-400">{delivery.items.length + index + 1}</td>
                    <td className="border border-gray-300 px-4 py-3"></td>
                    <td className="border border-gray-300 px-4 py-3"></td>
                    <td className="border border-gray-300 px-4 py-3"></td>
                    <td className="border border-gray-300 px-4 py-3"></td>
                    <td className="border border-gray-300 px-4 py-3"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Catatan:</h3>
            <div className="bg-gray-50 p-4 rounded-lg min-h-[80px] border border-gray-200">
              <p className="text-sm text-gray-700">{delivery.notes || 'Barang sudah diterima dalam kondisi baik dan sesuai pesanan.'}</p>
            </div>
          </div>

          {/* Important Notes */}
          <div className="mb-8">
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
              <p className="text-sm text-yellow-800 font-semibold mb-2">Ketentuan Penting:</p>
              <ul className="text-sm text-yellow-700 space-y-2">
                <li>• Barang yang sudah diterima dan ditandatangani tidak dapat dikembalikan</li>
                <li>• Harap periksa kondisi dan jumlah barang sebelum menandatangani surat jalan</li>
                <li>• Simpan surat jalan ini sebagai bukti resmi pengiriman barang</li>
                <li>• Jika ada kerusakan atau kekurangan, harap segera laporkan kepada penanggung jawab</li>
              </ul>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12">
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 mb-16">Yang Mengirim</p>
              <div className="border-t-2 border-gray-400 pt-3">
                <p className="text-sm font-medium text-gray-900">{delivery.driverName || '_______________'}</p>
                <p className="text-sm text-gray-600 mt-1">Driver Pengiriman</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700 mb-16">Yang Menerima</p>
              <div className="border-t-2 border-gray-400 pt-3">
                <p className="text-sm font-medium text-gray-900">_______________</p>
                <p className="text-sm text-gray-600 mt-1">{transaction.customerName}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t-2 border-gray-300 text-center">
            <div className="text-sm text-gray-500 space-y-1">
              <p>Dicetak pada: {format(new Date(), "d MMMM yyyy, HH:mm", { locale: id })} WIB</p>
              <p>Dokumen ini adalah salinan resmi surat jalan pengiriman barang</p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden dot matrix format */}
      <div className="fixed -left-[9999px] top-0 z-[-1]">
        <div ref={dotMatrixRef} className="font-mono">
          <div className="flex justify-between items-start mb-2">
            <div className="text-left">
              <h1 className="text-sm font-bold">{settings?.name || 'PT. AQUAVIT'}</h1>
              <p className="text-xs">{settings?.address || 'Alamat Perusahaan'}</p>
              <p className="text-xs">Telp: {settings?.phone || '-'}</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold mb-1">SURAT JALAN</div>
              <div className="text-xs space-y-0.5">
                <div><strong>No:</strong> {delivery.transactionId}-{delivery.deliveryNumber}</div>
                <div><strong>Tgl:</strong> {safeFormatDate(delivery.deliveryDate, "dd/MM/yy HH:mm")}</div>
                <div><strong>Kepada:</strong> {transaction.customerName}</div>
                <div><strong>Driver:</strong> {delivery.driverName || '-'}</div>
                {delivery.helperName && (
                  <div><strong>Helper:</strong> {delivery.helperName}</div>
                )}
              </div>
            </div>
          </div>
          
          <div className="border-b border-dashed border-black mb-2"></div>
          
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dashed border-black">
                <th className="text-left font-normal pb-1">No</th>
                <th className="text-left font-normal pb-1">Nama Barang</th>
                <th className="text-right font-normal pb-1">Antar</th>
                <th className="text-center font-normal pb-1">Sat</th>
                <th className="text-right font-normal pb-1">Total Antar</th>
                <th className="text-right font-normal pb-1">Sisa</th>
              </tr>
            </thead>
            <tbody>
              {delivery.items.map((item, index) => {
                // FIXED: Calculate historical cumulative totals up to and including this delivery
                // Get the delivery summary item for baseline data
                const deliverySummaryItem = transaction.deliverySummary?.find(ds => ds.productId === item.productId)
                const orderedQuantity = deliverySummaryItem?.orderedQuantity || 0
                
                // Calculate cumulative delivered quantity up to and including this delivery
                // by finding all deliveries for this product up to this delivery's creation date
                const deliveryCreatedAt2 = delivery.createdAt ? new Date(delivery.createdAt).getTime() : Date.now()
                const cumulativeDeliveredAtThisPoint = transaction.deliveries
                  ? transaction.deliveries
                      .filter(d => {
                        const dCreatedAt = d.createdAt ? new Date(d.createdAt).getTime() : 0
                        return !isNaN(dCreatedAt) && !isNaN(deliveryCreatedAt2) && dCreatedAt <= deliveryCreatedAt2
                      })
                      .reduce((sum, d) => {
                        const productItem = d.items.find(di => di.productId === item.productId)
                        return sum + (productItem?.quantityDelivered || 0)
                      }, 0)
                  : item.quantityDelivered // Fallback to current delivery quantity if no deliveries array
                
                // Calculate remaining quantity at this point in time
                // For history view without complete transaction data, show 0 remaining
                const remainingAtThisPoint = transaction.deliverySummary 
                  ? orderedQuantity - cumulativeDeliveredAtThisPoint
                  : 0
                
                return (
                  <tr key={item.id}>
                    <td className="pt-1 align-top">{index + 1}</td>
                    <td className="pt-1 align-top">{item.productName}</td>
                    <td className="pt-1 text-right align-top">{item.quantityDelivered}</td>
                    <td className="pt-1 text-center align-top">{item.unit}</td>
                    <td className="pt-1 text-right align-top">{cumulativeDeliveredAtThisPoint}</td>
                    <td className="pt-1 text-right align-top">{remainingAtThisPoint}</td>
                  </tr>
                )
              })}
              {/* Add empty rows if needed */}
              {delivery.items.length < 5 && Array.from({ length: 5 - delivery.items.length }).map((_, index) => (
                <tr key={`empty-${index}`}>
                  <td className="pt-1">{delivery.items.length + index + 1}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="mt-2 pt-1 border-t border-dashed border-black text-xs">
            <div><strong>Catatan:</strong> {delivery.notes || 'Barang sudah diterima dalam kondisi baik'}</div>
          </div>
          
          <div className="flex justify-between mt-3 text-xs">
            <div className="text-center">
              <div className="mb-2">Yang Mengirim</div>
              <div style={{ height: '30px' }}></div>
              <div className="border-t border-black inline-block px-4">
                <div className="mt-1">{delivery.driverName || '_______________'}</div>
                <div>Driver</div>
              </div>
            </div>
            <div className="text-center">
              <div className="mb-2">Yang Menerima</div>
              <div style={{ height: '30px' }}></div>
              <div className="border-t border-black inline-block px-4">
                <div className="mt-1">_______________</div>
                <div>{transaction.customerName}</div>
              </div>
            </div>
          </div>
          
          <div className="text-center mt-3 text-xs border-t border-dashed border-black pt-1">
            Dicetak: {format(new Date(), "dd/MM/yy HH:mm", { locale: id })}
          </div>
        </div>
      </div>
    </>
  )
}