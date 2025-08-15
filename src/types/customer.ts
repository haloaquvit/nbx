export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  orderCount: number; // Menambahkan jumlah orderan
  createdAt: Date;
}