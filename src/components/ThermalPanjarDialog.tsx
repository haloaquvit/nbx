"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EmployeeAdvance } from "@/types/employeeAdvance"
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { Printer, Download, Bluetooth } from "lucide-react"
import jsPDF from 'jspdf'

interface ThermalPanjarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  advance: EmployeeAdvance
  companyName?: string
  thermalPrinterWidth?: '58mm' | '80mm'
}

export function ThermalPanjarDialog({
  open,
  onOpenChange,
  advance,
  companyName = "AQUVIT",
  thermalPrinterWidth = '58mm'
}: ThermalPanjarDialogProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const generateThermalPDF = () => {
    setIsGenerating(true)

    try {
      // Dynamic paper width based on settings
      const paperWidthMm = thermalPrinterWidth === '80mm' ? 80 : 58
      const charWidth = thermalPrinterWidth === '80mm' ? 48 : 32
      const separator = '-'.repeat(charWidth)

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [paperWidthMm, 180]
      })

      const pageWidth = paperWidthMm
      let yPos = 5
      const centerX = pageWidth / 2

      // Company name
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(companyName, centerX, yPos, { align: 'center' })
      yPos += 5

      // Title
      doc.setFontSize(10)
      doc.text('BUKTI PANJAR', centerX, yPos, { align: 'center' })
      yPos += 8

      // Divider
      doc.setFontSize(8)
      doc.text(separator, centerX, yPos, { align: 'center' })
      yPos += 6

      // Receipt details
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      
      // No & Date
      doc.text(`No: ${advance.id.substring(0, 12)}...`, 2, yPos)
      yPos += 4
      doc.text(`Tgl: ${format(advance.date, 'dd/MM/yyyy HH:mm', { locale: id })}`, 2, yPos)
      yPos += 6

      // Employee
      doc.text(`Karyawan: ${advance.employeeName}`, 2, yPos)
      yPos += 6

      // Amount box
      doc.text(separator, centerX, yPos, { align: 'center' })
      yPos += 4
      
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      const amount = new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR' 
      }).format(advance.amount)
      doc.text(amount, centerX, yPos, { align: 'center' })
      yPos += 6
      
      doc.setFontSize(8)
      doc.text(separator, centerX, yPos, { align: 'center' })
      yPos += 6

      // Remaining amount
      doc.setFont('helvetica', 'normal')
      doc.text('Sisa Panjar:', 2, yPos)
      yPos += 4
      const remaining = new Intl.NumberFormat('id-ID', { 
        style: 'currency', 
        currency: 'IDR' 
      }).format(advance.remainingAmount)
      doc.text(remaining, 2, yPos)
      yPos += 6

      // Notes
      if (advance.notes) {
        doc.text('Keterangan:', 2, yPos)
        yPos += 4
        
        // Split notes into lines for thermal width
        const notesLines = doc.splitTextToSize(advance.notes, pageWidth - 4)
        doc.text(notesLines, 2, yPos)
        yPos += (notesLines.length * 3) + 6
      }

      // Account
      if (advance.accountName) {
        doc.text(`Dibayar dari: ${advance.accountName}`, 2, yPos)
        yPos += 6
      }

      // Repayment history (if any)
      if (advance.repayments && advance.repayments.length > 0) {
        doc.text('Riwayat Bayar:', 2, yPos)
        yPos += 4
        
        advance.repayments.slice(0, 3).forEach((repayment, index) => { // Limit to 3 recent repayments
          const repayAmount = new Intl.NumberFormat('id-ID', { 
            style: 'currency', 
            currency: 'IDR' 
          }).format(repayment.amount)
          const repayDate = format(repayment.date, 'dd/MM')
          doc.setFontSize(7)
          doc.text(`${repayDate}: ${repayAmount}`, 2, yPos)
          yPos += 3
        })
        
        if (advance.repayments.length > 3) {
          doc.text(`... dan ${advance.repayments.length - 3} lainnya`, 2, yPos)
          yPos += 3
        }
        
        doc.setFontSize(8)
        yPos += 3
      }

      // Footer
      doc.text(separator, centerX, yPos, { align: 'center' })
      yPos += 4
      doc.setFontSize(7)
      doc.text(`Dicetak: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, centerX, yPos, { align: 'center' })

      // Save PDF
      const fileName = `struk-panjar-${advance.employeeName.replace(/\s+/g, '-')}-${format(advance.date, 'yyyyMMdd')}.pdf`
      doc.save(fileName)
      
    } catch (error) {
      console.error('Error generating thermal PDF:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const generateRawBT = () => {
    // Generate ESC/POS commands for thermal printer via Bluetooth
    const charWidth = thermalPrinterWidth === '80mm' ? 48 : 32
    const separator = '-'.repeat(charWidth)
    const commands = []

    // Initialize printer
    commands.push('\x1b\x40') // Initialize
    commands.push('\x1b\x61\x01') // Center alignment

    // Company name
    commands.push('\x1b\x21\x08') // Double height
    commands.push(`${companyName}\n`)
    commands.push('\x1b\x21\x00') // Normal size

    // Title
    commands.push('BUKTI PANJAR\n')
    commands.push(`${separator}\n`)
    
    // Details
    commands.push('\x1b\x61\x00') // Left align
    commands.push(`No: ${advance.id.substring(0, 12)}...\n`)
    commands.push(`Tgl: ${format(advance.date, 'dd/MM/yyyy HH:mm', { locale: id })}\n`)
    commands.push(`Karyawan: ${advance.employeeName}\n\n`)
    
    // Amount
    commands.push('\x1b\x61\x01') // Center
    commands.push(`${separator}\n`)
    commands.push('\x1b\x21\x10') // Double width
    const amount = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR'
    }).format(advance.amount)
    commands.push(`${amount}\n`)
    commands.push('\x1b\x21\x00') // Normal size
    commands.push(`${separator}\n\n`)
    
    // Remaining amount
    commands.push('\x1b\x61\x00') // Left align
    commands.push('Sisa Panjar:\n')
    const remaining = new Intl.NumberFormat('id-ID', { 
      style: 'currency', 
      currency: 'IDR' 
    }).format(advance.remainingAmount)
    commands.push(`${remaining}\n\n`)
    
    // Notes
    if (advance.notes) {
      commands.push('Keterangan:\n')
      commands.push(`${advance.notes}\n\n`)
    }
    
    if (advance.accountName) {
      commands.push(`Dibayar dari: ${advance.accountName}\n`)
    }
    
    // Repayment history (recent ones only)
    if (advance.repayments && advance.repayments.length > 0) {
      commands.push('Riwayat Bayar:\n')
      advance.repayments.slice(0, 2).forEach((repayment) => {
        const repayAmount = new Intl.NumberFormat('id-ID', { 
          style: 'currency', 
          currency: 'IDR' 
        }).format(repayment.amount)
        const repayDate = format(repayment.date, 'dd/MM')
        commands.push(`${repayDate}: ${repayAmount}\n`)
      })
      commands.push('\n')
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
    a.download = `struk-panjar-rawbt-${advance.employeeName.replace(/\s+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-center">Cetak Struk Panjar</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Preview */}
          <div className="bg-slate-50 p-4 rounded-lg border-2 border-dashed border-slate-200">
            <div className="text-center space-y-1 text-sm">
              <div className="font-bold">{companyName}</div>
              <div>BUKTI PANJAR</div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="text-left space-y-1 text-xs">
                <div>No: {advance.id.substring(0, 12)}...</div>
                <div>Tgl: {format(advance.date, 'dd/MM/yyyy HH:mm')}</div>
                <div>Karyawan: {advance.employeeName}</div>
              </div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="font-bold text-base">
                {new Intl.NumberFormat('id-ID', { 
                  style: 'currency', 
                  currency: 'IDR' 
                }).format(advance.amount)}
              </div>
              <div className="text-xs">- - - - - - - - - - - - - - - -</div>
              <div className="text-left text-xs">
                <div>Sisa: {new Intl.NumberFormat('id-ID', { 
                  style: 'currency', 
                  currency: 'IDR' 
                }).format(advance.remainingAmount)}</div>
                {advance.notes && (
                  <div>Keterangan: {advance.notes.substring(0, 30)}...</div>
                )}
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