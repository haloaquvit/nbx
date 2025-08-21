"use client"

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { DateTimePicker } from './ui/datetime-picker'
import { Transaction, TransactionItem, PaymentStatus } from '@/types/transaction'
import { useTransactions } from '@/hooks/useTransactions'
import { useCustomers } from '@/hooks/useCustomers'
import { useProducts } from '@/hooks/useProducts'
import { useAccounts } from '@/hooks/useAccounts'
import { calculatePPNWithMode, getDefaultPPNPercentage } from '@/utils/ppnCalculations'
import { Trash2, Plus } from 'lucide-react'

interface EditTransactionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaction: Transaction
}

interface FormTransactionItem {
  id: number;
  product: any | null;
  keterangan: string;
  qty: number;
  harga: number;
  unit: string;
}

export function EditTransactionDialog({ open, onOpenChange, transaction }: EditTransactionDialogProps) {
  const { toast } = useToast()
  const { updateTransaction } = useTransactions()
  const { customers } = useCustomers()
  const { products } = useProducts()
  const { accounts } = useAccounts()

  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null)
  const [orderDate, setOrderDate] = useState<Date | undefined>(new Date())
  const [dueDate, setDueDate] = useState('')
  const [paymentAccountId, setPaymentAccountId] = useState<string>('')
  const [items, setItems] = useState<FormTransactionItem[]>([])
  const [diskon, setDiskon] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
  const [ppnEnabled, setPpnEnabled] = useState(false)
  const [ppnMode, setPpnMode] = useState<'include' | 'exclude'>('include')
  const [ppnPercentage, setPpnPercentage] = useState(getDefaultPPNPercentage())
  const [isOfficeSale, setIsOfficeSale] = useState(false)

  // Load transaction data when dialog opens
  useEffect(() => {
    if (open && transaction) {
      const customer = customers?.find(c => c.id === transaction.customerId)
      setSelectedCustomer(customer || null)
      setOrderDate(transaction.orderDate)
      setDueDate(transaction.dueDate ? transaction.dueDate.toISOString().split('T')[0] : '')
      setPaymentAccountId(transaction.paymentAccountId || '')
      setPaidAmount(transaction.paidAmount)
      setPpnEnabled(transaction.ppnEnabled)
      setPpnMode(transaction.ppnMode || 'include')
      setPpnPercentage(transaction.ppnPercentage)
      setIsOfficeSale(transaction.isOfficeSale || false)
      
      // Convert transaction items to form items
      const formItems: FormTransactionItem[] = transaction.items.map((item, index) => ({
        id: index,
        product: item.product,
        keterangan: item.notes || '',
        qty: item.quantity,
        harga: item.price,
        unit: item.unit,
      }))
      setItems(formItems)
      
      // Calculate discount from subtotal difference
      const itemsTotal = transaction.items.reduce((total, item) => total + (item.quantity * item.price), 0)
      const calculatedDiskon = itemsTotal - transaction.subtotal
      setDiskon(calculatedDiskon)
    }
  }, [open, transaction, customers])

  const subTotal = useMemo(() => items.reduce((total, item) => total + (item.qty * item.harga), 0), [items])
  const subtotalAfterDiskon = useMemo(() => subTotal - diskon, [subTotal, diskon])
  const ppnCalculation = useMemo(() => {
    if (ppnEnabled) {
      return calculatePPNWithMode(subtotalAfterDiskon, ppnPercentage, ppnMode)
    }
    return { subtotal: subtotalAfterDiskon, ppnAmount: 0, total: subtotalAfterDiskon }
  }, [subtotalAfterDiskon, ppnEnabled, ppnPercentage, ppnMode])
  const totalTagihan = useMemo(() => ppnCalculation.total, [ppnCalculation])
  const sisaTagihan = useMemo(() => totalTagihan - paidAmount, [totalTagihan, paidAmount])

  const handleAddItem = () => {
    const newItem: FormTransactionItem = {
      id: Date.now(), product: null, keterangan: '', qty: 1, harga: 0, unit: 'pcs'
    }
    setItems([...items, newItem])
  }

  const handleItemChange = (index: number, field: keyof FormTransactionItem, value: any) => {
    const newItems = [...items]
    (newItems[index] as any)[field] = value

    if (field === 'product' && value) {
      newItems[index].harga = value.basePrice || 0
      newItems[index].unit = value.unit || 'pcs'
    }
    
    setItems(newItems)
  }

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const validItems = items.filter(item => item.product && item.qty > 0)

    if (!selectedCustomer || validItems.length === 0) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Pelanggan dan tambahkan minimal satu item produk yang valid." })
      return
    }

    if (paidAmount > 0 && !paymentAccountId) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Metode Pembayaran jika ada jumlah yang dibayar." })
      return
    }

    const transactionItems: TransactionItem[] = validItems.map(item => ({
      product: item.product!,
      quantity: item.qty,
      price: item.harga,
      unit: item.unit,
      width: 0, 
      height: 0, 
      notes: item.keterangan,
    }))

    const paymentStatus: PaymentStatus = sisaTagihan <= 0 ? 'Lunas' : 'Belum Lunas'

    const updatedTransaction: Transaction = {
      ...transaction,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      paymentAccountId: paymentAccountId || null,
      orderDate: orderDate || new Date(),
      dueDate: sisaTagihan > 0 ? new Date(dueDate) : null,
      items: transactionItems,
      subtotal: ppnCalculation.subtotal,
      ppnEnabled: ppnEnabled,
      ppnMode: ppnEnabled ? ppnMode : undefined,
      ppnPercentage: ppnPercentage,
      ppnAmount: ppnCalculation.ppnAmount,
      total: totalTagihan,
      paidAmount: paidAmount,
      paymentStatus: paymentStatus,
      isOfficeSale: isOfficeSale,
    }

    updateTransaction.mutate(updatedTransaction, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Transaksi berhasil diperbarui." })
        onOpenChange(false)
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal Memperbarui", description: error.message })
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Transaksi</DialogTitle>
          <DialogDescription>
            Edit data transaksi {transaction?.id}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Pelanggan</Label>
              <Select 
                value={selectedCustomer?.id || ''} 
                onValueChange={(value) => {
                  const customer = customers?.find(c => c.id === value)
                  setSelectedCustomer(customer || null)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih pelanggan..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tanggal Order</Label>
              <DateTimePicker date={orderDate} setDate={setOrderDate} />
            </div>
          </div>

          {/* Office Sale Checkbox */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isOfficeSale}
                onChange={(e) => setIsOfficeSale(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <span className="text-sm font-medium text-blue-900">Laku Kantor</span>
            </label>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Daftar Item</Label>
              <Button type="button" onClick={handleAddItem} size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Item
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Produk</th>
                    <th className="text-left p-2">Catatan</th>
                    <th className="text-left p-2">Qty</th>
                    <th className="text-left p-2">Unit</th>
                    <th className="text-left p-2">Harga</th>
                    <th className="text-left p-2">Subtotal</th>
                    <th className="text-left p-2">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="border-t">
                      <td className="p-2">
                        <Select 
                          value={item.product?.id || ''} 
                          onValueChange={(value) => {
                            const product = products?.find(p => p.id === value)
                            handleItemChange(index, 'product', product || null)
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Pilih produk..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products?.map(product => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          value={item.keterangan}
                          onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)}
                          placeholder="Catatan..."
                          className="w-full"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value) || 1)}
                          className="w-16"
                        />
                      </td>
                      <td className="p-2 text-sm">{item.unit}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          value={item.harga}
                          onChange={(e) => handleItemChange(index, 'harga', Number(e.target.value) || 0)}
                          className="w-24"
                        />
                      </td>
                      <td className="p-2 text-sm font-medium">
                        {new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}
                      </td>
                      <td className="p-2">
                        <Button 
                          type="button" 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tax Settings */}
          <div>
            <Label>Pengaturan Pajak</Label>
            <div className="space-y-2 mt-2">
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="taxMode"
                  checked={ppnEnabled && ppnMode === 'include'}
                  onChange={() => {
                    setPpnEnabled(true)
                    setPpnMode('include')
                  }}
                  className="mr-2"
                />
                PPN Include (sudah termasuk pajak)
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="taxMode"
                  checked={ppnEnabled && ppnMode === 'exclude'}
                  onChange={() => {
                    setPpnEnabled(true)
                    setPpnMode('exclude')
                  }}
                  className="mr-2"
                />
                PPN Exclude (belum termasuk pajak)
              </label>
              <label className="flex items-center text-sm">
                <input
                  type="radio"
                  name="taxMode"
                  checked={!ppnEnabled}
                  onChange={() => setPpnEnabled(false)}
                  className="mr-2"
                />
                Non Pajak
              </label>
            </div>
          </div>

          {/* Payment Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Sub Total</Label>
              <div className="text-lg font-medium">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(subTotal)}
              </div>
            </div>
            <div>
              <Label>Diskon</Label>
              <Input
                type="number"
                value={diskon}
                onChange={(e) => setDiskon(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {ppnEnabled && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>PPN ({ppnPercentage}%)</Label>
                <div className="text-lg font-medium">
                  {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(ppnCalculation.ppnAmount)}
                </div>
              </div>
              <div>
                <Label>Total</Label>
                <div className="text-lg font-bold">
                  {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalTagihan)}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Metode Pembayaran</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih pembayaran..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => a.isPaymentAccount).map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jumlah Dibayar</Label>
              <Input
                type="number"
                value={paidAmount}
                onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {sisaTagihan > 0 && (
            <div>
              <Label>Tanggal Jatuh Tempo</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={updateTransaction.isPending}>
              {updateTransaction.isPending ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}