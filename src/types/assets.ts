// Asset Management Types

export type AssetCategory = 'equipment' | 'vehicle' | 'building' | 'furniture' | 'computer' | 'other';
export type AssetStatus = 'active' | 'maintenance' | 'retired' | 'sold';
export type AssetCondition = 'excellent' | 'good' | 'fair' | 'poor';
export type DepreciationMethod = 'straight_line' | 'declining_balance';

export interface Asset {
  id: string;
  assetName: string;
  assetCode: string;
  category: AssetCategory;
  description?: string;

  // Purchase Information
  purchaseDate: Date;
  purchasePrice: number;
  supplierName?: string;

  // Asset Details
  brand?: string;
  model?: string;
  serialNumber?: string;
  location?: string;

  // Depreciation
  usefulLifeYears: number;
  salvageValue: number;
  depreciationMethod: DepreciationMethod;

  // Status
  status: AssetStatus;
  condition: AssetCondition;

  // Financial Integration
  accountId?: string;
  currentValue?: number;

  // Additional Info
  warrantyExpiry?: Date;
  insuranceExpiry?: Date;
  notes?: string;
  photoUrl?: string;

  // Metadata
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MaintenanceType = 'preventive' | 'corrective' | 'inspection' | 'calibration' | 'other';
export type MaintenanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'overdue';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';
export type RecurrenceUnit = 'days' | 'weeks' | 'months' | 'years';

export interface AssetMaintenance {
  id: string;
  assetId: string;
  assetName?: string; // Joined from assets table

  // Maintenance Type
  maintenanceType: MaintenanceType;
  title: string;
  description?: string;

  // Schedule Information
  scheduledDate: Date;
  completedDate?: Date;
  nextMaintenanceDate?: Date;

  // Frequency (for recurring maintenance)
  isRecurring: boolean;
  recurrenceInterval?: number;
  recurrenceUnit?: RecurrenceUnit;

  // Status
  status: MaintenanceStatus;
  priority: MaintenancePriority;

  // Cost Information
  estimatedCost: number;
  actualCost: number;
  paymentAccountId?: string;
  paymentAccountName?: string;

  // Service Provider
  serviceProvider?: string;
  technicianName?: string;

  // Parts Used
  partsReplaced?: string; // JSON string
  laborHours?: number;

  // Result
  workPerformed?: string;
  findings?: string;
  recommendations?: string;

  // Attachments
  attachments?: string; // JSON string

  // Notification
  notifyBeforeDays: number;
  notificationSent: boolean;

  // Metadata
  createdBy?: string;
  completedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationType =
  | 'maintenance_due'
  | 'maintenance_overdue'
  | 'warranty_expiry'
  | 'insurance_expiry'
  | 'purchase_order_created'
  | 'purchase_order_received'
  | 'production_completed'
  | 'advance_request'
  | 'payroll_processed'
  | 'debt_payment'
  | 'low_stock'
  | 'transaction_created'
  | 'delivery_scheduled'
  | 'system_alert'
  | 'other';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;

  // Notification Details
  title: string;
  message: string;
  type: NotificationType;

  // Reference Information
  referenceType?: string;
  referenceId?: string;
  referenceUrl?: string;

  // Priority
  priority: NotificationPriority;

  // Status
  isRead: boolean;
  readAt?: Date;

  // Target User
  userId?: string;

  // Metadata
  createdAt: Date;
  expiresAt?: Date;
}

// Form Data Types
export interface AssetFormData {
  assetName: string;
  assetCode: string;
  category: AssetCategory;
  description?: string;
  purchaseDate: Date;
  purchasePrice: number;
  supplierName?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  usefulLifeYears: number;
  salvageValue: number;
  depreciationMethod: DepreciationMethod;
  status: AssetStatus;
  condition: AssetCondition;
  accountId?: string;
  warrantyExpiry?: Date;
  insuranceExpiry?: Date;
  notes?: string;
  photoUrl?: string;
}

export interface MaintenanceFormData {
  assetId: string;
  maintenanceType: MaintenanceType;
  title: string;
  description?: string;
  scheduledDate: Date;
  isRecurring: boolean;
  recurrenceInterval?: number;
  recurrenceUnit?: RecurrenceUnit;
  priority: MaintenancePriority;
  estimatedCost: number;
  serviceProvider?: string;
  technicianName?: string;
  notifyBeforeDays: number;
  notes?: string;
}

// Summary Types
export interface AssetSummary {
  totalAssets: number;
  totalValue: number;
  totalDepreciation: number;
  activeAssets: number;
  maintenanceAssets: number;
  retiredAssets: number;
  byCategory: {
    category: AssetCategory;
    count: number;
    totalValue: number;
  }[];
}

export interface MaintenanceSummary {
  totalScheduled: number;
  overdueCount: number;
  inProgressCount: number;
  totalCompleted: number;
  upcomingThisMonth: number;
  totalCostThisMonth: number;
  totalCostThisYear: number;
  averageCompletionTime: number; // in days
}
