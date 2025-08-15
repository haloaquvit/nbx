"use client"
import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PlusCircle, Trash2, Search, UserPlus, Wallet, FileText, Check, ChevronsUpDown, Percent } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/use-toast'
import { Switch } from '@/components/ui/switch'
import { calculatePPN, getDefaultPPNPercentage } from '@/utils/ppnCalculations'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
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

export const PosForm = () => {
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
  const [ppnEnabled, setPpnEnabled] = useState(false)
  const [ppnPercentage, setPpnPercentage] = useState(getDefaultPPNPercentage())
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false)
  const [isCustomerAddOpen, setIsCustomerAddOpen] = useState(false)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null)
  const [sourceQuotationId, setSourceQuotationId] = useState<string | null>(null)
  const [isQuotationProcessed, setIsQuotationProcessed] = useState(false);
  const [openProductDropdowns, setOpenProductDropdowns] = useState<{[key: number]: boolean}>({});

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
  const subtotalAfterDiskon = useMemo(() => subTotal - diskon, [subTotal, diskon]);
  const ppnCalculation = useMemo(() => {
    if (ppnEnabled) {
      return calculatePPN(subtotalAfterDiskon, ppnPercentage);
    }
    return { subtotal: subtotalAfterDiskon, ppnAmount: 0, total: subtotalAfterDiskon };
  }, [subtotalAfterDiskon, ppnEnabled, ppnPercentage]);
  const totalTagihan = useMemo(() => ppnCalculation.total, [ppnCalculation]);
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

  const handlePrintDialogClose = (shouldNavigate: boolean = true) => {
    setIsPrintDialogOpen(false);
    
    if (shouldNavigate) {
      // Reset form
      setSelectedCustomer(null);
      setItems([]);
      setDiskon(0);
      setPaidAmount(0);
      setPaymentAccountId('');
      setSourceQuotationId(null);
      setPpnEnabled(false);
      setPpnPercentage(getDefaultPPNPercentage());
      
      // Navigate to transactions page
      navigate('/transactions');
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
      subtotal: ppnCalculation.subtotal,
      ppnEnabled: ppnEnabled,
      ppnPercentage: ppnPercentage,
      ppnAmount: ppnCalculation.ppnAmount,
      total: totalTagihan,
      paidAmount: paidAmount,
      paymentStatus: paymentStatus,
      status: 'Pesanan Masuk',
    };

    addTransaction.mutate({ newTransaction, quotationId: sourceQuotationId }, {
      onSuccess: async (savedData) => {
        // Record payment to comprehensive payments table if there's a payment
        if (paidAmount > 0 && paymentAccountId) {
          try {
            const selectedAccount = accounts?.find(acc => acc.id === paymentAccountId);
            const paymentMethod = selectedAccount?.name?.toLowerCase().includes('bank') ? 'bank_transfer' : 'cash';
            
            // Payment tracking removed
            
            // Update account balance
            await updateAccountBalance.mutateAsync({ accountId: paymentAccountId, amount: paidAmount });
          } catch (paymentError) {
            console.error('Error creating payment record:', paymentError);
            toast({ 
              variant: "destructive", 
              title: "Warning", 
              description: "Transaksi berhasil disimpan tetapi ada masalah dalam pencatatan pembayaran." 
            });
          }
        }
        
        setSavedTransaction(savedData);
        toast({ title: "Sukses", description: "Transaksi dan pembayaran berhasil disimpan." });
        
        // Show print dialog instead of immediately redirecting
        setIsPrintDialogOpen(true);
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.message });
      }
    });
  };

  return (
    <>
      <CustomerSearchDialog open={isCustomerSearchOpen} onOpenChange={setIsCustomerSearchOpen} onCustomerSelect={setSelectedCustomer} />
      <AddCustomerDialog open={isCustomerAddOpen} onOpenChange={setIsCustomerAddOpen} onCustomerAdded={setSelectedCustomer} />
      {savedTransaction && <PrintReceiptDialog open={isPrintDialogOpen} onOpenChange={handlePrintDialogClose} transaction={savedTransaction} template="receipt" />}
      
      <form onSubmit={handleSubmit} className="bg-card text-card-foreground p-6 rounded-b-lg shadow-sm space-y-6">
        {sourceQuotationId && (
          <div className="p-3 mb-4 text-sm text-blue-800 rounded-lg bg-blue-50 dark:bg-gray-800 dark:text-blue-400" role="alert">
            <FileText className="inline-block w-4 h-4 mr-2" />
            <span className="font-medium">Membuat transaksi dari penawaran nomor:</span> {sourceQuotationId}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 items-start">
          <div className="space-y-3">
            <h3 className="font-semibold">Nama Pemesan</h3>
            <div className="flex items-start gap-4">
              <div className="flex-grow space-y-2">
                <p className="font-semibold text-lg h-10 flex items-center">{selectedCustomer?.name || 'Pelanggan Belum Dipilih'}</p>
                <div className="flex items-center">
                  <Label htmlFor="customerAlamat" className="w-16 text-right pr-4 shrink-0">Alamat :</Label>
                  <Textarea id="customerAlamat" value={selectedCustomer?.address || ''} readOnly rows={1} className="h-8 bg-muted"/>
                </div>
                <div className="flex items-center">
                  <Label htmlFor="customerTelp" className="w-16 text-right pr-4 shrink-0">Telp :</Label>
                  <Input id="customerTelp" value={selectedCustomer?.phone || ''} readOnly className="h-8 bg-muted"/>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" onClick={() => setIsCustomerSearchOpen(true)} className="bg-yellow-400 hover:bg-yellow-500 text-black h-8"><Search className="mr-2 h-4 w-4" /> Cari</Button>
                <Button type="button" onClick={() => setIsCustomerAddOpen(true)} className="bg-primary hover:bg-primary/90 h-8"><UserPlus className="mr-2 h-4 w-4" /> Baru</Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center"><div className="w-2/5 text-sm font-semibold p-2 flex items-center justify-center shrink-0">Tgl Order</div><DateTimePicker date={orderDate} setDate={setOrderDate} /></div>
              <div className="flex items-center"><div className="w-2/5 text-sm font-semibold p-2 flex items-center justify-center shrink-0">Tgl Selesai</div><DateTimePicker date={finishDate} setDate={setFinishDate} /></div>
              <div className="flex items-center"><div className="w-2/5 text-sm font-semibold p-2 flex items-center justify-center shrink-0">Desainer</div><Select value={designerId} onValueChange={setDesignerId}><SelectTrigger className="w-3/5 h-9"><SelectValue placeholder="Pilih Desainer" /></SelectTrigger><SelectContent>{designers?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="flex items-center"><div className="w-2/5 text-sm font-semibold p-2 flex items-center justify-center shrink-0">Operator</div><Select value={operatorId} onValueChange={setOperatorId}><SelectTrigger className="w-3/5 h-9"><SelectValue placeholder="Pilih Operator" /></SelectTrigger><SelectContent>{operators?.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Daftar Item</h3>
            <Button type="button" onClick={handleAddItem} variant="outline" className=""><PlusCircle className="mr-2 h-4 w-4" /> Tambah Item</Button>
          </div>
          
          <div className="overflow-x-auto border rounded-lg">
            <Table>
              <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Keterangan</TableHead><TableHead>Qty</TableHead><TableHead>Satuan</TableHead><TableHead>Harga Satuan</TableHead><TableHead>Total</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="min-w-[200px]">
                      <Popover open={openProductDropdowns[index]} onOpenChange={(open) => setOpenProductDropdowns({...openProductDropdowns, [index]: open})}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openProductDropdowns[index]}
                            className="w-full justify-between"
                          >
                            {item.product?.name || "Pilih Produk..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0">
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
                    </TableCell>
                    <TableCell className="min-w-[200px]"><Input value={item.keterangan} onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)} placeholder="Detail, ukuran, dll." /></TableCell>
                    <TableCell className="min-w-[80px]"><Input type="number" value={item.qty} onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))} /></TableCell>
                    <TableCell className="min-w-[120px]"><Input value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)} placeholder="pcs, m², etc" /></TableCell>
                    <TableCell className="min-w-[150px]"><Input type="number" value={item.harga} onChange={(e) => handleItemChange(index, 'harga', Number(e.target.value))} /></TableCell>
                    <TableCell className="font-medium text-right">{new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}</TableCell>
                    <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {items.length === 0 && (
            <div className="text-center py-8 text-muted-foreground border rounded-lg border-dashed">
              <PlusCircle className="mx-auto h-12 w-12 mb-2 opacity-50" />
              <p>Belum ada item. Klik "Tambah Item" untuk menambahkan produk.</p>
            </div>
          )}
        </div>

        {/* PPN Configuration */}
        <div className="border rounded-lg p-4 bg-muted/20">
          <h4 className="font-medium mb-3">Pengaturan Pajak</h4>
          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="ppn-toggle"
                checked={ppnEnabled}
                onCheckedChange={setPpnEnabled}
              />
              <Label htmlFor="ppn-toggle" className="text-sm font-medium">
                Kena PPN
              </Label>
            </div>
            {ppnEnabled && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="ppn-percentage" className="text-sm text-muted-foreground">
                  Persentase PPN:
                </Label>
                <div className="relative">
                  <Input
                    id="ppn-percentage"
                    type="number"
                    value={ppnPercentage}
                    onChange={(e) => setPpnPercentage(Number(e.target.value))}
                    className="w-20 text-right pr-8"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                  <Percent className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
          {ppnEnabled && (
            <div className="mt-2 text-sm text-muted-foreground">
              PPN {ppnPercentage}%: {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(ppnCalculation.ppnAmount)}
            </div>
          )}
        </div>

        <div className="flex justify-between items-end gap-4 pt-6 border-t">
          <div className="flex gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Metode Pembayaran</Label>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Pilih Pembayaran..." /></SelectTrigger>
                <SelectContent>{accounts?.filter(a => a.isPaymentAccount).map(acc => (<SelectItem key={acc.id} value={acc.id}><Wallet className="inline-block mr-2 h-4 w-4" />{acc.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sub Total</Label><Input value={new Intl.NumberFormat("id-ID").format(subTotal)} readOnly className="w-32 font-semibold text-right bg-muted" /></div>
            <div className="space-y-1"><Label htmlFor="diskon" className="text-xs text-muted-foreground">Diskon</Label><Input id="diskon" type="number" value={diskon} onChange={e => setDiskon(Number(e.target.value))} className="w-32 text-right" placeholder="Misal: 50000"/></div>
            {ppnEnabled && (
              <div className="space-y-1"><Label className="text-xs text-muted-foreground">PPN ({ppnPercentage}%)</Label><Input value={new Intl.NumberFormat("id-ID").format(ppnCalculation.ppnAmount)} readOnly className="w-32 font-semibold text-right bg-blue-50 text-blue-700" /></div>
            )}
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Total Tagihan</Label><Input value={new Intl.NumberFormat("id-ID").format(totalTagihan)} readOnly className="w-32 font-semibold text-right bg-muted" /></div>
            <div className="space-y-1"><Label htmlFor="paidAmount" className="text-xs text-muted-foreground">Jumlah Bayar</Label><Input id="paidAmount" type="number" value={paidAmount} onChange={e => setPaidAmount(Number(e.target.value))} className="w-32 text-right font-bold" /></div>
            <div className="space-y-1"><Label className="text-xs text-muted-foreground">Sisa</Label><Input value={new Intl.NumberFormat("id-ID").format(sisaTagihan)} readOnly className="w-32 font-semibold text-right bg-destructive/20 text-destructive" /></div>
            <Button type="submit" size="lg" disabled={addTransaction.isPending}>
              {addTransaction.isPending ? "Menyimpan..." : "Simpan Transaksi"}
            </Button>
          </div>
        </div>
      </form>
    </>
  )
}