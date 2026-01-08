"use client"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useExpenses } from "@/hooks/useExpenses"
import { useAccounts } from "@/hooks/useAccounts"
import { useToast } from "./ui/use-toast"
import { DateTimePicker } from "./ui/datetime-picker"
import { format } from "date-fns"
import { id } from "date-fns/locale/id"
import { useAuth } from "@/hooks/useAuth"
import { canManageCash } from '@/utils/roleUtils'
import { Trash2, Check, ChevronsUpDown, Filter, X } from "lucide-react"
import { ExpenseReceiptPDF } from "./ExpenseReceiptPDF"
import { Badge } from "./ui/badge"
import { cn } from "@/lib/utils"
import { useTimezone } from "@/contexts/TimezoneContext"
import { getOfficeTime } from "@/utils/officeTime"
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
import { formatNumber, parseFormattedNumber } from "@/utils/formatNumber"

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
  const { timezone } = useTimezone()
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      description: "",
      amount: 0,
      accountId: "",
      date: getOfficeTime(timezone),
      expenseAccountId: "",
    }
  })

  // Watch amount for external changes (like reset)
  const watchAmount = watch("amount")
  const [displayAmount, setDisplayAmount] = useState("")

  // Sync display amount with form amount (e.g. after submit/reset)
  useEffect(() => {
    const currentParsed = displayAmount ? parseFormattedNumber(displayAmount) : 0;
    if (watchAmount !== currentParsed) {
      setDisplayAmount(watchAmount ? formatNumber(watchAmount) : "");
    }
  }, [watchAmount]) // Removed displayAmount dependency to avoid loop, we just read current value

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Remove non-digits
    const cleanValue = value.replace(/[^0-9]/g, '')

    if (cleanValue === '') {
      setDisplayAmount('')
      setValue('amount', 0)
      return
    }

    const num = parseInt(cleanValue, 10)
    if (!isNaN(num)) {
      setDisplayAmount(formatNumber(num))
      setValue('amount', num)
    }
  }

  const watchDate = watch("date")
  const watchExpenseAccountId = watch("expenseAccountId")
  const canDeleteExpense = canManageCash(user);
  const [expenseAccountOpen, setExpenseAccountOpen] = useState(false);

  // Filter states
  const [filterStartDate, setFilterStartDate] = useState<Date | undefined>(undefined);
  const [filterEndDate, setFilterEndDate] = useState<Date | undefined>(undefined);
  const [filterExpenseAccountId, setFilterExpenseAccountId] = useState<string>("all");
  const [filterPaymentAccountId, setFilterPaymentAccountId] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);

  // Filter akun beban (type = 'Beban') yang bukan header
  const expenseAccounts = accounts?.filter(a => a.type === 'Beban' && !a.isHeader) || [];

  // Payment accounts for filter
  const paymentAccounts = accounts?.filter(a => a.isPaymentAccount) || [];

  // Get selected expense account for display
  const selectedExpenseAccount = expenseAccounts.find(a => a.id === watchExpenseAccountId);

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
        reset({ date: getOfficeTime(timezone), description: "", amount: 0, accountId: "", expenseAccountId: "" })
        setDisplayAmount("") // Ensure display cleared
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

  // Filter expenses
  const filteredExpenses = expenses?.filter(exp => {
    // Date filter
    if (filterStartDate) {
      const expDate = new Date(exp.date);
      expDate.setHours(0, 0, 0, 0);
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      if (expDate < startDate) return false;
    }
    if (filterEndDate) {
      const expDate = new Date(exp.date);
      expDate.setHours(23, 59, 59, 999);
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      if (expDate > endDate) return false;
    }
    // Expense account filter (skip if "all")
    if (filterExpenseAccountId && filterExpenseAccountId !== "all" && exp.expenseAccountId !== filterExpenseAccountId) return false;
    // Payment account (sumber dana) filter (skip if "all")
    if (filterPaymentAccountId && filterPaymentAccountId !== "all" && exp.accountId !== filterPaymentAccountId) return false;
    return true;
  }) || [];

  const clearFilters = () => {
    setFilterStartDate(undefined);
    setFilterEndDate(undefined);
    setFilterExpenseAccountId("all");
    setFilterPaymentAccountId("all");
  };

  const hasActiveFilters = filterStartDate || filterEndDate || (filterExpenseAccountId && filterExpenseAccountId !== "all") || (filterPaymentAccountId && filterPaymentAccountId !== "all");

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
                <Input
                  id="amount"
                  value={displayAmount}
                  onChange={handleAmountChange}
                  placeholder="0"
                  autoComplete="off"
                />
                {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expenseAccountId">Akun Beban</Label>
                <Popover open={expenseAccountOpen} onOpenChange={setExpenseAccountOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={expenseAccountOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedExpenseAccount
                        ? (selectedExpenseAccount.code ? `${selectedExpenseAccount.code} - ${selectedExpenseAccount.name}` : selectedExpenseAccount.name)
                        : "Pilih akun beban..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0">
                    <Command>
                      <CommandInput placeholder="Cari akun beban..." />
                      <CommandList>
                        <CommandEmpty>Akun tidak ditemukan.</CommandEmpty>
                        <CommandGroup>
                          {isLoadingAccounts ? (
                            <CommandItem disabled>Memuat...</CommandItem>
                          ) : (
                            expenseAccounts.map(acc => (
                              <CommandItem
                                key={acc.id}
                                value={acc.code ? `${acc.code} ${acc.name}` : acc.name}
                                onSelect={() => {
                                  setValue("expenseAccountId", acc.id);
                                  setExpenseAccountOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    watchExpenseAccountId === acc.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {acc.code ? `${acc.code} - ${acc.name}` : acc.name}
                              </CommandItem>
                            ))
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {errors.expenseAccountId && <p className="text-sm text-destructive">{errors.expenseAccountId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Tanggal</Label>
                <DateTimePicker date={watchDate} setDate={(d) => setValue("date", d || getOfficeTime(timezone))} />
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Riwayat Pengeluaran</CardTitle>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filter
            {hasActiveFilters && <Badge variant="secondary" className="ml-2">{[filterStartDate, filterEndDate, filterExpenseAccountId, filterPaymentAccountId].filter(Boolean).length}</Badge>}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filter Section */}
          {showFilters && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/50 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Dari Tanggal</Label>
                  <DateTimePicker
                    date={filterStartDate}
                    setDate={setFilterStartDate}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sampai Tanggal</Label>
                  <DateTimePicker
                    date={filterEndDate}
                    setDate={setFilterEndDate}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Akun Beban</Label>
                  <Select value={filterExpenseAccountId} onValueChange={setFilterExpenseAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua akun beban" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua akun beban</SelectItem>
                      {expenseAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.code ? `${acc.code} - ${acc.name}` : acc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sumber Dana</Label>
                  <Select value={filterPaymentAccountId} onValueChange={setFilterPaymentAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Semua sumber dana" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua sumber dana</SelectItem>
                      {paymentAccounts.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasActiveFilters && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Menampilkan {filteredExpenses.length} dari {expenses?.length || 0} pengeluaran
                  </p>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Hapus Filter
                  </Button>
                </div>
              )}
            </div>
          )}

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
                filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDeleteExpense ? 7 : 6} className="text-center text-muted-foreground py-8">
                      {hasActiveFilters ? 'Tidak ada pengeluaran yang sesuai filter' : 'Belum ada pengeluaran'}
                    </TableCell>
                  </TableRow>
                ) :
                filteredExpenses.map(exp => {
                  const isDebtPayment = exp.category === 'Pembayaran Hutang';
                  return (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <div>{format(new Date(exp.date), "d MMM yyyy", { locale: id })}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(exp.date), "HH:mm")}</div>
                      </TableCell>
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