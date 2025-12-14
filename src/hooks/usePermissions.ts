import { useMemo, useEffect, useState } from 'react';
import { useAuth } from './useAuth';

// Simplified permission keys - hanya yang benar-benar dibutuhkan
export const PERMISSIONS = {
  // Core Data Access
  PRODUCTS: 'products',
  MATERIALS: 'materials',
  TRANSACTIONS: 'transactions',
  CUSTOMERS: 'customers',
  EMPLOYEES: 'employees',
  DELIVERIES: 'deliveries',

  // Financial
  FINANCIAL: 'financial',

  // Reports
  REPORTS: 'reports',

  // System
  SETTINGS: 'settings',
  ROLES: 'roles'
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Load granular permissions from localStorage
const loadRolePermissions = () => {
  try {
    const saved = localStorage.getItem('rolePermissions');
    return saved ? JSON.parse(saved) : {};
  } catch (error) {
    console.error('Error loading role permissions:', error);
    return {};
  }
};

// Map granular permissions to simplified permissions
const mapGranularToSimplified = (granularPerms: Record<string, boolean>): Record<string, boolean> => {
  return {
    // Products - need at least view access
    products: granularPerms.products_view === true,

    // Materials - need at least view access
    materials: granularPerms.materials_view === true,

    // Transactions - need POS or transaction view access
    transactions: granularPerms.pos_access === true || granularPerms.transactions_view === true,

    // Customers - need at least view access
    customers: granularPerms.customers_view === true,

    // Employees - need at least view access
    employees: granularPerms.employees_view === true,

    // Deliveries - assume all roles can access deliveries for now
    deliveries: true,

    // Financial - need at least one financial permission
    financial: granularPerms.accounts_view === true ||
               granularPerms.receivables_view === true ||
               granularPerms.expenses_view === true ||
               granularPerms.advances_view === true ||
               granularPerms.financial_reports === true,

    // Reports - need at least one report permission
    reports: granularPerms.stock_reports === true ||
             granularPerms.transaction_reports === true ||
             granularPerms.attendance_reports === true,

    // Settings - need settings access
    settings: granularPerms.settings_access === true,

    // Roles - need role management permission
    roles: granularPerms.role_management === true,
  };
};

export const usePermissions = () => {
  const { user } = useAuth();
  const [rolePermissions, setRolePermissions] = useState<any>({});

  // Load role permissions from localStorage
  useEffect(() => {
    const perms = loadRolePermissions();
    setRolePermissions(perms);

    // Listen for changes to rolePermissions in localStorage
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'rolePermissions') {
        const perms = loadRolePermissions();
        setRolePermissions(perms);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const userPermissions = useMemo(() => {
    if (!user) return {};

    // Owner memiliki akses penuh
    if (user.role === 'owner') {
      return Object.values(PERMISSIONS).reduce((acc, permission) => {
        acc[permission] = true;
        return acc;
      }, {} as Record<string, boolean>);
    }

    // Get granular permissions for user's role
    const granularPerms = rolePermissions[user.role] || {};

    // Map to simplified permissions
    return mapGranularToSimplified(granularPerms);
  }, [user, rolePermissions]);

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;

    // Owner always has permission
    if (user.role === 'owner') return true;

    // Admin has all permissions except roles
    if (user.role === 'admin' && permission !== PERMISSIONS.ROLES) return true;

    // Check mapped permissions
    return userPermissions[permission] === true;
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    return permissions.some(permission => hasPermission(permission));
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    return permissions.every(permission => hasPermission(permission));
  };

  // Specific permission checks
  const canAccessProducts = () => hasPermission(PERMISSIONS.PRODUCTS);
  const canAccessMaterials = () => hasPermission(PERMISSIONS.MATERIALS);
  const canAccessTransactions = () => hasPermission(PERMISSIONS.TRANSACTIONS);
  const canAccessCustomers = () => hasPermission(PERMISSIONS.CUSTOMERS);
  const canAccessEmployees = () => hasPermission(PERMISSIONS.EMPLOYEES);
  const canAccessDeliveries = () => hasPermission(PERMISSIONS.DELIVERIES);
  const canAccessFinancial = () => hasPermission(PERMISSIONS.FINANCIAL);
  const canAccessReports = () => hasPermission(PERMISSIONS.REPORTS);
  const canAccessSettings = () => hasPermission(PERMISSIONS.SETTINGS);
  const canManageRoles = () => hasPermission(PERMISSIONS.ROLES);

  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    userPermissions,
    isOwner: user?.role === 'owner',
    isAdmin: user?.role === 'admin',
    userRole: user?.role,
    // Simplified access methods
    canAccessProducts,
    canAccessMaterials,
    canAccessTransactions,
    canAccessCustomers,
    canAccessEmployees,
    canAccessDeliveries,
    canAccessFinancial,
    canAccessReports,
    canAccessSettings,
    canManageRoles,
  };
};

// Permission checker utility - no JSX in this file
export const checkPermission = (userRole: string, permission: Permission, roles: any[]): boolean => {
  if (userRole === 'owner') return true;
  
  const role = roles?.find(r => r.name === userRole);
  return role?.permissions?.[permission] === true;
};