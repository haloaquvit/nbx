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
    // A4 landscape size for better compatibility
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 297] // A4 landscape
    })

    const pageWidth = 297
    const pageHeight = 210
    const margin = 20

    // Header Company
    doc.setFontSize(18)
    doc.setFont(undefined, 'bold')
    doc.text(companyName, pageWidth/2, 25, { align: 'center' })
    
    doc.setFontSize(10)
    doc.setFont(undefined, 'normal')
    doc.text(companyAddress, pageWidth/2, 32, { align: 'center' })

    // Title
    doc.setFontSize(16)
    doc.setFont(undefined, 'bold')
    doc.text('KWITANSI PANJAR KARYAWAN', pageWidth/2, 45, { align: 'center' })

    // Divider line
    doc.setLineWidth(0.5)
    doc.line(margin, 50, pageWidth - margin, 50)

    // Receipt details
    doc.setFontSize(11)
    doc.setFont(undefined, 'normal')
    
    const leftCol = margin + 10
    const rightCol = pageWidth/2 + 10
    let yPos = 65

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
    yPos = 65
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

    // Amount box
    yPos = 90
    doc.setFillColor(248, 249, 250)
    doc.rect(leftCol, yPos, pageWidth - (margin * 2) - 20, 25, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.rect(leftCol, yPos, pageWidth - (margin * 2) - 20, 25, 'S')

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text('JUMLAH PANJAR:', leftCol + 5, yPos + 8)
    
    doc.setFontSize(16)
    doc.setTextColor(220, 38, 127) // Pink color
    const amountText = new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR' 
    }).format(advance.amount)
    doc.text(amountText, pageWidth - margin - 15, yPos + 12, { align: 'right' })
    doc.setTextColor(0, 0, 0) // Reset to black

    // Notes/Description
    yPos += 35
    doc.setFontSize(11)
    doc.setFont(undefined, 'bold')
    doc.text('KETERANGAN:', leftCol, yPos)
    
    yPos += 8
    doc.setFont(undefined, 'normal')
    // Handle notes text
    const notesText = advance.notes || 'Panjar karyawan untuk keperluan operasional'
    const notesLines = doc.splitTextToSize(notesText, pageWidth - (margin * 2) - 20)
    doc.text(notesLines, leftCol, yPos)
    
    // Calculate next position based on notes lines
    yPos += (notesLines.length * 5) + 15

    // Repayment history if any
    if (advance.repayments && advance.repayments.length > 0) {
      yPos += 5
      doc.setFontSize(11)
      doc.setFont(undefined, 'bold')
      doc.text('RIWAYAT PEMBAYARAN:', leftCol, yPos)
      
      yPos += 8
      doc.setFontSize(9)
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
      yPos += 10
    }

    // Signature section
    const signatureY = Math.max(yPos, 155) // Ensure minimum distance from top
    const colWidth = (pageWidth - (margin * 2) - 40) / 3
    
    // Signature boxes
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.3)
    
    // Disetujui oleh
    const col1X = leftCol
    doc.text('Disetujui oleh:', col1X, signatureY)
    doc.rect(col1X, signatureY + 5, colWidth, 30, 'S')
    doc.setFontSize(9)
    doc.text('Nama:', col1X + 2, signatureY + 38)
    doc.text('Tanggal:', col1X + 2, signatureY + 43)
    doc.line(col1X + 15, signatureY + 39, col1X + colWidth - 5, signatureY + 39)
    doc.line(col1X + 20, signatureY + 44, col1X + colWidth - 5, signatureY + 44)

    // Penerima (Karyawan)  
    const col2X = leftCol + colWidth + 10
    doc.setFontSize(11)
    doc.text('Penerima:', col2X, signatureY)
    doc.rect(col2X, signatureY + 5, colWidth, 30, 'S')
    doc.setFontSize(9)
    doc.text('Nama:', col2X + 2, signatureY + 38)
    doc.text('Tanggal:', col2X + 2, signatureY + 43)
    doc.line(col2X + 15, signatureY + 39, col2X + colWidth - 5, signatureY + 39)
    doc.line(col2X + 20, signatureY + 44, col2X + colWidth - 5, signatureY + 44)

    // Yang mengeluarkan
    const col3X = leftCol + (colWidth * 2) + 20
    doc.setFontSize(11)
    doc.text('Yang Mengeluarkan:', col3X, signatureY)
    doc.rect(col3X, signatureY + 5, colWidth, 30, 'S')
    doc.setFontSize(9)
    doc.text('Nama:', col3X + 2, signatureY + 38)
    doc.text('Tanggal:', col3X + 2, signatureY + 43)
    doc.line(col3X + 15, signatureY + 39, col3X + colWidth - 5, signatureY + 39)
    doc.line(col3X + 20, signatureY + 44, col3X + colWidth - 5, signatureY + 44)

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
      doc.save(fileName)
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