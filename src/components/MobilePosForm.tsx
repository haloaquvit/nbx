"use client"
import { useState, useMemo, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PlusCircle, Trash2, Search, UserPlus, Wallet, FileText, Check, ChevronsUpDown, ShoppingCart, Calculator, User as UserIcon, Plus, Minus, Printer, Eye, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/use-toast'
import { Textarea } from './ui/textarea'
import { useProducts } from '@/hooks/useProducts'
import { useUsers } from '@/hooks/useUsers'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { Product } from '@/types/product'
import { Customer } from '@/types/customer'
import { Transaction, TransactionItem, PaymentStatus } from '@/types/transaction'
import { CustomerSearchDialog } from './CustomerSearchDialog'
import { AddCustomerDialog } from './AddCustomerDialog'
import { PrintReceiptDialog } from './PrintReceiptDialog'
import { DateTimePicker } from './ui/datetime-picker'
import { useAuth } from '@/hooks/useAuth'
import { User } from '@/types/user'
import { useCustomers } from '@/hooks/useCustomers'
import { useSalesEmployees } from '@/hooks/useSalesCommission'
import { PricingService } from '@/services/pricingService'

interface FormTransactionItem {
  id: number;
  product: Product | null;
  keterangan: string;
  qty: number;
  harga: number;
  unit: string;
  designFileName?: string;
  isBonus?: boolean;
  bonusDescription?: string;
}

export const MobilePosForm = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser } = useAuth()
  const { products, isLoading: isLoadingProducts } = useProducts()
  const { users } = useUsers();
  const { accounts } = useAccounts();
  const { addTransaction } = useTransactions();
  const { customers } = useCustomers();
  const { data: salesEmployees } = useSalesEmployees();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedSales, setSelectedSales] = useState<string>('none')
  const [orderDate, setOrderDate] = useState<Date | undefined>(new Date())
  const [finishDate, setFinishDate] = useState<Date | undefined>()
  const [designerId, setDesignerId] = useState<string>('')
  const [operatorId, setOperatorId] = useState<string>('')
  const [paymentAccountId, setPaymentAccountId] = useState<string>('')
  const [items, setItems] = useState<FormTransactionItem[]>([])
  const [diskon, setDiskon] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false)
  const [isCustomerAddOpen, setIsCustomerAddOpen] = useState(false)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null)
  const [isSuccessSheetOpen, setIsSuccessSheetOpen] = useState(false)
  const [lastTransactionTotal, setLastTransactionTotal] = useState<number>(0) // Store total before reset
  const [openProductDropdowns, setOpenProductDropdowns] = useState<{[key: number]: boolean}>({});
  const [isItemsSheetOpen, setIsItemsSheetOpen] = useState(false);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);
  const [isProductSheetOpen, setIsProductSheetOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const productSearchRef = useRef<HTMLInputElement>(null);


  const subTotal = useMemo(() => items.reduce((total, item) => total + (item.qty * item.harga), 0), [items]);
  const totalTagihan = useMemo(() => subTotal - diskon, [subTotal, diskon]);
  const sisaTagihan = useMemo(() => totalTagihan - paidAmount, [totalTagihan, paidAmount]);

  const designers = useMemo(() => users?.filter(u => u.role?.toLowerCase() === 'designer'), [users]);
  const operators = useMemo(() => users?.filter(u => u.role?.toLowerCase() === 'operator'), [users]);

  // Filter produk berdasarkan pencarian
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!productSearch) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase())
    );
  }, [products, productSearch]);

  useEffect(() => {
    setPaidAmount(totalTagihan);
  }, [totalTagihan]);

  // Auto-select sales jika user login dengan role sales
  useEffect(() => {
    if (currentUser?.role?.toLowerCase() === 'sales' && currentUser?.id) {
      // Cek apakah user ada di daftar salesEmployees
      const userAsSales = salesEmployees?.find(s => s.id === currentUser.id);
      if (userAsSales) {
        setSelectedSales(currentUser.id);
      }
    }
  }, [currentUser, salesEmployees]);

  // Auto focus search when product sheet opens
  useEffect(() => {
    if (isProductSheetOpen && productSearchRef.current) {
      setTimeout(() => productSearchRef.current?.focus(), 100);
    }
  }, [isProductSheetOpen]);

  const handleAddItem = () => {
    const newItem: FormTransactionItem = {
      id: Date.now(), product: null, keterangan: '', qty: 1, harga: 0, unit: 'pcs'
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = (index: number, field: keyof FormTransactionItem, value: any) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;

    if (field === 'product' && value) {
      const selectedProduct = value as Product;
      newItems[index].harga = selectedProduct.basePrice || 0;
      newItems[index].unit = selectedProduct.unit || 'pcs';
    }
    
    setItems(newItems);
  };

  const handleNumberInputChange = (index: number, field: 'qty' | 'harga', e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow empty string to enable complete deletion
    if (value === '') {
      handleItemChange(index, field, 0);
    } else {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue >= 0) {
        handleItemChange(index, field, numValue);
      }
    }
  };

  const handleDiskonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setDiskon(0);
    } else {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setDiskon(numValue);
      }
    }
  };

  const handlePaidAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '') {
      setPaidAmount(0);
    } else {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue >= 0) {
        setPaidAmount(numValue);
      }
    }
  };

  const handleRemoveItem = (index: number) => {
    const itemToRemove = items[index];
    if (itemToRemove.isBonus) {
      // Remove only the bonus item
      setItems(items.filter((_, i) => i !== index));
    } else {
      // Remove main item and all its bonus items
      setItems(items.filter(item =>
        !(item.id === itemToRemove.id || (item.isBonus && item.product?.id === itemToRemove.product?.id))
      ));
    }
  };

  // Reset form after successful transaction
  const resetForm = () => {
    setSelectedCustomer(null);
    setSelectedSales('none');
    setItems([]);
    setDiskon(0);
    setPaidAmount(0);
    setPaymentAccountId('');
    setSavedTransaction(null);
  };

  // Handle print thermal (RawBT)
  const handlePrintThermal = () => {
    if (savedTransaction) {
      setIsPrintDialogOpen(true);
    }
  };

  // Handle view detail and navigate
  const handleViewDetail = () => {
    setIsSuccessSheetOpen(false);
    resetForm();
    if (savedTransaction) {
      navigate(`/transactions?highlight=${savedTransaction.id}`);
    } else {
      navigate('/transactions');
    }
  };

  // Handle continue (go to transactions list)
  const handleContinue = () => {
    setIsSuccessSheetOpen(false);
    resetForm();
    navigate('/transactions');
  };

  // Handle new transaction
  const handleNewTransaction = () => {
    setIsSuccessSheetOpen(false);
    resetForm();
  };

  // Update item dengan bonus calculation
  const updateItemWithBonuses = async (existingItem: FormTransactionItem, newQty: number) => {
    if (!existingItem.product) return;

    const calculation = await PricingService.calculatePrice(existingItem.product.id, newQty);

    // Update main item
    let newItems = items.map(item =>
      item.id === existingItem.id
        ? { ...item, qty: newQty, harga: calculation?.unitPrice || item.harga }
        : item
    );

    // Remove existing bonus items for this product
    newItems = newItems.filter(item =>
      !(item.isBonus && item.product?.id === existingItem.product?.id)
    );

    // Add bonus items if any
    if (calculation?.bonuses && calculation.bonuses.length > 0) {
      for (const bonus of calculation.bonuses) {
        if (bonus.type === 'quantity' && bonus.bonusQuantity > 0) {
          const bonusItem: FormTransactionItem = {
            id: Date.now() + Math.random(),
            product: existingItem.product,
            keterangan: bonus.description || `Bonus - ${bonus.type}`,
            qty: bonus.bonusQuantity,
            harga: 0,
            unit: existingItem.product.unit || 'pcs',
            isBonus: true,
            bonusDescription: bonus.description,
          };
          newItems.push(bonusItem);
        }
      }
    }

    setItems(newItems);
  };

  // Add new item with bonus calculation
  const addNewItemWithBonuses = async (product: Product, quantity: number) => {
    const calculation = await PricingService.calculatePrice(product.id, quantity);

    const newItems: FormTransactionItem[] = [...items];

    // Add main item
    const mainItem: FormTransactionItem = {
      id: Date.now(),
      product: product,
      keterangan: '',
      qty: quantity,
      harga: calculation?.unitPrice || product.basePrice || 0,
      unit: product.unit || 'pcs',
      isBonus: false,
    };
    newItems.push(mainItem);

    // Add bonus items if any
    if (calculation?.bonuses && calculation.bonuses.length > 0) {
      for (const bonus of calculation.bonuses) {
        if (bonus.type === 'quantity' && bonus.bonusQuantity > 0) {
          const bonusItem: FormTransactionItem = {
            id: Date.now() + Math.random(),
            product: product,
            keterangan: bonus.description || `Bonus - ${bonus.type}`,
            qty: bonus.bonusQuantity,
            harga: 0,
            unit: product.unit || 'pcs',
            isBonus: true,
            bonusDescription: bonus.description,
          };
          newItems.push(bonusItem);
        }
      }
    }

    setItems(newItems);
  };

  // Tambah produk ke cart dengan cepat
  const addProductToCart = async (product: Product) => {
    const existing = items.find(item => item.product?.id === product.id && !item.isBonus);
    if (existing) {
      // Jika sudah ada, tambah qty dan update bonus
      const newQty = existing.qty + 1;
      await updateItemWithBonuses(existing, newQty);
    } else {
      // Jika belum ada, tambah item baru dengan bonus
      await addNewItemWithBonuses(product, 1);
    }
  };

  // Update qty item (with bonus recalculation)
  const updateItemQty = async (index: number, delta: number) => {
    const item = items[index];
    const newQty = item.qty + delta;

    if (item.isBonus) {
      // Allow manual bonus quantity adjustment
      if (newQty <= 0) {
        setItems(items.filter((_, i) => i !== index));
      } else {
        const newItems = [...items];
        newItems[index].qty = newQty;
        setItems(newItems);
      }
      return;
    }

    if (newQty <= 0) {
      // Remove main item and all its bonus items
      setItems(items.filter(i =>
        !(i.id === item.id || (i.isBonus && i.product?.id === item.product?.id))
      ));
    } else {
      // Update with bonus recalculation
      await updateItemWithBonuses(item, newQty);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = items.filter(item => item.product && item.qty > 0);

    if (!selectedCustomer || validItems.length === 0 || !currentUser) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Pelanggan dan tambahkan minimal satu item produk yang valid." });
      return;
    }

    if (paidAmount > 0 && !paymentAccountId) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Kas/Bank untuk menerima pembayaran." });
      return;
    }

    const transactionItems: TransactionItem[] = validItems.map(item => ({
      product: item.product!,
      quantity: item.qty,
      price: item.harga,
      unit: item.unit,
      width: 0,
      height: 0,
      notes: item.isBonus
        ? `${item.keterangan}${item.keterangan ? ' - ' : ''}BONUS: ${item.bonusDescription || 'Bonus Item'}`
        : item.keterangan,
      designFileName: item.designFileName,
      isBonus: item.isBonus || false,
      name: item.isBonus ? `${item.product!.name} (Bonus)` : item.product!.name
    }));

    const paymentStatus: PaymentStatus = sisaTagihan <= 0 ? 'Lunas' : 'Belum Lunas';

    const newTransaction: Omit<Transaction, 'createdAt'> = {
      id: `KRP-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000)}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      salesId: selectedSales && selectedSales !== 'none' ? selectedSales : null,
      salesName: selectedSales && selectedSales !== 'none' ? salesEmployees?.find(s => s.id === selectedSales)?.name || null : null,
      designerId: designerId || null,
      operatorId: operatorId || null,
      paymentAccountId: paymentAccountId || null,
      orderDate: orderDate || new Date(),
      finishDate: finishDate || null,
      items: transactionItems,
      total: totalTagihan,
      paidAmount: paidAmount,
      paymentStatus: paymentStatus,
      status: 'Pesanan Masuk',
    };

    addTransaction.mutate({ newTransaction }, {
      onSuccess: (savedData) => {
        // ============================================================================
        // BALANCE UPDATE DIHAPUS - Sekarang dihitung dari journal_entries
        // addTransaction sudah memanggil createSalesJournal yang akan auto-post jurnal
        // ============================================================================

        // Store the total BEFORE reset (use totalTagihan from state, not savedData which may not have it)
        setLastTransactionTotal(totalTagihan);
        setSavedTransaction(savedData);
        toast({ title: "Sukses", description: "Transaksi berhasil disimpan." });

        // Show success sheet with print/view options instead of immediate redirect
        setIsSuccessSheetOpen(true);
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.message });
      }
    });
  };

  return (
    <div className="space-y-4">
      <CustomerSearchDialog open={isCustomerSearchOpen} onOpenChange={setIsCustomerSearchOpen} onCustomerSelect={setSelectedCustomer} />
      <AddCustomerDialog open={isCustomerAddOpen} onOpenChange={setIsCustomerAddOpen} onCustomerAdded={setSelectedCustomer} />
      {savedTransaction && (
        <PrintReceiptDialog
          open={isPrintDialogOpen}
          onOpenChange={setIsPrintDialogOpen}
          transaction={savedTransaction}
          template="receipt"
          onClose={() => {
            // Setelah print dialog ditutup dengan tombol "Selesai", navigasi ke transaksi
            setIsSuccessSheetOpen(false);
            resetForm();
            navigate('/transactions');
          }}
        />
      )}

      {/* Success Sheet - After transaction saved */}
      <Sheet open={isSuccessSheetOpen} onOpenChange={(open) => {
        if (!open) {
          // If closing without selecting action, reset and go to transactions
          handleContinue();
        }
      }}>
        <SheetContent side="bottom" className="h-auto">
          <SheetHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <SheetTitle className="text-xl">Transaksi Berhasil!</SheetTitle>
            <SheetDescription>
              {savedTransaction && (
                <div className="space-y-1">
                  <p className="font-semibold text-2xl text-green-600">
                    Rp {new Intl.NumberFormat("id-ID").format(lastTransactionTotal || savedTransaction.total || 0)}
                  </p>
                  <p className="text-sm font-medium">{savedTransaction.customerName}</p>
                  <p className="text-xs text-muted-foreground">No: {savedTransaction.id}</p>
                </div>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-3 pb-6">
            {/* Print Thermal (RawBT) Button */}
            <Button
              onClick={handlePrintThermal}
              className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700"
            >
              <Printer className="mr-2 h-5 w-5" />
              Cetak Struk (RawBT)
            </Button>

            {/* View Detail Button */}
            <Button
              onClick={handleViewDetail}
              variant="outline"
              className="w-full h-12"
            >
              <Eye className="mr-2 h-5 w-5" />
              Lihat Detail Transaksi
            </Button>

            {/* New Transaction Button */}
            <Button
              onClick={handleNewTransaction}
              variant="outline"
              className="w-full h-12 border-green-300 text-green-700 hover:bg-green-50"
            >
              <Plus className="mr-2 h-5 w-5" />
              Transaksi Baru
            </Button>

            {/* Go to Transactions Button */}
            <Button
              onClick={handleContinue}
              variant="ghost"
              className="w-full h-10 text-muted-foreground"
            >
              <ArrowRight className="mr-2 h-4 w-4" />
              Ke Daftar Transaksi
            </Button>
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Point of Sale
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Customer Selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pelanggan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-semibold text-base">
              {selectedCustomer?.name || 'Belum dipilih'}
            </p>
            {selectedCustomer && (
              <>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedCustomer.address}
                </p>
                <p className="text-sm text-muted-foreground">
                  📞 {selectedCustomer.phone}
                </p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setIsCustomerSearchOpen(true)}
              className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-black"
            >
              <Search className="mr-2 h-4 w-4" /> Cari
            </Button>
            <Button
              onClick={() => setIsCustomerAddOpen(true)}
              className="flex-1"
            >
              <UserPlus className="mr-2 h-4 w-4" /> Baru
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sales Selection */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-green-600" />
            Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedSales} onValueChange={setSelectedSales}>
            <SelectTrigger className="bg-white">
              <SelectValue placeholder="Pilih Sales (Opsional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-gray-500">Tanpa Sales</span>
              </SelectItem>
              {salesEmployees?.map((sales) => (
                <SelectItem key={sales.id} value={sales.id}>
                  <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>{sales.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedSales && selectedSales !== 'none' && (
            <p className="text-sm text-green-700 mt-2">
              ✓ Sales: {salesEmployees?.find(s => s.id === selectedSales)?.name}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Items Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Item ({items.length})</CardTitle>
            <div className="flex gap-2">
              {/* Tombol Tambah Produk Cepat */}
              <Sheet open={isProductSheetOpen} onOpenChange={setIsProductSheetOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700">
                    <Plus className="mr-1 h-4 w-4" /> Tambah
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[85vh]">
                  <SheetHeader>
                    <SheetTitle>Pilih Produk</SheetTitle>
                    <SheetDescription>
                      Ketuk produk untuk menambahkan ke keranjang
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4 space-y-4">
                    {/* Search Input */}
                    <Input
                      ref={productSearchRef}
                      placeholder="🔍 Cari produk..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="text-lg py-6"
                    />
                    {/* Product Grid */}
                    <div className="grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pb-4">
                      {filteredProducts.map((product) => {
                        const inCart = items.find(item => item.product?.id === product.id);
                        return (
                          <div
                            key={product.id}
                            onClick={() => {
                              addProductToCart(product);
                              // Tidak tutup sheet agar bisa tambah banyak produk
                            }}
                            className={cn(
                              "p-3 rounded-lg border-2 cursor-pointer transition-all active:scale-95",
                              inCart
                                ? "border-green-500 bg-green-50"
                                : "border-gray-200 bg-white hover:border-blue-300"
                            )}
                          >
                            <p className="font-semibold text-sm truncate">{product.name}</p>
                            <p className="text-green-600 font-bold mt-1">
                              {new Intl.NumberFormat("id-ID").format(product.basePrice || 0)}
                            </p>
                            <p className="text-xs text-gray-500">/{product.unit}</p>
                            {inCart && (
                              <div className="mt-2 flex items-center justify-center bg-green-600 text-white rounded-full px-2 py-1 text-xs">
                                ✓ {inCart.qty} di keranjang
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Tombol Selesai */}
                    <Button
                      className="w-full h-12 text-lg"
                      onClick={() => {
                        setIsProductSheetOpen(false);
                        setProductSearch('');
                      }}
                    >
                      Selesai ({items.length} item)
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Tombol Kelola Detail */}
              <Sheet open={isItemsSheetOpen} onOpenChange={setIsItemsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <FileText className="mr-1 h-4 w-4" /> Edit
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Edit Item</SheetTitle>
                    <SheetDescription>
                      Edit detail, qty, atau harga item
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-4 mt-6">
                    {items.map((item, index) => (
                      <Card key={item.id} className={cn(
                        "p-4",
                        item.isBonus && "bg-green-50 border-green-300"
                      )}>
                        <div className="space-y-3">
                          {/* Product Name */}
                          <div className="flex items-center justify-between">
                            {item.isBonus ? (
                              <p className="font-semibold text-green-700">
                                🎁 {item.product?.name} (Bonus)
                              </p>
                            ) : (
                              <p className="font-semibold">{item.product?.name || 'Produk'}</p>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(index)}
                              className="text-destructive h-8 w-8 p-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Bonus Description */}
                          {item.isBonus && item.bonusDescription && (
                            <p className="text-sm text-green-600 -mt-2">{item.bonusDescription}</p>
                          )}

                          {/* Quantity and Price */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-sm">Qty</Label>
                              <Input
                                type="number"
                                value={item.qty || ''}
                                onChange={(e) => handleNumberInputChange(index, 'qty', e)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                min="0"
                                step="1"
                              />
                            </div>
                            <div>
                              <Label className="text-sm">Harga</Label>
                              <Input
                                type="number"
                                value={item.isBonus ? 0 : (item.harga || '')}
                                onChange={(e) => handleNumberInputChange(index, 'harga', e)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0"
                                min="0"
                                disabled={item.isBonus}
                                className={item.isBonus ? "bg-green-100" : ""}
                              />
                            </div>
                          </div>

                          {/* Keterangan */}
                          <div>
                            <Label className="text-sm">Catatan</Label>
                            <Input
                              value={item.keterangan}
                              onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)}
                              placeholder="Catatan item..."
                            />
                          </div>

                          {/* Total */}
                          <div className="flex justify-between pt-2 border-t">
                            <span className="text-sm text-muted-foreground">Total:</span>
                            {item.isBonus ? (
                              <span className="font-bold text-green-600">GRATIS</span>
                            ) : (
                              <span className="font-bold text-green-600">
                                {new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}

                    {items.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShoppingCart className="mx-auto h-12 w-12 mb-2 opacity-50" />
                        <p>Keranjang kosong</p>
                        <p className="text-sm">Ketuk "Tambah" untuk menambah produk</p>
                      </div>
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={item.id} className={cn(
                  "flex items-center gap-2 p-2 rounded",
                  item.isBonus ? "bg-green-100 border border-green-300" : "bg-muted"
                )}>
                  {/* Qty Controls */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => updateItemQty(index, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <Input
                      type="number"
                      value={item.qty || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '') {
                          handleItemChange(index, 'qty', 0);
                        } else {
                          const num = parseInt(val);
                          if (!isNaN(num) && num >= 0) {
                            handleItemChange(index, 'qty', num);
                          }
                        }
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-14 h-8 text-center font-bold p-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min="0"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => updateItemQty(index, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    {item.isBonus ? (
                      <>
                        <p className="font-medium text-sm truncate text-green-700">
                          🎁 {item.product?.name} (Bonus)
                        </p>
                        {item.bonusDescription && (
                          <p className="text-xs text-green-600">{item.bonusDescription}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="font-medium text-sm truncate">{item.product?.name || 'Produk'}</p>
                        <p className="text-xs text-muted-foreground">
                          @ {new Intl.NumberFormat("id-ID").format(item.harga)}
                        </p>
                      </>
                    )}
                  </div>
                  {/* Total */}
                  {item.isBonus ? (
                    <span className="text-sm font-medium text-green-600">GRATIS</span>
                  ) : (
                    <p className="font-bold text-green-600">
                      {new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              className="text-center py-6 text-muted-foreground cursor-pointer hover:bg-muted rounded-lg transition-colors"
              onClick={() => setIsProductSheetOpen(true)}
            >
              <Plus className="mx-auto h-10 w-10 mb-2 text-green-600" />
              <p className="font-medium">Ketuk untuk tambah produk</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Summary - Simplified */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Pembayaran
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Total */}
          <div className="flex justify-between items-center py-2 border-b">
            <span className="text-lg font-medium">Total</span>
            <span className="text-xl font-bold text-green-600">
              {new Intl.NumberFormat("id-ID").format(totalTagihan)}
            </span>
          </div>

          {/* Metode Pembayaran - Quick Select Buttons */}
          <div>
            <Label className="text-sm text-muted-foreground mb-2 block">Bayar dengan:</Label>
            {accounts?.filter(a => a.isPaymentAccount).length === 0 ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
                <p className="text-sm text-red-600 font-medium">⚠️ Tidak ada akun pembayaran</p>
                <p className="text-xs text-red-500 mt-1">Buka Chart of Accounts → Import COA Standar</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {accounts?.filter(a => a.isPaymentAccount).slice(0, 4).map(acc => (
                  <Button
                    key={acc.id}
                    type="button"
                    variant={paymentAccountId === acc.id ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "h-10",
                      paymentAccountId === acc.id && "bg-green-600 hover:bg-green-700"
                    )}
                    onClick={() => setPaymentAccountId(acc.id)}
                  >
                    <Wallet className="mr-1 h-4 w-4" />
                    {acc.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Bayar Penuh / Sebagian Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={paidAmount === totalTagihan ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1",
                paidAmount === totalTagihan && "bg-green-600 hover:bg-green-700"
              )}
              onClick={() => setPaidAmount(totalTagihan)}
            >
              Lunas
            </Button>
            <Button
              type="button"
              variant={paidAmount !== totalTagihan && paidAmount > 0 ? "default" : "outline"}
              size="sm"
              className={cn(
                "flex-1",
                paidAmount !== totalTagihan && paidAmount > 0 && "bg-orange-500 hover:bg-orange-600"
              )}
              onClick={() => setPaidAmount(0)}
            >
              Belum Bayar
            </Button>
          </div>

          {/* Input Bayar Sebagian (hanya muncul jika tidak lunas) */}
          {paidAmount !== totalTagihan && (
            <div className="flex items-center gap-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
              <span className="text-sm">Bayar:</span>
              <Input
                type="number"
                value={paidAmount || ''}
                onChange={handlePaidAmountChange}
                onFocus={(e) => e.target.select()}
                className="flex-1 h-9 text-right font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="0"
                min="0"
              />
              <span className="text-sm text-muted-foreground">Sisa:</span>
              <span className="font-bold text-orange-600 min-w-[80px] text-right">
                {new Intl.NumberFormat("id-ID").format(sisaTagihan)}
              </span>
            </div>
          )}

          {/* Status Pembayaran */}
          {paidAmount === totalTagihan && totalTagihan > 0 && (
            <div className="text-center py-2 bg-green-100 rounded-lg text-green-700 font-medium">
              ✓ Pembayaran Lunas
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <Button 
        onClick={handleSubmit}
        size="lg" 
        className="w-full h-14 text-lg"
        disabled={addTransaction.isPending || !selectedCustomer || items.length === 0}
      >
        {addTransaction.isPending ? "Menyimpan..." : "Simpan Transaksi"}
      </Button>
    </div>
  )
}