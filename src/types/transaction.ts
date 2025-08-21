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

export type TransactionStatus = 
  | 'Pesanan Masuk'     // Order baru dibuat
  | 'Siap Antar'        // Produksi selesai, siap diantar
  | 'Diantar Sebagian'  // Sebagian sudah diantar
  | 'Selesai'           // Semua sudah berhasil diantar
  | 'Dibatalkan';       // Order dibatalkan

export type PaymentStatus = 
  | 'Lunas'             // Sudah dibayar penuh
  | 'Belum Lunas'       // Belum dibayar atau bayar sebagian
  | 'Kredit';           // Pembayaran kredit

// Status delivery untuk tracking pengantaran
export type DeliveryStatus = 
  | 'Pending'           // Belum diantar
  | 'In Progress'       // Sedang dalam perjalanan
  | 'Partial'           // Sebagian sudah sampai
  | 'Completed'         // Semua sudah sampai
  | 'Cancelled';        // Pengantaran dibatalkan

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
  ppnMode?: 'include' | 'exclude'; // Mode PPN: include (sudah termasuk) atau exclude (belum termasuk)
  ppnPercentage: number; // Persentase PPN (default 11)
  ppnAmount: number; // Jumlah PPN dalam rupiah
  total: number; // Total setelah PPN
  paidAmount: number; // Jumlah yang sudah dibayar
  paymentStatus: PaymentStatus; // Status pembayaran
  dueDate?: Date | null; // Tanggal jatuh tempo untuk pembayaran kredit
  status: TransactionStatus;
  isOfficeSale?: boolean; // Tandai jika produk laku kantor
  createdAt: Date;
}