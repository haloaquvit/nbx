import { Product } from "./product";

export interface TransactionItem {
  product: Product;
  width: number;
  height: number;
  quantity: number;
  notes?: string;
  price: number; // Menambahkan harga per item
  unit: string; // Satuan produk (pcs, m, box, etc.)
  designFile?: File | null; // Untuk upload file
  designFileName?: string; // Untuk menyimpan nama file
}

export type TransactionStatus = 'Pesanan Masuk' | 'Proses Design' | 'ACC Costumer' | 'Proses Produksi' | 'Pesanan Selesai' | 'Dibatalkan';
export type PaymentStatus = 'Lunas' | 'Belum Lunas' | 'Kredit';

export interface Transaction {
  id: string;
  customerId: string;
  customerName: string;
  cashierId: string;
  cashierName: string;
  designerId?: string | null;
  operatorId?: string | null;
  paymentAccountId?: string | null;
  orderDate: Date;
  finishDate?: Date | null;
  items: TransactionItem[];
  subtotal: number; // Total sebelum PPN
  ppnEnabled: boolean; // Apakah PPN diaktifkan
  ppnPercentage: number; // Persentase PPN (default 11)
  ppnAmount: number; // Jumlah PPN dalam rupiah
  total: number; // Total setelah PPN
  paidAmount: number; // Jumlah yang sudah dibayar
  paymentStatus: PaymentStatus; // Status pembayaran
  status: TransactionStatus;
  createdAt: Date;
}