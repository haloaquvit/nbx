"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Expense } from "@/types/expense"
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { Printer, Download, Bluetooth } from "lucide-react"
import jsPDF from 'jspdf'

interface ThermalReceiptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: Expense
  companyName?: string
  thermalPrinterWidth?: '58mm' | '80mm'
}

export function ThermalReceiptDialog({
  open,
  onOpenChange,
  expense,
  companyName = "AQUVIT",
  thermalPrinterWidth = '58mm'
}: ThermalReceiptDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const generateThermalPDF = () => {
    setIsGenerating(true)

    try {
      // Lebar kertas berdasarkan setting
      const paperWidthMm = thermalPrinterWidth === '80mm' ? 80 : 58
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [paperWidthMm, 150]
      })

      const pageWidth = paperWidthMm
      let yPos = 5
      const centerX = pageWidth / 2

      // Company name
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      doc.text(companyName, centerX, yPos, { align: 'center' })
      yPos += 5

      // Title
      doc.setFontSize(10)
      doc.text('BUKTI PENGELUARAN', centerX, yPos, { align: 'center' })
      yPos += 8

      // Divider
      doc.setFontSize(8)
      doc.text('--------------------------------', centerX, yPos, { align: 'center' })
      yPos += 6

      // Receipt details
      doc.setFont(undefined, 'normal')
      doc.setFontSize(8)
      
      // No & Date
      doc.text(`No: ${expense.id.substring(0, 12)}...`, 2, yPos)
      yPos += 4
      doc.text(`Tgl: ${format(expense.date, 'dd/MM/yyyy HH:mm', { locale: id })}`, 2, yPos)
      yPos += 6

      // Category
      doc.text(`Kategori: ${expense.category}`, 2, yPos)
      yPos += 6

      // Amount box
      doc.text('--------------------------------', centerX, yPos, { align: 'center' })
      yPos += 4
      
      doc.setFontSize(12)
      doc.setFont(undefined, 'bold')
      const amount = new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR' 
      }).format(expense.amount)
      doc.text(amount, centerX, yPos, { align: 'center' })
      yPos += 6
      
      doc.setFontSize(8)
      doc.text('--------------------------------', centerX, yPos, { align: 'center' })
      yPos += 6

      // Description
      doc.setFont(undefined, 'normal')
      doc.text('Keterangan:', 2, yPos)
      yPos += 4
      
      // Split description into lines for thermal width
      const descLines = doc.splitTextToSize(expense.description, pageWidth - 4)
      doc.text(descLines, 2, yPos)
      yPos += (descLines.length * 3) + 6

      // Account
      if (expense.accountName) {
        doc.text(`Dibayar dari: ${expense.accountName}`, 2, yPos)
        yPos += 6
      }

      // Footer
      doc.text('--------------------------------', centerX, yPos, { align: 'center' })
      yPos += 4
      doc.setFontSize(7)
      doc.text(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, centerX, yPos, { align: 'center' })

      // Save PDF
      const fileName = `struk-${expense.id.substring(0, 8)}-${format(expense.date, 'yyyyMMdd')}.pdf`
      doc.save(fileName)
      
    } catch (error) {
      console.error('Error generating thermal PDF:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const generateRawBT = () => {
    // Generate ESC/POS commands for thermal printer via Bluetooth
    const commands = []

    // Lebar karakter berdasarkan setting: 58mm = 32 char, 80mm = 48 char
    const charWidth = thermalPrinterWidth === '80mm' ? 48 : 32
    const separator = '-'.repeat(charWidth)

    // Initialize printer
    commands.push('\x1b\x40') // Initialize
    commands.push('\x1b\x61\x01') // Center alignment

    // Company name
    commands.push('\x1b\x21\x08') // Double height
    commands.push(`${companyName}\n`)
    commands.push('\x1b\x21\x00') // Normal size

    // Title
    commands.push('BUKTI PENGELUARAN\n')
    commands.push(`${separator}\n`)
    
    // Details
    commands.push('\x1b\x61\x00') // Left align
    commands.push(`No: ${expense.id.substring(0, 12)}...\n`)
    commands.push(`Tgl: ${format(expense.date, 'dd/MM/yyyy HH:mm', { locale: id })}\n`)
    commands.push(`Kategori: ${expense.category}\n\n`)
    
    // Amount
    commands.push('\x1b\x61\x01') // Center
    commands.push(`${separator}\n`)
    commands.push('\x1b\x21\x10') // Double width
    const amount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(expense.amount)
    commands.push(`${amount}\n`)
    commands.push('\x1b\x21\x00') // Normal size
    commands.push(`${separator}\n\n`)
    
    // Description
    commands.push('\x1b\x61\x00') // Left align
    commands.push('Keterangan:\n')
    commands.push(`${expense.description}\n\n`)
    
    if (expense.accountName) {
      commands.push(`Dibayar dari: ${expense.accountName}\n`)
    }
    
    // Footer
    commands.push('\x1b\x61\x01') // Center
    commands.push(`${separator}\n`)
    commands.push(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}\n\n\n`)
    
    // Cut paper
    commands.push('\x1d\x56\x00')
    
    const rawData = commands.join('')
    
    // Create blob and download for RawBT apps
    const blob = new Blob([rawData], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `struk-rawbt-${expense.id.substring(0, 8)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Cetak Struk Thermal</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-slate-50 p-4 rounded-lg border-2 border-dashed border-slate-200">
            <div className="text-center space-y-1 text-sm">
              <div className="font-bold">{companyName}</div>
              <div>BUKTI PENGELUARAN</div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="text-left space-y-1 text-xs">
                <div>No: {expense.id.substring(0, 12)}...</div>
                <div>Tgl: {format(expense.date, 'dd/MM/yyyy HH:mm')}</div>
                <div>Kategori: {expense.category}</div>
              </div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="font-bold text-base">
                {new Intl.NumberFormat('id-ID', { 
                  style: 'currency', 
                  currency: 'IDR' 
                }).format(expense.amount)}
              </div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="text-left text-xs">
                <div>Keterangan:</div>
                <div>{expense.description.substring(0, 50)}...</div>
              </div>
            </div>
          </div>

          {/* Print Options */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={generateRawBT}
              className="bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center gap-2 h-20"
            >
              <Bluetooth className="h-6 w-6" />
              <span className="text-xs">RawBT</span>
            </Button>
            
            <Button
              onClick={generateThermalPDF}
              disabled={isGenerating}
              variant="outline"
              className="border-gray-300 text-gray-700 hover:bg-gray-50 flex flex-col items-center gap-2 h-20"
            >
              <Download className="h-6 w-6" />
              <span className="text-xs">
                {isGenerating ? 'Generating...' : 'Download PDF'}
              </span>
            </Button>
          </div>

          {/* Instructions */}
          <div className="text-xs text-slate-600 text-center space-y-1">
            <div><strong>RawBT:</strong> Untuk printer Bluetooth via aplikasi RawBT</div>
            <div><strong>PDF:</strong> Untuk cetak manual atau printer lain</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}