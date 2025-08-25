"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { Truck, Plus, Trash2, ShoppingCart, User, Package, CreditCard, AlertCircle, Phone, MapPin } from "lucide-react"
import { useCustomers } from "@/hooks/useCustomers"
import { useProducts } from "@/hooks/useProducts"
import { useAccounts } from "@/hooks/useAccounts"
import { useTransactions } from "@/hooks/useTransactions"
import { useAuth } from "@/hooks/useAuth"
import { useDriverHasRetasi } from "@/hooks/useRetasi"
import { TransactionItem, Transaction } from "@/types/transaction"
import { DriverDeliveryDialog } from "@/components/DriverDeliveryDialog"
import { DriverPrintDialog } from "@/components/DriverPrintDialog"

export default function DriverPosPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  const { customers } = useCustomers()
  const { products } = useProducts()
  const { accounts, updateAccountBalance } = useAccounts()
  const { addTransaction } = useTransactions()

  // Check if driver has retasi records
  const { data: driverHasRetasi, isLoading: isCheckingRetasi } = useDriverHasRetasi(user?.name)

  // Enhanced role-based access control
  const isAdminOwner = user?.role && ['admin', 'owner'].includes(user.role)
  
  // Access logic: admin/owner always have access, helper always has access, driver only if they have retasi
  const hasAccess = isAdminOwner || 
                   (user?.role === 'helper') ||
                   (user?.role === 'driver' && driverHasRetasi)

  // Show loading state while checking retasi
  if (isCheckingRetasi && user?.role === 'driver') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 p-4 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <div className="animate-pulse">
              <Truck className="h-8 w-8 mx-auto mb-4 text-blue-600" />
              <p className="text-lg font-medium">Memeriksa akses...</p>
              <p className="text-sm text-muted-foreground mt-2">Validating driver permissions</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!hasAccess) {
    const isDriverWithoutRetasi = user?.role === 'driver' && !driverHasRetasi
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 p-4 flex items-center justify-center">
        <div className="max-w-md mx-auto">
          <Card className="bg-gradient-to-r from-red-600 to-red-700 text-white">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6" />
                Akses Ditolak
              </CardTitle>
              <CardDescription className="text-red-100">
                {isDriverWithoutRetasi 
                  ? "Anda belum memiliki data retasi terkait" 
                  : "Akses terbatas untuk role tertentu"}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="bg-red-800/30 rounded-lg p-4">
                <p className="text-red-100 text-sm mb-2">
                  <span className="font-semibold">Role Anda:</span> {user?.role || 'Unknown'}
                </p>
                {isDriverWithoutRetasi && (
                  <p className="text-red-100 text-xs">
                    Untuk mengakses POS Supir, Anda harus memiliki minimal satu data retasi terkait dengan nama Anda.
                  </p>
                )}
              </div>
              <div className="text-red-100 text-xs">
                <p className="font-semibold mb-1">Yang dapat mengakses:</p>
                <ul className="list-disc list-inside space-y-1 text-left">
                  <li>Admin & Owner (akses penuh)</li>
                  <li>Helper (akses penuh)</li>
                  <li>Driver dengan data retasi</li>
                </ul>
              </div>
              <Button
                variant="secondary"
                className="mt-4"
                onClick={() => window.history.back()}
              >
                Kembali
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Form state - with cart functionality
  const [selectedCustomer, setSelectedCustomer] = useState("")
  const [selectedProduct, setSelectedProduct] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [items, setItems] = useState<TransactionItem[]>([])
  const [notes, setNotes] = useState("")
  const [paymentAccount, setPaymentAccount] = useState("")
  const [paidAmount, setPaidAmount] = useState(0)

  const handlePaidAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setPaidAmount(0);
      setPaymentAccount('');
    } else {
      const numValue = parseInt(value) || 0;
      if (numValue >= 0 && numValue <= total) {
        setPaidAmount(numValue);
        if (numValue === 0) {
          setPaymentAccount('');
        }
      }
    }
  };
  
  // Dialog states
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [createdTransaction, setCreatedTransaction] = useState<Transaction | null>(null)
  
  // Loading state
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedProductData = products?.find(p => p.id === selectedProduct)
  const selectedCustomerData = customers?.find(c => c.id === selectedCustomer)
  
  // Calculate totals from items
  const quantityNum = parseInt(quantity) || 0
  const subtotal = items.reduce((sum, item) => sum + (item.product.basePrice * item.quantity), 0)
  const total = subtotal

  const addItem = () => {
    if (!selectedProductData) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih produk terlebih dahulu"
      })
      return
    }

    if (quantityNum <= 0) {
      toast({
        variant: "destructive",
        title: "Error", 
        description: "Kuantitas harus lebih dari 0"
      })
      return
    }

    // Check stock availability
    const currentStock = selectedProductData.currentStock || 0
    if (quantityNum > currentStock) {
      toast({
        variant: "destructive",
        title: "Stock Tidak Cukup",
        description: `Stock tersedia: ${currentStock} ${selectedProductData.unit || 'pcs'}`
      })
      return
    }

    const price = selectedProductData.basePrice || 0
    const unit = selectedProductData.unit || "pcs"

    const newItem: TransactionItem = {
      product: selectedProductData,
      width: 0,
      height: 0,
      quantity: quantityNum,
      notes: "",
      price,
      unit
    }

    setItems([...items, newItem])
    
    // Reset product selection
    setSelectedProduct("")
    setQuantity("1")
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const handleSubmit = async () => {
    if (!selectedCustomerData) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih pelanggan terlebih dahulu"
      })
      return
    }

    if (items.length === 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Tambahkan minimal satu produk"
      })
      return
    }

    if (!user) {
      toast({
        variant: "destructive", 
        title: "Error",
        description: "User tidak terautentikasi"
      })
      return
    }

    // Validate payment account when there's a payment
    if (paidAmount > 0 && (!paymentAccount || paymentAccount === "")) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Pilih akun pembayaran ketika ada pembayaran"
      })
      return
    }

    // Validate payment amount doesn't exceed total
    if (paidAmount > total) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Jumlah dibayar tidak boleh melebihi total tagihan"
      })
      return
    }

    setIsSubmitting(true)
    
    try {
      const transactionId = `TXN-${Date.now()}`
      const orderDate = new Date()
      
      const newTransaction: Omit<Transaction, 'createdAt'> = {
        id: transactionId,
        customerId: selectedCustomerData.id,
        customerName: selectedCustomerData.name,
        cashierId: user.id,
        cashierName: user.name || user.email || 'Driver POS',
        paymentAccountId: paymentAccount || null,
        orderDate,
        items,
        subtotal: total,
        ppnEnabled: false, // No PPN for driver POS
        ppnMode: 'exclude',
        ppnPercentage: 0,
        ppnAmount: 0,
        total,
        paidAmount: paidAmount || 0,
        paymentStatus: paidAmount >= total ? 'Lunas' : 'Belum Lunas',
        status: 'Pesanan Masuk', // Will be updated after delivery
        isOfficeSale: false, // No office sale option for driver POS
        dueDate: paidAmount < total ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null // 30 days
      }

      const savedTransaction = await addTransaction.mutateAsync({ 
        newTransaction 
      })

      // Update account balance if there's a payment
      if (paidAmount > 0 && paymentAccount) {
        try {
          await updateAccountBalance.mutateAsync({ accountId: paymentAccount, amount: paidAmount });
        } catch (paymentError) {
          console.error('Error updating account balance:', paymentError);
          toast({ 
            variant: "destructive", 
            title: "Warning", 
            description: "Transaksi berhasil disimpan tetapi ada masalah dalam update saldo akun." 
          });
        }
      }

      setCreatedTransaction(savedTransaction)
      
      // Clear form
      setSelectedCustomer("")
      setSelectedProduct("")
      setQuantity("1")
      setItems([])
      setNotes("")
      setPaymentAccount("")
      setPaidAmount(0)
      
      toast({
        title: "Transaksi Berhasil",
        description: `Transaksi ${transactionId} berhasil disimpan`
      })

      // Open delivery dialog immediately
      setDeliveryDialogOpen(true)

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Gagal menyimpan transaksi"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeliveryComplete = () => {
    setDeliveryDialogOpen(false)
    setPrintDialogOpen(true)
  }

  const handlePrintComplete = () => {
    setPrintDialogOpen(false)
    setCreatedTransaction(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 lg:p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardHeader className="py-6 px-6">
            <CardTitle className="flex items-center gap-3 text-2xl font-bold">
              <Truck className="h-8 w-8" />
              POS Supir
            </CardTitle>
            <CardDescription className="text-blue-100 text-lg mt-2">
              Point of Sale untuk Supir & Helper
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Customer Selection */}
        <Card>
          <CardHeader className="py-4 px-6">
            <CardTitle className="flex items-center gap-3 text-xl">
              <User className="h-5 w-5" />
              Pelanggan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue placeholder="Pilih Pelanggan" />
              </SelectTrigger>
              <SelectContent>
                {customers?.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-xs text-muted-foreground">{customer.phone}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Customer Information Display */}
            {selectedCustomerData && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium text-muted-foreground">Informasi Pelanggan:</div>
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-medium">{selectedCustomerData.name}</div>
                    <div className="text-sm text-muted-foreground mt-1">{selectedCustomerData.address}</div>
                    {selectedCustomerData.phone && (
                      <div className="text-sm text-blue-600 mt-1">📞 {selectedCustomerData.phone}</div>
                    )}
                    {selectedCustomerData.jumlah_galon_titip !== undefined && selectedCustomerData.jumlah_galon_titip > 0 && (
                      <div className="text-sm text-green-600 mt-1 font-medium">
                        🥤 Galon Titip: {selectedCustomerData.jumlah_galon_titip} galon
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedCustomerData.phone && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = `tel:${selectedCustomerData.phone}`}
                        className="flex items-center gap-2"
                      >
                        <Phone className="h-4 w-4" />
                        <span>Telepon</span>
                      </Button>
                    )}
                    {selectedCustomerData.latitude && selectedCustomerData.longitude && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          window.open(`https://www.google.com/maps/dir//${selectedCustomerData.latitude},${selectedCustomerData.longitude}`, '_blank');
                        }}
                        className="flex items-center gap-2"
                      >
                        <MapPin className="h-4 w-4" />
                        <span>Lokasi GPS</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product Selection - Only show when customer is selected */}
        {selectedCustomer && (
          <Card>
            <CardHeader className="py-4 px-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <Package className="h-5 w-5" />
                Pilih Produk
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
            <div>
              <Label className="text-base font-medium">Produk</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Pilih Produk" />
                </SelectTrigger>
                <SelectContent>
                  {products
                    ?.filter(product => product?.id && product.id.trim() !== '') // Only include products with valid IDs
                    ?.filter(product => !items.some(item => item.product.id === product.id)) // Hide already added products
                    ?.sort((a, b) => (b.currentStock || 0) - (a.currentStock || 0)) // Sort by stock descending
                    ?.map((product) => {
                      // Ensure we have a valid product ID
                      if (!product.id || product.id.trim() === '') return null;
                      
                      return (
                        <SelectItem 
                          key={product.id} 
                          value={product.id} 
                          disabled={(product.currentStock || 0) === 0}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{product.name || 'Unnamed Product'}</span>
                              {(product.currentStock || 0) === 0 && (
                                <span className="text-xs bg-red-100 text-red-600 px-1 rounded">Kosong</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-green-600 font-medium">
                                {new Intl.NumberFormat("id-ID", {
                                  style: "currency",
                                  currency: "IDR",
                                  minimumFractionDigits: 0
                                }).format(product.basePrice || 0)}
                              </span>
                              <span className="text-muted-foreground">•</span>
                              <span className={`${(product.currentStock || 0) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                Stock: {product.currentStock || 0} {product.unit || 'pcs'}
                              </span>
                            </div>
                          </div>
                        </SelectItem>
                      );
                    })
                    ?.filter(Boolean) // Remove null items
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-base font-medium">Jumlah</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={selectedProductData?.currentStock || 999}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Masukkan jumlah"
                  className="h-12 text-base"
                />
              </div>
              <div>
                <Label className="text-base font-medium">Tersedia</Label>
                <Input
                  value={`${selectedProductData?.currentStock || 0} ${selectedProductData?.unit || 'pcs'}`}
                  disabled
                  className="bg-gray-100 h-12 text-base"
                />
              </div>
            </div>

            {/* Product Info */}
            {selectedProductData && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-lg font-medium text-blue-800">{selectedProductData.name}</div>
                <div className="flex justify-between text-base text-blue-600 mt-2">
                  <span>Harga: {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    minimumFractionDigits: 0
                  }).format(selectedProductData.basePrice || 0)}</span>
                  <span className={`${(selectedProductData.currentStock || 0) > 0 ? 'text-blue-600' : 'text-red-500'}`}>
                    Stock: {selectedProductData.currentStock || 0} {selectedProductData.unit || 'pcs'}
                  </span>
                </div>
                {quantityNum > 0 && (
                  <div className="bg-white p-3 rounded mt-3 border">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Harga Item:</span>
                      <span className="text-lg font-bold text-green-600">
                        {new Intl.NumberFormat("id-ID", {
                          style: "currency",
                          currency: "IDR",
                          minimumFractionDigits: 0
                        }).format(selectedProductData.basePrice * quantityNum)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {quantityNum} {selectedProductData.unit} × {new Intl.NumberFormat("id-ID", {
                        style: "currency",
                        currency: "IDR",
                        minimumFractionDigits: 0
                      }).format(selectedProductData.basePrice)}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <Button 
              onClick={addItem} 
              className="w-full h-14 text-lg font-medium"
              disabled={!selectedProduct || !quantity || quantity === '0' || (selectedProductData?.currentStock || 0) === 0}
            >
              <Plus className="h-5 w-5 mr-3" />
              {(selectedProductData?.currentStock || 0) === 0 ? 'Stock Kosong' : 'Tambah Produk'}
            </Button>
          </CardContent>
          </Card>
        )}

        {/* Items List */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="py-4 px-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <ShoppingCart className="h-5 w-5" />
                Daftar Produk ({items.length} item)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex items-start justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-base">{item.product.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.quantity} {item.unit}
                    </div>
                    {item.notes && (
                      <div className="text-sm text-blue-600 mt-1">{item.notes}</div>
                    )}
                    <div className="text-lg font-medium text-green-600 mt-2">
                      {new Intl.NumberFormat("id-ID", {
                        style: "currency", 
                        currency: "IDR",
                        minimumFractionDigits: 0
                      }).format(item.product.basePrice * item.quantity)}
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => removeItem(index)}
                    className="text-red-500 hover:text-red-700 h-10 w-10"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Payment */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="py-4 px-6">
              <CardTitle className="flex items-center gap-3 text-xl">
                <CreditCard className="h-5 w-5" />
                Pembayaran
              </CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">Jumlah Dibayar</Label>
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPaidAmount(total)}
                    className="text-xs h-6 px-2"
                  >
                    Bayar Lunas
                  </Button>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  max={total}
                  value={paidAmount || ''}
                  onChange={handlePaidAmountChange}
                  placeholder={`Maksimal: ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(total)}`}
                  className="h-12 text-base"
                />
                {paidAmount > total && (
                  <p className="text-sm text-red-600 mt-1">
                    Jumlah dibayar tidak boleh melebihi total tagihan
                  </p>
                )}
              </div>

              {paidAmount > 0 && (
                <div>
                  <Label className="text-base font-medium">
                    Akun Pembayaran *
                  </Label>
                  <Select value={paymentAccount} onValueChange={setPaymentAccount}>
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Pilih akun pembayaran" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts?.filter(account => account.isPaymentAccount).map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} - {new Intl.NumberFormat("id-ID", {
                            style: "currency",
                            currency: "IDR",
                            minimumFractionDigits: 0
                          }).format(account.balance || 0)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <div className="flex justify-between text-base">
                  <span>Total:</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR", 
                      minimumFractionDigits: 0
                    }).format(total)}
                  </span>
                </div>
                <div className="flex justify-between text-base">
                  <span>Dibayar:</span>
                  <span className="font-medium">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0
                    }).format(paidAmount)}
                  </span>
                </div>
                <div className="flex justify-between text-base border-t pt-2">
                  <span>Sisa:</span>
                  <span className={`font-medium ${total - paidAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      minimumFractionDigits: 0
                    }).format(Math.max(0, total - paidAmount))}
                  </span>
                </div>
                <div className="flex justify-center">
                  <Badge variant={paidAmount === 0 ? "secondary" : total - paidAmount > 0 ? "secondary" : "default"} className="w-full justify-center">
                    Status: {paidAmount === 0 ? 'Piutang' : paidAmount >= total ? 'Lunas' : 'Kredit'}
                  </Badge>
                </div>
              </div>

              <div>
                <Label className="text-base font-medium">Catatan</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan untuk pesanan ini..."
                  rows={3}
                  className="text-base"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        {items.length > 0 && (
          <Button 
            onClick={handleSubmit} 
            className="w-full h-16 text-xl font-bold bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-lg"
            disabled={isSubmitting || !selectedCustomer || items.length === 0}
          >
            <Truck className="h-6 w-6 mr-3" />
            {isSubmitting ? "Memproses..." : "Simpan & Antar"}
          </Button>
        )}

        {/* Delivery Dialog */}
        {createdTransaction && (
          <DriverDeliveryDialog
            open={deliveryDialogOpen}
            onOpenChange={setDeliveryDialogOpen}
            transaction={createdTransaction}
            onDeliveryComplete={handleDeliveryComplete}
          />
        )}

        {/* Print Dialog */}
        {createdTransaction && (
          <DriverPrintDialog
            open={printDialogOpen}
            onOpenChange={setPrintDialogOpen}
            transaction={createdTransaction}
            onComplete={handlePrintComplete}
          />
        )}

      </div>
    </div>
  )
}