"use client"

import { useState, useMemo, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Truck, Plus, Trash2, ShoppingCart, User, Package, CreditCard, AlertCircle, Phone, MapPin, Calendar, Minus, Gift } from "lucide-react"
import { useCustomers } from "@/hooks/useCustomers"
import { useProducts } from "@/hooks/useProducts"
import { useAccounts } from "@/hooks/useAccounts"
import { useTransactions } from "@/hooks/useTransactions"
import { useAuth } from "@/hooks/useAuth"
import { useActiveRetasi } from "@/hooks/useRetasi"
import { TransactionItem, Transaction } from "@/types/transaction"
import { DriverDeliveryDialog } from "@/components/DriverDeliveryDialog"
import { DriverPrintDialog } from "@/components/DriverPrintDialog"
import { PricingService } from "@/services/pricingService"
import { Product } from "@/types/product"

interface CartItem extends TransactionItem {
  isBonus?: boolean
  bonusDescription?: string
  parentProductId?: string
}

export default function DriverPosPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { customers } = useCustomers()
  const { products } = useProducts()
  const { accounts } = useAccounts()
  const { addTransaction } = useTransactions()
  const [searchParams] = useSearchParams()

  // Check if driver has active retasi (is_returned = false)
  const { data: activeRetasi, isLoading: isCheckingRetasi } = useActiveRetasi(user?.name)

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState("")
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)

  // Auto-select customer from URL query parameter
  useEffect(() => {
    const customerId = searchParams.get('customerId')
    if (customerId && customers && customers.length > 0 && !selectedCustomer) {
      const customer = customers.find(c => c.id === customerId)
      if (customer) {
        setSelectedCustomer(customer.id)
        setCustomerSearch(customer.name)
      }
    }
  }, [searchParams, customers, selectedCustomer])
  const [items, setItems] = useState<CartItem[]>([])
  const [paymentAccount, setPaymentAccount] = useState("")
  const [paidAmount, setPaidAmount] = useState(0)
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  })

  // Dialog states
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [createdTransaction, setCreatedTransaction] = useState<Transaction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Memoized values
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      customer.phone.includes(customerSearch)
    ).slice(0, 8);
  }, [customers, customerSearch]);

  const selectedCustomerData = customers?.find(c => c.id === selectedCustomer)

  // Products sorted by stock
  const availableProducts = useMemo(() => {
    return products
      ?.filter(p => p?.id && p.id.trim() !== '' && (p.currentStock || 0) > 0)
      ?.sort((a, b) => (b.currentStock || 0) - (a.currentStock || 0)) || [];
  }, [products]);

  // Calculate totals (exclude bonus items from total)
  const subtotal = items
    .filter(item => !item.isBonus)
    .reduce((sum, item) => sum + (item.price * item.quantity), 0)
  const total = subtotal

  // Count bonus items
  const bonusItems = items.filter(item => item.isBonus)
  const totalBonusQty = bonusItems.reduce((sum, item) => sum + item.quantity, 0)

  // Access control
  const isAdminOwner = user?.role && ['admin', 'owner'].includes(user.role)
  const isDriver = user?.role === 'driver' || user?.role === 'supir'
  const isHelper = user?.role === 'helper' || user?.role === 'pembantu'
  const hasAccess = isAdminOwner || isHelper || (isDriver && activeRetasi !== null)

  // Calculate price with bonus
  const calculatePriceWithBonus = async (product: Product, quantity: number) => {
    try {
      const productPricing = await PricingService.getProductPricing(product.id)
      if (productPricing) {
        const priceCalculation = PricingService.calculatePrice(
          product.basePrice,
          product.currentStock || 0,
          quantity,
          productPricing.stockPricings,
          productPricing.bonusPricings
        )
        return {
          price: priceCalculation.stockAdjustedPrice,
          bonuses: priceCalculation.bonuses || []
        }
      }
    } catch (error) {
      console.error('Error calculating price:', error)
    }
    return { price: product.basePrice, bonuses: [] }
  }

  // Quick add product to cart with bonus calculation
  const quickAddProduct = async (product: typeof availableProducts[0]) => {
    const existingIndex = items.findIndex(item => item.product.id === product.id && !item.isBonus)

    if (existingIndex >= 0) {
      // Increment quantity if already in cart
      const currentQty = items[existingIndex].quantity
      const newQty = currentQty + 1
      if (newQty <= (product.currentStock || 0)) {
        await updateItemWithBonus(existingIndex, newQty)
      } else {
        toast({
          variant: "destructive",
          title: "Stock Tidak Cukup",
          description: `Stock tersedia: ${product.currentStock} ${product.unit || 'pcs'}`
        })
      }
    } else {
      // Add new item with bonus check
      const { price, bonuses } = await calculatePriceWithBonus(product, 1)
      const newItem: CartItem = {
        product,
        width: 0,
        height: 0,
        quantity: 1,
        notes: "",
        price: price,
        unit: product.unit || "pcs"
      }
      let newItems = [...items, newItem]

      // Add bonus items if any
      for (const bonus of bonuses) {
        if (bonus.type === 'quantity' && bonus.bonusQuantity > 0) {
          const bonusItem: CartItem = {
            product,
            width: 0,
            height: 0,
            quantity: bonus.bonusQuantity,
            notes: bonus.description || 'Bonus',
            price: 0,
            unit: product.unit || "pcs",
            isBonus: true,
            bonusDescription: bonus.description,
            parentProductId: product.id
          }
          newItems.push(bonusItem)
        }
      }
      setItems(newItems)
    }
  }

  // Update item with bonus recalculation
  const updateItemWithBonus = async (index: number, newQty: number) => {
    const item = items[index]
    if (item.isBonus) return // Don't update bonus items directly

    const { price, bonuses } = await calculatePriceWithBonus(item.product, newQty)

    // Remove existing bonus items for this product
    let newItems = items.filter(i => i.parentProductId !== item.product.id)

    // Update main item
    newItems = newItems.map((i, idx) =>
      idx === index ? { ...i, quantity: newQty, price } : i
    )

    // Add new bonus items
    for (const bonus of bonuses) {
      if (bonus.type === 'quantity' && bonus.bonusQuantity > 0) {
        const bonusItem: CartItem = {
          product: item.product,
          width: 0,
          height: 0,
          quantity: bonus.bonusQuantity,
          notes: bonus.description || 'Bonus',
          price: 0,
          unit: item.product.unit || "pcs",
          isBonus: true,
          bonusDescription: bonus.description,
          parentProductId: item.product.id
        }
        newItems.push(bonusItem)
      }
    }

    setItems(newItems)
  }

  const updateQuantity = async (index: number, delta: number) => {
    const item = items[index]
    if (item.isBonus) return // Don't update bonus items directly

    const newQty = item.quantity + delta

    if (newQty <= 0) {
      // Remove item and its bonuses
      setItems(items.filter((i, idx) => idx !== index && i.parentProductId !== item.product.id))
    } else if (newQty <= (item.product.currentStock || 0)) {
      await updateItemWithBonus(index, newQty)
    } else {
      toast({
        variant: "destructive",
        title: "Stock Tidak Cukup",
        description: `Stock tersedia: ${item.product.currentStock} ${item.product.unit || 'pcs'}`
      })
    }
  }

  const setQuantityDirect = async (index: number, qty: number) => {
    const item = items[index]
    if (item.isBonus) return

    if (qty <= 0) {
      setItems(items.filter((i, idx) => idx !== index && i.parentProductId !== item.product.id))
    } else if (qty <= (item.product.currentStock || 0)) {
      await updateItemWithBonus(index, qty)
    } else {
      toast({
        variant: "destructive",
        title: "Stock Tidak Cukup",
        description: `Stock tersedia: ${item.product.currentStock} ${item.product.unit || 'pcs'}`
      })
    }
  }

  const removeItem = (index: number) => {
    const item = items[index]
    // Remove item and its bonuses
    setItems(items.filter((i, idx) => idx !== index && i.parentProductId !== item.product.id))
  }

  const handleSubmit = async () => {
    const customerName = selectedCustomerData?.name || customerSearch.trim();

    if (!customerName) {
      toast({ variant: "destructive", title: "Error", description: "Isi nama pelanggan" })
      return
    }
    if (items.length === 0) {
      toast({ variant: "destructive", title: "Error", description: "Tambahkan minimal satu produk" })
      return
    }
    if (paidAmount > 0 && !paymentAccount) {
      toast({ variant: "destructive", title: "Error", description: "Pilih akun pembayaran" })
      return
    }

    setIsSubmitting(true)

    try {
      const transactionId = `TXN-${Date.now()}`

      const newTransaction: Omit<Transaction, 'createdAt'> = {
        id: transactionId,
        customerId: selectedCustomerData?.id || 'manual-customer',
        customerName,
        cashierId: user!.id,
        cashierName: user?.name || user?.email || 'Driver POS',
        paymentAccountId: paymentAccount || null,
        retasiId: activeRetasi?.id || null,
        retasiNumber: activeRetasi?.retasi_number || null,
        orderDate: new Date(),
        items,
        subtotal: total,
        ppnEnabled: false,
        ppnMode: 'exclude',
        ppnPercentage: 0,
        ppnAmount: 0,
        total,
        paidAmount: paidAmount || 0,
        paymentStatus: paidAmount >= total ? 'Lunas' : 'Belum Lunas',
        status: 'Pesanan Masuk',
        isOfficeSale: false,
        dueDate: paidAmount < total ? new Date(dueDate) : null
      }

      const savedTransaction = await addTransaction.mutateAsync({ newTransaction })
      setCreatedTransaction(savedTransaction)

      // Reset form
      setSelectedCustomer("")
      setCustomerSearch('')
      setItems([])
      setPaymentAccount("")
      setPaidAmount(0)
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + 30);
      setDueDate(newDueDate.toISOString().split('T')[0])

      toast({ title: "Berhasil", description: `Transaksi ${transactionId} disimpan` })
      setDeliveryDialogOpen(true)

    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Gagal menyimpan" })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Loading state
  if (isCheckingRetasi && isDriver) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 flex items-center justify-center">
        <div className="animate-pulse text-center">
          <Truck className="h-8 w-8 mx-auto mb-4 text-blue-600" />
          <p>Memeriksa akses...</p>
        </div>
      </div>
    )
  }

  // Access denied
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 p-4 flex items-center justify-center">
        <Card className="max-w-md bg-red-600 text-white">
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <AlertCircle className="h-6 w-6" />
              Akses Ditolak
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-red-100 text-sm">
              {isDriver ? "Anda tidak memiliki retasi aktif" : "Akses terbatas"}
            </p>
            <Button variant="secondary" onClick={() => window.history.back()}>
              Kembali
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-2 pb-32">
      {/* Header - Compact */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-lg mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <span className="font-bold">POS Supir</span>
        </div>
        {activeRetasi && isDriver && (
          <Badge variant="secondary" className="text-xs">
            {activeRetasi.retasi_number}
          </Badge>
        )}
      </div>

      {/* Customer Input - Compact */}
      <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Ketik nama pelanggan..."
            value={customerSearch}
            onChange={(e) => {
              setCustomerSearch(e.target.value)
              setShowCustomerDropdown(true)
              if (!e.target.value) setSelectedCustomer('')
            }}
            onFocus={() => setShowCustomerDropdown(true)}
            onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
            className="w-full h-10 pl-9 pr-4 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {showCustomerDropdown && filteredCustomers.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-auto">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                  onClick={() => {
                    setSelectedCustomer(customer.id)
                    setCustomerSearch(customer.name)
                    setShowCustomerDropdown(false)
                  }}
                >
                  <div className="font-medium">{customer.name}</div>
                  {customer.address && <div className="text-xs text-gray-500 truncate">{customer.address}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Customer quick actions */}
        {selectedCustomerData && (
          <div className="flex gap-2 mt-2">
            {selectedCustomerData.phone && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => window.location.href = `tel:${selectedCustomerData.phone}`}>
                <Phone className="h-3 w-3 mr-1" /> Telepon
              </Button>
            )}
            {selectedCustomerData.latitude && (
              <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => window.open(`https://www.google.com/maps/dir//${selectedCustomerData.latitude},${selectedCustomerData.longitude}`, '_blank')}>
                <MapPin className="h-3 w-3 mr-1" /> GPS
              </Button>
            )}
            {selectedCustomerData.jumlah_galon_titip > 0 && (
              <Badge variant="secondary" className="text-xs">🥤 {selectedCustomerData.jumlah_galon_titip} galon</Badge>
            )}
          </div>
        )}
      </div>

      {/* Product Grid - Tap to Add */}
      <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-4 w-4 text-gray-600" />
          <span className="text-sm font-medium">Produk (tap untuk tambah)</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {availableProducts.slice(0, 8).map((product) => {
            const inCart = items.find(i => i.product.id === product.id)
            return (
              <button
                key={product.id}
                onClick={() => quickAddProduct(product)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  inCart
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
              >
                <div className="font-medium text-sm truncate">{product.name}</div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-xs text-green-600 font-medium">
                    {new Intl.NumberFormat("id-ID").format(product.basePrice || 0)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {product.currentStock} {product.unit}
                  </span>
                </div>
                {inCart && (
                  <Badge className="mt-1 text-xs" variant="default">
                    {inCart.quantity} di keranjang
                  </Badge>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cart - Compact List */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium">Keranjang ({items.filter(i => !i.isBonus).length})</span>
              {totalBonusQty > 0 && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                  <Gift className="h-3 w-3 mr-1" />+{totalBonusQty} bonus
                </Badge>
              )}
            </div>
            <span className="font-bold text-green-600">
              {new Intl.NumberFormat("id-ID").format(total)}
            </span>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div
                key={index}
                className={`flex items-center justify-between rounded p-2 ${
                  item.isBonus ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {item.isBonus && <Gift className="h-3 w-3 text-green-600" />}
                    <span className={`text-sm font-medium truncate ${item.isBonus ? 'text-green-700' : ''}`}>
                      {item.product.name}
                    </span>
                    {item.isBonus && (
                      <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                        BONUS
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.isBonus ? (
                      <span className="text-green-600">{item.bonusDescription || 'Gratis'}</span>
                    ) : (
                      <>{new Intl.NumberFormat("id-ID").format(item.price)} × {item.quantity}</>
                    )}
                  </div>
                </div>
                {item.isBonus ? (
                  <div className="text-sm font-medium text-green-600">{item.quantity} {item.unit}</div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(index, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => setQuantityDirect(index, parseInt(e.target.value) || 0)}
                      onFocus={(e) => e.target.select()}
                      className="w-12 h-7 text-center text-sm p-0"
                      min={1}
                      max={item.product.currentStock || 999}
                    />
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => updateQuantity(index, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeItem(index)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment - Compact */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium">Pembayaran</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-500">Jumlah Bayar</label>
              <Input
                type="number"
                inputMode="numeric"
                value={paidAmount || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 0
                  setPaidAmount(Math.min(val, total))
                  if (val === 0) setPaymentAccount('')
                }}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex gap-1">
              <Button
                variant={paidAmount >= total ? "default" : "outline"}
                size="sm"
                className="flex-1 h-9 text-xs"
                onClick={() => setPaidAmount(total)}
              >
                Lunas
              </Button>
              <Button
                variant={paidAmount === 0 ? "default" : "outline"}
                size="sm"
                className="flex-1 h-9 text-xs"
                onClick={() => { setPaidAmount(0); setPaymentAccount(''); }}
              >
                Kredit
              </Button>
            </div>
          </div>

          {paidAmount > 0 && (
            <div className="mb-3">
              <label className="text-xs text-gray-500">Akun Pembayaran</label>
              <Select value={paymentAccount} onValueChange={setPaymentAccount}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Pilih Kas/Bank" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => a.isPaymentAccount).map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {paidAmount < total && (
            <Card className="mb-3 bg-orange-50 border-orange-200">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-800">Jatuh Tempo Piutang</span>
                </div>
                {/* Quick select buttons */}
                <div className="flex gap-1 mb-2">
                  {[7, 14, 21, 30].map((days) => {
                    const targetDate = new Date()
                    targetDate.setDate(targetDate.getDate() + days)
                    const targetDateStr = targetDate.toISOString().split('T')[0]
                    const isActive = dueDate === targetDateStr
                    return (
                      <Button
                        key={days}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        className={`flex-1 h-8 text-xs ${isActive ? 'bg-orange-600 hover:bg-orange-700' : ''}`}
                        onClick={() => setDueDate(targetDateStr)}
                      >
                        {days} hari
                      </Button>
                    )
                  })}
                </div>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9 text-sm bg-white"
                />
                <p className="text-xs text-orange-600 mt-1">
                  Sisa piutang: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(total - paidAmount)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Summary */}
          <div className="bg-gray-50 rounded p-2 text-sm">
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-bold">{new Intl.NumberFormat("id-ID").format(total)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Bayar:</span>
              <span>{new Intl.NumberFormat("id-ID").format(paidAmount)}</span>
            </div>
            {total - paidAmount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>Sisa:</span>
                <span>{new Intl.NumberFormat("id-ID").format(total - paidAmount)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed Submit Button */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white border-t shadow-lg">
          <Button
            onClick={handleSubmit}
            className="w-full h-12 text-base font-bold bg-gradient-to-r from-green-500 to-green-600"
            disabled={isSubmitting || (!selectedCustomer && !customerSearch.trim())}
          >
            <Truck className="h-5 w-5 mr-2" />
            {isSubmitting ? "Memproses..." : `Simpan & Antar (${new Intl.NumberFormat("id-ID").format(total)})`}
          </Button>
        </div>
      )}

      {/* Dialogs */}
      {createdTransaction && (
        <>
          <DriverDeliveryDialog
            open={deliveryDialogOpen}
            onOpenChange={setDeliveryDialogOpen}
            transaction={createdTransaction}
            onDeliveryComplete={() => { setDeliveryDialogOpen(false); setPrintDialogOpen(true); }}
          />
          <DriverPrintDialog
            open={printDialogOpen}
            onOpenChange={setPrintDialogOpen}
            transaction={createdTransaction}
            onComplete={() => { setPrintDialogOpen(false); setCreatedTransaction(null); }}
          />
        </>
      )}
    </div>
  )
}
