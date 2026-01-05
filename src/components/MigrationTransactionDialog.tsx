"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { AlertTriangle, Plus, Trash2, Package, User, Calendar, DollarSign, FileText, Truck, CheckCircle } from "lucide-react"
import { useProducts } from "@/hooks/useProducts"
import { useCustomers } from "@/hooks/useCustomers"
import { useAccounts } from "@/hooks/useAccounts"
import { useBranch } from "@/contexts/BranchContext"
import { useAuth } from "@/hooks/useAuth"
import { useTimezone } from "@/contexts/TimezoneContext"
import { getOfficeTime, getOfficeDateString } from "@/utils/officeTime"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { generateTransactionId } from "@/utils/idGenerator"

interface MigrationItem {
  id: number
  productId: string
  productName: string
  quantity: number       // Total quantity ordered
  deliveredQty: number   // Already delivered in old system
  price: number
  unit: string
}

interface MigrationTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MigrationTransactionDialog({ open, onOpenChange }: MigrationTransactionDialogProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { currentBranch } = useBranch()
  const { timezone } = useTimezone()
  const { products } = useProducts()
  const { customers } = useCustomers()
  const { accounts } = useAccounts()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customerSearch, setCustomerSearch] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("")
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [orderDate, setOrderDate] = useState(getOfficeDateString(timezone))
  const [items, setItems] = useState<MigrationItem[]>([])
  const [paidAmount, setPaidAmount] = useState(0)
  const [paymentAccountId, setPaymentAccountId] = useState("")
  const [notes, setNotes] = useState("")

  // Filter customers
  const filteredCustomers = useMemo(() => {
    if (!customers || !customerSearch) return customers?.slice(0, 10) || []
    return customers
      .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
      .slice(0, 10)
  }, [customers, customerSearch])

  // Get payment accounts
  const paymentAccounts = useMemo(() => {
    if (!accounts) return []
    return accounts.filter(a => a.isPaymentAccount && !a.isHeader)
  }, [accounts])

  // Calculate totals
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }, [items])

  // Calculate delivered value
  const deliveredValue = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.price * item.deliveredQty), 0)
  }, [items])

  // Calculate remaining value (undelivered)
  const remainingValue = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.price * (item.quantity - item.deliveredQty)), 0)
  }, [items])

  const sisaPiutang = total - paidAmount

  // Add item
  const handleAddItem = () => {
    setItems([...items, {
      id: Date.now(),
      productId: "",
      productName: "",
      quantity: 1,
      deliveredQty: 0,
      price: 0,
      unit: "pcs"
    }])
  }

  // Update item
  const handleUpdateItem = (index: number, field: keyof MigrationItem, value: any) => {
    const newItems = [...items]
    if (field === 'productId' && value) {
      const product = products?.find(p => p.id === value)
      if (product) {
        newItems[index] = {
          ...newItems[index],
          productId: product.id,
          productName: product.name,
          price: product.basePrice || 0,
          unit: product.unit || 'pcs'
        }
      }
    } else if (field === 'deliveredQty') {
      // Ensure delivered qty doesn't exceed total qty
      const qty = parseInt(value) || 0
      newItems[index].deliveredQty = Math.min(qty, newItems[index].quantity)
    } else if (field === 'quantity') {
      const qty = parseInt(value) || 0
      newItems[index].quantity = qty
      // Adjust delivered if needed
      if (newItems[index].deliveredQty > qty) {
        newItems[index].deliveredQty = qty
      }
    } else {
      (newItems[index] as any)[field] = value
    }
    setItems(newItems)
  }

  // Remove item
  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  // Set all as delivered
  const handleSetAllDelivered = () => {
    setItems(items.map(item => ({
      ...item,
      deliveredQty: item.quantity
    })))
  }

  // Reset form
  const resetForm = () => {
    setCustomerSearch("")
    setSelectedCustomerId("")
    setOrderDate(getOfficeDateString(timezone))
    setItems([])
    setPaidAmount(0)
    setPaymentAccountId("")
    setNotes("")
  }

  // Submit migration transaction
  const handleSubmit = async () => {
    // Validation
    if (!selectedCustomerId && !customerSearch.trim()) {
      toast({ variant: "destructive", title: "Error", description: "Pilih atau masukkan nama pelanggan" })
      return
    }
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Tambahkan minimal 1 item" })
      return
    }
    if (paidAmount > 0 && !paymentAccountId) {
      toast({ variant: "destructive", title: "Error", description: "Pilih akun pembayaran" })
      return
    }
    if (!currentBranch?.id) {
      toast({ variant: "destructive", title: "Error", description: "Branch tidak dipilih" })
      return
    }

    // Validate delivered qty
    for (const item of items) {
      if (item.deliveredQty > item.quantity) {
        toast({ variant: "destructive", title: "Error", description: `Qty terkirim tidak boleh lebih dari total qty untuk ${item.productName}` })
        return
      }
    }

    setIsSubmitting(true)

    try {
      const transactionId = await generateTransactionId('migration')
      const customerName = customers?.find(c => c.id === selectedCustomerId)?.name || customerSearch.trim()

      // Call RPC for migration transaction
      const { data: rpcResult, error: rpcError } = await supabase.rpc('create_migration_transaction', {
        p_transaction_id: transactionId,
        p_customer_id: selectedCustomerId || null,
        p_customer_name: customerName,
        p_order_date: orderDate,
        p_items: items.map(item => ({
          product_id: item.productId || null,
          product_name: item.productName,
          quantity: item.quantity,
          delivered_qty: item.deliveredQty,
          price: item.price,
          unit: item.unit
        })),
        p_total: total,
        p_delivered_value: deliveredValue,
        p_paid_amount: paidAmount,
        p_payment_account_id: paymentAccountId || null,
        p_notes: notes || null,
        p_branch_id: currentBranch.id,
        p_cashier_id: user?.id || null,
        p_cashier_name: user?.name || 'Migration Import'
      })

      if (rpcError) throw new Error(rpcError.message)

      const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
      if (!result?.success) {
        throw new Error(result?.error_message || 'Gagal menyimpan transaksi migrasi')
      }

      const hasRemainingDelivery = items.some(item => item.quantity > item.deliveredQty)

      toast({
        title: "Berhasil",
        description: `Transaksi migrasi ${transactionId} berhasil disimpan.${hasRemainingDelivery ? ' Sisa pengiriman telah ditambahkan ke daftar pengiriman.' : ''}`
      })

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] })
      queryClient.invalidateQueries({ queryKey: ['deliveries'] })

      resetForm()
      onOpenChange(false)

    } catch (error: any) {
      console.error('Migration transaction error:', error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menyimpan transaksi migrasi"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Import Transaksi Migrasi
          </DialogTitle>
          <DialogDescription>
            Import data transaksi dari sistem lama. Masukkan jumlah yang sudah terkirim dan sisa akan masuk ke daftar pengiriman.
          </DialogDescription>
        </DialogHeader>

        {/* Warning Banner */}
        <Card className="bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-medium mb-1">Mode Migrasi Data</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Stok produk <strong>TIDAK</strong> akan berkurang (sudah dikirim di sistem lama)</li>
                  <li>Komisi sales/driver <strong>TIDAK</strong> dicatat (sudah dicatat di sistem lama)</li>
                  <li><strong>TIDAK</strong> mempengaruhi kas saat input (piutang saja)</li>
                  <li><strong>TIDAK</strong> mempengaruhi pendapatan (akan dicatat saat pengiriman)</li>
                  <li>Jurnal: Piutang ↔ Modal Barang Dagang Tertahan (2140)</li>
                  <li>Sisa barang yang belum terkirim akan masuk ke daftar pengiriman</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Customer Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Pelanggan *
            </Label>
            <div className="relative">
              <Input
                placeholder="Ketik nama pelanggan..."
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value)
                  setShowCustomerDropdown(true)
                  if (!e.target.value) setSelectedCustomerId("")
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
              />
              {showCustomerDropdown && filteredCustomers.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-48 overflow-auto">
                  {filteredCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                      onClick={() => {
                        setSelectedCustomerId(customer.id)
                        setCustomerSearch(customer.name)
                        setShowCustomerDropdown(false)
                      }}
                    >
                      <div className="font-medium text-sm">{customer.name}</div>
                      {customer.phone && <div className="text-xs text-gray-500">{customer.phone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Order Date */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Tanggal Transaksi *
            </Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Item Transaksi *
              </Label>
              <div className="flex gap-2">
                {items.length > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={handleSetAllDelivered}>
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Semua Terkirim
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" onClick={handleAddItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Tambah Item
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border rounded-lg">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Belum ada item. Klik "Tambah Item" untuk menambah.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Header */}
                <div className="grid grid-cols-12 gap-2 px-2 text-xs font-medium text-gray-500">
                  <div className="col-span-4">Produk</div>
                  <div className="col-span-2 text-center">Total Qty</div>
                  <div className="col-span-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Truck className="h-3 w-3" />
                      Terkirim
                    </div>
                  </div>
                  <div className="col-span-2 text-center">Harga</div>
                  <div className="col-span-1 text-right">Subtotal</div>
                  <div className="col-span-1"></div>
                </div>

                {items.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="col-span-4">
                      <Select
                        value={item.productId}
                        onValueChange={(value) => handleUpdateItem(index, 'productId', value)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Pilih Produk" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Total"
                        value={item.quantity || ''}
                        onChange={(e) => handleUpdateItem(index, 'quantity', e.target.value)}
                        className="h-9 text-center"
                        min={1}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Terkirim"
                        value={item.deliveredQty || ''}
                        onChange={(e) => handleUpdateItem(index, 'deliveredQty', e.target.value)}
                        className="h-9 text-center bg-green-50 border-green-200 dark:bg-green-900/20"
                        min={0}
                        max={item.quantity}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Harga"
                        value={item.price || ''}
                        onChange={(e) => handleUpdateItem(index, 'price', parseInt(e.target.value) || 0)}
                        className="h-9 text-center"
                        min={0}
                      />
                    </div>
                    <div className="col-span-1 text-right text-sm font-medium">
                      {new Intl.NumberFormat('id-ID').format(item.price * item.quantity)}
                    </div>
                    <div className="col-span-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 p-0 text-red-500"
                        onClick={() => handleRemoveItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {/* Show remaining if not fully delivered */}
                    {item.quantity > item.deliveredQty && item.productId && (
                      <div className="col-span-12 flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 pl-2">
                        <Truck className="h-3 w-3" />
                        Sisa {item.quantity - item.deliveredQty} {item.unit} akan masuk daftar pengiriman
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Summary Cards */}
          {items.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
                <CardContent className="p-3">
                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Total Transaksi</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(total)}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
                <CardContent className="p-3">
                  <div className="text-xs text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Sudah Terkirim
                  </div>
                  <div className="text-lg font-bold text-green-700 dark:text-green-300">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(deliveredValue)}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200">
                <CardContent className="p-3">
                  <div className="text-xs text-orange-600 dark:text-orange-400 mb-1 flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    Belum Terkirim
                  </div>
                  <div className="text-lg font-bold text-orange-700 dark:text-orange-300">
                    {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(remainingValue)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Payment */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Jumlah Sudah Dibayar (di sistem lama)
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={paidAmount || ''}
                onChange={(e) => setPaidAmount(parseInt(e.target.value) || 0)}
                placeholder="0"
                className="flex-1"
              />
              <Button
                type="button"
                variant={paidAmount === total ? "default" : "outline"}
                size="sm"
                onClick={() => setPaidAmount(total)}
              >
                Lunas
              </Button>
              <Button
                type="button"
                variant={paidAmount === 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setPaidAmount(0)}
              >
                Kredit
              </Button>
            </div>
            {sisaPiutang > 0 && (
              <p className="text-sm text-orange-600">
                Sisa Piutang: {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(sisaPiutang)}
              </p>
            )}
          </div>

          {/* Payment Account - only if there's payment */}
          {paidAmount > 0 && (
            <div className="space-y-2">
              <Label>Akun Penerimaan Pembayaran *</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih Akun Kas/Bank" />
                </SelectTrigger>
                <SelectContent>
                  {paymentAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Pembayaran ini akan menambah saldo kas/bank yang dipilih (jurnal terpisah)
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Catatan</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Catatan tambahan untuk transaksi migrasi..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Menyimpan..." : "Simpan Transaksi Migrasi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
