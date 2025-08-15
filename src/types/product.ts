export interface ProductSpecification {
  key: string;
  value: string;
}

export type ProductType = 'Stock' | 'Beli';

export interface Product {
  id: string;
  name: string;
  category: 'indoor' | 'outdoor';
  type: ProductType; // BARU: Jenis barang (Stock/Beli/Jasa)
  basePrice: number;
  unit: string; // Satuan produk
  currentStock: number; // BARU: Stock saat ini
  minStock: number; // BARU: Stock minimum
  minOrder: number;
  description?: string;
  specifications: ProductSpecification[];
  materials: ProductMaterial[]; // Ini adalah BOM (Bill of Materials)
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductMaterial {
  materialId: string;
  quantity: number;
  notes?: string;
}