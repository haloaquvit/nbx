"use client"

import React, { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAccounts } from "@/hooks/useAccounts"
import { useToast } from "@/hooks/use-toast"
import { Account, AccountCategory, NormalBalance } from "@/types/account"
import { useAuth } from "@/hooks/useAuth"
import { isOwner, isAdmin, isAdminOrOwner, canManageCash } from "@/utils/roleUtils"
import { ChartOfAccountsTree } from "./ChartOfAccountsTree"
import { 
  STANDARD_COA_TEMPLATE, 
  generateNextAccountCode, 
  validateAccountCode,
  mapLegacyTypeToCategory,
  getNormalBalanceForCategory 
} from "@/utils/chartOfAccountsUtils"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Upload, Download, RefreshCw, TreePine } from "lucide-react"

const accountSchema = z.object({
  name: z.string().min(3, "Nama akun minimal 3 karakter."),
  code: z.string().refine(validateAccountCode, "Kode akun harus 4 digit angka.").optional().or(z.literal("")),
  type: z.enum(['Aset', 'Kewajiban', 'Modal', 'Pendapatan', 'Beban']),
  balance: z.coerce.number().min(0, "Saldo awal tidak boleh negatif."),
  initialBalance: z.coerce.number().min(0, "Saldo awal tidak boleh negatif."),
  isPaymentAccount: z.boolean().default(false),
  parentId: z.string().optional().or(z.literal("")),
  normalBalance: z.enum(['DEBIT', 'CREDIT']).optional(),
  isHeader: z.boolean().default(false),
  isActive: z.boolean().default(true),
  level: z.number().min(1).max(4).default(1),
  sortOrder: z.number().default(0),
})

type AccountFormData = z.infer<typeof accountSchema>

