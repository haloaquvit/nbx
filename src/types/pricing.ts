export interface StockPricing {
  id: string;
  productId: string;
  minStock: number;
  maxStock: number | null; // null means no upper limit
  price: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BonusPricing {
  id: string;
  productId: string;
  minQuantity: number;
  maxQuantity: number | null; // null means no upper limit
  bonusQuantity: number;
  bonusType: 'quantity' | 'percentage' | 'fixed_discount';
  bonusValue: number; // quantity, percentage (0-100), or fixed amount
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductPricing {
  id: string;
  productId: string;
  productName: string;
  basePrice: number;
  currentStock: number;
  stockPricings: StockPricing[];
  bonusPricings: BonusPricing[];
  finalPrice?: number; // calculated based on current stock
  availableBonuses?: BonusPricing[]; // applicable bonuses for current quantity
}

export interface PriceCalculationResult {
  basePrice: number;
  stockAdjustedPrice: number;
  finalPrice: number;
  appliedStockRule?: StockPricing;
  availableBonuses: BonusPricing[];
  calculatedBonus?: {
    rule: BonusPricing;
    bonusQuantity: number;
    discountAmount: number;
  };
  bonuses: {
    type: string;
    bonusQuantity: number;
    description: string;
    discountAmount: number;
  }[];
}

export interface CreateStockPricingRequest {
  productId: string;
  minStock: number;
  maxStock?: number;
  price: number;
}

export interface CreateBonusPricingRequest {
  productId: string;
  minQuantity: number;
  maxQuantity?: number;
  bonusQuantity: number;
  bonusType: 'quantity' | 'percentage' | 'fixed_discount';
  bonusValue: number;
  description?: string;
}

// Customer-based pricing types
export type CustomerPricingType = 'fixed' | 'discount_percentage' | 'discount_amount';
export type CustomerClassificationType = 'Rumahan' | 'Kios/Toko';

export interface CustomerPricing {
  id: string;
  productId: string;
  customerId?: string; // If targeting specific customer
  customerName?: string; // For display purposes (joined)
  customerClassification?: CustomerClassificationType; // If targeting classification
  priceType: CustomerPricingType;
  priceValue: number; // Fixed price, percentage (0-100), or discount amount
  priority: number;
  description?: string;
  isActive: boolean;
  branchId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerPricingRequest {
  productId: string;
  customerId?: string;
  customerClassification?: CustomerClassificationType;
  priceType: CustomerPricingType;
  priceValue: number;
  priority?: number;
  description?: string;
  branchId?: string;
}

export interface CustomerPriceCalculationResult {
  basePrice: number;
  customerAdjustedPrice: number;
  appliedRule?: CustomerPricing;
  discountAmount: number;
  discountPercentage: number;
}