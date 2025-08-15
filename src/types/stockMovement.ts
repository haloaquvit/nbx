export type StockMovementType = 'IN' | 'OUT' | 'ADJUSTMENT';
export type StockMovementReason = 'PURCHASE' | 'PRODUCTION' | 'SALES' | 'ADJUSTMENT' | 'RETURN';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  reason: StockMovementReason;
  quantity: number;
  previousStock: number;
  newStock: number;
  notes?: string;
  referenceId?: string; // ID transaksi/purchase order yang terkait
  referenceType?: string; // Type referensi (transaction, purchase_order, dll)
  userId: string;
  userName: string;
  createdAt: Date;
}

export interface CreateStockMovementData {
  productId: string;
  productName: string;
  type: StockMovementType;
  reason: StockMovementReason;
  quantity: number;
  previousStock: number;
  newStock: number;
  notes?: string;
  referenceId?: string;
  referenceType?: string;
  userId: string;
  userName: string;
}

export interface StockConsumptionReport {
  productId: string;
  productName: string;
  productType: 'Stock' | 'Beli';
  unit: string;
  totalIn: number;
  totalOut: number;
  netMovement: number;
  startingStock: number;
  endingStock: number;
  movements: StockMovement[];
}