import { TransactionItem } from "./transaction";

export type QuotationStatus = 'Draft' | 'Terkirim' | 'Disetujui' | 'Ditolak' | 'Kadaluarsa';

export interface Quotation {
  id: string;
  customerId: string;
  customerName: string;
  preparedBy: string; // Nama yang menyiapkan penawaran
  items: TransactionItem[];
  total: number;
  status: QuotationStatus;
  createdAt: Date;
  validUntil: Date; // Tanggal kadaluarsa penawaran
  transactionId?: string; // ID transaksi jika sudah di-konversi
}