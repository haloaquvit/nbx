import { Employee } from '@/types/employee';

/**
 * Helper functions for role comparison that handles case insensitive matching
 */

export const isUserRole = (user: Employee | null, role: string): boolean => {
  return user?.role?.toLowerCase() === role.toLowerCase();
};

export const hasAnyRole = (user: Employee | null, roles: string[]): boolean => {
  if (!user?.role) return false;
  return roles.some(role => user.role.toLowerCase() === role.toLowerCase());
};

export const isOwner = (user: Employee | null): boolean => {
  return isUserRole(user, 'owner');
};

export const isAdmin = (user: Employee | null): boolean => {
  return isUserRole(user, 'admin');
};

export const isCashier = (user: Employee | null): boolean => {
  return isUserRole(user, 'cashier');
};

export const isAdminOrOwner = (user: Employee | null): boolean => {
  return hasAnyRole(user, ['admin', 'owner']);
};

export const canManageCash = (user: Employee | null): boolean => {
  return hasAnyRole(user, ['owner', 'admin', 'cashier']);
};

export const canManageEmployees = (user: Employee | null): boolean => {
  return hasAnyRole(user, ['owner', 'admin']);
};

export const canDeleteTransactions = (user: Employee | null): boolean => {
  return hasAnyRole(user, ['owner', 'admin']);
};

export const canManageRoles = (user: Employee | null): boolean => {
  return isUserRole(user, 'owner');
};