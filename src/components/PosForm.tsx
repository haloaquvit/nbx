"use client"
import { useState, useMemo, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PlusCircle, Trash2, Search, UserPlus, Wallet, FileText, Check, ChevronsUpDown, Percent, AlertTriangle, Plus, ChevronDown, User as UserIcon, Phone, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useToast } from '@/components/ui/use-toast'
import { Switch } from '@/components/ui/switch'
import { calculatePPN, calculatePPNWithMode, getDefaultPPNPercentage } from '@/utils/ppnCalculations'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { Textarea } from './ui/textarea'
import { useProducts } from '@/hooks/useProducts'
import { useUsers } from '@/hooks/useUsers'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactions } from '@/hooks/useTransactions'
import { useQueryClient } from '@tanstack/react-query'
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
import { useRetasi } from '@/hooks/useRetasi'
import { supabase } from '@/integrations/supabase/client'
import { useSalesEmployees } from '@/hooks/useSalesCommission'
import { useProductPricing, usePriceCalculation } from '@/hooks/usePricing'
import { PricingService } from '@/services/pricingService'
import { Link } from 'react-router-dom'

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
  parentItemId?: number;
}

export const PosForm = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const { products, isLoading: isLoadingProducts } = useProducts()
  const { users } = useUsers();
  const { accounts, updateAccountBalance } = useAccounts();
  const { addTransaction } = useTransactions();
  const { data: salesEmployees } = useSalesEmployees();
  const { customers } = useCustomers();
  const { checkDriverAvailability } = useRetasi();
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [selectedSales, setSelectedSales] = useState<string>('none')
  const [orderDate, setOrderDate] = useState<Date | undefined>(new Date())
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().split('T')[0];
  });
  const [paymentAccountId, setPaymentAccountId] = useState<string>('')
  const [items, setItems] = useState<FormTransactionItem[]>([])
  const [diskon, setDiskon] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
  const [ppnEnabled, setPpnEnabled] = useState(false)
  const [ppnMode, setPpnMode] = useState<'include' | 'exclude'>('include') // PPN include or exclude
  const [ppnPercentage, setPpnPercentage] = useState(getDefaultPPNPercentage())
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false)
  const [isCustomerAddOpen, setIsCustomerAddOpen] = useState(false)
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false)
  const [savedTransaction, setSavedTransaction] = useState<Transaction | null>(null)
  const [openProductDropdowns, setOpenProductDropdowns] = useState<{[key: number]: boolean}>({});
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [showTaxSettings, setShowTaxSettings] = useState(false);
  const [retasiBlocked, setRetasiBlocked] = useState(false);
  const [retasiMessage, setRetasiMessage] = useState('');
  const [isOfficeSale, setIsOfficeSale] = useState(false);
  const [transactionNotes, setTransactionNotes] = useState('');
  const [loadingPrices, setLoadingPrices] = useState<{[key: number]: boolean}>({});


  const subTotal = useMemo(() => items.reduce((total, item) => total + (item.qty * item.harga), 0), [items]);
  const subtotalAfterDiskon = useMemo(() => subTotal - diskon, [subTotal, diskon]);
  const ppnCalculation = useMemo(() => {
    if (ppnEnabled) {
      return calculatePPNWithMode(subtotalAfterDiskon, ppnPercentage, ppnMode);
    }
    return { subtotal: subtotalAfterDiskon, ppnAmount: 0, total: subtotalAfterDiskon };
  }, [subtotalAfterDiskon, ppnEnabled, ppnPercentage, ppnMode]);
  const totalTagihan = useMemo(() => ppnCalculation.total, [ppnCalculation]);
  const sisaTagihan = useMemo(() => totalTagihan - paidAmount, [totalTagihan, paidAmount]);

  // Helper function to create sample pricing rules for testing (tiered system)
  const createSamplePricingRules = async (productId: string, basePrice: number) => {
    try {
      // Create bonus rules
      const bonusRules = [
        {
          minQuantity: 100,
          bonusValue: 1,
          description: 'Beli 100+ gratis 1'
        },
        {
          minQuantity: 500,
          bonusValue: 25,
          description: 'Beli 500+ gratis 25'
        },
        {
          minQuantity: 1000,
          bonusValue: 75,
          description: 'Beli 1000+ gratis 75'
        }
      ];

      for (const rule of bonusRules) {
        await PricingService.createBonusPricing({
          productId: productId,
          minQuantity: rule.minQuantity,
          maxQuantity: null, // No upper limit
          bonusQuantity: rule.bonusValue,
          bonusType: 'quantity',
          bonusValue: rule.bonusValue,
          description: rule.description
        });
      }

      // Create stock-based pricing rules (different prices based on stock levels)
      const stockPricingRules = [
        {
          minStock: 0,
          maxStock: 50,
          price: basePrice * 1.2, // Higher price when stock is low
          description: 'Harga tinggi (stok rendah)'
        },
        {
          minStock: 51,
          maxStock: 200,
          price: basePrice, // Normal price
          description: 'Harga normal'
        },
        {
          minStock: 201,
          maxStock: null, // No upper limit
          price: basePrice * 0.9, // Lower price when stock is high
          description: 'Harga diskon (stok tinggi)'
        }
      ];

      for (const rule of stockPricingRules) {
        await PricingService.createStockPricing({
          productId: productId,
          minStock: rule.minStock,
          maxStock: rule.maxStock,
          price: rule.price
        });
      }

      console.log('✅ Created tiered pricing rules (bonus + stock) for product:', productId);
    } catch (error) {
      console.error('❌ Failed to create sample pricing rules:', error);
    }
  };

  // Function to calculate dynamic pricing for a product
  const calculateDynamicPrice = async (product: Product, quantity: number) => {
    try {
      console.log('🔄 Calculating price for product:', product.name, 'quantity:', quantity);
      let productPricing = await PricingService.getProductPricing(product.id)
      
      // If no pricing data exists, create sample pricing rules (for testing)
      if (!productPricing || (productPricing.bonusPricings.length === 0 && productPricing.stockPricings.length === 0)) {
        console.log('🎯 No pricing rules found, creating sample rules...');
        await createSamplePricingRules(product.id, product.basePrice);
        productPricing = await PricingService.getProductPricing(product.id);
      }
      
      if (productPricing) {
        const priceCalculation = PricingService.calculatePrice(
          product.basePrice,
          product.currentStock,
          quantity,
          productPricing.stockPricings,
          productPricing.bonusPricings
        )
        console.log('💰 Price calculation:', priceCalculation);
        return {
          price: priceCalculation.stockAdjustedPrice,
          calculation: priceCalculation
        }
      }
    } catch (error) {
      console.error('❌ Error calculating dynamic price:', error)
    }
    return { price: product.basePrice, calculation: null }
  }


  useEffect(() => {
    setPaidAmount(totalTagihan);
  }, [totalTagihan]);

  // Check retasi validation for drivers
  useEffect(() => {
    const checkRetasiValidation = async () => {
      if (currentUser?.role?.toLowerCase() === 'supir' && currentUser?.name) {
        try {
          // Check if driver has active retasi (Armada Berangkat) today
          const hasActiveRetasi = await checkDriverAvailability(currentUser.name);
          if (hasActiveRetasi) {
            // Driver has unreturned retasi, can access POS
            setRetasiBlocked(false);
            setRetasiMessage('');
          } else {
            // Driver has no active retasi, blocked from POS
            setRetasiBlocked(true);
            setRetasiMessage('Anda tidak dapat mengakses POS. Silakan buat retasi "Armada Berangkat" terlebih dahulu.');
          }
        } catch (error) {
          console.error('Error checking retasi validation:', error);
          // Block access if check fails for drivers
          setRetasiBlocked(true);
          setRetasiMessage('Gagal memvalidasi retasi. Silakan buat retasi terlebih dahulu.');
        }
      } else {
        setRetasiBlocked(false);
        setRetasiMessage('');
      }
    };

    if (currentUser) {
      checkRetasiValidation();
    }
  }, [currentUser, checkDriverAvailability]);

  const handleAddItem = () => {
    const newItem: FormTransactionItem = {
      id: Date.now(), product: null, keterangan: '', qty: 1, harga: 0, unit: 'pcs'
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = async (index: number, field: keyof FormTransactionItem, value: any) => {
    const targetItem = items[index];
    const newItems = [...items];
    (newItems[index] as any)[field] = value;

    if (field === 'product' && value) {
      const selectedProduct = value as Product;
      setLoadingPrices(prev => ({ ...prev, [newItems[index].id]: true }));
      const { price } = await calculateDynamicPrice(selectedProduct, newItems[index].qty);
      newItems[index].harga = price;
      newItems[index].unit = selectedProduct.unit || 'pcs';
      setLoadingPrices(prev => ({ ...prev, [newItems[index].id]: false }));
    }
    
    if (field === 'qty' && newItems[index].product && !newItems[index].isBonus) {
      // Handle main item quantity change with bonus updates
      setLoadingPrices(prev => ({ ...prev, [newItems[index].id]: true }));
      await updateItemWithBonuses(newItems[index], value);
      setLoadingPrices(prev => ({ ...prev, [newItems[index].id]: false }));
      return;
    }

    if (field === 'qty' && newItems[index].isBonus) {
      // Allow manual bonus quantity adjustment
      newItems[index].qty = value;
    }
    
    setItems(newItems);
  };

  const handleRemoveItem = (index: number) => {
    const itemToRemove = items[index];
    if (itemToRemove.isBonus) {
      // Remove only the bonus item
      setItems(items.filter((_, i) => i !== index));
    } else {
      // Remove main item and all its bonus items
      setItems(items.filter((item, i) => i !== index && item.parentItemId !== itemToRemove.id));
    }
  };

  const handlePrintDialogClose = (shouldNavigate: boolean = true) => {
    setIsPrintDialogOpen(false);
    
    if (shouldNavigate) {
      // Reset form
      setSelectedCustomer(null);
      setCustomerSearch('');
      setItems([]);
      setDiskon(0);
      setPaidAmount(0);
      setPaymentAccountId('');
      setPpnEnabled(false);
      setPpnMode('include');
      setPpnPercentage(getDefaultPPNPercentage());
      setIsOfficeSale(false);
      
      // Reset due date
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + 14);
      setDueDate(newDueDate.toISOString().split('T')[0]);
      
      // Navigate to transactions page
      navigate('/transactions');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const validItems = items.filter(item => item.product && item.qty > 0);

    // Check if we have either selected customer or typed customer name
    const customerName = selectedCustomer?.name || customerSearch.trim();
    
    if (!customerName || validItems.length === 0 || !currentUser) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap isi Nama Pelanggan dan tambahkan minimal satu item produk yang valid." });
      return;
    }

    if (paidAmount > 0 && !paymentAccountId) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap pilih Metode Pembayaran jika ada jumlah yang dibayar." });
      return;
    }

    const transactionItems: TransactionItem[] = validItems.map(item => ({
      product: {
        ...item.product!,
        // Ensure bonus items have distinct names for delivery differentiation
        name: item.isBonus ? `${item.product!.name} (Bonus)` : item.product!.name
      },
      quantity: item.qty,
      price: item.harga,
      unit: item.unit,
      width: 0, height: 0, 
      notes: item.isBonus 
        ? `${item.keterangan}${item.keterangan ? ' - ' : ''}BONUS: ${item.bonusDescription || 'Bonus Item'}`
        : item.keterangan,
      designFileName: item.designFileName,
      isBonus: item.isBonus || false,
    }));

    const paymentStatus: PaymentStatus = sisaTagihan <= 0 ? 'Lunas' : 'Belum Lunas';

    const newTransaction: Omit<Transaction, 'createdAt'> = {
      id: `KRP-${format(new Date(), 'yyMMdd')}-${Math.floor(Math.random() * 1000)}`,
      customerId: selectedCustomer?.id || 'manual-customer',
      customerName: customerName,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      salesId: selectedSales && selectedSales !== 'none' ? selectedSales : null,
      salesName: selectedSales && selectedSales !== 'none' ? salesEmployees?.find(s => s.id === selectedSales)?.name || null : null,
      designerId: null,
      operatorId: null,
      paymentAccountId: paymentAccountId || null,
      orderDate: orderDate || new Date(),
      finishDate: null,
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
      status: 'Pesanan Masuk',
      notes: transactionNotes.trim() || undefined,
      isOfficeSale: isOfficeSale,
    };

    addTransaction.mutate({ newTransaction }, {
      onSuccess: async (savedData) => {
        // Update account balance if there's a payment (cash flow is already handled in useTransactions.ts)
        if (paidAmount > 0 && paymentAccountId) {
          try {
            await updateAccountBalance.mutateAsync({ accountId: paymentAccountId, amount: paidAmount });
          } catch (paymentError) {
            console.error('Error updating account balance:', paymentError);
            toast({ 
              variant: "destructive", 
              title: "Warning", 
              description: "Transaksi berhasil disimpan tetapi ada masalah dalam update saldo akun." 
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

  const filteredProducts = useMemo(() => {
    return products?.filter(product => 
      product.name?.toLowerCase().includes(productSearch.toLowerCase())
    ) || [];
  }, [products, productSearch]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    return customers.filter(customer => 
      customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      customer.phone.includes(customerSearch)
    ).slice(0, 10); // Limit to 10 results
  }, [customers, customerSearch]);

  const addToCart = async (product: Product) => {
    const existing = items.find(item => item.product?.id === product.id && !item.isBonus);
    if (existing) {
      const newQty = existing.qty + 1;
      await updateItemWithBonuses(existing, newQty);
    } else {
      await addNewItemWithBonuses(product, 1);
    }
    setShowProductDropdown(false);
    setProductSearch('');
  };

  const updateItemWithBonuses = async (existingItem: FormTransactionItem, newQty: number) => {
    const { price, calculation } = await calculateDynamicPrice(existingItem.product!, newQty);
    
    console.log('🎯 Price calculation result:', calculation);
    console.log('🎯 Product:', existingItem.product?.name, 'Qty:', newQty, 'Price:', price);
    
    // Remove existing bonus items for this product
    let newItems = items.filter(item => item.parentItemId !== existingItem.id);
    
    // Update main item
    newItems = newItems.map(item => 
      item.id === existingItem.id
        ? { ...item, qty: newQty, harga: price }
        : item
    );
    
    // Add bonus items if any
    if (calculation?.bonuses && calculation.bonuses.length > 0) {
      console.log('🎁 Processing bonuses:', calculation.bonuses);
      for (const bonus of calculation.bonuses) {
        // Only add quantity-based bonuses as separate items
        if (bonus.type === 'quantity' && bonus.bonusQuantity > 0) {
          console.log('🎁 Adding bonus item:', bonus);
          const bonusItem: FormTransactionItem = {
            id: Date.now() + Math.random(),
            product: existingItem.product,
            keterangan: bonus.description || `Bonus - ${bonus.type}`,
            qty: bonus.bonusQuantity,
            harga: 0,
            unit: existingItem.product!.unit || 'pcs',
            isBonus: true,
            bonusDescription: bonus.description,
            parentItemId: existingItem.id
          };
          newItems.push(bonusItem);
        }
        // For discount bonuses, we don't add separate items as the price is already adjusted
      }
    } else {
      console.log('❌ No bonuses found in calculation:', calculation);
    }
    
    setItems(newItems);
  };

  const addNewItemWithBonuses = async (product: Product, quantity: number) => {
    const { price, calculation } = await calculateDynamicPrice(product, quantity);
    const newItemId = Date.now();
    
    const newItem: FormTransactionItem = {
      id: newItemId,
      product: product,
      keterangan: '',
      qty: quantity,
      harga: price,
      unit: product.unit || 'pcs'
    };
    
    let newItems = [...items, newItem];
    
    // Add bonus items if any
    if (calculation?.bonuses && calculation.bonuses.length > 0) {
      for (const bonus of calculation.bonuses) {
        // Only add quantity-based bonuses as separate items
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
            parentItemId: newItemId
          };
          newItems.push(bonusItem);
        }
        // For discount bonuses, we don't add separate items as the price is already adjusted
      }
    }
    
    setItems(newItems);
  };

  return (
    <>
      <CustomerSearchDialog 
        open={isCustomerSearchOpen} 
        onOpenChange={setIsCustomerSearchOpen} 
        onCustomerSelect={(customer) => {
          setSelectedCustomer(customer)
          setCustomerSearch(customer?.name || '')
        }} 
      />
      <AddCustomerDialog 
        open={isCustomerAddOpen} 
        onOpenChange={setIsCustomerAddOpen} 
        onCustomerAdded={(customer) => {
          setSelectedCustomer(customer)
          setCustomerSearch(customer?.name || '')
        }} 
      />
      {savedTransaction && <PrintReceiptDialog open={isPrintDialogOpen} onOpenChange={handlePrintDialogClose} transaction={savedTransaction} template="receipt" />}
      
      <div className="min-h-screen bg-white">
        <div className="bg-white border-b p-3 md:p-4">
          <h1 className="text-lg md:text-xl font-bold text-gray-900">Buat Transaksi Baru</h1>
          <p className="text-xs md:text-sm text-gray-600">Isi detail pesanan pelanggan pada form di bawah ini.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-3 md:p-6 space-y-4 md:space-y-6">
        {retasiBlocked && (
          <div className="p-4 mb-4 text-sm text-red-800 rounded-lg bg-red-50 border border-red-200" role="alert">
            <div className="flex items-center">
              <AlertTriangle className="inline-block w-5 h-5 mr-2" />
              <span className="font-medium">Akses POS Diblokir</span>
            </div>
            <p className="mt-2">{retasiMessage}</p>
            <div className="mt-3">
              <Button 
                type="button" 
                onClick={() => navigate('/retasi')} 
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Buka Halaman Retasi
              </Button>
            </div>
          </div>
        )}
          <div className="space-y-4 md:space-y-0 md:grid md:grid-cols-1 lg:grid-cols-2 md:gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Nama Pemesan</h3>
              <div className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Ketik nama pelanggan atau pilih dari dropdown..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value)
                      setShowCustomerDropdown(true)
                      if (!e.target.value) {
                        setSelectedCustomer(null)
                      }
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    onBlur={() => {
                      // Delay to allow click on dropdown items
                      setTimeout(() => setShowCustomerDropdown(false), 150)
                    }}
                    disabled={retasiBlocked}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  
                  {showCustomerDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                          onClick={() => {
                            setSelectedCustomer(customer)
                            setCustomerSearch(customer.name)
                            setShowCustomerDropdown(false)
                          }}
                        >
                          <div className="font-medium">{customer.name}</div>
                          <div className="text-xs text-gray-500">{customer.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setIsCustomerSearchOpen(true)}
                    disabled={retasiBlocked}
                    variant="outline"
                    size="sm"
                    className="bg-yellow-400 hover:bg-yellow-500 text-black border-yellow-400 text-xs md:text-sm"
                  >
                    <Search className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                    Cari Lanjutan
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsCustomerAddOpen(true)}
                    disabled={retasiBlocked}
                    variant="outline"
                    size="sm"
                    className="bg-gray-500 hover:bg-gray-600 text-white border-gray-500 text-xs md:text-sm"
                  >
                    <UserIcon className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
                    Baru
                  </Button>
                </div>
                
                {selectedCustomer && (
                  <div className="text-xs md:text-sm text-gray-600 space-y-2 bg-gray-50 p-3 rounded">
                    <div>
                      <strong>Alamat:</strong> <span className="break-words">{selectedCustomer.address}</span>
                    </div>
                    <div>
                      <strong>Telp:</strong> {selectedCustomer.phone}
                    </div>
                    {selectedCustomer.jumlah_galon_titip !== undefined && selectedCustomer.jumlah_galon_titip > 0 && (
                      <div className="text-green-600 font-medium">
                        <strong>🥤 Galon Titip:</strong> {selectedCustomer.jumlah_galon_titip} galon
                      </div>
                    )}
                    <div className="flex gap-2 mt-2">
                      {selectedCustomer.phone && (
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          onClick={() => window.location.href = `tel:${selectedCustomer.phone}`}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Phone className="h-3 w-3" />
                          <span>Telepon</span>
                        </Button>
                      )}
                      {selectedCustomer.latitude && selectedCustomer.longitude && (
                        <Button 
                          type="button"
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            window.open(`https://www.google.com/maps/dir//${selectedCustomer.latitude},${selectedCustomer.longitude}`, '_blank');
                          }}
                          className="flex items-center gap-1 text-xs"
                        >
                          <MapPin className="h-3 w-3" />
                          <span>Lokasi GPS</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sales Selection */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Sales</h3>
              <Select value={selectedSales} onValueChange={setSelectedSales} disabled={retasiBlocked}>
                <SelectTrigger>
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
                <div className="mt-2 text-xs text-green-700">
                  <strong>Sales:</strong> {salesEmployees?.find(s => s.id === selectedSales)?.name}
                </div>
              )}
              {selectedSales === 'none' && (
                <div className="mt-2 text-xs text-gray-500">
                  <strong>Sales:</strong> Tanpa Sales
                </div>
              )}
            </div>

            {/* Office Sale Checkbox */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isOfficeSale}
                  onChange={(e) => setIsOfficeSale(e.target.checked)}
                  className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  disabled={retasiBlocked}
                />
                <div>
                  <span className="text-lg font-medium text-blue-900">Laku Kantor</span>
                  <p className="text-sm text-blue-700">Centang jika produk laku kantor (tidak perlu update ke pengantaran)</p>
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Tgl Order</label>
                <DateTimePicker date={orderDate} setDate={setOrderDate} disabled={retasiBlocked} />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base md:text-lg font-medium text-gray-900">Daftar Item</h3>
              <div className="relative flex-1 max-w-md ml-4">
                <Button
                  type="button"
                  size="lg"
                  className="w-full bg-gray-800 hover:bg-gray-900 text-sm md:text-base py-3 md:py-4"
                  onClick={() => setShowProductDropdown(!showProductDropdown)}
                  disabled={retasiBlocked}
                >
                  <Plus className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                  Tambah Item
                </Button>

                {showProductDropdown && (
                  <div className="absolute right-0 top-full mt-2 w-full min-w-[400px] md:min-w-[500px] bg-white border rounded-lg shadow-xl z-50 max-h-96 md:max-h-[500px] overflow-y-auto">
                    <div className="p-4 border-b bg-gray-50">
                      <Input
                        placeholder="Cari produk..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="w-full text-base"
                      />
                    </div>
                    <div className="max-h-80 md:max-h-96 overflow-y-auto">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="p-4 hover:bg-gray-50 border-b last:border-b-0 transition-colors cursor-pointer"
                          onClick={() => addToCart(product)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-base text-gray-900">
                                  {product.name}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 text-green-600 font-medium">
                              <Plus className="h-5 w-5" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs ${
                              product.type === 'Produksi' 
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {product.type}
                            </span>
                            {product.type === 'Jual Langsung' && (
                              <span className="text-xs text-gray-500">(Tidak mengurangi stok)</span>
                            )}
                          </div>
                          <div className="text-base font-bold text-green-600 mb-1">
                            {new Intl.NumberFormat("id-ID", {
                              style: "currency",
                              currency: "IDR",
                              maximumFractionDigits: 0,
                            }).format(product.basePrice || 0)}
                          </div>
                          {product.type === 'Produksi' && (
                            <div className="text-sm text-gray-600">Stok: {product.currentStock || 0}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-medium text-gray-700">Produk</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm font-medium text-gray-700">Qty</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-medium text-gray-700">Satuan</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-right text-xs md:text-sm font-medium text-gray-700">Harga Satuan</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-left text-xs md:text-sm font-medium text-gray-700">Catatan</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-right text-xs md:text-sm font-medium text-gray-700">Total</th>
                    <th className="px-2 md:px-4 py-2 md:py-3 text-center text-xs md:text-sm font-medium text-gray-700">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 md:py-12 text-center text-gray-500">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 md:w-16 md:h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
                            <Plus className="w-6 h-6 md:w-8 md:h-8 text-gray-400" />
                          </div>
                          <p className="text-xs md:text-sm">
                            Belum ada item. Klik "Tambah Item" untuk menambahkan produk.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={item.id} className={`border-t ${item.isBonus ? 'bg-green-50' : ''}`}>
                        <td className="px-2 md:px-4 py-2 md:py-3">
                          {item.isBonus ? (
                            <div className="text-xs text-green-700 font-medium">
                              🎁 {item.product?.name} (Bonus)
                              {item.bonusDescription && (
                                <div className="text-xs text-gray-600 mt-1">{item.bonusDescription}</div>
                              )}
                            </div>
                          ) : (
                            <Popover open={openProductDropdowns[index]} onOpenChange={(open) => {
                              setOpenProductDropdowns(prev => ({ ...prev, [index]: open }));
                            }}>
                              <PopoverTrigger asChild disabled={retasiBlocked}>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className={cn(
                                    "w-full justify-between text-xs h-8",
                                    !item.product && "text-muted-foreground"
                                  )}
                                >
                                  {item.product ? item.product.name : "Pilih produk..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0">
                                <Command>
                                  <CommandInput placeholder="Cari produk..." />
                                  <CommandEmpty>Produk tidak ditemukan.</CommandEmpty>
                                  <CommandGroup className="max-h-64 overflow-y-auto">
                                    {(products || []).map((product) => (
                                      <CommandItem
                                        key={product.id}
                                        value={product.name}
                                        onSelect={() => {
                                          handleItemChange(index, 'product', product);
                                          setOpenProductDropdowns(prev => ({ ...prev, [index]: false }));
                                        }}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            item.product?.id === product.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div>
                                          <div className="font-medium">{product.name}</div>
                                          <div className="text-xs text-gray-500">
                                            {new Intl.NumberFormat("id-ID", {
                                              style: "currency",
                                              currency: "IDR",
                                              maximumFractionDigits: 0,
                                            }).format(product.basePrice || 0)} | {product.unit}
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          )}
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-center">
                          <Input
                            type="number"
                            min="1"
                            value={item.qty}
                            onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value) || 1)}
                            className="w-16 md:w-20 text-center text-xs"
                            disabled={retasiBlocked}
                          />
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm">{item.unit}</td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-right">
                          {item.isBonus ? (
                            <div className="text-center text-xs text-green-600 font-medium">GRATIS</div>
                          ) : (
                            <div className="relative">
                              <Input
                                type="number"
                                value={item.harga}
                                onChange={(e) => handleItemChange(index, 'harga', Number(e.target.value) || 0)}
                                className="w-20 md:w-32 text-right text-xs"
                                disabled={retasiBlocked || loadingPrices[item.id]}
                              />
                              {loadingPrices[item.id] && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70">
                                  <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-left">
                          <Input
                            type="text"
                            placeholder="Catatan..."
                            value={item.keterangan}
                            onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)}
                            className="w-20 md:w-32 text-xs"
                            disabled={retasiBlocked}
                          />
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-right text-xs md:text-sm font-medium">
                          {new Intl.NumberFormat("id-ID").format(item.qty * item.harga)}
                        </td>
                        <td className="px-2 md:px-4 py-2 md:py-3 text-center">
                          <Button size="sm" variant="outline" onClick={() => handleRemoveItem(index)} disabled={retasiBlocked}>
                            <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Catatan</label>
            <textarea
              className="mt-1 w-full p-2 md:p-3 border rounded-lg resize-none text-sm"
              rows={2}
              placeholder="Tambahkan catatan untuk transaksi ini..."
              value={transactionNotes}
              onChange={(e) => setTransactionNotes(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            {/* Payment Method */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Metode Pembayaran</h3>
              <Select value={paymentAccountId} onValueChange={setPaymentAccountId} disabled={retasiBlocked}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih Pembayaran..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.filter(a => a.isPaymentAccount).map(acc => (
                    <SelectItem key={acc.id} value={acc.id}>
                      <Wallet className="inline-block mr-2 h-4 w-4" />
                      {acc.name}
                    </SelectItem>
                  ))}
                  {(!accounts || accounts.filter(a => a.isPaymentAccount).length === 0) && (
                    <SelectItem value="no-accounts" disabled>
                      Tidak ada akun pembayaran tersedia
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {accounts && (
                <p className="text-xs text-gray-500 mt-1">
                  Total akun: {accounts.length}, Akun pembayaran: {accounts.filter(a => a.isPaymentAccount).length}
                </p>
              )}
            </div>

            {/* Tax Settings - Always Visible */}
            <div className="border border-blue-200 bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Pengaturan Pajak</h3>
              <div className="space-y-3">
                <label className="flex items-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded transition-colors">
                  <input
                    type="radio"
                    name="taxMode"
                    value="include"
                    checked={ppnEnabled && ppnMode === 'include'}
                    onChange={(e) => {
                      setPpnEnabled(true);
                      setPpnMode('include');
                    }}
                    className="mr-3 w-4 h-4 text-blue-600"
                    disabled={retasiBlocked}
                  />
                  <div>
                    <div className="font-medium text-gray-900">PPN Include</div>
                    <div className="text-xs text-gray-600">Harga sudah termasuk pajak {ppnPercentage}%</div>
                  </div>
                </label>
                <label className="flex items-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded transition-colors">
                  <input
                    type="radio"
                    name="taxMode"
                    value="exclude"
                    checked={ppnEnabled && ppnMode === 'exclude'}
                    onChange={(e) => {
                      setPpnEnabled(true);
                      setPpnMode('exclude');
                    }}
                    className="mr-3 w-4 h-4 text-blue-600"
                    disabled={retasiBlocked}
                  />
                  <div>
                    <div className="font-medium text-gray-900">PPN Exclude</div>
                    <div className="text-xs text-gray-600">Pajak {ppnPercentage}% ditambahkan ke total</div>
                  </div>
                </label>
                <label className="flex items-center text-sm cursor-pointer hover:bg-blue-100 p-2 rounded transition-colors">
                  <input
                    type="radio"
                    name="taxMode"
                    value="none"
                    checked={!ppnEnabled}
                    onChange={(e) => setPpnEnabled(false)}
                    className="mr-3 w-4 h-4 text-blue-600"
                    disabled={retasiBlocked}
                  />
                  <div>
                    <div className="font-medium text-gray-900">Non Pajak</div>
                    <div className="text-xs text-gray-600">Tidak menggunakan pajak</div>
                  </div>
                </label>
                {ppnEnabled && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="text-xs text-blue-700">
                      <strong>Mode Aktif:</strong> {ppnMode === 'include' ? 'PPN Include' : 'PPN Exclude'} ({ppnPercentage}%)
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payment Details - Collapsible */}
            <div>
              <button
                type="button"
                className="flex items-center justify-between w-full text-sm font-medium text-gray-700 mb-2 md:mb-3"
                onClick={() => setShowPaymentDetails(!showPaymentDetails)}
              >
                <span>Detail Pembayaran</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform md:hidden ${showPaymentDetails ? "rotate-180" : ""}`}
                />
              </button>
              <div className={`space-y-3 md:space-y-4 ${showPaymentDetails ? "block" : "hidden md:block"}`}>

                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  <div>
                    <label className="text-xs md:text-sm text-gray-600">Sub Total</label>
                    <div className="text-sm md:text-lg font-medium">
                      {new Intl.NumberFormat("id-ID").format(subTotal)}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs md:text-sm text-gray-600">Diskon</label>
                    <Input
                      type="number"
                      value={diskon}
                      onChange={(e) => setDiskon(Number(e.target.value) || 0)}
                      className="text-right text-sm"
                      disabled={retasiBlocked}
                    />
                  </div>
                </div>

                {ppnEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
                    <div>
                      <label className="text-xs md:text-sm text-gray-600">
                        PPN {ppnPercentage}%
                      </label>
                      <div className="text-sm md:text-lg font-medium text-blue-600">
                        {new Intl.NumberFormat("id-ID").format(ppnCalculation.ppnAmount)}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs md:text-sm text-gray-600">
                        Subtotal Setelah Diskon
                      </label>
                      <div className="text-sm md:text-lg font-medium">
                        {new Intl.NumberFormat("id-ID").format(subtotalAfterDiskon)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 md:gap-4">
                  <div>
                    <label className="text-xs md:text-sm text-gray-600">Total Tagihan</label>
                    <div className="text-sm md:text-lg font-bold">{new Intl.NumberFormat("id-ID").format(totalTagihan)}</div>
                  </div>
                  <div>
                    <label className="text-xs md:text-sm text-gray-600">Jumlah Bayar</label>
                    <Input
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                      className="text-right font-medium text-sm w-full"
                      disabled={retasiBlocked}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 md:gap-4 text-xs md:text-sm">
                  <div>
                    <label className="text-gray-600">Sisa</label>
                    <div className="font-medium text-red-600">{new Intl.NumberFormat("id-ID").format(sisaTagihan)}</div>
                  </div>
                  <div>
                    <label className="text-gray-600">Kembali</label>
                    <div className="font-medium text-green-600">{new Intl.NumberFormat("id-ID").format(Math.max(0, paidAmount - totalTagihan))}</div>
                  </div>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={items.length === 0 || addTransaction.isPending || retasiBlocked}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold py-3 md:py-4 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm md:text-base"
            >
              {addTransaction.isPending ? "Menyimpan..." : "Simpan Transaksi"}
            </Button>

            {/* Due Date Section - Only show if payment is not full */}
            {sisaTagihan > 0 && (
              <div className="pt-3 md:pt-4 border-t border-gray-200">
                <label className="text-sm font-medium text-gray-700">Tanggal Jatuh Tempo</label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 text-sm"
                  min={new Date().toISOString().split('T')[0]}
                />
                <p className="text-xs text-gray-500 mt-1">Tenggat waktu pembayaran kredit</p>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() + 3);
                      setDueDate(date.toISOString().split('T')[0]);
                    }}
                  >
                    3 Hari
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() + 7);
                      setDueDate(date.toISOString().split('T')[0]);
                    }}
                  >
                    7 Hari
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() + 14);
                      setDueDate(date.toISOString().split('T')[0]);
                    }}
                  >
                    14 Hari
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
                    onClick={() => {
                      const date = new Date();
                      date.setDate(date.getDate() + 21);
                      setDueDate(date.toISOString().split('T')[0]);
                    }}
                  >
                    21 Hari
                  </Button>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>
    </>
  )
}