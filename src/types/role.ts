export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  permissions: Record<string, boolean>;
  isSystemRole: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateRoleData {
  name: string;
  displayName: string;
  description?: string;
  permissions?: Record<string, boolean>;
}

export interface UpdateRoleData {
  displayName?: string;
  description?: string;
  permissions?: Record<string, boolean>;
  isActive?: boolean;
}

export const DEFAULT_PERMISSIONS = {
  // User Management
  manage_users: false,
  create_users: false,
  edit_users: false,
  delete_users: false,
  view_users: false,
  
  // Product Management
  manage_products: false,
  create_products: false,
  edit_products: false,
  delete_products: false,
  view_products: false,
  
  // Transaction Management
  manage_transactions: false,
  create_transactions: false,
  edit_transactions: false,
  delete_transactions: false,
  view_transactions: false,
  
  // Customer Management
  manage_customers: false,
  create_customers: false,
  edit_customers: false,
  delete_customers: false,
  view_customers: false,
  
  // Material Management
  manage_materials: false,
  create_materials: false,
  edit_materials: false,
  delete_materials: false,
  view_materials: false,
  
  // Financial Management
  manage_finances: false,
  view_reports: false,
  manage_accounts: false,
  
  // Quotation Management
  create_quotations: false,
  edit_quotations: false,
  delete_quotations: false,
  view_quotations: false,
  
  // Production
  update_production: false,
  view_production: false,
  
  // System Settings
  manage_settings: false,
  manage_roles: false,
  
  // Special permissions
  all: false // Super admin permission
} as const;

export type PermissionKey = keyof typeof DEFAULT_PERMISSIONS;