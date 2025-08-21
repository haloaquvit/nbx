export interface DeliveryItem {
  id: string;
  deliveryId: string;
  productId: string;
  productName: string;
  quantityDelivered: number;
  unit: string;
  width?: number;
  height?: number;
  notes?: string;
  createdAt: Date;
}

export interface Delivery {
  id: string;
  transactionId: string;
  deliveryNumber: number;
  deliveryDate: Date;
  photoUrl?: string;
  photoDriveId?: string;
  notes?: string;
  driverId?: string;
  driverName?: string;
  helperId?: string;
  helperName?: string;
  items: DeliveryItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DeliverySummaryItem {
  productId: string;
  productName: string;
  orderedQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  unit: string;
  width?: number;
  height?: number;
}

export interface TransactionDeliveryInfo {
  id: string;
  customerName: string;
  orderDate: Date;
  items: any[]; // Transaction items
  total: number;
  status: string;
  deliveries: Delivery[];
  deliverySummary: DeliverySummaryItem[];
}

export interface CreateDeliveryRequest {
  transactionId: string;
  deliveryDate: Date;
  notes?: string;
  driverId?: string;
  helperId?: string;
  items: {
    productId: string;
    productName: string;
    quantityDelivered: number;
    unit: string;
    width?: number;
    height?: number;
    notes?: string;
  }[];
  photo?: File;
}

export interface DeliveryFormData {
  transactionId: string;
  deliveryDate: string;
  notes: string;
  driverId: string;
  helperId: string;
  items: {
    productId: string;
    productName: string;
    orderedQuantity: number;
    deliveredQuantity: number;
    remainingQuantity: number;
    quantityToDeliver: number;
    unit: string;
    width?: number;
    height?: number;
    notes: string;
  }[];
  photo?: File;
}

// Employee interface for dropdown options
export interface DeliveryEmployee {
  id: string;
  name: string;
  position: string;
  role: 'supir' | 'helper';
}