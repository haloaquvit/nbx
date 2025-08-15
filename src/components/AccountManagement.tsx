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
import { Checkbox } from "@/components/ui/checkbox"
import { useAccounts } from "@/hooks/useAccounts"
import { useToast } from "./ui/use-toast"
import { AccountType } from "@/types/account"
import { useNavigate } from "react-router-dom"
import { Skeleton } from "./ui/skeleton"
import { useAuth } from "@/hooks/useAuth"
import { supabase } from "@/integrations/supabase/client"
import { TransferAccountDialog } from "./TransferAccountDialog"
import { CashInOutDialog } from "./CashInOutDialog"
import { Trash2, ArrowRightLeft, TrendingUp, TrendingDown } from "lucide-react"
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

const accountSchema = z.object({
  name: z.string().min(3, "Nama akun minimal 3 karakter."),
  type: z.enum(['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban']),
  balance: z.coerce.number().min(0, "Saldo awal tidak boleh negatif."),
  initialBalance: z.coerce.number().min(0, "Saldo awal tidak boleh negatif."),
  isPaymentAccount: z.boolean().default(false),
})

type AccountFormData = z.infer<typeof accountSchema>

const accountTypes: AccountType[] = ['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban'];

export function AccountManagement() {
  const { accounts, isLoading, addAccount, deleteAccount } = useAccounts()
  const { toast } = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [isCashInDialogOpen, setIsCashInDialogOpen] = useState(false)
  const [isCashOutDialogOpen, setIsCashOutDialogOpen] = useState(false)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      type: 'Aset',
      balance: 0,
      initialBalance: 0,
      isPaymentAccount: false,
    }
  })

  const onSubmit = (data: AccountFormData) => {
    const newAccountData = {
      name: data.name,
      type: data.type,
      balance: data.balance,
      initialBalance: data.balance, // Set initial balance equal to balance for new accounts
      isPaymentAccount: data.isPaymentAccount,
    };
    addAccount.mutate(newAccountData, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Akun berhasil ditambahkan." })
        reset({
          name: '',
          balance: 0,
          initialBalance: 0,
          isPaymentAccount: false,
          type: 'Aset'
        })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: error.message })
      }
    })
  }

  const handleDelete = (accountId: string, accountName: string) => {
    deleteAccount.mutate(accountId, {
      onSuccess: () => {
        toast({ title: "Sukses", description: `Akun "${accountName}" berhasil dihapus.` })
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: `Tidak dapat menghapus akun. Mungkin akun ini masih terkait dengan data lain. Error: ${error.message}` })
      }
    })
  }

  const isAdminOrOwner = user?.role === 'admin' || user?.role === 'owner';
  const canManageCash = user?.role === 'owner' || user?.role === 'admin' || user?.role === 'cashier';

  return (
    <div className="space-y-6">
      <TransferAccountDialog 
        open={isTransferDialogOpen} 
        onOpenChange={setIsTransferDialogOpen} 
      />
      <CashInOutDialog
        open={isCashInDialogOpen}
        onOpenChange={setIsCashInDialogOpen}
        type="in"
        title="Kas Masuk"
        description="Input pemasukan kas secara manual"
      />
      <CashInOutDialog
        open={isCashOutDialogOpen}
        onOpenChange={setIsCashOutDialogOpen}
        type="out"
        title="Kas Keluar"
        description="Input pengeluaran kas secara manual"
      />
      
          <Card>
            <CardHeader>
              <CardTitle>Tambah Akun Keuangan Baru</CardTitle>
              <CardDescription>Buat akun baru untuk melacak keuangan perusahaan.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nama Akun</Label>
                    <Input id="name" {...register("name")} />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Tipe Akun</Label>
                    <Select onValueChange={(value: AccountType) => setValue("type", value)} defaultValue="Aset">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{accountTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                    </Select>
                    {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="balance">Saldo Awal (Rp)</Label>
                    <Input id="balance" type="number" {...register("balance")} />
                    {errors.balance && <p className="text-sm text-destructive">{errors.balance.message}</p>}
                  </div>
                  <div className="flex items-center space-x-2 pb-2">
                    <Checkbox id="isPaymentAccount" onCheckedChange={(checked) => setValue('isPaymentAccount', !!checked)} />
                    <Label htmlFor="isPaymentAccount" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Akun Pembayaran?
                    </Label>
                  </div>
                </div>
                <Button type="submit" disabled={addAccount.isPending}>
                  {addAccount.isPending ? "Menyimpan..." : "Simpan Akun"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Daftar Akun</CardTitle>
                <CardDescription>Kelola semua akun keuangan perusahaan</CardDescription>
              </div>
              {canManageCash && (
                <div className="flex gap-2">
                  <Button 
                    onClick={() => setIsCashInDialogOpen(true)} 
                    variant="outline"
                    size="sm"
                    className="text-green-600 border-green-600 hover:bg-green-50"
                  >
                    <TrendingUp className="mr-2 h-4 w-4" /> 
                    Kas Masuk
                  </Button>
                  <Button 
                    onClick={() => setIsCashOutDialogOpen(true)} 
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                  >
                    <TrendingDown className="mr-2 h-4 w-4" /> 
                    Kas Keluar
                  </Button>
                  <Button 
                    onClick={() => setIsTransferDialogOpen(true)} 
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-600 hover:bg-blue-50"
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4" /> 
                    Transfer
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama Akun</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      {user?.role === 'owner' && <TableHead className="text-right">Edit Saldo</TableHead>}
                      {isAdminOrOwner && <TableHead className="text-right">Aksi</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? 
                      Array.from({ length: 3 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={user?.role === 'owner' ? (isAdminOrOwner ? 5 : 4) : (isAdminOrOwner ? 4 : 3)}><Skeleton className="h-6 w-full" /></TableCell>
                        </TableRow>
                      )) :
                      accounts?.map(account => (
                        <TableRow key={account.id} className="hover:bg-muted/50">
                          <TableCell className="font-medium cursor-pointer" onClick={() => navigate(`/accounts/${account.id}`)}>{account.name}</TableCell>
                          <TableCell className="cursor-pointer" onClick={() => navigate(`/accounts/${account.id}`)}>{account.type}</TableCell>
                          <TableCell className="text-right cursor-pointer" onClick={() => navigate(`/accounts/${account.id}`)}>
                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(account.balance)}
                          </TableCell>
                          {user?.role === 'owner' && (
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                defaultValue={account.balance}
                                className="w-32 text-right"
                                onBlur={async (e) => {
                                  const newBalance = parseFloat(e.target.value);
                                  if (newBalance !== account.balance && !isNaN(newBalance)) {
                                    try {
                                      const { error } = await supabase
                                        .from('accounts')
                                        .update({ balance: newBalance })
                                        .eq('id', account.id);
                                      
                                      if (error) throw error;
                                      
                                      toast({ title: "Sukses", description: `Saldo akun ${account.name} berhasil diubah ke ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(newBalance)}` });
                                      window.location.reload(); // Refresh to show new balance
                                    } catch (error: any) {
                                      toast({ variant: "destructive", title: "Gagal", description: error.message });
                                      e.target.value = account.balance.toString(); // Reset to original value
                                    }
                                  }
                                }}
                              />
                            </TableCell>
                          )}
                          {isAdminOrOwner && (
                            <TableCell className="text-right">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={deleteAccount.isPending}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Anda yakin ingin menghapus akun ini?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tindakan ini tidak dapat dibatalkan. Menghapus akun "{account.name}" akan menghapusnya secara permanen. Pastikan tidak ada transaksi yang terkait dengan akun ini.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Batal</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(account.id, account.name)}
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
              </div>
            </CardContent>
          </Card>
    </div>
  )
}