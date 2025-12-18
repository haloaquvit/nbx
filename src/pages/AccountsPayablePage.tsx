"use client"

import { useState } from 'react'
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
import { DollarSign, FileText, Calendar, AlertCircle, Download, Edit, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { AddDebtDialog } from '@/components/AddDebtDialog'
import { useBranch } from '@/contexts/BranchContext'
import * as XLSX from 'xlsx'
import { supabase } from '@/integrations/supabase/client'
import { formatNumberWithCommas, parseNumberWithCommas } from '@/utils/formatNumber'

export default function AccountsPayablePage() {
  const { currentBranch } = useBranch();
  const [paymentDialog, setPaymentDialog] = useState({ open: false, payable: null as any })
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [deleteDialog, setDeleteDialog] = useState({ open: false, payable: null as any })
  const [isDeleting, setIsDeleting] = useState(false)

  const { accountsPayable, isLoading, payAccountsPayable } = useAccountsPayable()
  const { accounts } = useAccounts()
  const { toast } = useToast()

  const paymentAccounts = accounts?.filter(acc => acc.isPaymentAccount) || []

  // Calculate totals
  const totalOutstanding = accountsPayable?.filter(ap => ap.status === 'Outstanding')
    .reduce((sum, ap) => sum + ap.amount, 0) || 0
  const totalPartial = accountsPayable?.filter(ap => ap.status === 'Partial')
    .reduce((sum, ap) => sum + (ap.amount - (ap.paidAmount || 0)), 0) || 0
  const totalUnpaid = totalOutstanding + totalPartial

  const handlePayment = async () => {
    if (!paymentDialog.payable || !paymentAmount || !paymentAccountId) {
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
        notes: paymentNotes
      })

      toast({
        title: "Sukses",
        description: "Pembayaran hutang berhasil dicatat"
      })

      setPaymentDialog({ open: false, payable: null })
      setPaymentAmount('')
      setPaymentAccountId('')
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

    // Check if debt has been paid
    if (deleteDialog.payable.status === 'Paid' || (deleteDialog.payable.paidAmount && deleteDialog.payable.paidAmount > 0)) {
      toast({
        variant: "destructive",
        title: "Tidak Dapat Dihapus",
        description: "Hutang yang sudah dibayar (sebagian/lunas) tidak dapat dihapus"
      })
      setDeleteDialog({ open: false, payable: null })
      return
    }

    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('accounts_payable')
        .delete()
        .eq('id', deleteDialog.payable.id)

      if (error) throw error

      toast({
        title: "Sukses",
        description: "Hutang berhasil dihapus"
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
    <div className="container mx-auto py-6 space-y-6">
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
                    <TableRow key={payable.id}>
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
                      <TableCell>
                        <div className="flex gap-1">
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
                <Label htmlFor="paymentAccount">Akun Pembayaran</Label>
                <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun pembayaran" />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name} - {formatCurrency(account.balance || 0)}
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
              Apakah Anda yakin ingin menghapus hutang ini? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          {deleteDialog.payable && (
            <div className="bg-muted p-3 rounded">
              <div className="space-y-1 text-sm">
                <div><strong>ID:</strong> {deleteDialog.payable.id}</div>
                <div><strong>Kreditor:</strong> {deleteDialog.payable.supplierName}</div>
                <div><strong>Jumlah:</strong> {formatCurrency(deleteDialog.payable.amount)}</div>
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
    </div>
  )
}