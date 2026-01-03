"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Expense } from "@/types/expense"
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { FileText, Download, Printer, Receipt } from "lucide-react"
import { ThermalReceiptDialog } from "./ThermalReceiptDialog"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { terbilang } from '@/utils/terbilang'
import { saveCompressedPDF } from '@/utils/pdfUtils'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { useBranch } from '@/contexts/BranchContext'

interface ExpenseReceiptPDFProps {
  expense: Expense
  companyName?: string
  companyAddress?: string
}

export function ExpenseReceiptPDF({
  expense,
  companyName = "AQUVIT",
  companyAddress = "Jl. Contoh No. 123, Kota ABC"
}: ExpenseReceiptPDFProps) {
  const [isThermalDialogOpen, setIsThermalDialogOpen] = useState(false)
  const { settings } = useCompanySettings()
  const { currentBranch } = useBranch()

  const generatePDF = (action: 'download' | 'print' = 'download') => {
    // A4 page format with 1/3 page content area at top
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4' // A4: 210mm x 297mm
    })

    // A4 dimensions
    const a4Width = 210
    const a4Height = 297

    // Content area: full width with small margin, 1/3 of A4 height (~99mm)
    const margin = 10
    const contentWidth = a4Width - (margin * 2) // 190mm
    const contentHeight = 90 // ~1/3 of A4 (99mm - some padding)

    // Start at top
    const startX = margin
    const startY = margin

    // Draw border around content area
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.3)
    doc.rect(startX, startY, contentWidth, contentHeight, 'S')

    // Header Company - use branch name
    doc.setFontSize(14)
    doc.setFont(undefined, 'bold')
    doc.text(currentBranch?.name || settings?.name || 'AQUVIT', startX + contentWidth / 2, startY + 8, { align: 'center' })

    // Title
    doc.setFontSize(12)
    doc.text('KWITANSI PENGELUARAN', startX + contentWidth / 2, startY + 15, { align: 'center' })

    // Divider line
    doc.setLineWidth(0.3)
    doc.line(startX + 5, startY + 18, startX + contentWidth - 5, startY + 18)

    // Receipt details - two columns
    doc.setFontSize(9)
    doc.setFont(undefined, 'normal')

    const leftCol = startX + 8
    const rightCol = startX + contentWidth / 2 + 5
    const labelWidth = 28
    let yPos = startY + 25

    // Row 1: No. Kwitansi | Tanggal
    doc.setFont(undefined, 'bold')
    doc.text('No. Kwitansi:', leftCol, yPos)
    doc.setFont(undefined, 'normal')
    doc.text(expense.id, leftCol + labelWidth, yPos)

    doc.setFont(undefined, 'bold')
    doc.text('Tanggal:', rightCol, yPos)
    doc.setFont(undefined, 'normal')
    doc.text(format(expense.date, 'dd MMMM yyyy', { locale: id }), rightCol + labelWidth, yPos)

    // Row 2: Akun Beban | Akun Sumber
    yPos += 6
    doc.setFont(undefined, 'bold')
    doc.text('Akun Beban:', leftCol, yPos)
    doc.setFont(undefined, 'normal')
    const categoryText = expense.expenseAccountName || expense.category
    doc.text(categoryText.length > 30 ? categoryText.substring(0, 30) + '...' : categoryText, leftCol + labelWidth, yPos)

    doc.setFont(undefined, 'bold')
    doc.text('Akun Sumber:', rightCol, yPos)
    doc.setFont(undefined, 'normal')
    doc.text(expense.accountName || '-', rightCol + labelWidth, yPos)

    // Amount box
    yPos += 8
    const boxWidth = contentWidth - 16
    const boxHeight = 18
    doc.setFillColor(248, 249, 250)
    doc.rect(leftCol, yPos, boxWidth, boxHeight, 'F')
    doc.setDrawColor(200, 200, 200)
    doc.rect(leftCol, yPos, boxWidth, boxHeight, 'S')

    doc.setFontSize(9)
    doc.setFont(undefined, 'bold')
    doc.text('JUMLAH:', leftCol + 3, yPos + 5)

    doc.setFontSize(13)
    doc.setTextColor(220, 38, 127) // Pink color
    const amountText = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(expense.amount)
    doc.text(amountText, leftCol + boxWidth - 3, yPos + 7, { align: 'right' })
    doc.setTextColor(0, 0, 0) // Reset to black

    // Terbilang
    doc.setFontSize(8)
    doc.setFont(undefined, 'italic')
    const terbilangText = `Terbilang: ${terbilang(expense.amount)}`
    const terbilangLines = doc.splitTextToSize(terbilangText, boxWidth - 6)
    doc.text(terbilangLines[0] || '', leftCol + 3, yPos + 13)
    if (terbilangLines[1]) {
      doc.text(terbilangLines[1], leftCol + 3, yPos + 17)
    }
    doc.setFont(undefined, 'normal')

    // Description
    yPos += boxHeight + 4
    doc.setFontSize(8)
    doc.setFont(undefined, 'bold')
    doc.text('Deskripsi:', leftCol, yPos)
    doc.setFont(undefined, 'normal')
    const descriptionLines = doc.splitTextToSize(expense.description || '-', boxWidth - 20)
    doc.text(descriptionLines[0] || '-', leftCol + 20, yPos)

    // Signature section - inside content box
    const signatureY = startY + contentHeight - 22
    const colWidth = (contentWidth - 20) / 3

    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.2)
    doc.setFontSize(8)

    // Disetujui oleh
    const col1X = startX + 5
    doc.text('Disetujui:', col1X, signatureY)
    doc.rect(col1X, signatureY + 1, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama: _______________', col1X + 2, signatureY + 15)

    // Diterima oleh
    const col2X = startX + 5 + colWidth + 5
    doc.setFontSize(8)
    doc.text('Diterima:', col2X, signatureY)
    doc.rect(col2X, signatureY + 1, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama: _______________', col2X + 2, signatureY + 15)

    // Yang mengeluarkan
    const col3X = startX + 5 + (colWidth + 5) * 2
    doc.setFontSize(8)
    doc.text('Yang Keluar:', col3X, signatureY)
    doc.rect(col3X, signatureY + 1, colWidth, 12, 'S')
    doc.setFontSize(7)
    doc.text('Nama: _______________', col3X + 2, signatureY + 15)

    // Footer - inside content box
    doc.setFontSize(7)
    doc.setTextColor(128, 128, 128)
    doc.text(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, startX + contentWidth / 2, startY + contentHeight - 2, { align: 'center' })

    // Action based on type
    if (action === 'print') {
      doc.autoPrint()
      window.open(doc.output('bloburl'), '_blank')
    } else {
      const fileName = `kwitansi-pengeluaran-${expense.id}-${format(expense.date, 'yyyy-MM-dd')}.pdf`
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

      <ThermalReceiptDialog
        open={isThermalDialogOpen}
        onOpenChange={setIsThermalDialogOpen}
        expense={expense}
        companyName={currentBranch?.name || settings?.name || companyName}
      />
    </>
  )
}