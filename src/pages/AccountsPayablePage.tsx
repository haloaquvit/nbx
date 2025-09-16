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
import { DollarSign, FileText, Calendar, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'

export default function AccountsPayablePage() {
  const [paymentDialog, setPaymentDialog] = useState({ open: false, payable: null as any })
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')

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
      await payAccountsPayable.mutateAsync({
        payableId: paymentDialog.payable.id,
        amount: Number(paymentAmount),
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

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hutang Supplier</h1>
          <p className="text-muted-foreground">
            Kelola pembayaran hutang kepada supplier
          </p>
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
          <CardTitle>Daftar Hutang Supplier</CardTitle>
          <CardDescription>
            Kelola pembayaran hutang berdasarkan Purchase Order
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Hutang</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right">Dibayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Jatuh Tempo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountsPayable?.map((payable) => {
                  const remainingAmount = payable.amount - (payable.paidAmount || 0)
                  const overdueDays = getOverdueDays(payable.dueDate)

                  return (
                    <TableRow key={payable.id}>
                      <TableCell className="font-mono text-sm">
                        {payable.id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {payable.supplierName}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[200px] truncate">
                          {payable.description}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(payable.amount)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(payable.paidAmount || 0)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
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
                        {payable.status !== 'Paid' && (
                          <Button
                            size="sm"
                            onClick={() => openPaymentDialog(payable)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Bayar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(!accountsPayable || accountsPayable.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Tidak ada data hutang supplier
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
    </div>
  )
}