export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
  full_address?: string;
  store_photo_url?: string;
  store_photo_drive_id?: string;
  jumlah_galon_titip?: number; // Jumlah galon yang dititip di pelanggan
  orderCount: number; // Menambahkan jumlah orderan
  createdAt: Date;
}