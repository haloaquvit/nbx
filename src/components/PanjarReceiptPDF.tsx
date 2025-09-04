"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { EmployeeAdvance } from "@/types/employeeAdvance"
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { FileText, Download, Printer, Receipt } from "lucide-react"
import { ThermalPanjarDialog } from "./ThermalPanjarDialog"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { terbilang } from '@/utils/terbilang'
import { saveCompressedPDF } from '@/utils/pdfUtils'

interface PanjarReceiptPDFProps {
  advance: EmployeeAdvance
  companyName?: string
  companyAddress?: string
}

export function PanjarReceiptPDF({ 
  advance, 
  companyName = "AQUVIT",
  companyAddress = "Jl. Contoh No. 123, Kota ABC"
}: PanjarReceiptPDFProps) {
  const [isThermalDialogOpen, setIsThermalDialogOpen] = useState(false)

  const generatePDF = (action: 'download' | 'print' = 'download') => {
    // Custom size: 22cm x 10cm (220mm x 100mm)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [100, 220] // 10cm height x 22cm width
    })

    const pageWidth = 220
    const pageHeight = 100
    const margin = 20

    // Header Company - simplified
    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text('AQUVIT', pageWidth/2, 10, { align: 'center' })

    // Title
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('KWITANSI PANJAR KARYAWAN', pageWidth/2, 18, { align: 'center' })

    // Divider line
    doc.setLineWidth(0.3)
    doc.line(margin, 22, pageWidth - margin, 22)

    // Receipt details
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    
    const leftCol = margin + 5
    const rightCol = pageWidth/2 + 5
    let yPos = 30

    // Left column
    doc.setFont(undefined, 'bold')
    doc.text('No. Kwitansi:', leftCol, yPos)
    doc.setFont(undefined, 'normal') 
    doc.text(advance.id, leftCol + 35, yPos)

    yPos += 8
    doc.setFont(undefined, 'bold')
    doc.text('Tanggal:', leftCol, yPos)
    doc.setFont(undefined, 'normal')
    doc.text(format(advance.date, 'dd MMMM yyyy', { locale: id }), leftCol + 35, yPos)

    yPos += 8
    doc.setFont(undefined, 'bold')
    doc.text('Karyawan:', leftCol, yPos)
    doc.setFont(undefined, 'normal')
    doc.text(advance.employeeName, leftCol + 35, yPos)

    // Right column
    yPos = 38
    if (advance.accountName) {
      doc.setFont(undefined, 'bold')
      doc.text('Dibayar dari:', rightCol, yPos)
      doc.setFont(undefined, 'normal')
      doc.text(advance.accountName, rightCol + 35, yPos)
      yPos += 8
    }

    yPos += 8
    doc.setFont(undefined, 'bold')
    doc.text('Sisa Panjar:', rightCol, yPos)
    doc.setFont(undefined, 'normal')
    const remainingText = new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR' 
    }).format(advance.remainingAmount)
    doc.text(remainingText, rightCol + 35, yPos)

    // Amount box (increased height for terbilang)
    yPos = 48
    doc.setFillColor(248, 249, 250)
    doc.rect(leftCol, yPos, pageWidth - (margin * 2) - 10, 25, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.rect(leftCol, yPos, pageWidth - (margin * 2) - 10, 25, 'S')

    doc.setFontSize(10)
    doc.setFont(undefined, 'bold')
    doc.text('JUMLAH PANJAR:', leftCol + 3, yPos + 6)
    
    doc.setFontSize(14)
    doc.setTextColor(220, 38, 127) // Pink color
    const amountText = new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR' 
    }).format(advance.amount)
    doc.text(amountText, pageWidth - margin - 8, yPos + 9, { align: 'right' })
    doc.setTextColor(0, 0, 0) // Reset to black
    
    // Add terbilang (amount in words)
    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    const terbilangText = `(Terbilang: ${terbilang(advance.amount)})`
    const terbilangLines = doc.splitTextToSize(terbilangText, pageWidth - (margin * 2) - 20)
    doc.text(terbilangLines, leftCol + 3, yPos + 15)
    doc.setFont(undefined, 'normal')

    // Repayment history if any
    if (advance.repayments && advance.repayments.length > 0) {
      yPos = 76
      doc.setFontSize(9)
      doc.setFont(undefined, 'bold')
      doc.text('RIWAYAT PEMBAYARAN:', leftCol, yPos)
      
      yPos += 6
      doc.setFontSize(8)
      doc.setFont(undefined, 'normal')
      
      advance.repayments.forEach((repayment, index) => {
        const repayAmount = new Intl.NumberFormat('id-ID', { 
          style: 'currency', 
          currency: 'IDR' 
        }).format(repayment.amount)
        const repayDate = format(repayment.date, 'dd/MM/yyyy')
        doc.text(`${index + 1}. ${repayDate} - ${repayAmount} (oleh: ${repayment.recordedBy})`, leftCol + 5, yPos)
        yPos += 4
      })
    }

    // Signature section
    const signatureY = 85 // Fixed position for small receipt
    const colWidth = (pageWidth - (margin * 2) - 20) / 3
    
    // Signature boxes
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.3)
    doc.setFontSize(8)
    
    // Disetujui oleh
    const col1X = leftCol
    doc.text('Disetujui:', col1X, signatureY)
    doc.rect(col1X, signatureY + 2, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama:', col1X + 1, signatureY + 16)
    doc.line(col1X + 12, signatureY + 16, col1X + colWidth - 2, signatureY + 16)

    // Penerima (Karyawan)  
    const col2X = leftCol + colWidth + 7
    doc.setFontSize(8)
    doc.text('Penerima:', col2X, signatureY)
    doc.rect(col2X, signatureY + 2, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama:', col2X + 1, signatureY + 16)
    doc.line(col2X + 12, signatureY + 16, col2X + colWidth - 2, signatureY + 16)

    // Yang mengeluarkan
    const col3X = leftCol + (colWidth * 2) + 14
    doc.setFontSize(8)
    doc.text('Yang Keluar:', col3X, signatureY)
    doc.rect(col3X, signatureY + 2, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama:', col3X + 1, signatureY + 16)
    doc.line(col3X + 12, signatureY + 16, col3X + colWidth - 2, signatureY + 16)

    // Footer
    doc.setFontSize(8)
    doc.setTextColor(128, 128, 128)
    doc.text('Kwitansi panjar dicetak secara otomatis', pageWidth/2, pageHeight - 10, { align: 'center' })
    doc.text(`Dicetak pada: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth/2, pageHeight - 6, { align: 'center' })

    // Action based on type
    if (action === 'print') {
      doc.autoPrint()
      window.open(doc.output('bloburl'), '_blank')
    } else {
      const fileName = `kwitansi-panjar-${advance.employeeName.replace(/\s+/g, '-')}-${format(advance.date, 'yyyy-MM-dd')}.pdf`
      saveCompressedPDF(doc, fileName, 100)
    }
  }

  return (
    <>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={() => generatePDF('download')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-2"
        >
          <Download className="h-3 w-3 mr-1" />
          PDF
        </Button>
        
        <Button
          size="sm"
          variant="outline"
          onClick={() => generatePDF('print')}
          className="border-gray-300 text-gray-600 hover:bg-gray-50 px-2"
        >
          <Printer className="h-3 w-3 mr-1" />
          Print
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setIsThermalDialogOpen(true)}
          className="border-green-300 text-green-600 hover:bg-green-50 px-2"
        >
          <Receipt className="h-3 w-3 mr-1" />
          Struk
        </Button>
      </div>

      <ThermalPanjarDialog
        open={isThermalDialogOpen}
        onOpenChange={setIsThermalDialogOpen}
        advance={advance}
        companyName={companyName}
      />
    </>
  )
}