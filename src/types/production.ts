import { Product } from './product';
import { Material } from './material';

export interface ProductionRecord {
  id: string;
  ref: string;
  productId: string;
  productName: string;
  quantity: number;
  note?: string;
  consumeBOM: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BOMItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  notes?: string;
}

export interface ProductionInput {
  productId: string;
  quantity: number;
  note?: string;
  consumeBOM: boolean;
  createdBy: string;
}

export interface ProductionResult {
  success: boolean;
  ref: string;
  message: string;
}

export interface ErrorRecord {
  id: string;
  ref: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  note?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ErrorInput {
  materialId: string;
  quantity: number;
  note?: string;
  createdBy: string;
}