"use client"

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAccountsPayable } from '@/hooks/useAccountsPayable'
import { useAccounts } from '@/hooks/useAccounts'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { DollarSign, FileText, Calendar, AlertCircle, Download, Edit, Trash2, Eye, CreditCard, Building2, Banknote, Receipt, Clock, User, FileDown, CheckCircle, AlertTriangle, Clock3, Calculator } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { AddDebtDialog } from '@/components/AddDebtDialog'
import { EditDebtDialog } from '@/components/EditDebtDialog'
import { DebtInstallmentTab } from '@/components/DebtInstallmentTab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBranch } from '@/contexts/BranchContext'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { formatNumberWithCommas, parseNumberWithCommas } from '@/utils/formatNumber'
import { useCompanySettings } from '@/hooks/useCompanySettings'
import { createCompressedPDF } from '@/utils/pdfUtils'
import { AccountsPayable } from '@/types/accountsPayable'

export default function AccountsPayablePage() {
  const { currentBranch } = useBranch();
  const [paymentDialog, setPaymentDialog] = useState({ open: false, payable: null as any })
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [liabilityAccountId, setLiabilityAccountId] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [deleteDialog, setDeleteDialog] = useState({ open: false, payable: null as any })
  const [isDeleting, setIsDeleting] = useState(false)
  const [detailDialog, setDetailDialog] = useState({ open: false, payable: null as AccountsPayable | null })
  const [editDialog, setEditDialog] = useState({ open: false, payable: null as AccountsPayable | null })

  const { accountsPayable, isLoading, payAccountsPayable } = useAccountsPayable()
  const { accounts } = useAccounts()
  const { toast } = useToast()
  const { settings } = useCompanySettings()

  const paymentAccounts = accounts?.filter(acc => acc.isPaymentAccount) || []
  const liabilityAccounts = accounts?.filter(acc => acc.type === 'Kewajiban' && !acc.isHeader) || []

  // Calculate totals
  const totalOutstanding = accountsPayable?.filter(ap => ap.status === 'Outstanding')
    .reduce((sum, ap) => sum + ap.amount, 0) || 0
  const totalPartial = accountsPayable?.filter(ap => ap.status === 'Partial')
    .reduce((sum, ap) => sum + (ap.amount - (ap.paidAmount || 0)), 0) || 0
  const totalUnpaid = totalOutstanding + totalPartial

  const handlePayment = async () => {
    if (!paymentDialog.payable || !paymentAmount || !paymentAccountId || !liabilityAccountId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Harap isi semua field yang diperlukan"
      })
      return
    }

    try {
      // Parse nilai dengan koma menjadi angka murni
      const parsedAmount = parseNumberWithCommas(paymentAmount);

      await payAccountsPayable.mutateAsync({
        payableId: paymentDialog.payable.id,
        amount: parsedAmount,
        paymentAccountId,
        liabilityAccountId,
        notes: paymentNotes
      })

      toast({
        title: "Sukses",
        description: "Pembayaran hutang berhasil dicatat"
      })

      setPaymentDialog({ open: false, payable: null })
      setPaymentAmount('')
      setPaymentAccountId('')
      setLiabilityAccountId('')
      setPaymentNotes('')
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal mencatat pembayaran"
      })
    }
  }

  const openPaymentDialog = (payable: any) => {
    const remainingAmount = payable.amount - (payable.paidAmount || 0)
    setPaymentDialog({ open: true, payable })
    setPaymentAmount(remainingAmount.toString())
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Outstanding':
        return <Badge variant="destructive">Belum Dibayar</Badge>
      case 'Partial':
        return <Badge variant="secondary">Sebagian</Badge>
      case 'Paid':
        return <Badge variant="default">Lunas</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getOverdueDays = (dueDate?: Date) => {
    if (!dueDate) return null
    const today = new Date()
    const due = new Date(dueDate)
    const diffTime = today.getTime() - due.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : null
  }

  const handleDelete = async () => {
    if (!deleteDialog.payable) return

    setIsDeleting(true)
    try {
      const debtId = deleteDialog.payable.id
      let voidedJournals = 0

      // 1. Void all related journal entries (pencatatan hutang + pembayaran)
      const { data: relatedJournals, error: journalFetchError } = await supabase
        .from('journal_entries')
        .select('id, entry_number')
        .eq('reference_id', debtId)
        .eq('is_voided', false)

      if (journalFetchError) {
        console.warn('Error fetching related journals:', journalFetchError)
      }

      if (relatedJournals && relatedJournals.length > 0) {
        // Void each journal entry
        for (const journal of relatedJournals) {
          const { error: voidError } = await supabase
            .from('journal_entries')
            .update({
              is_voided: true,
              voided_at: new Date().toISOString(),
              voided_reason: `Hutang dihapus - ${deleteDialog.payable.supplierName || 'Unknown'}`
            })
            .eq('id', journal.id)

          if (!voidError) {
            voidedJournals++
          }
        }
      }

      // 2. Delete related debt installments
      const { error: installmentError } = await supabase
        .from('debt_installments')
        .delete()
        .eq('debt_id', debtId)

      if (installmentError) {
        console.warn('Error deleting installments:', installmentError)
      }

      // 3. Delete the debt record
      const { error: deleteError } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('id', debtId)

      if (deleteError) throw deleteError

      toast({
        title: "Sukses",
        description: voidedJournals > 0
          ? `Hutang berhasil dihapus. ${voidedJournals} jurnal terkait di-void.`
          : "Hutang berhasil dihapus"
      })

      setDeleteDialog({ open: false, payable: null })
      window.location.reload()
    } catch (error: any) {
      console.error('Error deleting debt:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: `Gagal menghapus hutang: ${error.message}`
      })
    } finally {
      setIsDeleting(false)
    }
  }

  const exportToExcel = () => {
    if (!accountsPayable || accountsPayable.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tidak ada data untuk di-export"
      })
      return
    }

    const exportData = accountsPayable.map(payable => {
      const remainingAmount = payable.amount - (payable.paidAmount || 0)
      const overdueDays = getOverdueDays(payable.dueDate)

      return {
        'ID Hutang': payable.id,
        'Jenis': payable.creditorType === 'bank' ? 'Bank' :
                payable.creditorType === 'credit_card' ? 'Kartu Kredit' :
                payable.creditorType === 'supplier' ? 'Supplier' : 'Lainnya',
        'Kreditor': payable.supplierName,
        'Deskripsi': payable.description,
        'Jumlah': payable.amount,
        'Bunga (%)': payable.interestRate || 0,
        'Tipe Bunga': payable.interestType || '-',
        'Dibayar': payable.paidAmount || 0,
        'Sisa': remainingAmount,
        'Jatuh Tempo': payable.dueDate ? format(payable.dueDate, 'dd/MM/yyyy') : '-',
        'Terlambat (hari)': overdueDays || '-',
        'Status': payable.status === 'Outstanding' ? 'Belum Dibayar' :
                  payable.status === 'Partial' ? 'Sebagian' : 'Lunas',
        'Catatan': payable.notes || '-'
      }
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Hutang')

    const fileName = `Laporan_Hutang_${currentBranch?.name || 'Semua'}_${format(new Date(), 'ddMMyyyy')}.xlsx`
    XLSX.writeFile(wb, fileName)

    toast({
      title: "Sukses",
      description: "Data berhasil di-export ke Excel"
    })
  }

  return (
    <div className="w-full max-w-none p-4 lg:p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hutang (Supplier, Bank, dll)</h1>
          <p className="text-muted-foreground">
            Kelola pembayaran hutang kepada supplier, bank, dan kreditor lainnya
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <AddDebtDialog onSuccess={() => window.location.reload()} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Hutang Belum Dibayar</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalUnpaid)}
            </div>
            <p className="text-xs text-muted-foreground">
              {accountsPayable?.filter(ap => ap.status !== 'Paid').length || 0} tagihan aktif
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hutang Jatuh Tempo</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {accountsPayable?.filter(ap =>
                ap.status !== 'Paid' &&
                ap.dueDate &&
                getOverdueDays(ap.dueDate) !== null &&
                getOverdueDays(ap.dueDate)! >= 0
              ).length || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Tagihan yang sudah/akan jatuh tempo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Supplier</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(accountsPayable?.map(ap => ap.supplierName)).size || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Supplier dengan hutang aktif
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accounts Payable Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Hutang</CardTitle>
          <CardDescription>
            Kelola pembayaran hutang dari Purchase Order, Bank, dan kreditor lainnya
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead className="w-[80px]">Jenis</TableHead>
                  <TableHead className="w-[120px]">Kreditor</TableHead>
                  <TableHead className="w-[150px]">Deskripsi</TableHead>
                  <TableHead className="text-right w-[100px]">Jumlah</TableHead>
                  <TableHead className="text-right w-[100px]">Dibayar</TableHead>
                  <TableHead className="text-right w-[100px]">Sisa</TableHead>
                  <TableHead className="w-[100px]">Tempo</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[120px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsPayable?.map((payable) => {
                  const remainingAmount = payable.amount - (payable.paidAmount || 0)
                  const overdueDays = getOverdueDays(payable.dueDate)

                  const getCreditorTypeBadge = (type?: string) => {
                    switch (type) {
                      case 'bank': return <Badge variant="outline" className="bg-blue-50">Bank</Badge>
                      case 'credit_card': return <Badge variant="outline" className="bg-purple-50">Kartu Kredit</Badge>
                      case 'supplier': return <Badge variant="outline" className="bg-green-50">Supplier</Badge>
                      default: return <Badge variant="outline">Lainnya</Badge>
                    }
                  }

                  return (
                    <TableRow
                      key={payable.id}
                      className="hover:bg-slate-50/80 cursor-pointer"
                      onClick={() => setDetailDialog({ open: true, payable })}
                    >
                      <TableCell className="font-mono text-xs">
                        {payable.id.substring(0, 12)}...
                      </TableCell>
                      <TableCell>
                        {getCreditorTypeBadge(payable.creditorType)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {payable.supplierName}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[150px] truncate text-sm">
                          {payable.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(payable.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(payable.paidAmount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(remainingAmount)}
                      </TableCell>
                      <TableCell>
                        {payable.dueDate ? (
                          <div className="flex items-center gap-1">
                            {overdueDays !== null && overdueDays >= 0 && (
                              <AlertCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className={overdueDays !== null && overdueDays >= 0 ? 'text-red-600 font-medium' : ''}>
                              {format(payable.dueDate, 'dd MMM yyyy', { locale: id })}
                            </span>
                            {overdueDays !== null && overdueDays > 0 && (
                              <span className="text-xs text-red-500">
                                ({overdueDays} hari)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(payable.status)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDetailDialog({ open: true, payable })}
                            className="h-7 px-2"
                            title="Lihat Detail"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditDialog({ open: true, payable })}
                            className="h-7 px-2"
                            title="Edit Bunga & Tenor"
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          {payable.status !== 'Paid' && (
                            <Button
                              size="sm"
                              onClick={() => openPaymentDialog(payable)}
                              className="h-7 px-2 text-xs"
                            >
                              Bayar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteDialog({ open: true, payable })}
                            className="h-7 px-2"
                            disabled={payable.status === 'Paid' || (payable.paidAmount && payable.paidAmount > 0)}
                            title={payable.status === 'Paid' || (payable.paidAmount && payable.paidAmount > 0) ? 'Hutang yang sudah dibayar tidak dapat dihapus' : 'Hapus hutang'}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!accountsPayable || accountsPayable.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Tidak ada data hutang
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={paymentDialog.open} onOpenChange={(open) => setPaymentDialog({ open, payable: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bayar Hutang Supplier</DialogTitle>
            <DialogDescription>
              Catat pembayaran untuk hutang supplier {paymentDialog.payable?.supplierName}
            </DialogDescription>
          </DialogHeader>

          {paymentDialog.payable && (
            <div className="space-y-4">
              <div className="bg-muted p-3 rounded">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>ID Hutang: <span className="font-mono">{paymentDialog.payable.id}</span></div>
                  <div>Total: <span className="font-mono">{formatCurrency(paymentDialog.payable.amount)}</span></div>
                  <div>Sudah Dibayar: <span className="font-mono">{formatCurrency(paymentDialog.payable.paidAmount || 0)}</span></div>
                  <div>Sisa: <span className="font-mono text-red-600">{formatCurrency(paymentDialog.payable.amount - (paymentDialog.payable.paidAmount || 0))}</span></div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Jumlah Pembayaran</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Masukkan jumlah pembayaran"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentAccount">Akun Pembayaran (Kas/Bank)</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code ? `${account.code} - ` : ''}{account.name} - {formatCurrency(account.balance || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="liabilityAccount">Akun Kewajiban (Hutang)</Label>
                <Select value={liabilityAccountId} onValueChange={setLiabilityAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun kewajiban" />
                  </SelectTrigger>
                  <SelectContent>
                    {liabilityAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code ? `${account.code} - ` : ''}{account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentNotes">Catatan (Opsional)</Label>
                <Input
                  id="paymentNotes"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Catatan pembayaran"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialog({ open: false, payable: null })}>
              Batal
            </Button>
            <Button onClick={handlePayment} disabled={payAccountsPayable.isPending}>
              {payAccountsPayable.isPending ? 'Memproses...' : 'Bayar Hutang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, payable: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Hutang</DialogTitle>
            <DialogDescription>
              Apakah Anda yakin ingin menghapus hutang ini? Semua jurnal terkait (pencatatan hutang & pembayaran) akan di-void. Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          {deleteDialog.payable && (
            <div className="bg-muted p-3 rounded">
              <div className="space-y-1 text-sm">
                <div><strong>Kreditor:</strong> {deleteDialog.payable.supplierName}</div>
                <div><strong>Jumlah:</strong> {formatCurrency(deleteDialog.payable.amount)}</div>
                <div><strong>Terbayar:</strong> {formatCurrency(deleteDialog.payable.paidAmount || 0)}</div>
                <div><strong>Deskripsi:</strong> {deleteDialog.payable.description}</div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, payable: null })} disabled={isDeleting}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Menghapus...' : 'Hapus Hutang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {detailDialog.payable && (
        <AccountsPayableDetailDialog
          payable={detailDialog.payable}
          open={detailDialog.open}
          onOpenChange={(open) => {
            setDetailDialog({ open, payable: open ? detailDialog.payable : null })
          }}
          settings={settings}
          accounts={accounts}
          getOverdueDays={getOverdueDays}
          onUpdate={() => window.location.reload()}
        />
      )}

      {/* Edit Dialog */}
      {editDialog.payable && (
        <EditDebtDialog
          payable={editDialog.payable}
          open={editDialog.open}
          onOpenChange={(open) => {
            setEditDialog({ open, payable: open ? editDialog.payable : null })
          }}
          onSuccess={() => window.location.reload()}
        />
      )}
    </div>
  )
}

// Dialog to show accounts payable details with PDF export
function AccountsPayableDetailDialog({
  payable,
  open,
  onOpenChange,
  settings,
  accounts,
  getOverdueDays,
  onUpdate,
}: {
  payable: AccountsPayable
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: any
  accounts: any[] | undefined
  getOverdueDays: (dueDate?: Date) => number | null
  onUpdate?: () => void
}) {
  const printRef = useRef<HTMLDivElement>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState('detail')

  const remainingAmount = payable.amount - (payable.paidAmount || 0)
  const overdueDays = getOverdueDays(payable.dueDate)
  const paidPercentage = payable.amount > 0 ? ((payable.paidAmount || 0) / payable.amount) * 100 : 0

  const getCreditorTypeInfo = (type?: string) => {
    switch (type) {
      case 'bank':
        return { label: 'Bank', icon: Building2, color: 'bg-blue-100 text-blue-700' }
      case 'credit_card':
        return { label: 'Kartu Kredit', icon: CreditCard, color: 'bg-purple-100 text-purple-700' }
      case 'supplier':
        return { label: 'Supplier', icon: Receipt, color: 'bg-green-100 text-green-700' }
      default:
        return { label: 'Lainnya', icon: Banknote, color: 'bg-gray-100 text-gray-700' }
    }
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'Outstanding':
        return { label: 'Belum Dibayar', icon: AlertTriangle, color: 'bg-red-100 text-red-700' }
      case 'Partial':
        return { label: 'Sebagian Dibayar', icon: Clock3, color: 'bg-yellow-100 text-yellow-700' }
      case 'Paid':
        return { label: 'Lunas', icon: CheckCircle, color: 'bg-green-100 text-green-700' }
      default:
        return { label: status, icon: AlertCircle, color: 'bg-gray-100 text-gray-700' }
    }
  }

  const paymentAccountName = accounts?.find(acc => acc.id === payable.paymentAccountId)?.name

  const handlePrintPDF = async () => {
    if (!printRef.current || isGenerating) return

    setIsGenerating(true)
    try {
      await createCompressedPDF(
        printRef.current,
        `Hutang-${payable.id}-${format(payable.createdAt, 'ddMMyyyy')}.pdf`,
        [148, 210], // Half A4 (A5): 148mm x 210mm
        100 // Max 100KB
      )
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Gagal membuat PDF: ' + (error as Error).message)
    } finally {
      setIsGenerating(false)
    }
  }

  const creditorInfo = getCreditorTypeInfo(payable.creditorType)
  const statusInfo = getStatusInfo(payable.status)
  const CreditorIcon = creditorInfo.icon
  const StatusIcon = statusInfo.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-blue-600" />
            Detail Hutang
          </DialogTitle>
          <DialogDescription>
            {payable.id} - {format(payable.createdAt, 'd MMMM yyyy', { locale: id })}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="detail" className="gap-2">
              <Receipt className="h-4 w-4" />
              Detail
            </TabsTrigger>
            <TabsTrigger value="installment" className="gap-2">
              <Calculator className="h-4 w-4" />
              Angsuran
            </TabsTrigger>
          </TabsList>

          {/* Tab Detail */}
          <TabsContent value="detail" className="space-y-4 mt-4">
            {/* Status Badge */}
            <div className="flex justify-center gap-2">
              <Badge variant="outline" className={`${statusInfo.color} text-sm px-4 py-1`}>
                <StatusIcon className="h-4 w-4 mr-2" />
                {statusInfo.label}
              </Badge>
              {overdueDays !== null && overdueDays > 0 && payable.status !== 'Paid' && (
                <Badge variant="destructive" className="text-sm px-3 py-1">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Terlambat {overdueDays} hari
                </Badge>
              )}
            </div>

            {/* Creditor Info Section */}
            <div className="grid grid-cols-2 gap-3 text-sm bg-slate-50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <CreditorIcon className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-slate-500 text-xs">Jenis Kreditor</span>
                  <p className="font-medium">{creditorInfo.label}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-slate-500 text-xs">Kreditor</span>
                  <p className="font-medium">{payable.supplierName}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-slate-500 text-xs">Tanggal Dibuat</span>
                  <p className="font-medium">{format(payable.createdAt, 'd MMM yyyy', { locale: id })}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <span className="text-slate-500 text-xs">Jatuh Tempo</span>
                  <p className={`font-medium ${overdueDays !== null && overdueDays > 0 ? 'text-red-600' : ''}`}>
                    {payable.dueDate ? format(payable.dueDate, 'd MMM yyyy', { locale: id }) : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Amount Card */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Informasi Pembayaran
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Total Hutang</span>
                  <span className="font-mono font-bold text-lg">{formatCurrency(payable.amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Sudah Dibayar</span>
                  <span className="font-mono font-bold text-green-600">{formatCurrency(payable.paidAmount || 0)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-slate-700 font-medium">Sisa Hutang</span>
                  <span className="font-mono font-bold text-lg text-red-600">{formatCurrency(remainingAmount)}</span>
                </div>

                {/* Progress Bar */}
                <div className="pt-2">
                  <div className="flex justify-between text-xs text-slate-500 mb-1">
                    <span>Progress Pembayaran</span>
                    <span>{paidPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${paidPercentage >= 100 ? 'bg-green-500' : paidPercentage > 0 ? 'bg-yellow-500' : 'bg-slate-300'}`}
                      style={{ width: `${Math.min(paidPercentage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interest Info */}
            {payable.interestRate && payable.interestRate > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Informasi Bunga</h4>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Suku Bunga</span>
                  <span className="font-medium">
                    {payable.interestRate}%
                    {payable.interestType === 'per_month' && ' / bulan'}
                    {payable.interestType === 'per_year' && ' / tahun'}
                    {payable.interestType === 'flat' && ' (flat)'}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Account */}
            {payable.status === 'Paid' && paymentAccountName && (
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Banknote className="h-4 w-4" />
                  Akun Pembayaran
                </h4>
                <p className="text-sm">{paymentAccountName}</p>
                {payable.paidAt && (
                  <p className="text-xs text-slate-500 mt-1">
                    Dilunasi: {format(payable.paidAt, 'd MMM yyyy HH:mm', { locale: id })}
                  </p>
                )}
              </div>
            )}

            {/* Description */}
            <div className="border rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">Deskripsi</h4>
              <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                {payable.description || '-'}
              </p>
            </div>

            {/* Notes */}
            {payable.notes && (
              <div className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold mb-2">Catatan</h4>
                <p className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                  {payable.notes}
                </p>
              </div>
            )}

            {/* Print PDF Button */}
            <div className="pt-4 border-t flex justify-end">
              <Button
                onClick={handlePrintPDF}
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={isGenerating}
              >
                <FileDown className="h-4 w-4" />
                {isGenerating ? "Membuat PDF..." : "Cetak PDF"}
              </Button>
            </div>
          </TabsContent>

          {/* Tab Angsuran */}
          <TabsContent value="installment" className="mt-4">
            <DebtInstallmentTab debt={payable} onUpdate={onUpdate} />
          </TabsContent>
        </Tabs>
      </DialogContent>

      {/* Hidden PDF Content */}
      <div className="fixed -left-[9999px] top-0 z-[-1]">
        <div
          ref={printRef}
          className="bg-white p-4 border"
          style={{
            width: '559px',
            height: 'auto',
            fontSize: '11px',
            fontFamily: 'Arial, sans-serif'
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-3 pb-2 border-b border-gray-300">
            <div>
              {settings?.logo && (
                <img
                  src={settings.logo}
                  alt="Logo"
                  className="h-8 w-auto mb-1"
                />
              )}
              <h1 className="text-sm font-bold text-gray-900">
                {settings?.name || 'AQUAVIT'}
              </h1>
              <p className="text-xs text-gray-600">{settings?.phone || ''}</p>
            </div>
            <div className="text-right">
              <h2 className="text-base font-bold text-gray-400">DETAIL HUTANG</h2>
              <p className="text-xs"><strong>ID:</strong> {payable.id}</p>
            </div>
          </div>

          {/* Info Section */}
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <div>
              <p><strong>Kreditor:</strong> {payable.supplierName}</p>
              <p><strong>Jenis:</strong> {creditorInfo.label}</p>
              <p><strong>Tanggal:</strong> {format(payable.createdAt, 'd/MM/yyyy', { locale: id })}</p>
            </div>
            <div>
              <p><strong>Status:</strong> {statusInfo.label}</p>
              <p><strong>Jatuh Tempo:</strong> {payable.dueDate ? format(payable.dueDate, 'd/MM/yyyy', { locale: id }) : '-'}</p>
              {overdueDays !== null && overdueDays > 0 && payable.status !== 'Paid' && (
                <p className="text-red-600"><strong>Terlambat:</strong> {overdueDays} hari</p>
              )}
            </div>
          </div>

          {/* Amount Table */}
          <div className="mb-3">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 text-left">Keterangan</th>
                  <th className="border border-gray-300 px-2 py-1 text-right w-32">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-2 py-1">Total Hutang</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-mono">
                    {formatCurrency(payable.amount)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-2 py-1">Sudah Dibayar</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-mono text-green-600">
                    {formatCurrency(payable.paidAmount || 0)}
                  </td>
                </tr>
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1">Sisa Hutang</td>
                  <td className="border border-gray-300 px-2 py-1 text-right font-mono text-red-600">
                    {formatCurrency(remainingAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Interest Info */}
          {payable.interestRate && payable.interestRate > 0 && (
            <div className="mb-3 text-xs">
              <p><strong>Bunga:</strong> {payable.interestRate}%
                {payable.interestType === 'per_month' && ' per bulan'}
                {payable.interestType === 'per_year' && ' per tahun'}
                {payable.interestType === 'flat' && ' (flat)'}
              </p>
            </div>
          )}

          {/* Description */}
          <div className="mb-3">
            <p className="text-xs"><strong>Deskripsi:</strong></p>
            <p className="text-xs bg-gray-50 p-2 rounded mt-1">{payable.description || '-'}</p>
          </div>

          {/* Notes */}
          {payable.notes && (
            <div className="mb-3">
              <p className="text-xs"><strong>Catatan:</strong></p>
              <p className="text-xs bg-gray-50 p-2 rounded mt-1">{payable.notes}</p>
            </div>
          )}

          {/* Payment Info */}
          {payable.status === 'Paid' && (
            <div className="mb-3 text-xs bg-green-50 p-2 rounded">
              <p><strong>Status:</strong> Lunas</p>
              {paymentAccountName && <p><strong>Akun Pembayaran:</strong> {paymentAccountName}</p>}
              {payable.paidAt && <p><strong>Tanggal Pelunasan:</strong> {format(payable.paidAt, 'd/MM/yyyy HH:mm', { locale: id })}</p>}
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="text-center text-xs">
              <p className="mb-6">Mengetahui</p>
              <div className="border-t border-gray-400 pt-1">
                <p>_______________</p>
                <p className="text-gray-500">Manager</p>
              </div>
            </div>
            <div className="text-center text-xs">
              <p className="mb-6">Yang Bertanggung Jawab</p>
              <div className="border-t border-gray-400 pt-1">
                <p>_______________</p>
                <p className="text-gray-500">Admin Keuangan</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 pt-1 border-t text-center text-xs text-gray-500">
            <p>Dicetak: {format(new Date(), "dd/MM/yyyy HH:mm", { locale: id })}</p>
          </div>
        </div>
      </div>
    </Dialog>
  )
}