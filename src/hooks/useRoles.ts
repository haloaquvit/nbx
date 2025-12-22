import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Role, CreateRoleData, UpdateRoleData } from '@/types/role'
import { supabase } from '@/integrations/supabase/client'

// DB to App mapping - handle both old and new table structure
const fromDb = (dbRole: any): Role => ({
  id: dbRole.id,
  name: dbRole.name,
  displayName: dbRole.display_name || capitalizeFirst(dbRole.name),
  description: dbRole.description || '',
  permissions: dbRole.permissions || getDefaultPermissionsForRole(dbRole.name),
  isSystemRole: dbRole.is_system_role ?? true, // Default to system role if not specified
  isActive: dbRole.is_active ?? true, // Default to active if not specified
  createdAt: new Date(dbRole.created_at),
  updatedAt: new Date(dbRole.updated_at),
});

// Helper function to capitalize first letter
const capitalizeFirst = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1);
};

// Helper function to get default permissions for existing roles
const getDefaultPermissionsForRole = (roleName: string): Record<string, boolean> => {
  const defaults = getDefaultRoles();
  const defaultRole = defaults.find(role => role.name === roleName);
  return defaultRole?.permissions || {};
};

// App to DB mapping
const toDb = (appRole: CreateRoleData | UpdateRoleData) => {
  const { displayName, ...rest } = appRole;
  return {
    ...rest,
    display_name: displayName,
  };
};

export const useRoles = () => {
  const queryClient = useQueryClient();

  const { data: roles, isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) {
        // If table doesn't exist or any other error, return default roles
        console.warn('Error fetching roles, returning default roles:', error.message);
        return getDefaultRoles();
      }
      
      const dbRoles = data ? data.map(fromDb) : [];
      
      // Return only active roles from database
      // Default roles are only used as fallback when table doesn't exist
      return dbRoles.sort((a, b) => a.name.localeCompare(b.name));
    }
  });

  const createRole = useMutation({
    mutationFn: async (roleData: CreateRoleData): Promise<Role> => {
      const dbData = toDb(roleData);
      const { data, error } = await supabase
        .from('roles')
        .insert(dbData)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    }
  });

  const updateRole = useMutation({
    mutationFn: async ({ id, ...updateData }: UpdateRoleData & { id: string }): Promise<Role> => {
      const dbData = toDb(updateData);
      const { data, error } = await supabase
        .from('roles')
        .update(dbData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return fromDb(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    }
  });

  const deleteRole = useMutation({
    mutationFn: async (roleId: string): Promise<void> => {
      // Check if it's a system role
      const { data: role } = await supabase
        .from('roles')
        .select('is_system_role')
        .eq('id', roleId)
        .single();
      
      if (role?.is_system_role) {
        throw new Error('System role tidak dapat dihapus');
      }

      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('roles')
        .update({ is_active: false })
        .eq('id', roleId);
      
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
    }
  });

  const getRoleByName = async (name: string): Promise<Role | null> => {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .eq('name', name)
      .eq('is_active', true)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(error.message);
    }
    return fromDb(data);
  };

  return {
    roles,
    isLoading,
    createRole,
    updateRole,
    deleteRole,
    getRoleByName,
  }
}

// Default roles fallback when table doesn't exist
function getDefaultRoles(): Role[] {
  const now = new Date();
  return [
    {
      id: 'owner-default',
      name: 'owner',
      displayName: 'Owner',
      description: 'Pemilik perusahaan dengan akses penuh',
      permissions: { 
        all: true, 
        manage_users: true, create_users: true, edit_users: true, delete_users: true, view_users: true,
        manage_products: true, create_products: true, edit_products: true, delete_products: true, view_products: true,
        manage_transactions: true, create_transactions: true, edit_transactions: true, delete_transactions: true, view_transactions: true,
        manage_customers: true, create_customers: true, edit_customers: true, delete_customers: true, view_customers: true,
        manage_materials: true, create_materials: true, edit_materials: true, delete_materials: true, view_materials: true,
        manage_finances: true, view_reports: true, manage_accounts: true,
        create_quotations: true, edit_quotations: true, delete_quotations: true, view_quotations: true,
        update_production: true, view_production: true, manage_settings: true, manage_roles: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'admin-default',
      name: 'admin',
      displayName: 'Administrator',
      description: 'Administrator sistem dengan akses luas',
      permissions: { 
        manage_users: true, create_users: true, edit_users: true, delete_users: true, view_users: true,
        manage_products: true, create_products: true, edit_products: true, delete_products: true, view_products: true,
        manage_transactions: true, create_transactions: true, edit_transactions: true, delete_transactions: true, view_transactions: true,
        manage_customers: true, create_customers: true, edit_customers: true, delete_customers: true, view_customers: true,
        manage_materials: true, create_materials: true, edit_materials: true, delete_materials: true, view_materials: true,
        manage_finances: true, view_reports: true, manage_accounts: true,
        create_quotations: true, edit_quotations: true, delete_quotations: true, view_quotations: true,
        update_production: true, view_production: true, manage_settings: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'supervisor-default',
      name: 'supervisor',
      displayName: 'Supervisor',
      description: 'Supervisor operasional',
      permissions: { 
        view_users: true, 
        manage_products: true, create_products: true, edit_products: true, view_products: true,
        manage_transactions: true, create_transactions: true, edit_transactions: true, view_transactions: true,
        manage_customers: true, create_customers: true, edit_customers: true, view_customers: true,
        view_materials: true, view_reports: true,
        create_quotations: true, edit_quotations: true, view_quotations: true,
        update_production: true, view_production: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'cashier-default',
      name: 'cashier',
      displayName: 'Kasir',
      description: 'Kasir untuk transaksi penjualan',
      permissions: { 
        create_transactions: true, view_transactions: true,
        manage_customers: true, create_customers: true, edit_customers: true, view_customers: true,
        view_products: true,
        create_quotations: true, view_quotations: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'designer-default',
      name: 'designer',
      displayName: 'Desainer',
      description: 'Desainer produk dan quotation',
      permissions: { 
        view_users: true,
        manage_products: true, create_products: true, edit_products: true, view_products: true,
        view_customers: true, view_materials: true,
        create_quotations: true, edit_quotations: true, view_quotations: true,
        view_production: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'operator-default',
      name: 'operator',
      displayName: 'Operator',
      description: 'Operator produksi',
      permissions: {
        view_users: true, view_products: true, view_customers: true, view_materials: true,
        view_quotations: true, update_production: true, view_production: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'supir-default',
      name: 'supir',
      displayName: 'Supir',
      description: 'Supir pengantaran',
      permissions: {
        pos_driver_access: true,
        delivery_view: true, delivery_create: true, delivery_edit: true,
        retasi_view: true, retasi_create: true,
        attendance_access: true, attendance_view: true, attendance_create: true,
        notifications_view: true, profiles_view: true, profiles_edit: true
      },
      isSystemRole: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}