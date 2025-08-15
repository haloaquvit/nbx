"use client"
import { useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useQuotationById, useQuotations } from "@/hooks/useQuotations"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, FileText, User, Calendar, CheckCircle, AlertCircle, Printer, ShieldCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { PrintQuotationDialog } from "@/components/PrintQuotationDialog"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useTransactions } from "@/hooks/useTransactions"
import { useAuth } from "@/hooks/useAuth"
import { TransactionStatus, PaymentStatus } from "@/types/transaction"

export default function QuotationDetailPage() {
  const { id: quotationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { quotation, isLoading } = useQuotationById(quotationId || "")
  const { updateQuotation } = useQuotations()
  const { addTransaction } = useTransactions()
  const { user } = useAuth()
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)

  const handleConvertToTransaction = () => {
    if (!quotation) return;
    navigate('/pos', { state: { quotationData: quotation } });
  };

  const handleApproveQuotation = () => {
    if (!quotationId || !quotation || !user) return;

    const newTransactionData = {
      id: `T-${Date.now()}`,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      cashierId: user.id,
      cashierName: user.name,
      orderDate: new Date(),
      items: quotation.items,
      total: quotation.total,
      paidAmount: 0,
      paymentStatus: 'Belum Lunas' as PaymentStatus,
      status: 'Pesanan Masuk' as TransactionStatus,
    };

    updateQuotation.mutate({ quotationId, newData: { status: 'Disetujui' } }, {
      onSuccess: (updatedQuotation) => {
        toast({ title: "Sukses", description: "Penawaran disetujui. Membuat transaksi..." })
        
        addTransaction.mutate({ newTransaction: newTransactionData, quotationId: updatedQuotation.id }, {
          onSuccess: (newTransaction) => {
            toast({
              title: "Transaksi Dibuat!",
              description: `Transaksi ${newTransaction.id} berhasil dibuat.`,
              action: <Button size="sm" onClick={() => navigate(`/transactions/${newTransaction.id}`)}>Lihat</Button>
            })
          },
          onError: (error) => {
            toast({ variant: "destructive", title: "Gagal Membuat Transaksi", description: error.message })
          }
        });
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  if (!quotation) {
    return <div className="text-center"><h2>Penawaran tidak ditemukan</h2></div>
  }

  const canBeApproved = ['Draft', 'Terkirim'].includes(quotation.status);

  return (
    <>
      <PrintQuotationDialog
        open={isPrintDialogOpen}
        onOpenChange={setIsPrintDialogOpen}
        quotation={quotation}
      />
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Detail Penawaran</h1>
            <p className="text-muted-foreground">Rincian untuk penawaran <Badge variant="outline">{quotation.id}</Badge></p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline"><Link to="/quotations"><ArrowLeft className="mr-2 h-4 w-4" /> Kembali</Link></Button>
            <Button onClick={() => setIsPrintDialogOpen(true)}><Printer className="mr-2 h-4 w-4" /> Cetak Penawaran</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Item Penawaran</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Jumlah</TableHead><TableHead className="text-right">Harga</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {quotation.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.product.name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell className="text-right">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price)}</TableCell>
                        <TableCell className="text-right">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.price * item.quantity)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            
            {canBeApproved && (
              <Card className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800">
                <CardHeader>
                  <CardTitle className="text-amber-700 dark:text-amber-400">Tindakan Diperlukan</CardTitle>
                  <CardDescription>Penawaran ini masih dalam status draft atau terkirim. Setujui penawaran untuk melanjutkan ke transaksi.</CardDescription>
                </CardHeader>
                <CardContent>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="success" disabled={updateQuotation.isPending || addTransaction.isPending}><ShieldCheck className="mr-2 h-4 w-4" /> Setujui Penawaran</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Anda yakin ingin menyetujui penawaran ini?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Setelah disetujui, transaksi akan dibuat secara otomatis. Tindakan ini tidak dapat dibatalkan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Batal</AlertDialogCancel>
                        <AlertDialogAction onClick={handleApproveQuotation} disabled={updateQuotation.isPending || addTransaction.isPending}>
                          Ya, Setujui & Buat Transaksi
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            )}

            {quotation.status === 'Disetujui' && !quotation.transactionId && (
              <Card className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                <CardHeader className="flex-row items-center gap-4 space-y-0">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <CardTitle className="text-green-700 dark:text-green-400">Penawaran Disetujui</CardTitle>
                    <p className="text-sm text-green-600 dark:text-green-500">Sedang membuat transaksi dari penawaran ini...</p>
                  </div>
                </CardHeader>
              </Card>
            )}
            {quotation.transactionId && (
              <Card className="bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                <CardHeader className="flex-row items-center gap-4 space-y-0">
                  <CheckCircle className="h-8 w-8 text-blue-500" />
                  <div>
                    <CardTitle className="text-blue-700 dark:text-blue-400">Sudah Menjadi Transaksi</CardTitle>
                    <p className="text-sm text-blue-600 dark:text-blue-500">Penawaran ini telah dikonversi menjadi transaksi dengan nomor <Link to={`/transactions/${quotation.transactionId}`} className="font-bold underline"><Badge variant="secondary">{quotation.transactionId}</Badge></Link>.</p>
                  </div>
                </CardHeader>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Informasi</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-2"><User className="h-4 w-4 text-muted-foreground" /> <span>{quotation.customerName}</span></div>
                <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /> <span>Dibuat: {format(new Date(quotation.createdAt), "d MMM yyyy", { locale: id })}</span></div>
                <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-muted-foreground" /> <span>Berlaku hingga: {format(new Date(quotation.validUntil), "d MMM yyyy", { locale: id })}</span></div>
                <div className="flex items-center gap-2"><Badge>{quotation.status}</Badge></div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  )
}