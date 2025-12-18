// Branch and Company Types

export interface Company {
  id: string;
  name: string;
  code: string;
  isHeadOffice: boolean;
  address?: string;
  phone?: string;
  email?: string;
  taxId?: string; // NPWP
  logoUrl?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  companyId: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  managerId?: string;
  managerName?: string;
  isActive: boolean;
  settings?: BranchSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface BranchSettings {
  allowCreditSales?: boolean;
  maxCreditDays?: number;
  requireApprovalForExpenses?: boolean;
  expenseApprovalLimit?: number;
  enableCommissions?: boolean;
  commissionRates?: {
    [productId: string]: number;
  };
  workingHours?: {
    start: string; // "09:00"
    end: string;   // "17:00"
  };
  workingDays?: number[]; // [1,2,3,4,5] = Mon-Fri
}

export interface BranchTransfer {
  id: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  transferType: 'stock' | 'cash' | 'asset';
  items?: BranchTransferItem[];
  amount?: number; // For cash transfer
  accountId?: string; // For cash transfer
  assetId?: string; // For asset transfer
  notes?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedBy: string;
  requestedByName: string;
  approvedBy?: string;
  approvedByName?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface BranchTransferItem {
  materialId?: string;
  materialName?: string;
  productId?: string;
  productName?: string;
  quantity: number;
  unit: string;
  notes?: string;
}

// Helper type to add branch_id to existing types
export type WithBranch<T> = T & {
  branchId: string;
};

// Helper type for shared resources
export type Sharable<T> = T & {
  isShared?: boolean;
  branchId: string;
};
