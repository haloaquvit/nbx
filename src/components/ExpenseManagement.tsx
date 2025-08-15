"use client"
import { useState } from "react"
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
import { Trash2 } from "lucide-react"
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
  category: z.string().min(3, "Kategori minimal 3 karakter."),
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
      category: "",
    }
  })

  const watchDate = watch("date")
  const canDeleteExpense = user?.role === 'admin' || user?.role === 'owner' || user?.role === 'cashier';

  const onSubmit = (data: ExpenseFormData) => {
    const account = accounts?.find(a => a.id === data.accountId)
    if (!account) return
    
    const newExpenseData = {
      description: data.description,
      amount: data.amount,
      accountId: data.accountId,
      date: data.date,
      category: data.category,
      accountName: account.name,
    };

    addExpense.mutate(newExpenseData, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Pengeluaran berhasil dicatat." })
        reset({ date: new Date(), description: "", amount: 0, accountId: "", category: "" })
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
                <Label htmlFor="category">Kategori</Label>
                <Input id="category" {...register("category")} placeholder="cth: Operasional" />
                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
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
            <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Deskripsi</TableHead><TableHead>Kategori</TableHead><TableHead>Sumber Dana</TableHead><TableHead className="text-right">Jumlah</TableHead>{canDeleteExpense && <TableHead className="text-right">Aksi</TableHead>}</TableRow></TableHeader>
            <TableBody>
              {isLoadingExpenses ? <TableRow><TableCell colSpan={canDeleteExpense ? 6 : 5}>Memuat...</TableCell></TableRow> :
                expenses?.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>{format(new Date(exp.date), "d MMM yyyy", { locale: id })}</TableCell>
                    <TableCell className="font-medium">{exp.description}</TableCell>
                    <TableCell>{exp.category}</TableCell>
                    <TableCell>{exp.accountName}</TableCell>
                    <TableCell className="text-right">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(exp.amount)}</TableCell>
                    {canDeleteExpense && (
                      <TableCell className="text-right">
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
                      </TableCell>
                    )}
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}