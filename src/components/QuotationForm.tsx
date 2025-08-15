"use client"
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PlusCircle, Trash2, Search, UserPlus } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { useProducts } from '@/hooks/useProducts'
import { useAuth } from '@/hooks/useAuth'
import { Product } from '@/types/product'
import { Customer } from '@/types/customer'
import { Quotation } from '@/types/quotation'
import { CustomerSearchDialog } from './CustomerSearchDialog'
import { AddCustomerDialog } from './AddCustomerDialog'
import { DateTimePicker } from './ui/datetime-picker'
import { TransactionItem } from '@/types/transaction'
import { useQuotations } from '@/hooks/useQuotations'

interface FormQuotationItem {
  id: number;
  product: Product | null;
  keterangan: string;
  qty: number;
  harga: number;
  unit: string;
}

export const QuotationForm = () => {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { products, isLoading: isLoadingProducts } = useProducts()
  const { user: currentUser } = useAuth()
  const { addQuotation, isLoading: isSaving } = useQuotations()
  
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [validUntil, setValidUntil] = useState<Date | undefined>()
  const [items, setItems] = useState<FormQuotationItem[]>([])
  const [isCustomerSearchOpen, setIsCustomerSearchOpen] = useState(false)
  const [isCustomerAddOpen, setIsCustomerAddOpen] = useState(false)

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
  };

  const handleAddItem = () => {
    const newItem: FormQuotationItem = {
      id: Date.now(), product: null, keterangan: '', qty: 1, harga: 0, unit: 'pcs'
    };
    setItems([...items, newItem]);
  };

  const handleItemChange = (index: number, field: keyof FormQuotationItem, value: any) => {
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

  const calculateItemTotal = (item: FormQuotationItem) => item.qty * item.harga;

  const totalPenawaran = useMemo(() => items.reduce((total, item) => total + calculateItemTotal(item), 0), [items]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCustomer || items.length === 0 || !currentUser || !validUntil) {
      toast({ variant: "destructive", title: "Validasi Gagal", description: "Harap lengkapi semua data (Pelanggan, Item, dan Tanggal Berlaku)." });
      return;
    }

    const quotationItems: TransactionItem[] = items
      .filter(item => item.product)
      .map(item => ({
        product: item.product!,
        quantity: item.qty,
        price: item.harga,
        unit: item.unit,
        width: 0, height: 0, notes: item.keterangan,
      }));

    const newQuotation: Omit<Quotation, 'id' | 'createdAt'> = {
      customerId: selectedCustomer.id,
      customerName: selectedCustomer.name,
      preparedBy: currentUser.name,
      validUntil: validUntil,
      items: quotationItems,
      total: totalPenawaran,
      status: 'Draft',
    };

    addQuotation.mutate(newQuotation, {
      onSuccess: () => {
        toast({ title: "Sukses", description: "Penawaran berhasil disimpan sebagai draft." });
        navigate('/quotations');
      },
      onError: (error) => {
        toast({ variant: "destructive", title: "Gagal Menyimpan", description: error.message });
      }
    });
  };

  return (
    <>
      <CustomerSearchDialog open={isCustomerSearchOpen} onOpenChange={setIsCustomerSearchOpen} onCustomerSelect={handleCustomerSelect} />
      <AddCustomerDialog open={isCustomerAddOpen} onOpenChange={setIsCustomerAddOpen} onCustomerAdded={handleCustomerSelect} />
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <Label className="font-semibold">Pelanggan</Label>
            <div className="flex items-center gap-2 mt-2">
              <Input value={selectedCustomer?.name || 'Belum ada pelanggan dipilih'} readOnly className="bg-muted" />
              <Button type="button" variant="outline" onClick={() => setIsCustomerSearchOpen(true)}><Search className="mr-2 h-4 w-4" /> Cari</Button>
              <Button type="button" onClick={() => setIsCustomerAddOpen(true)}><UserPlus className="mr-2 h-4 w-4" /> Baru</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="preparedBy" className="font-semibold">Disiapkan Oleh</Label>
              <Input id="preparedBy" value={currentUser?.name || ''} readOnly disabled className="mt-2 bg-muted" />
            </div>
            <div>
              <Label htmlFor="validUntil" className="font-semibold">Berlaku Hingga</Label>
              <DateTimePicker date={validUntil} setDate={setValidUntil} />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Keterangan</TableHead><TableHead>Qty</TableHead><TableHead>Satuan</TableHead><TableHead>Harga Satuan</TableHead><TableHead>Total</TableHead><TableHead>Aksi</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="min-w-[200px]"><Select onValueChange={(v) => handleItemChange(index, 'product', products?.find(p => p.id === v))} value={item.product?.id || ""}><SelectTrigger><SelectValue placeholder="Pilih Produk" /></SelectTrigger><SelectContent>{isLoadingProducts ? <SelectItem value="loading" disabled>Memuat...</SelectItem> : products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></TableCell>
                  <TableCell className="min-w-[200px]"><Input value={item.keterangan} onChange={(e) => handleItemChange(index, 'keterangan', e.target.value)} placeholder="Detail, ukuran, dll." /></TableCell>
                  <TableCell className="min-w-[80px]"><Input type="number" value={item.qty} onChange={(e) => handleItemChange(index, 'qty', Number(e.target.value))} /></TableCell>
                  <TableCell className="min-w-[120px]"><Input value={item.unit} onChange={(e) => handleItemChange(index, 'unit', e.target.value)} placeholder="pcs, m², etc" /></TableCell>
                  <TableCell className="min-w-[150px]"><Input type="number" value={item.harga} onChange={(e) => handleItemChange(index, 'harga', Number(e.target.value))} /></TableCell>
                  <TableCell className="font-medium text-right">{new Intl.NumberFormat("id-ID").format(calculateItemTotal(item))}</TableCell>
                  <TableCell><Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveItem(index)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button type="button" onClick={handleAddItem} variant="outline" className="w-full"><PlusCircle className="mr-2 h-4 w-4" /> Tambah Item</Button>

        <div className="flex justify-end items-center gap-8 pt-6 border-t">
            <div className="text-right">
                <p className="text-muted-foreground">Total Penawaran</p>
                <p className="text-2xl font-bold">{new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(totalPenawaran)}</p>
            </div>
            <Button type="submit" size="lg" disabled={isSaving}>
              {isSaving ? "Menyimpan..." : "Simpan Penawaran"}
            </Button>
        </div>
      </form>
    </>
  )
}