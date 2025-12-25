import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { History, DollarSign, Printer, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePayrollRecords } from '@/hooks/usePayroll'
import { useBranch } from '@/contexts/BranchContext'
import { isOwner } from '@/utils/roleUtils'

interface PayrollPayment {
  id: string
  entry_number: string
  account_name: string
  account_code: string
  amount: number
  description: string
  employee_name: string
  entry_date: string
  created_at: string
  reference_id: string
  status: string
}

export const PayrollHistoryTable = () => {
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const { deletePayrollRecord } = usePayrollRecords({})
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [paymentToDelete, setPaymentToDelete] = useState<PayrollPayment | null>(null)

  // Fetch payroll payment history from journal_entries (new system)
  const { data: payrollHistory, isLoading } = useQuery<PayrollPayment[]>({
    queryKey: ['payrollHistory', currentBranch?.id],
    queryFn: async () => {
      console.log('🔍 Fetching payroll history from journal_entries...')

      // Get payroll journal entries with their credit lines (payment account)
      const { data: journalEntries, error: journalError } = await supabase
        .from('journal_entries')
        .select(`
          id,
          entry_number,
          entry_date,
          description,
          reference_id,
          status,
          is_voided,
          total_credit,
          created_at,
          journal_entry_lines (
            account_code,
            account_name,
            credit_amount
          )
        `)
        .eq('reference_type', 'payroll')
        .eq('status', 'posted')
        .eq('is_voided', false)
        .eq('branch_id', currentBranch?.id)
        .order('created_at', { ascending: false })

      console.log('📊 Payroll journal entries result:', { journalEntries, journalError })

      if (journalError) {
        console.error('❌ Failed to fetch payroll journal entries:', journalError)
        throw journalError
      }

      // Transform journal entries to PayrollPayment format
      const payments: PayrollPayment[] = (journalEntries || []).map((entry: any) => {
        // Find the payment account line (the one with credit_amount for Kas/Bank)
        const paymentLine = entry.journal_entry_lines?.find(
          (line: any) => line.credit_amount > 0 && line.account_code?.startsWith('1')
        )

        // Extract employee name from description (format: "Pembayaran Gaji - Employee Name")
        const employeeName = entry.description?.replace('Pembayaran Gaji - ', '') || 'Unknown'

        return {
          id: entry.id,
          entry_number: entry.entry_number,
          account_name: paymentLine?.account_name || 'Kas',
          account_code: paymentLine?.account_code || '',
          amount: paymentLine?.credit_amount || entry.total_credit || 0,
          description: entry.description,
          employee_name: employeeName,
          entry_date: entry.entry_date,
          created_at: entry.created_at,
          reference_id: entry.reference_id,
          status: entry.status,
        }
      })

      console.log(`✅ Found ${payments.length} payroll payment records`)
      return payments
    },
    enabled: !!currentBranch?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes
  })

  const handleDeleteClick = (payment: PayrollPayment) => {
    setPaymentToDelete(payment)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!paymentToDelete) return
    await deletePayrollRecord.mutateAsync(paymentToDelete.reference_id)
    setIsDeleteDialogOpen(false)
    setPaymentToDelete(null)
  }

  const handlePrintAll = () => {
    if (!payrollHistory || payrollHistory.length === 0) return

    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    const totalPayments = payrollHistory.reduce((sum, payment) => sum + payment.amount, 0)

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Riwayat Pembayaran Gaji</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #333;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
          }
          .header h1 {
            margin: 0;
            color: #1a1a1a;
          }
          .header p {
            margin: 5px 0;
            color: #666;
          }
          .summary {
            display: flex;
            justify-content: space-around;
            margin-bottom: 30px;
            padding: 15px;
            background-color: #f5f5f5;
            border-radius: 5px;
          }
          .summary-item {
            text-align: center;
          }
          .summary-item .label {
            font-size: 12px;
            color: #666;
            margin-bottom: 5px;
          }
          .summary-item .value {
            font-size: 24px;
            font-weight: bold;
            color: #2563eb;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 12px 8px;
            text-align: left;
          }
          th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #1a1a1a;
          }
          tr:nth-child(even) {
            background-color: #f9f9f9;
          }
          .amount {
            text-align: right;
            font-weight: bold;
            color: #16a34a;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #ddd;
            padding-top: 10px;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Riwayat Pembayaran Gaji</h1>
          <p>Dicetak pada: ${new Date().toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>

        <div class="summary">
          <div class="summary-item">
            <div class="label">Total Pembayaran</div>
            <div class="value">${formatCurrency(totalPayments)}</div>
          </div>
          <div class="summary-item">
            <div class="label">Jumlah Transaksi</div>
            <div class="value">${payrollHistory.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Tanggal</th>
              <th>Karyawan</th>
              <th>Deskripsi</th>
              <th>Akun Pembayaran</th>
              <th style="text-align: right">Jumlah</th>
              <th>Dibayar Oleh</th>
            </tr>
          </thead>
          <tbody>
            ${payrollHistory.map((payment, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>
                  ${formatDate(new Date(payment.entry_date))}<br>
                  <small style="color: #666;">${payment.entry_number}</small>
                </td>
                <td>
                  ${payment.employee_name}<br>
                  <small style="color: #666;">ID: ${payment.reference_id}</small>
                </td>
                <td>${payment.description}</td>
                <td>${payment.account_code} - ${payment.account_name}</td>
                <td class="amount">${formatCurrency(payment.amount)}</td>
                <td>-</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Dokumen ini dicetak dari sistem Aquvit POS</p>
          <p>© ${new Date().getFullYear()} - Semua hak dilindungi</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `

    printWindow.document.write(printContent)
    printWindow.document.close()
  }

  const handlePrintSingle = async (payment: PayrollPayment) => {
    // Fetch full payroll details from database
    const { data: payrollDetail, error } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('id', payment.reference_id)
      .single()

    if (error) {
      console.error('Error fetching payroll details:', error)
      // Continue with basic info even if detail fetch fails
    }

    const printWindow = window.open('', '', 'width=800,height=600')
    if (!printWindow) return

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bukti Pembayaran Gaji - ${payment.employee_name}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #333;
            padding-bottom: 15px;
          }
          .header h1 {
            margin: 0 0 10px 0;
            color: #1a1a1a;
            font-size: 28px;
          }
          .header p {
            margin: 5px 0;
            color: #666;
            font-size: 14px;
          }
          .receipt-info {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 25px;
            border-left: 4px solid #2563eb;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #e0e0e0;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            color: #555;
            min-width: 180px;
          }
          .info-value {
            color: #1a1a1a;
            text-align: right;
            flex: 1;
          }
          .amount-section {
            background-color: #e8f5e9;
            padding: 20px;
            border-radius: 8px;
            margin: 25px 0;
            text-align: center;
            border: 2px solid #4caf50;
          }
          .amount-label {
            font-size: 14px;
            color: #2e7d32;
            margin-bottom: 8px;
            font-weight: bold;
          }
          .amount-value {
            font-size: 36px;
            font-weight: bold;
            color: #1b5e20;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #ddd;
          }
          .signature-section {
            display: flex;
            justify-content: space-between;
            margin-top: 50px;
          }
          .signature-box {
            text-align: center;
            width: 45%;
          }
          .signature-line {
            border-top: 1px solid #333;
            margin-top: 60px;
            padding-top: 8px;
          }
          .print-info {
            text-align: center;
            font-size: 11px;
            color: #999;
            margin-top: 30px;
          }
          @media print {
            body {
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BUKTI PEMBAYARAN GAJI</h1>
          <p>Nomor: ${payment.entry_number}</p>
          <p>Dicetak pada: ${new Date().toLocaleString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>

        <div class="receipt-info">
          <div class="info-row">
            <div class="info-label">Tanggal Pembayaran:</div>
            <div class="info-value">
              ${formatDate(new Date(payment.entry_date))}
            </div>
          </div>
          <div class="info-row">
            <div class="info-label">Nama Karyawan:</div>
            <div class="info-value">${payment.employee_name}</div>
          </div>
          ${payrollDetail ? `
          <div class="info-row">
            <div class="info-label">Periode Gaji:</div>
            <div class="info-value">${payrollDetail.period_display || `${payrollDetail.period_month}/${payrollDetail.period_year}`}</div>
          </div>
          ` : ''}
          <div class="info-row">
            <div class="info-label">No. Jurnal:</div>
            <div class="info-value">${payment.entry_number}</div>
          </div>
          <div class="info-row">
            <div class="info-label">Akun Pembayaran:</div>
            <div class="info-value">${payment.account_code} - ${payment.account_name}</div>
          </div>
        </div>

        ${payrollDetail ? `
        <!-- Salary Breakdown -->
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #4caf50;">
          <h3 style="margin: 0 0 15px 0; color: #2e7d32; font-size: 16px; border-bottom: 2px solid #4caf50; padding-bottom: 8px;">RINCIAN GAJI</h3>

          <!-- Income Section -->
          <div style="margin-bottom: 15px;">
            <div style="font-weight: bold; color: #1b5e20; margin-bottom: 8px;">Penghasilan:</div>
            <table style="width: 100%; border: none; margin-bottom: 10px;">
              <tr style="background: none;">
                <td style="border: none; padding: 5px 10px; color: #555;">Gaji Pokok</td>
                <td style="border: none; padding: 5px 10px; text-align: right; font-family: monospace;">${formatCurrency(payrollDetail.base_salary_amount || 0)}</td>
              </tr>
              ${payrollDetail.commission_amount > 0 ? `
              <tr style="background: none;">
                <td style="border: none; padding: 5px 10px; color: #555;">Komisi</td>
                <td style="border: none; padding: 5px 10px; text-align: right; font-family: monospace;">${formatCurrency(payrollDetail.commission_amount)}</td>
              </tr>
              ` : ''}
              ${payrollDetail.bonus_amount > 0 ? `
              <tr style="background: none;">
                <td style="border: none; padding: 5px 10px; color: #555;">Bonus</td>
                <td style="border: none; padding: 5px 10px; text-align: right; font-family: monospace;">${formatCurrency(payrollDetail.bonus_amount)}</td>
              </tr>
              ` : ''}
              <tr style="background: none; border-top: 1px solid #ddd;">
                <td style="border: none; padding: 8px 10px; font-weight: bold; color: #1b5e20;">Total Penghasilan (Gaji Kotor)</td>
                <td style="border: none; padding: 8px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #1b5e20;">${formatCurrency(payrollDetail.gross_salary || 0)}</td>
              </tr>
            </table>
          </div>

          <!-- Deduction Section -->
          ${(payrollDetail.deduction_amount > 0 || payrollDetail.outstanding_advances > 0) ? `
          <div style="margin-top: 15px; padding-top: 15px; border-top: 2px solid #ddd;">
            <div style="font-weight: bold; color: #c62828; margin-bottom: 8px;">Potongan:</div>
            <table style="width: 100%; border: none; margin-bottom: 10px;">
              ${payrollDetail.outstanding_advances > 0 ? `
              <tr style="background: none;">
                <td style="border: none; padding: 5px 10px; color: #555;">Pemotongan Panjar Karyawan</td>
                <td style="border: none; padding: 5px 10px; text-align: right; font-family: monospace; color: #c62828;">(${formatCurrency(payrollDetail.outstanding_advances)})</td>
              </tr>
              ` : ''}
              ${payrollDetail.deduction_amount > 0 ? `
              <tr style="background: none;">
                <td style="border: none; padding: 5px 10px; color: #555;">Potongan Lainnya</td>
                <td style="border: none; padding: 5px 10px; text-align: right; font-family: monospace; color: #c62828;">(${formatCurrency(payrollDetail.deduction_amount)})</td>
              </tr>
              ` : ''}
              <tr style="background: none; border-top: 1px solid #ddd;">
                <td style="border: none; padding: 8px 10px; font-weight: bold; color: #c62828;">Total Potongan</td>
                <td style="border: none; padding: 8px 10px; text-align: right; font-family: monospace; font-weight: bold; color: #c62828;">(${formatCurrency((payrollDetail.outstanding_advances || 0) + (payrollDetail.deduction_amount || 0))})</td>
              </tr>
            </table>
          </div>
          ` : ''}

          ${payrollDetail.notes ? `
          <!-- Notes -->
          <div style="margin-top: 15px; padding: 10px; background-color: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
            <div style="font-size: 12px; font-weight: bold; color: #856404; margin-bottom: 4px;">Catatan:</div>
            <div style="font-size: 13px; color: #856404;">${payrollDetail.notes}</div>
          </div>
          ` : ''}
        </div>
        ` : ''}

        <div class="amount-section">
          <div class="amount-label">${payrollDetail ? 'GAJI BERSIH (TAKE HOME PAY)' : 'JUMLAH YANG DIBAYARKAN'}</div>
          <div class="amount-value">${formatCurrency(payrollDetail?.net_salary || payment.amount)}</div>
        </div>

        <div class="footer">
          <div class="signature-section">
            <div class="signature-box">
              <div>Penerima,</div>
              <div class="signature-line">${payment.employee_name}</div>
            </div>
            <div class="signature-box">
              <div>Yang Membayar,</div>
              <div class="signature-line">_________________</div>
            </div>
          </div>

          <div class="print-info">
            <p>Dokumen ini dicetak dari sistem Aquvit POS</p>
            <p>© ${new Date().getFullYear()} - Semua hak dilindungi</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `

    printWindow.document.write(printContent)
    printWindow.document.close()
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!payrollHistory || payrollHistory.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-lg font-medium">Belum Ada Pembayaran Gaji</p>
        <p className="text-sm">Pembayaran gaji akan muncul di sini setelah status payroll diubah ke "Paid"</p>
      </div>
    )
  }

  // Calculate total payments
  const totalPayments = payrollHistory.reduce((sum, payment) => sum + payment.amount, 0)

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <DollarSign className="h-5 w-5" />
              Ringkasan Pembayaran Gaji
            </CardTitle>
            <Button
              onClick={handlePrintAll}
              variant="outline"
              size="sm"
              className="gap-2 bg-white hover:bg-green-50"
            >
              <Printer className="h-4 w-4" />
              Cetak Semua
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600">Total Pembayaran</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(totalPayments)}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-600">Jumlah Transaksi</p>
              <p className="text-2xl font-bold text-blue-700">
                {payrollHistory.length}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment History Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>No. Jurnal</TableHead>
              <TableHead>Akun Pembayaran</TableHead>
              <TableHead className="text-right">Jumlah</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payrollHistory.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{formatDate(new Date(payment.entry_date))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(payment.created_at).toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{payment.employee_name}</p>
                    <p className="text-xs text-muted-foreground">
                      ID: {payment.reference_id.slice(0, 8)}...
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-sm font-mono">{payment.entry_number}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {payment.account_code} - {payment.account_name}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-200">
                    Dibayar
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      onClick={() => handlePrintSingle(payment)}
                      variant="ghost"
                      size="sm"
                      className="gap-1 hover:bg-blue-50"
                    >
                      <Printer className="h-3 w-3" />
                      Cetak
                    </Button>
                    {isOwner(user) && (
                      <Button
                        onClick={() => handleDeleteClick(payment)}
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Hapus
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Pembayaran Gaji</AlertDialogTitle>
            <AlertDialogDescription>
              {paymentToDelete && (
                <>
                  Apakah Anda yakin ingin menghapus pembayaran gaji untuk{' '}
                  <span className="font-semibold">
                    {paymentToDelete.employee_name}
                  </span>
                  ?
                  <br /><br />
                  <span className="text-amber-600 font-medium">
                    ⚠️ Menghapus pembayaran ini akan:
                    <ul className="list-disc ml-6 mt-2">
                      <li>Menghapus record gaji dari sistem</li>
                      <li>Menghapus jurnal pembayaran</li>
                      <li>Mengembalikan saldo akun pembayaran sebesar {formatCurrency(paymentToDelete.amount)}</li>
                    </ul>
                  </span>
                  <br />
                  Tindakan ini tidak dapat dibatalkan.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}