export function EnhancedAccountManagement() {
  const { accounts, isLoading, addAccount, deleteAccount, updateAccount, importStandardCoA: importCoAMutation } = useAccounts()
  const { toast } = useToast()
  const { user } = useAuth()
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [parentAccountForNew, setParentAccountForNew] = useState<Account | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'Aset',
      balance: 0,
      initialBalance: 0,
      isPaymentAccount: false,
      parentId: '',
      normalBalance: 'DEBIT',
      isHeader: false,
      isActive: true,
      level: 1,
      sortOrder: 0,
    }
  })

  const watchedType = watch('type')
  const watchedParentId = watch('parentId')

  // Auto-set normal balance based on type
  React.useEffect(() => {
    const category = mapLegacyTypeToCategory(watchedType)
    const normalBalance = getNormalBalanceForCategory(category)
    setValue('normalBalance', normalBalance)
  }, [watchedType, setValue])

  // Auto-generate code when parent changes
  React.useEffect(() => {
    if (watchedParentId && accounts) {
      const parentAccount = accounts.find(acc => acc.id === watchedParentId)
      if (parentAccount && parentAccount.code) {
        const existingCodes = accounts.map(acc => acc.code).filter(Boolean) as string[]
        const nextCode = generateNextAccountCode(existingCodes, parentAccount.code)
        setValue('code', nextCode)
        setValue('level', (parentAccount.level || 1) + 1)
      }
    } else {
      // Root level account
      if (accounts) {
        const existingCodes = accounts.map(acc => acc.code).filter(Boolean) as string[]
        const nextCode = generateNextAccountCode(existingCodes)
        setValue('code', nextCode)
        setValue('level', 1)
      }
    }
  }, [watchedParentId, accounts, setValue])

  const onSubmit = (data: AccountFormData) => {
    const accountData = {
      name: data.name,
      type: data.type,
      balance: data.balance,
      initialBalance: data.balance,
      isPaymentAccount: data.isPaymentAccount,
      code: data.code || undefined,
      parentId: data.parentId || undefined,
      normalBalance: data.normalBalance,
      isHeader: data.isHeader,
      isActive: data.isActive,
      level: data.level,
      sortOrder: data.sortOrder,
    };

    if (isEditDialogOpen && selectedAccount) {
      // Update existing account
      updateAccount.mutate({ 
        accountId: selectedAccount.id, 
        newData: accountData 
      }, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Akun berhasil diupdate." })
          reset()
          setIsEditDialogOpen(false)
          setSelectedAccount(null)
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Gagal", description: error.message })
        }
      })
    } else {
      // Create new account
      addAccount.mutate(accountData, {
        onSuccess: () => {
          toast({ title: "Sukses", description: "Akun berhasil ditambahkan." })
          reset()
          setIsAddDialogOpen(false)
          setParentAccountForNew(null)
        },
        onError: (error) => {
          toast({ variant: "destructive", title: "Gagal", description: error.message })
        }
      })
    }
  }

  const handleAccountSelect = (account: Account) => {
    setSelectedAccount(account)
  }

  const handleAccountEdit = (account: Account) => {
    setSelectedAccount(account)
    // Pre-fill form with account data
    reset({
      name: account.name,
      code: account.code || '',
      type: account.type,
      balance: account.balance,
      initialBalance: account.initialBalance,
      isPaymentAccount: account.isPaymentAccount,
      parentId: account.parentId || '',
      normalBalance: account.normalBalance || 'DEBIT',
      isHeader: account.isHeader || false,
      isActive: account.isActive !== false,
      level: account.level || 1,
      sortOrder: account.sortOrder || 0,
    })
    setIsEditDialogOpen(true)
  }

  const handleAccountDelete = (account: Account) => {
    setAccountToDelete(account)
    setIsDeleteDialogOpen(true)
  }

  const handleAddSubAccount = (parentAccount: Account) => {
    setParentAccountForNew(parentAccount)
    reset({
      name: '',
      code: '',
      type: 'Aset',
      balance: 0,
      initialBalance: 0,
      isPaymentAccount: false,
      parentId: parentAccount.id,
      normalBalance: 'DEBIT',
      isHeader: false,
      isActive: true,
      level: (parentAccount.level || 1) + 1,
      sortOrder: 0,
    })
    setIsAddDialogOpen(true)
  }

  const confirmDelete = () => {
    if (!accountToDelete) return

    deleteAccount.mutate(accountToDelete.id, {
      onSuccess: () => {
        toast({ title: "Sukses", description: `Akun "${accountToDelete.name}" berhasil dihapus.` })
        setIsDeleteDialogOpen(false)
        setAccountToDelete(null)
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal", description: `Tidak dapat menghapus akun. ${error.message}` })
      }
    })
  }

  const importStandardCoA = () => {
    const templateData = STANDARD_COA_TEMPLATE.map(template => ({
      code: template.code,
      name: template.name,
      type: template.category === 'ASET' ? 'Aset' : 
            template.category === 'KEWAJIBAN' ? 'Kewajiban' :
            template.category === 'MODAL' ? 'Modal' :
            template.category === 'PENDAPATAN' ? 'Pendapatan' : 'Beban',
      parentCode: template.parentCode,
      level: template.level,
      normalBalance: template.normalBalance,
      isHeader: template.isHeader,
      sortOrder: template.sortOrder
    }))

    importCoAMutation.mutate(templateData, {
      onSuccess: (count) => {
        toast({
          title: "Import Berhasil!",
          description: `${count} accounts telah diimport ke database.`
        })
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Import Gagal",
          description: error.message
        })
      }
    })
  }

  // Use role utility functions
  const userIsOwner = isOwner(user);
  const userIsAdmin = isAdmin(user);
  const userIsAdminOrOwner = isAdminOrOwner(user);
  const userCanManageCash = canManageCash(user);

  // Get accounts for parent selection (header accounts only)
  const parentAccountOptions = accounts?.filter(acc => acc.isHeader) || []

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Chart of Accounts</h2>
          <p className="text-muted-foreground">Kelola struktur akun keuangan perusahaan</p>
        </div>
        
        {userIsAdminOrOwner && (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={importStandardCoA}
              disabled={importCoAMutation.isPending}
            >
              <Upload className="h-4 w-4 mr-2" />
              {importCoAMutation.isPending ? "Importing..." : "Import Standard CoA"}
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Tambah Account
            </Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="tree" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tree">
            <TreePine className="h-4 w-4 mr-2" />
            Tree View
          </TabsTrigger>
          <TabsTrigger value="table">Table View</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tree View */}
            <div className="lg:col-span-2">
              <Card>
                <CardContent className="p-4">
                  <ChartOfAccountsTree
                    accounts={accounts || []}
                    onAccountSelect={handleAccountSelect}
                    onAccountEdit={userIsAdminOrOwner ? handleAccountEdit : undefined}
                    onAccountDelete={userIsOwner ? handleAccountDelete : undefined}
                    onAddSubAccount={userIsAdminOrOwner ? handleAddSubAccount : undefined}
                    selectedAccountId={selectedAccount?.id}
                    showActions={userIsAdminOrOwner}
                    readOnly={!userIsAdminOrOwner}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Account Details */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Detail Account</CardTitle>
                  <CardDescription>
                    {selectedAccount ? 'Informasi detail account yang dipilih' : 'Pilih account untuk melihat detail'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedAccount ? (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Nama</Label>
                        <p className="text-sm">{selectedAccount.name}</p>
                      </div>
                      
                      {selectedAccount.code && (
                        <div>
                          <Label className="text-sm font-medium">Kode</Label>
                          <p className="text-sm font-mono">{selectedAccount.code}</p>
                        </div>
                      )}
                      
                      <div>
                        <Label className="text-sm font-medium">Tipe</Label>
                        <p className="text-sm">{selectedAccount.type}</p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Saldo Saat Ini</Label>
                        <p className="text-lg font-semibold">
                          {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0,
                          }).format(selectedAccount.balance)}
                        </p>
                      </div>
                      
                      {selectedAccount.normalBalance && (
                        <div>
                          <Label className="text-sm font-medium">Normal Balance</Label>
                          <p className="text-sm">{selectedAccount.normalBalance}</p>
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        {selectedAccount.isPaymentAccount && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                            Payment Account
                          </span>
                        )}
                        {selectedAccount.isHeader && (
                          <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                            Header Account
                          </span>
                        )}
                      </div>

                      {userIsAdminOrOwner && (
                        <div className="flex gap-2 pt-4">
                          <Button variant="outline" size="sm" onClick={() => handleAccountEdit(selectedAccount)}>
                            Edit
                          </Button>
                          {userIsOwner && (
                            <Button variant="destructive" size="sm" onClick={() => handleAccountDelete(selectedAccount)}>
                              Hapus
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Klik pada account di tree view untuk melihat detail
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="table">
          {/* Legacy Table View - Keep existing AccountManagement component */}
          <div className="text-center py-8 text-muted-foreground">
            <p>Table view coming soon...</p>
            <p className="text-sm">Sementara gunakan Tree View untuk mengelola Chart of Accounts</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Account Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {parentAccountForNew ? `Tambah Sub-Account untuk "${parentAccountForNew.name}"` : 'Tambah Account Baru'}
            </DialogTitle>
            <DialogDescription>
              Buat account baru dalam Chart of Accounts
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nama Account</Label>
                <Input id="name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="code">Kode Account</Label>
                <Input id="code" {...register("code")} placeholder="1110" />
                {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Tipe Account</Label>
                <Select onValueChange={(value) => setValue("type", value as any)} defaultValue="Aset">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aset">Aset</SelectItem>
                    <SelectItem value="Kewajiban">Kewajiban</SelectItem>
                    <SelectItem value="Modal">Modal</SelectItem>
                    <SelectItem value="Pendapatan">Pendapatan</SelectItem>
                    <SelectItem value="Beban">Beban</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
              </div>
              
              {!parentAccountForNew && (
                <div className="space-y-2">
                  <Label htmlFor="parentId">Parent Account</Label>
                  <Select onValueChange={(value) => setValue("parentId", value === "none" ? "" : value)} value={watchedParentId || "none"}>
                    <SelectTrigger><SelectValue placeholder="Pilih parent (opsional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak ada parent (Root level)</SelectItem>
                      {parentAccountOptions.map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.code ? `${account.code} - ` : ''}{account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="balance">Saldo Awal (Rp)</Label>
                <Input id="balance" type="number" {...register("balance")} />
                {errors.balance && <p className="text-sm text-destructive">{errors.balance.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="normalBalance">Normal Balance</Label>
                <Select onValueChange={(value) => setValue("normalBalance", value as NormalBalance)} 
                        value={watch('normalBalance') || 'DEBIT'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox id="isPaymentAccount" onCheckedChange={(checked) => setValue('isPaymentAccount', !!checked)} />
                <Label htmlFor="isPaymentAccount" className="text-sm">Account Pembayaran</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox id="isHeader" onCheckedChange={(checked) => setValue('isHeader', !!checked)} />
                <Label htmlFor="isHeader" className="text-sm">Header Account</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={addAccount.isPending}>
                {addAccount.isPending ? "Menyimpan..." : "Simpan Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Edit informasi account yang dipilih
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nama Account</Label>
                <Input id="edit-name" {...register("name")} />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-code">Kode Account</Label>
                <Input id="edit-code" {...register("code")} placeholder="1110" />
                {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-type">Tipe Account</Label>
                <Select onValueChange={(value) => setValue("type", value as any)} value={watchedType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aset">Aset</SelectItem>
                    <SelectItem value="Kewajiban">Kewajiban</SelectItem>
                    <SelectItem value="Modal">Modal</SelectItem>
                    <SelectItem value="Pendapatan">Pendapatan</SelectItem>
                    <SelectItem value="Beban">Beban</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-parentId">Parent Account</Label>
                <Select onValueChange={(value) => setValue("parentId", value === "none" ? "" : value)} value={watchedParentId || "none"}>
                  <SelectTrigger><SelectValue placeholder="Pilih parent (opsional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tidak ada parent (Root level)</SelectItem>
                    {parentAccountOptions.filter(acc => acc.id !== selectedAccount?.id).map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.code ? `${account.code} - ` : ''}{account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-balance">Saldo (Rp)</Label>
                <Input id="edit-balance" type="number" {...register("balance")} />
                {errors.balance && <p className="text-sm text-destructive">{errors.balance.message}</p>}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-normalBalance">Normal Balance</Label>
                <Select onValueChange={(value) => setValue("normalBalance", value as NormalBalance)} 
                        value={watch('normalBalance') || 'DEBIT'}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">Debit</SelectItem>
                    <SelectItem value="CREDIT">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-isPaymentAccount" 
                  checked={watch('isPaymentAccount')}
                  onCheckedChange={(checked) => setValue('isPaymentAccount', !!checked)} 
                />
                <Label htmlFor="edit-isPaymentAccount" className="text-sm">Account Pembayaran</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-isHeader" 
                  checked={watch('isHeader')}
                  onCheckedChange={(checked) => setValue('isHeader', !!checked)} 
                />
                <Label htmlFor="edit-isHeader" className="text-sm">Header Account</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="edit-isActive" 
                  checked={watch('isActive') !== false}
                  onCheckedChange={(checked) => setValue('isActive', !!checked)} 
                />
                <Label htmlFor="edit-isActive" className="text-sm">Account Aktif</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={updateAccount.isPending}>
                {updateAccount.isPending ? "Updating..." : "Update Account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Account</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus account "{accountToDelete?.name}"?
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}