export interface CommissionRule {
  id: string
  productId: string
  productName: string
  productSku?: string
  role: 'sales' | 'driver' | 'helper'
  ratePerQty: number
  createdAt: Date
  updatedAt: Date
}

export interface CommissionEntry {
  id: string
  userId: string
  userName: string
  role: 'sales' | 'driver' | 'helper'
  productId: string
  productName: string
  productSku?: string
  quantity: number
  ratePerQty: number
  amount: number
  transactionId?: string
  deliveryId?: string
  ref: string
  createdAt: Date
  status: 'pending' | 'paid' | 'cancelled'
}

export interface CommissionSummary {
  userId: string
  userName: string
  role: 'sales' | 'driver' | 'helper'
  totalAmount: number
  totalQuantity: number
  entryCount: number
}