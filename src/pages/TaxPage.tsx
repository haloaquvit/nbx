"use client"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Receipt,
  TrendingUp,
  TrendingDown,
  Calculator,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Wallet,
  FileText,
  CreditCard,
} from "lucide-react"
import { useTax } from "@/hooks/useTax"
import { useAccounts } from "@/hooks/useAccounts"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"
import { id as localeId } from "date-fns/locale"

export default function TaxPage() {
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [ppnMasukanToUse, setPpnMasukanToUse] = useState<number>(0)
  const [ppnKeluaranToPay, setPpnKeluaranToPay] = useState<number>(0)
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")
  const [paymentNotes, setPaymentNotes] = useState<string>("")
  const [activeTab, setActiveTab] = useState<string>("summary")

  const { toast } = useToast()
  const {
    taxSummary,
    taxTransactions,
    taxPayments,
    isLoading,
    payTax,
    checkTaxReminder,
  } = useTax()
  const { accounts } = useAccounts()

  // Filter cash/bank accounts for payment
  const cashBankAccounts = accounts?.filter(
    (acc) => acc.code?.startsWith('11') && !acc.isHeader
  ) || []

  const taxReminder = checkTaxReminder()

  const handleOpenPaymentDialog = () => {
    // Pre-fill with current balances
    setPpnMasukanToUse(Math.min(taxSummary?.ppnMasukan?.balance || 0, taxSummary?.ppnKeluaran?.balance || 0))
    setPpnKeluaranToPay(taxSummary?.ppnKeluaran?.balance || 0)
    setPaymentAccountId("")
    setPaymentNotes("")
    setIsPaymentDialogOpen(true)
  }

  const handlePayTax = async () => {
    if (!paymentAccountId) {
      toast({
        title: "Error",
        description: "Pilih akun pembayaran",
        variant: "destructive",
      })
      return
    }

    if (ppnKeluaranToPay <= 0) {
      toast({
        title: "Error",
        description: "Jumlah PPN Keluaran harus lebih dari 0",
        variant: "destructive",
      })
      return
    }

    const netPayment = ppnKeluaranToPay - ppnMasukanToUse
    if (netPayment < 0) {
      toast({
        title: "Error",
        description: "PPN Masukan tidak boleh lebih besar dari PPN Keluaran",
        variant: "destructive",
      })
      return
    }

    const period = taxSummary?.taxPeriod || new Date().toISOString().slice(0, 7)

    try {
      await payTax.mutateAsync({
        period,
        ppnMasukanToUse,
        ppnKeluaranToPay,
        paymentAccountId,
        notes: paymentNotes,
      })

      toast({
        title: "Berhasil",
        description: `Pembayaran pajak periode ${period} berhasil dicatat`,
      })
      setIsPaymentDialogOpen(false)
    } catch (error: any) {
      toast({
        title: "Gagal",
        description: error.message || "Gagal mencatat pembayaran pajak",
        variant: "destructive",
      })
    }
  }

  const netPayment = ppnKeluaranToPay - ppnMasukanToUse

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pajak (PPN)</h1>
          <p className="text-muted-foreground">
            Kelola PPN Masukan dan PPN Keluaran perusahaan
          </p>
        </div>
        <Button
          onClick={handleOpenPaymentDialog}
          disabled={(taxSummary?.netTaxPayable || 0) <= 0}
        >
          <CreditCard className="h-4 w-4 mr-2" />
          Bayar Pajak
        </Button>
      </div>

      {/* Tax Reminder Alert */}
      {taxReminder.isDue && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Peringatan Pajak</AlertTitle>
          <AlertDescription>
            {taxReminder.message}
          </AlertDescription>
        </Alert>
      )}

      {taxReminder.daysUntilDue > 0 && taxReminder.daysUntilDue <= 5 && !taxReminder.isDue && (
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertTitle>Pengingat Pajak</AlertTitle>
          <AlertDescription>
            {taxReminder.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PPN Masukan</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(taxSummary?.ppnMasukan?.balance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Piutang Pajak (dapat dikreditkan)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">PPN Keluaran</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(taxSummary?.ppnKeluaran?.balance || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Hutang Pajak (harus disetor)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pajak Terutang</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(taxSummary?.netTaxPayable || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(taxSummary?.netTaxPayable || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {(taxSummary?.netTaxPayable || 0) > 0 ? 'Harus dibayar' : 'Lebih bayar'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            {(taxSummary?.netTaxPayable || 0) <= 0 ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(taxSummary?.netTaxPayable || 0) <= 0 ? (
                <Badge className="bg-green-100 text-green-800 border-green-300">
                  Lunas
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                  Belum Lunas
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Periode: {taxSummary?.taxPeriod || '-'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary">
            <FileText className="h-4 w-4 mr-1" />
            Ringkasan
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <Receipt className="h-4 w-4 mr-1" />
            Transaksi PPN
          </TabsTrigger>
          <TabsTrigger value="payments">
            <Wallet className="h-4 w-4 mr-1" />
            Riwayat Pembayaran
          </TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  PPN Masukan (Piutang Pajak)
                </CardTitle>
                <CardDescription>
                  Akun: {taxSummary?.ppnMasukan?.accountCode || '1230'} - {taxSummary?.ppnMasukan?.accountName || 'PPN Masukan'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Saldo Saat Ini</span>
                    <span className="text-2xl font-bold text-green-600">
                      {formatCurrency(taxSummary?.ppnMasukan?.balance || 0)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>PPN Masukan adalah pajak yang dibayar saat pembelian barang/jasa yang dapat dikreditkan terhadap PPN Keluaran.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                  PPN Keluaran (Hutang Pajak)
                </CardTitle>
                <CardDescription>
                  Akun: {taxSummary?.ppnKeluaran?.accountCode || '2130'} - {taxSummary?.ppnKeluaran?.accountName || 'PPN Keluaran'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Saldo Saat Ini</span>
                    <span className="text-2xl font-bold text-red-600">
                      {formatCurrency(taxSummary?.ppnKeluaran?.balance || 0)}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>PPN Keluaran adalah pajak yang dipungut saat penjualan barang/jasa yang harus disetor ke negara.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Net Tax Calculation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Perhitungan Pajak Terutang
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span>PPN Keluaran (Hutang)</span>
                  <span className="font-medium">{formatCurrency(taxSummary?.ppnKeluaran?.balance || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span>PPN Masukan (Kredit)</span>
                  <span className="font-medium text-green-600">- {formatCurrency(taxSummary?.ppnMasukan?.balance || 0)}</span>
                </div>
                <div className="flex justify-between items-center py-2 text-lg font-bold">
                  <span>Pajak yang Harus Dibayar</span>
                  <span className={(taxSummary?.netTaxPayable || 0) > 0 ? 'text-red-600' : 'text-green-600'}>
                    {formatCurrency(taxSummary?.netTaxPayable || 0)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaksi yang Mempengaruhi PPN</CardTitle>
              <CardDescription>
                Jurnal yang mempengaruhi akun PPN Masukan atau PPN Keluaran
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="text-right">PPN Masukan</TableHead>
                    <TableHead className="text-right">PPN Keluaran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!taxTransactions || taxTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Belum ada transaksi PPN
                      </TableCell>
                    </TableRow>
                  ) : (
                    taxTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          {format(tx.date, 'dd MMM yyyy', { locale: localeId })}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{tx.description}</div>
                            <div className="text-xs text-muted-foreground">
                              {tx.referenceType}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{tx.referenceId || '-'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.ppnMasukanAmount > 0 ? (
                            <span className="text-green-600">
                              +{formatCurrency(tx.ppnMasukanAmount)}
                            </span>
                          ) : tx.ppnMasukanAmount < 0 ? (
                            <span className="text-red-600">
                              {formatCurrency(tx.ppnMasukanAmount)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.ppnKeluaranAmount > 0 ? (
                            <span className="text-red-600">
                              +{formatCurrency(tx.ppnKeluaranAmount)}
                            </span>
                          ) : tx.ppnKeluaranAmount < 0 ? (
                            <span className="text-green-600">
                              {formatCurrency(tx.ppnKeluaranAmount)}
                            </span>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Pembayaran Pajak</CardTitle>
              <CardDescription>
                Daftar pembayaran pajak yang sudah dilakukan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal Bayar</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">PPN Masukan Dikreditkan</TableHead>
                    <TableHead className="text-right">PPN Keluaran Dibayar</TableHead>
                    <TableHead className="text-right">Pembayaran Bersih</TableHead>
                    <TableHead>Akun Pembayaran</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!taxPayments || taxPayments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Belum ada pembayaran pajak
                      </TableCell>
                    </TableRow>
                  ) : (
                    taxPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>
                          {format(payment.paymentDate, 'dd MMM yyyy', { locale: localeId })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{payment.period}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(payment.ppnMasukanUsed)}
                        </TableCell>
                        <TableCell className="text-right text-red-600">
                          {formatCurrency(payment.ppnKeluaranPaid)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(payment.netPayment)}
                        </TableCell>
                        <TableCell>{payment.paymentAccountName}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Pembayaran Pajak</DialogTitle>
            <DialogDescription>
              Catat pembayaran pajak untuk periode {taxSummary?.taxPeriod}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* PPN Keluaran to Pay */}
            <div className="space-y-2">
              <Label>PPN Keluaran yang Dibayar</Label>
              <Input
                type="number"
                value={ppnKeluaranToPay || ''}
                onChange={(e) => setPpnKeluaranToPay(Number(e.target.value))}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Saldo PPN Keluaran: {formatCurrency(taxSummary?.ppnKeluaran?.balance || 0)}
              </p>
            </div>

            {/* PPN Masukan to Use */}
            <div className="space-y-2">
              <Label>PPN Masukan yang Dikreditkan</Label>
              <Input
                type="number"
                value={ppnMasukanToUse || ''}
                onChange={(e) => setPpnMasukanToUse(Number(e.target.value))}
                placeholder="0"
                max={Math.min(taxSummary?.ppnMasukan?.balance || 0, ppnKeluaranToPay)}
              />
              <p className="text-xs text-muted-foreground">
                Saldo PPN Masukan: {formatCurrency(taxSummary?.ppnMasukan?.balance || 0)}
              </p>
            </div>

            {/* Net Payment Display */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span>Pembayaran Bersih</span>
                <span className="text-xl font-bold">
                  {formatCurrency(netPayment)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                = PPN Keluaran - PPN Masukan yang dikreditkan
              </p>
            </div>

            {/* Payment Account */}
            <div className="space-y-2">
              <Label>Akun Pembayaran (Kas/Bank)</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih akun pembayaran" />
                </SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Catatan (Opsional)</Label>
              <Input
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Catatan pembayaran..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handlePayTax} disabled={payTax.isPending}>
              {payTax.isPending ? 'Menyimpan...' : 'Bayar Pajak'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
