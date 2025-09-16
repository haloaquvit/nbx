export interface Supplier {
  id: string;
  code: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  paymentTerms: string;
  taxNumber?: string;
  bankAccount?: string;
  bankName?: string;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplierMaterial {
  id: string;
  supplierId: string;
  materialId: string;
  supplierPrice: number;
  unit: string;
  minOrderQty: number;
  leadTimeDays: number;
  lastUpdated: Date;
  notes?: string;
  isActive: boolean;
  createdAt: Date;
}

export interface SupplierMaterialWithDetails extends SupplierMaterial {
  supplierName: string;
  supplierCode: string;
  materialName: string;
}

export interface CreateSupplierData {
  code?: string; // Optional, will be auto-generated if not provided
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  paymentTerms?: string;
  taxNumber?: string;
  bankAccount?: string;
  bankName?: string;
  notes?: string;
}

export interface UpdateSupplierData extends Partial<CreateSupplierData> {
  isActive?: boolean;
}

export interface CreateSupplierMaterialData {
  supplierId: string;
  materialId: string;
  supplierPrice: number;
  unit: string;
  minOrderQty?: number;
  leadTimeDays?: number;
  notes?: string;
}

export interface SupplierOption {
  id: string;
  code: string;
  name: string;
  paymentTerms: string;
}