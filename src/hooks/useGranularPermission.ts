import { useMemo, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getRolePermissions } from '@/services/rolePermissionService';

/**
 * Hook to check granular permissions directly from role_permissions table.
 * This is used for fine-grained permission checks like retasi_create, delivery_edit, etc.
 */
export const useGranularPermission = () => {
  const { user } = useAuth();
  const [rolePermissions, setRolePermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load role permissions from database
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        // First try localStorage for faster initial load
        const cachedPerms = localStorage.getItem('rolePermissions');
        if (cachedPerms) {
          setRolePermissions(JSON.parse(cachedPerms));
        }

        // Then fetch from database
        const dbPerms = await getRolePermissions();
        if (dbPerms && dbPerms.length > 0) {
          const permsByRole: Record<string, Record<string, boolean>> = {};
          dbPerms.forEach((rp: { role_id: string; permissions: Record<string, boolean> }) => {
            permsByRole[rp.role_id] = rp.permissions;
          });
          setRolePermissions(permsByRole);
          // Update localStorage cache
          localStorage.setItem('rolePermissions', JSON.stringify(permsByRole));
        }
      } catch (error) {
        console.warn('Error loading granular permissions:', error);
        // Fallback to localStorage
        try {
          const saved = localStorage.getItem('rolePermissions');
          if (saved) {
            setRolePermissions(JSON.parse(saved));
          }
        } catch (e) {
          console.error('Error loading from localStorage:', e);
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadPermissions();

    // Listen for changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'rolePermissions') {
        try {
          const perms = e.newValue ? JSON.parse(e.newValue) : {};
          setRolePermissions(perms);
        } catch (error) {
          console.error('Error parsing storage change:', error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Get all granular permissions for the current user's role
   */
  const userGranularPermissions = useMemo(() => {
    if (!user) return {};

    // Owner has all permissions
    if (user.role === 'owner') {
      return {
        // Return a proxy-like object that returns true for everything
        _isOwner: true
      };
    }

    // Admin has most permissions except role management
    if (user.role === 'admin') {
      return {
        _isAdmin: true
      };
    }

    return rolePermissions[user.role] || {};
  }, [user, rolePermissions]);

  /**
   * Check if user has a specific granular permission
   * @param permission - The granular permission key (e.g., 'retasi_create', 'delivery_edit')
   */
  const hasGranularPermission = (permission: string): boolean => {
    if (!user) return false;

    // Owner always has permission
    if (user.role === 'owner') return true;

    // Admin has all permissions except role_management
    if (user.role === 'admin' && permission !== 'role_management') return true;

    // Check specific permission
    const perms = rolePermissions[user.role] || {};
    return perms[permission] === true;
  };

  /**
   * Check if user can create retasi
   */
  const canCreateRetasi = (): boolean => {
    return hasGranularPermission('retasi_create');
  };

  /**
   * Check if user can edit delivery
   */
  const canEditDelivery = (): boolean => {
    return hasGranularPermission('delivery_edit');
  };

  /**
   * Check if user can create delivery
   */
  const canCreateDelivery = (): boolean => {
    return hasGranularPermission('delivery_create');
  };

  return {
    hasGranularPermission,
    userGranularPermissions,
    isLoading,
    // Convenience methods
    canCreateRetasi,
    canEditDelivery,
    canCreateDelivery,
  };
};
