import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'

// Default permissions for each role (same as in RolePermissionManagement)
const DEFAULT_PERMISSIONS = {
  owner: {
    // Owner has all permissions
    products_view: true, products_create: true, products_edit: true, products_delete: true,
    materials_view: true, materials_create: true, materials_edit: true, materials_delete: true,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: true,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: true,
    employees_view: true, employees_create: true, employees_edit: true, employees_delete: true,
    accounts_view: true, accounts_create: true, accounts_edit: true,
    receivables_view: true,
    expenses_view: true, expenses_create: true,
    advances_view: true, advances_create: true,
    financial_reports: true,
    stock_reports: true, transaction_reports: true, attendance_reports: true,
    settings_access: true, role_management: true, attendance_access: true,
  },
  admin: {
    products_view: true, products_create: true, products_edit: true, products_delete: true,
    materials_view: true, materials_create: true, materials_edit: true, materials_delete: true,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: true,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: true,
    employees_view: true, employees_create: true, employees_edit: true, employees_delete: true,
    accounts_view: true, accounts_create: true, accounts_edit: true,
    receivables_view: true,
    expenses_view: true, expenses_create: true,
    advances_view: true, advances_create: true,
    financial_reports: true,
    stock_reports: true, transaction_reports: true, attendance_reports: true,
    settings_access: true, role_management: false, attendance_access: true,
  },
  supervisor: {
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: true, materials_edit: true, materials_delete: false,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: true, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: true, accounts_create: false, accounts_edit: false,
    receivables_view: true,
    expenses_view: true, expenses_create: true,
    advances_view: true, advances_create: true,
    financial_reports: true,
    stock_reports: true, transaction_reports: true, attendance_reports: true,
    settings_access: false, role_management: false, attendance_access: true,
  },
  cashier: {
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: true,
    transactions_view: true, transactions_create: true, transactions_edit: true, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: true, customers_edit: true, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: true,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    financial_reports: false,
    stock_reports: false, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  },
  designer: {
    products_view: true, products_create: true, products_edit: true, products_delete: false,
    materials_view: true, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: true, transactions_create: false, transactions_edit: false, transactions_delete: false,
    quotations_view: true, quotations_create: true, quotations_edit: true,
    customers_view: true, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: false,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    stock_reports: true, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  },
  operator: {
    products_view: false, products_create: false, products_edit: false, products_delete: false,
    materials_view: false, materials_create: false, materials_edit: false, materials_delete: false,
    pos_access: false,
    transactions_view: false, transactions_create: false, transactions_edit: false, transactions_delete: false,
    quotations_view: false, quotations_create: false, quotations_edit: false,
    customers_view: false, customers_create: false, customers_edit: false, customers_delete: false,
    employees_view: false, employees_create: false, employees_edit: false, employees_delete: false,
    accounts_view: false, accounts_create: false, accounts_edit: false,
    receivables_view: false,
    expenses_view: false, expenses_create: false,
    advances_view: false, advances_create: false,
    financial_reports: false,
    stock_reports: false, transaction_reports: false, attendance_reports: false,
    settings_access: false, role_management: false, attendance_access: true,
  }
} as const

export const usePermissions = () => {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<typeof DEFAULT_PERMISSIONS>(DEFAULT_PERMISSIONS)

  useEffect(() => {
    // Load custom permissions from localStorage
    const savedPermissions = localStorage.getItem('rolePermissions')
    if (savedPermissions) {
      try {
        const customPermissions = JSON.parse(savedPermissions)
        setPermissions({ ...DEFAULT_PERMISSIONS, ...customPermissions })
      } catch (error) {
        console.error('Error loading custom permissions:', error)
      }
    }
  }, [])

  const hasPermission = (permission: string): boolean => {
    if (!user) return false
    
    const rolePermissions = permissions[user.role as keyof typeof DEFAULT_PERMISSIONS]
    if (!rolePermissions) return false
    
    return rolePermissions[permission as keyof typeof rolePermissions] || false
  }

  const getRolePermissions = (role: string) => {
    return permissions[role as keyof typeof DEFAULT_PERMISSIONS] || {}
  }

  // Convenience methods for common permission checks
  const canViewProducts = () => hasPermission('products_view')
  const canCreateProducts = () => hasPermission('products_create')
  const canEditProducts = () => hasPermission('products_edit')
  const canDeleteProducts = () => hasPermission('products_delete')
  
  const canViewMaterials = () => hasPermission('materials_view')
  const canCreateMaterials = () => hasPermission('materials_create')
  const canEditMaterials = () => hasPermission('materials_edit')
  const canDeleteMaterials = () => hasPermission('materials_delete')
  
  const canAccessPOS = () => hasPermission('pos_access')
  const canManageRoles = () => hasPermission('role_management')
  const canAccessSettings = () => hasPermission('settings_access')

  return {
    hasPermission,
    getRolePermissions,
    // Product permissions
    canViewProducts,
    canCreateProducts,
    canEditProducts,
    canDeleteProducts,
    // Material permissions
    canViewMaterials,
    canCreateMaterials,
    canEditMaterials,
    canDeleteMaterials,
    // System permissions
    canAccessPOS,
    canManageRoles,
    canAccessSettings,
    // Helper for product management
    canManageProducts: () => canViewProducts() && (canCreateProducts() || canEditProducts()),
  }
}