"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExpenses } from "@/hooks/useExpenses"
import { useAccounts } from "@/hooks/useAccounts"
import { useToast } from "./ui/use-toast"
import { DateTimePicker } from "./ui/datetime-picker"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { useAuth } from "@/hooks/useAuth"
import { canManageCash } from '@/utils/roleUtils'
import { Trash2 } from "lucide-react"
import { ExpenseReceiptPDF } from "./ExpenseReceiptPDF"
import { Badge } from "./ui/badge"
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

const expenseSchema = z.object({
  description: z.string().min(3, "Deskripsi minimal 3 karakter."),
  amount: z.coerce.number().min(1, "Jumlah harus lebih dari 0."),
  accountId: z.string().min(1, "Pilih akun pembayaran."),
  date: z.date({ required_error: "Tanggal harus diisi." }),
  expenseAccountId: z.string().min(1, "Pilih akun beban."),
})

type ExpenseFormData = z.infer<typeof expenseSchema>

export function ExpenseManagement() {
  const { expenses, isLoading: isLoadingExpenses, addExpense, deleteExpense } = useExpenses()
  const { accounts, isLoading: isLoadingAccounts } = useAccounts()
  const { toast } = useToast()
  const { user } = useAuth()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: 0,
      accountId: "",
      date: new Date(),
      expenseAccountId: "",
    }
  })

  const watchDate = watch("date")
  const canDeleteExpense = canManageCash(user);

  // Filter akun beban (type = 'Beban') yang bukan header
  const expenseAccounts = accounts?.filter(a => a.type === 'Beban' && !a.isHeader) || [];

  const onSubmit = async (data: ExpenseFormData) => {
    const paymentAccount = accounts?.find(a => a.id === data.accountId)
    const expenseAccount = accounts?.find(a => a.id === data.expenseAccountId)
    if (!paymentAccount || !expenseAccount) return

    const newExpenseData = {
      description: data.description,
      amount: data.amount,
      accountId: data.accountId, // Payment account (kas/bank)
      accountName: paymentAccount.name, // Payment account name
      expenseAccountId: data.expenseAccountId, // Expense account from CoA
      expenseAccountName: expenseAccount.name, // Expense account name
      date: data.date,
      category: expenseAccount.name, // For backward compatibility with reports
    };

    addExpense.mutate(newExpenseData, {
      onSuccess: () => {
        toast({
          title: "Sukses",
          description: `Pengeluaran berhasil dicatat ke ${expenseAccount.name}`
        })
        reset({ date: new Date(), description: "", amount: 0, accountId: "", expenseAccountId: "" })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  const handleDelete = (expenseId: string) => {
    deleteExpense.mutate(expenseId, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Pengeluaran berhasil dihapus." })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Catat Pengeluaran Baru</CardTitle>
          <CardDescription>Catat semua pengeluaran operasional perusahaan di sini.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="description">Deskripsi</Label>
                <Input id="description" {...register("description")} />
                {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Jumlah (Rp)</Label>
                <Input id="amount" type="number" {...register("amount")} />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expenseAccountId">Akun Beban</Label>
                <Select onValueChange={(value) => setValue("expenseAccountId", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih akun beban..." />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingAccounts ? (
                      <SelectItem value="loading" disabled>Memuat...</SelectItem>
                    ) : expenseAccounts.length === 0 ? (
                      <SelectItem value="empty" disabled>Tidak ada akun beban</SelectItem>
                    ) : (
                      expenseAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.code ? `${acc.code} - ${acc.name}` : acc.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {errors.expenseAccountId && <p className="text-sm text-destructive">{errors.expenseAccountId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Tanggal</Label>
                <DateTimePicker date={watchDate} setDate={(d) => setValue("date", d || new Date())} />
                {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="accountId">Dibayar Dari Akun</Label>
                    <Select onValueChange={(value) => setValue("accountId", value)}>
                        <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
                        <SelectContent>
                            {isLoadingAccounts ? <SelectItem value="loading" disabled>Memuat...</SelectItem> :
                            accounts?.filter(a => a.isPaymentAccount).map(acc => (
                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
                </div>
            </div>
            <Button type="submit" disabled={addExpense.isPending}>
              {addExpense.isPending ? "Menyimpan..." : "Simpan Pengeluaran"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pengeluaran</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead>Akun</TableHead>
                <TableHead>Sumber Dana</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
                <TableHead className="text-center">Kwitansi</TableHead>
                {canDeleteExpense && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingExpenses ? <TableRow><TableCell colSpan={canDeleteExpense ? 7 : 6}>Memuat...</TableCell></TableRow> :
                expenses?.map(exp => {
                  const isDebtPayment = exp.category === 'Pembayaran Hutang';
                  return (
                    <TableRow key={exp.id}>
                      <TableCell>{format(new Date(exp.date), "d MMM yyyy", { locale: id })}</TableCell>
                      <TableCell className="font-medium">{exp.description}</TableCell>
                      <TableCell>
                        <Badge
                          variant={isDebtPayment ? "outline" : "secondary"}
                          className={`w-fit ${isDebtPayment ? 'bg-blue-50 text-blue-700 border-blue-200' : ''}`}
                        >
                          {exp.expenseAccountName || exp.category}
                        </Badge>
                      </TableCell>
                      <TableCell>{exp.accountName || '-'}</TableCell>
                      <TableCell className="text-right">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(exp.amount)}</TableCell>
                      <TableCell className="text-center">
                        {!isDebtPayment && <ExpenseReceiptPDF expense={exp} />}
                        {isDebtPayment && <span className="text-xs text-muted-foreground">-</span>}
                      </TableCell>
                      {canDeleteExpense && (
                        <TableCell className="text-right">
                          {!isDebtPayment ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Apakah Anda yakin?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tindakan ini tidak dapat dibatalkan. Ini akan menghapus data pengeluaran dan mengembalikan saldo ke akun terkait.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Batal</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(exp.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Ya, Hapus
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              }
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}