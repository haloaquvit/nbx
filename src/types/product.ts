export interface ProductSpecification {
  key: string;
  value: string;
}

export type ProductType = 'Produksi' | 'Jual Langsung';

export interface Product {
  id: string;
  name: string;
  type: ProductType; // Jenis barang (Produksi/Jual Langsung)
  basePrice: number;
  unit: string; // Satuan produk
  currentStock: number; // Stock saat ini
  minStock: number; // Stock minimum
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