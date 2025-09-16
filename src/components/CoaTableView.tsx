"use client"

import React, { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Edit, Save, X, Trash2, Check } from "lucide-react"
import { Account } from "@/types/account"
import { useToast } from "@/hooks/use-toast"
import { UseMutationResult } from "@tanstack/react-query"

interface CoaTableViewProps {
  accounts: Account[]
  onAccountUpdate: (account: Account) => void
  onAccountDelete?: (account: Account) => void
  canEdit: boolean
  updateAccount: UseMutationResult<Account, Error, { accountId: string; newData: any }, unknown>
}

interface EditingState {
  accountId: string | null
  balance: number
  initialBalance: number
}

export function CoaTableView({ accounts, onAccountUpdate, onAccountDelete, canEdit, updateAccount }: CoaTableViewProps) {
  const { toast } = useToast()
  const [editing, setEditing] = useState<EditingState>({ accountId: null, balance: 0, initialBalance: 0 })

  // Filter out header accounts and sort by code for better display
  const sortedAccounts = [...accounts]
    .filter(account => !account.isHeader) // Hide header accounts
    .sort((a, b) => {
      const codeA = a.code || '9999'
      const codeB = b.code || '9999'
      return codeA.localeCompare(codeB)
    })

  const startEdit = (account: Account) => {
    setEditing({
      accountId: account.id,
      balance: account.balance,
      initialBalance: account.initialBalance || account.balance
    })
  }

  const cancelEdit = () => {
    setEditing({ accountId: null, balance: 0, initialBalance: 0 })
  }

  const saveEdit = async (account: Account) => {
    try {
      const updateData = {
        balance: editing.balance,
        initialBalance: editing.initialBalance,
        // Keep other fields unchanged
        name: account.name,
        type: account.type,
        isPaymentAccount: account.isPaymentAccount,
        code: account.code,
        parentId: account.parentId,
        normalBalance: account.normalBalance,
        isHeader: account.isHeader,
        isActive: account.isActive,
        level: account.level,
        sortOrder: account.sortOrder,
      }

      await updateAccount.mutateAsync({
        accountId: account.id,
        newData: updateData
      })

      toast({
        title: "Berhasil",
        description: `Saldo akun "${account.name}" berhasil diupdate.`
      })

      cancelEdit()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Gagal",
        description: error.message || "Gagal mengupdate saldo akun"
      })
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const getAccountTypeVariant = (type: string) => {
    switch (type) {
      case 'Aset': return 'default'
      case 'Kewajiban': return 'destructive'
      case 'Modal': return 'secondary'
      case 'Pendapatan': return 'outline'
      case 'Beban': return 'secondary'
      default: return 'outline'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chart of Accounts - Table View</CardTitle>
        <p className="text-sm text-muted-foreground">
          Kelola saldo awal dan informasi akun keuangan. Klik tombol edit untuk mengubah saldo.
        </p>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Kode</TableHead>
                <TableHead>Nama Akun</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead className="text-right">Saldo Awal</TableHead>
                <TableHead className="text-right">Saldo Saat Ini</TableHead>
                <TableHead>Normal Balance</TableHead>
                <TableHead>Status</TableHead>
                {canEdit && <TableHead className="w-[120px]">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAccounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canEdit ? 8 : 7} className="h-24 text-center">
                    Belum ada akun keuangan.
                  </TableCell>
                </TableRow>
              ) : (
                sortedAccounts.map((account) => (
                  <TableRow key={account.id}>
                    {/* Kode */}
                    <TableCell className="font-mono text-xs">
                      {account.code || '-'}
                    </TableCell>

                    {/* Nama Akun */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>
                          {account.name}
                        </span>
                        {account.isPaymentAccount && (
                          <Badge variant="outline" className="text-xs">Payment</Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Tipe */}
                    <TableCell>
                      <Badge variant={getAccountTypeVariant(account.type)}>
                        {account.type}
                      </Badge>
                    </TableCell>

                    {/* Saldo Awal */}
                    <TableCell className="text-right">
                      {editing.accountId === account.id ? (
                        <Input
                          type="number"
                          value={editing.initialBalance}
                          onChange={(e) => setEditing(prev => ({
                            ...prev,
                            initialBalance: Number(e.target.value)
                          }))}
                          className="w-32 text-right"
                          step="1000"
                        />
                      ) : (
                        <span className={account.initialBalance > 0 ? "font-medium" : "text-muted-foreground"}>
                          {formatCurrency(account.initialBalance || 0)}
                        </span>
                      )}
                    </TableCell>

                    {/* Saldo Saat Ini */}
                    <TableCell className="text-right">
                      {editing.accountId === account.id ? (
                        <Input
                          type="number"
                          value={editing.balance}
                          onChange={(e) => setEditing(prev => ({
                            ...prev,
                            balance: Number(e.target.value)
                          }))}
                          className="w-32 text-right"
                          step="1000"
                        />
                      ) : (
                        <span className={account.balance > 0 ? "font-medium" : "text-muted-foreground"}>
                          {formatCurrency(account.balance)}
                        </span>
                      )}
                    </TableCell>

                    {/* Normal Balance */}
                    <TableCell>
                      <Badge variant={account.normalBalance === 'DEBIT' ? 'default' : 'secondary'}>
                        {account.normalBalance || 'DEBIT'}
                      </Badge>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <div className="flex gap-1">
                        {account.isActive !== false && (
                          <Badge variant="outline" className="text-green-600">Aktif</Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Aksi */}
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {editing.accountId === account.id ? (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => saveEdit(account)}
                                disabled={updateAccount.isPending}
                                className="h-8 w-8"
                                title="Simpan perubahan"
                              >
                                {updateAccount.isPending ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
                                ) : (
                                  <Save className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={cancelEdit}
                                disabled={updateAccount.isPending}
                                className="h-8 w-8"
                                title="Batal edit"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => startEdit(account)}
                                className="h-8 w-8"
                                title="Edit saldo"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                onClick={() => onAccountUpdate(account)}
                                className="h-8 w-8"
                                title="Edit akun"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                              {onAccountDelete && (
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => onAccountDelete(account)}
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  title="Hapus akun"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {canEdit && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p><strong>Tips:</strong></p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Klik tombol <Edit className="inline h-3 w-3" /> untuk mengedit saldo awal dan saldo saat ini</li>
              <li>Klik tombol <Check className="inline h-3 w-3" /> untuk mengedit detail akun lengkap</li>
              <li>Saldo awal digunakan untuk opening balance saat periode baru</li>
              <li>Saldo saat ini menampilkan balance terkini setelah transaksi</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}