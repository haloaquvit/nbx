"use client"
import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PlusCircle, Trash2, Search, UserPlus, Wallet, FileText, Check, ChevronsUpDown, ShoppingCart, Calculator } from 'lucide-react'
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
import { Quotation } from '@/types/quotation'
import { useCustomers } from '@/hooks/useCustomers'

interface FormTransactionItem {
  id: number;
  product: Product | null;
  keterangan: string;
  qty: number;
  harga: number;
  unit: string;
  designFileName?: string;
}

export const MobilePosForm = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser } = useAuth()
  const { products, isLoading: isLoadingProducts } = useProducts()
  const { users } = useUsers();
  const { accounts, updateAccountBalance } = useAccounts();
  const { addTransaction } = useTransactions();
  const { customers } = useCustomers();
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
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
  const [sourceQuotationId, setSourceQuotationId] = useState<string | null>(null)
  const [isQuotationProcessed, setIsQuotationProcessed] = useState(false);
  const [openProductDropdowns, setOpenProductDropdowns] = useState<{[key: number]: boolean}>({});
  const [isItemsSheetOpen, setIsItemsSheetOpen] = useState(false);
  const [isPaymentSheetOpen, setIsPaymentSheetOpen] = useState(false);

  useEffect(() => {
    const quotationData = location.state?.quotationData as Quotation | undefined;
    if (quotationData && !isQuotationProcessed && customers) {
      const customer = customers.find(c => c.id === quotationData.customerId);
      if (customer) setSelectedCustomer(customer);

      const transactionItems: FormTransactionItem[] = quotationData.items.map(item => ({
        id: Math.random(),
        product: item.product,
        keterangan: item.notes || '',
        qty: item.quantity,
        harga: item.price,
        unit: item.unit,
      }));
      setItems(transactionItems);
      setSourceQuotationId(quotationData.id);
      
      setIsQuotationProcessed(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, customers, isQuotationProcessed]);

  const subTotal = useMemo(() => items.reduce((total, item) => total + (item.qty * item.harga), 0), [items]);
  const totalTagihan = useMemo(() => subTotal - diskon, [subTotal, diskon]);
  const sisaTagihan = useMemo(() => totalTagihan - paidAmount, [totalTagihan, paidAmount]);

  const designers = useMemo(() => users?.filter(u => u.role === 'designer'), [users]);
  const operators = useMemo(() => users?.filter(u => u.role === 'operator'), [users]);

  useEffect(() => {
    setPaidAmount(totalTagihan);
  }, [totalTagihan]);

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

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = items.filter(item => item.product && item.qty > 0);

    if (!selectedCustomer || validItems.length === 0 || !currentUser) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Pelanggan dan tambahkan minimal satu item produk yang valid." });
      return;
    }

    if (paidAmount > 0 && !paymentAccountId) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Metode Pembayaran jika ada jumlah yang dibayar." });
      return;
    }

    const transactionItems: TransactionItem[] = validItems.map(item => ({
      product: item.product!,
      quantity: item.qty,
      price: item.harga,
      unit: item.unit,
      width: 0, height: 0, notes: item.keterangan,
      designFileName: item.designFileName,
    }));

    const paymentStatus: PaymentStatus = sisaTagihan <= 0 ? 'Lunas' : 'Belum Lunas';

    const newTransaction: Omit<Transaction, 'createdAt'> = {
      id: `KRP-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000)}`,
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
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

    addTransaction.mutate({ newTransaction, quotationId: sourceQuotationId }, {
      onSuccess: (savedData) => {
        if (paidAmount > 0 && paymentAccountId) {
          updateAccountBalance.mutate({ accountId: paymentAccountId, amount: paidAmount });
        }
        
        setSavedTransaction(savedData);
        toast({ title: "Sukses", description: "Transaksi berhasil disimpan." });
        
        // Redirect to transaction list page after successful save
        navigate('/transactions');
        
        // Reset form
        setSelectedCustomer(null);
        setItems([]);
        setDiskon(0);
        setPaidAmount(0);
        setPaymentAccountId('');
        setSourceQuotationId(null);
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
      {savedTransaction && <PrintReceiptDialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen} transaction={savedTransaction} template="receipt" />}
      
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            Point of Sale
          </CardTitle>
          {sourceQuotationId && (
            <CardDescription className="text-blue-600 dark:text-blue-400">
              <FileText className="inline-block w-4 h-4 mr-2" />
              Dari penawaran: {sourceQuotationId}
            </CardDescription>
          )}
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

      {/* Items Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Item ({items.length})</CardTitle>
            <Sheet open={isItemsSheetOpen} onOpenChange={setIsItemsSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" /> Kelola
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[90vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Kelola Item</SheetTitle>
                  <SheetDescription>
                    Tambah, edit, atau hapus item produk
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  <Button onClick={handleAddItem} className="w-full">
                    <PlusCircle className="mr-2 h-4 w-4" /> Tambah Item
                  </Button>
                  
                  {items.map((item, index) => (
                    <Card key={item.id} className="p-4">
                      <div className="space-y-3">
                        {/* Product Selection */}
                        <div>
                          <Label className="text-sm">Produk</Label>
                          <Popover 
                            open={openProductDropdowns[index]} 
                            onOpenChange={(open) => setOpenProductDropdowns({...openProductDropdowns, [index]: open})}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between"
                              >
                                {item.product?.name || "Pilih Produk..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0">
                              <Command>
                                <CommandInput placeholder="Cari produk..." />
                                <CommandList>
                                  <CommandEmpty>Produk tidak ditemukan.</CommandEmpty>
                                  <CommandGroup>
                                    {products?.map((product) => (
                                      <CommandItem
                                        key={product.id}
                                        value={`${product.name} ${product.basePrice}`}
                                        onSelect={() => {
                                          handleItemChange(index, 'product', product);
                                          setOpenProductDropdowns({...openProductDropdowns, [index]: false});
                                        }}
                                      >
                                        <div className="flex flex-col w-full">
                                          <span className="font-medium">{product.name}</span>
                                          <span className="text-sm text-muted-foreground">
                                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(product.basePrice || 0)} / {product.unit}
                                          </span>
                                        </div>
                                        <Check
                                          className={cn(
                                            "ml-auto h-4 w-4",
                                            item.product?.id === product.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        {/* Description */}
                        <div>
                          <Label className="text-sm">Keterangan</Label>
                          <Textarea 
                            value={item.keterangan} 
                            onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)} 
                            placeholder="Detail, ukuran, dll."
                            rows={2}
                          />
                        </div>

                        {/* Quantity and Price */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label className="text-sm">Qty</Label>
                            <Input 
                              type="number" 
                              value={item.qty} 
                              onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))} 
                            />
                          </div>
                          <div>
                            <Label className="text-sm">Satuan</Label>
                            <Input 
                              value={item.unit} 
                              onChange={(e) => handleItemChange(index, 'unit', e.target.value)} 
                              placeholder="pcs, m², dll"
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-sm">Harga Satuan</Label>
                          <Input 
                            type="number" 
                            value={item.harga} 
                            onChange={(e) => handleItemChange(index, 'harga', Number(e.target.value))} 
                          />
                        </div>

                        {/* Total and Remove */}
                        <div className="flex items-center justify-between pt-2 border-t">
                          <div>
                            <span className="text-sm text-muted-foreground">Total: </span>
                            <span className="font-semibold">
                              {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(item.qty * item.harga)}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleRemoveItem(index)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}

                  {items.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <PlusCircle className="mx-auto h-12 w-12 mb-2 opacity-50" />
                      <p>Belum ada item</p>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardHeader>
        <CardContent>
          {items.length > 0 ? (
            <div className="space-y-2">
              {items.slice(0, 3).map((item, index) => (
                <div key={item.id} className="flex justify-between items-start p-2 bg-muted rounded">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.product?.name || 'Produk'}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.qty} {item.unit} × {new Intl.NumberFormat("id-ID").format(item.harga)}
                    </p>
                  </div>
                  <p className="font-semibold ml-2">
                    {new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}
                  </p>
                </div>
              ))}
              {items.length > 3 && (
                <p className="text-center text-sm text-muted-foreground">
                  +{items.length - 3} item lainnya
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <PlusCircle className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Belum ada item</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Pembayaran</CardTitle>
            <Sheet open={isPaymentSheetOpen} onOpenChange={setIsPaymentSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <Calculator className="mr-2 h-4 w-4" /> Detail
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[60vh]">
                <SheetHeader>
                  <SheetTitle>Detail Pembayaran</SheetTitle>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Sub Total:</span>
                      <span className="font-semibold">
                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(subTotal)}
                      </span>
                    </div>
                    
                    <div>
                      <Label htmlFor="diskon" className="text-sm">Diskon</Label>
                      <Input 
                        id="diskon" 
                        type="number" 
                        value={diskon} 
                        onChange={e => setDiskon(Number(e.target.value))} 
                        placeholder="Misal: 50000"
                      />
                    </div>

                    <div className="flex justify-between text-lg font-semibold">
                      <span>Total Tagihan:</span>
                      <span>
                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalTagihan)}
                      </span>
                    </div>

                    <div>
                      <Label className="text-sm">Metode Pembayaran</Label>
                      <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih Pembayaran..." />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts?.filter(a => a.isPaymentAccount).map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>
                              <div className="flex items-center">
                                <Wallet className="mr-2 h-4 w-4" />
                                {acc.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="paidAmount" className="text-sm">Jumlah Bayar</Label>
                      <Input 
                        id="paidAmount" 
                        type="number" 
                        value={paidAmount} 
                        onChange={e => setPaidAmount(Number(e.target.value))} 
                        className="font-bold"
                      />
                    </div>

                    <div className="flex justify-between text-lg">
                      <span>Sisa:</span>
                      <span className={cn(
                        "font-semibold",
                        sisaTagihan > 0 ? "text-destructive" : "text-green-600"
                      )}>
                        {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(sisaTagihan)}
                      </span>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-semibold">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalTagihan)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bayar:</span>
              <span className="font-semibold">
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(paidAmount)}
              </span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="text-muted-foreground">Sisa:</span>
              <span className={cn(
                "font-bold",
                sisaTagihan > 0 ? "text-destructive" : "text-green-600"
              )}>
                {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(sisaTagihan)}
              </span>
            </div>
          </div>
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