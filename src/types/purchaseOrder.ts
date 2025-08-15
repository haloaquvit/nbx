export type PurchaseOrderStatus = 'Pending' | 'Approved' | 'Rejected' | 'Dibayar' | 'Selesai';

export interface PurchaseOrder {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  requestedBy: string;
  status: PurchaseOrderStatus;
  createdAt: Date;
  notes?: string;
  totalCost?: number;
  paymentAccountId?: string;
  paymentDate?: Date;
}