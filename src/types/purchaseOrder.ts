export type PurchaseOrderStatus = 'Pending' | 'Approved' | 'Diterima' | 'Dibayar' | 'Selesai';

export interface PurchaseOrder {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  requestedBy: string;
  status: PurchaseOrderStatus;
  createdAt: Date;
  notes?: string;
  totalCost?: number;
  paymentAccountId?: string;
  paymentDate?: Date;
  supplierName?: string;
  supplierContact?: string;
  supplierId?: string;
  quotedPrice?: number;
  expedition?: string;
  expectedDeliveryDate?: Date;
  receivedDate?: Date;
  deliveryNotePhoto?: string;
  receivedBy?: string;
  receivedQuantity?: number;
  expeditionReceiver?: string;
}