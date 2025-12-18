import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  Supplier,
  SupplierMaterial,
  SupplierMaterialWithDetails,
  CreateSupplierData,
  UpdateSupplierData,
  CreateSupplierMaterialData,
  SupplierOption
} from '@/types/supplier'
import { useBranch } from '@/contexts/BranchContext'

// Helper functions for data transformation
const fromDbSupplier = (data: any): Supplier => ({
  id: data.id,
  code: data.code,
  name: data.name,
  contactPerson: data.contact_person,
  phone: data.phone,
  email: data.email,
  address: data.address,
  city: data.city,
  postalCode: data.postal_code,
  paymentTerms: data.payment_terms,
  taxNumber: data.tax_number,
  bankAccount: data.bank_account,
  bankName: data.bank_name,
  notes: data.notes,
  isActive: data.is_active,
  createdAt: new Date(data.created_at),
  updatedAt: new Date(data.updated_at)
})

const toDbSupplier = (data: CreateSupplierData | UpdateSupplierData) => ({
  code: data.code,
  name: data.name,
  contact_person: data.contactPerson,
  phone: data.phone,
  email: data.email,
  address: data.address,
  city: data.city,
  postal_code: data.postalCode,
  payment_terms: data.paymentTerms || 'Cash',
  tax_number: data.taxNumber,
  bank_account: data.bankAccount,
  bank_name: data.bankName,
  notes: data.notes,
  is_active: 'isActive' in data ? data.isActive : true
})

// Hook for suppliers management
export const useSuppliers = () => {
  const queryClient = useQueryClient()
  const { currentBranch } = useBranch()

  // Get all suppliers
  const { data: suppliers, isLoading } = useQuery<Supplier[]>({
    queryKey: ['suppliers', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select('*')
        .order('name');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbSupplier) : [];
    },
    enabled: !!currentBranch,
    // Optimized for supplier management
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  })

  // Get active suppliers for dropdowns
  const { data: activeSuppliers } = useQuery<SupplierOption[]>({
    queryKey: ['suppliers', 'active', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('suppliers')
        .select('id, code, name, payment_terms')
        .eq('is_active', true)
        .order('name');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ? data.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        paymentTerms: item.payment_terms
      })) : [];
    },
    enabled: !!currentBranch,
    // Optimized for dropdown usage
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  })

  // Create supplier
  const createSupplier = useMutation({
    mutationFn: async (data: CreateSupplierData): Promise<Supplier> => {
      const dbData = {
        ...toDbSupplier(data),
        branch_id: currentBranch?.id || null,
      }
      const { data: result, error } = await supabase
        .from('suppliers')
        .insert(dbData)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return fromDbSupplier(result)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  // Update supplier
  const updateSupplier = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: UpdateSupplierData }): Promise<Supplier> => {
      const dbData = toDbSupplier(data)
      const { data: result, error } = await supabase
        .from('suppliers')
        .update(dbData)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw new Error(error.message)
      return fromDbSupplier(result)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  // Delete supplier
  const deleteSupplier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)
      
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  return {
    suppliers,
    activeSuppliers,
    isLoading,
    createSupplier,
    updateSupplier,
    deleteSupplier
  }
}

// Hook for supplier materials management
export const useSupplierMaterials = () => {
  const queryClient = useQueryClient()

  // Get supplier materials with details
  const { data: supplierMaterials, isLoading } = useQuery<SupplierMaterialWithDetails[]>({
    queryKey: ['supplier-materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplier_materials')
        .select(`
          *,
          suppliers(code, name),
          materials(name)
        `)
        .order('last_updated', { ascending: false })
      
      if (error) throw new Error(error.message)
      return data ? data.map(item => ({
        id: item.id,
        supplierId: item.supplier_id,
        materialId: item.material_id,
        supplierPrice: item.supplier_price,
        unit: item.unit,
        minOrderQty: item.min_order_qty,
        leadTimeDays: item.lead_time_days,
        lastUpdated: new Date(item.last_updated),
        notes: item.notes,
        isActive: item.is_active,
        createdAt: new Date(item.created_at),
        supplierName: item.suppliers?.name || '',
        supplierCode: item.suppliers?.code || '',
        materialName: item.materials?.name || ''
      })) : []
    }
  })

  // Get supplier materials for a specific material
  const getSupplierMaterialsForMaterial = async (materialId: string): Promise<SupplierMaterialWithDetails[]> => {
    const { data, error } = await supabase
      .from('supplier_materials')
      .select(`
        *,
        suppliers(code, name, payment_terms)
      `)
      .eq('material_id', materialId)
      .eq('is_active', true)
      .order('supplier_price')
    
    if (error) throw new Error(error.message)
    return data ? data.map(item => ({
      id: item.id,
      supplierId: item.supplier_id,
      materialId: item.material_id,
      supplierPrice: item.supplier_price,
      unit: item.unit,
      minOrderQty: item.min_order_qty,
      leadTimeDays: item.lead_time_days,
      lastUpdated: new Date(item.last_updated),
      notes: item.notes,
      isActive: item.is_active,
      createdAt: new Date(item.created_at),
      supplierName: item.suppliers?.name || '',
      supplierCode: item.suppliers?.code || '',
      materialName: ''
    })) : []
  }

  // Create supplier material
  const createSupplierMaterial = useMutation({
    mutationFn: async (data: CreateSupplierMaterialData) => {
      const { data: result, error } = await supabase
        .from('supplier_materials')
        .insert({
          supplier_id: data.supplierId,
          material_id: data.materialId,
          supplier_price: data.supplierPrice,
          unit: data.unit,
          min_order_qty: data.minOrderQty || 1,
          lead_time_days: data.leadTimeDays || 7,
          notes: data.notes
        })
        .select()
        .single()
      
      if (error) throw new Error(error.message)
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-materials'] })
    }
  })

  return {
    supplierMaterials,
    isLoading,
    getSupplierMaterialsForMaterial,
    createSupplierMaterial
  }
}