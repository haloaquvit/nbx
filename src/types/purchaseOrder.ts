export type PurchaseOrderStatus = 'Pending' | 'Approved' | 'Dikirim' | 'Diterima' | 'Dibayar' | 'Selesai';

// Purchase Order Item (line item within a PO)
export interface PurchaseOrderItem {
  id?: string;
  purchaseOrderId?: string;
  materialId: string;
  materialName?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  quantityReceived?: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// Main Purchase Order (header)
export interface PurchaseOrder {
  id: string;
  poNumber?: string;

  // Supplier info
  supplierId?: string;
  supplierName?: string;
  supplierContact?: string;

  // Dates
  orderDate?: Date;
  expectedDeliveryDate?: Date;
  receivedDate?: Date;
  paymentDate?: Date;
  createdAt: Date;
  updatedAt?: Date;
  approvedAt?: Date;

  // Status and workflow
  status: PurchaseOrderStatus;
  requestedBy: string;
  approvedBy?: string;

  // Financial
  totalCost?: number;
  includePpn?: boolean;
  ppnAmount?: number;
  paymentAccountId?: string;

  // Additional info
  expedition?: string;
  notes?: string;
  branchId?: string;

  // Items (for multi-item PO)
  items?: PurchaseOrderItem[];

  // Legacy fields (for backward compatibility with single-item POs)
  materialId?: string;
  materialName?: string;
  quantity?: number;
  unit?: string;
  unitPrice?: number;
  quotedPrice?: number;
}