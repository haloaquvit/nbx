import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AssetMaintenance, MaintenanceFormData, MaintenanceSummary } from '@/types/assets';
import { useBranch } from '@/contexts/BranchContext';

// Fetch all maintenance records
export function useMaintenance() {
  const { currentBranch } = useBranch();

  return useQuery({
    queryKey: ['maintenance', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('asset_maintenance')
        .select(`
          *,
          assets(asset_name)
        `)
        .order('scheduled_date', { ascending: false });

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((maint: any) => ({
        id: maint.id,
        assetId: maint.asset_id,
        assetName: maint.assets?.asset_name,
        maintenanceType: maint.maintenance_type,
        title: maint.title,
        description: maint.description,
        scheduledDate: new Date(maint.scheduled_date),
        completedDate: maint.completed_date ? new Date(maint.completed_date) : undefined,
        nextMaintenanceDate: maint.next_maintenance_date ? new Date(maint.next_maintenance_date) : undefined,
        isRecurring: maint.is_recurring,
        recurrenceInterval: maint.recurrence_interval,
        recurrenceUnit: maint.recurrence_unit,
        status: maint.status,
        priority: maint.priority,
        estimatedCost: maint.estimated_cost,
        actualCost: maint.actual_cost,
        paymentAccountId: maint.payment_account_id,
        serviceProvider: maint.service_provider,
        technicianName: maint.technician_name,
        partsReplaced: maint.parts_replaced,
        laborHours: maint.labor_hours,
        workPerformed: maint.work_performed,
        findings: maint.findings,
        recommendations: maint.recommendations,
        attachments: maint.attachments,
        notifyBeforeDays: maint.notify_before_days,
        notificationSent: maint.notification_sent,
        createdBy: maint.created_by,
        completedBy: maint.completed_by,
        createdAt: new Date(maint.created_at),
        updatedAt: new Date(maint.updated_at),
      })) as AssetMaintenance[];
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

// Get maintenance by asset ID
export function useMaintenanceByAsset(assetId?: string) {
  return useQuery({
    queryKey: ['maintenance', 'asset', assetId],
    queryFn: async () => {
      if (!assetId) return [];

      const { data, error } = await supabase
        .from('asset_maintenance')
        .select('*')
        .eq('asset_id', assetId)
        .order('scheduled_date', { ascending: false });

      if (error) throw error;

      return (data || []).map((maint: any) => ({
        id: maint.id,
        assetId: maint.asset_id,
        maintenanceType: maint.maintenance_type,
        title: maint.title,
        description: maint.description,
        scheduledDate: new Date(maint.scheduled_date),
        completedDate: maint.completed_date ? new Date(maint.completed_date) : undefined,
        nextMaintenanceDate: maint.next_maintenance_date ? new Date(maint.next_maintenance_date) : undefined,
        isRecurring: maint.is_recurring,
        recurrenceInterval: maint.recurrence_interval,
        recurrenceUnit: maint.recurrence_unit,
        status: maint.status,
        priority: maint.priority,
        estimatedCost: maint.estimated_cost,
        actualCost: maint.actual_cost,
        paymentAccountId: maint.payment_account_id,
        serviceProvider: maint.service_provider,
        technicianName: maint.technician_name,
        partsReplaced: maint.parts_replaced,
        laborHours: maint.labor_hours,
        workPerformed: maint.work_performed,
        findings: maint.findings,
        recommendations: maint.recommendations,
        attachments: maint.attachments,
        notifyBeforeDays: maint.notify_before_days,
        notificationSent: maint.notification_sent,
        createdBy: maint.created_by,
        completedBy: maint.completed_by,
        createdAt: new Date(maint.created_at),
        updatedAt: new Date(maint.updated_at),
      })) as AssetMaintenance[];
    },
    enabled: !!assetId,
  });
}

// Get maintenance summary
export function useMaintenanceSummary() {
  const { currentBranch } = useBranch();

  return useQuery({
    queryKey: ['maintenance', 'summary', currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('asset_maintenance')
        .select('*');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const records = data || [];
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const thisYear = new Date(now.getFullYear(), 0, 1);

      const totalScheduled = records.filter(r => r.status === 'scheduled').length;

      // Calculate overdue: scheduled but past the scheduled_date
      const overdueCount = records.filter(r =>
        r.status === 'scheduled' &&
        new Date(r.scheduled_date) < now &&
        new Date(r.scheduled_date).toDateString() !== now.toDateString()
      ).length;

      const inProgressCount = records.filter(r => r.status === 'in_progress').length;
      const totalCompleted = records.filter(r => r.status === 'completed').length;
      const upcomingThisMonth = records.filter(r =>
        r.status === 'scheduled' &&
        new Date(r.scheduled_date) >= thisMonth &&
        new Date(r.scheduled_date) < nextMonth
      ).length;

      const completedThisMonth = records.filter(r =>
        r.status === 'completed' &&
        r.completed_date &&
        new Date(r.completed_date) >= thisMonth &&
        new Date(r.completed_date) < nextMonth
      );

      const completedThisYear = records.filter(r =>
        r.status === 'completed' &&
        r.completed_date &&
        new Date(r.completed_date) >= thisYear
      );

      const totalCostThisMonth = completedThisMonth.reduce((sum, r) => sum + (r.actual_cost || 0), 0);
      const totalCostThisYear = completedThisYear.reduce((sum, r) => sum + (r.actual_cost || 0), 0);

      // Calculate average completion time
      const completedWithDates = completedThisYear.filter(r => r.completed_date && r.scheduled_date);
      const avgCompletionDays = completedWithDates.length > 0
        ? completedWithDates.reduce((sum, r) => {
            const scheduled = new Date(r.scheduled_date).getTime();
            const completed = new Date(r.completed_date!).getTime();
            return sum + (completed - scheduled) / (1000 * 60 * 60 * 24);
          }, 0) / completedWithDates.length
        : 0;

      return {
        totalScheduled,
        overdueCount,
        inProgressCount,
        totalCompleted,
        upcomingThisMonth,
        totalCostThisMonth,
        totalCostThisYear,
        averageCompletionTime: Math.round(avgCompletionDays),
      } as MaintenanceSummary;
    },
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes cache
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: 1000,
  });
}

// Create maintenance record
export function useCreateMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formData: MaintenanceFormData) => {
      const id = `MAINT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const { error } = await supabase
        .from('asset_maintenance')
        .insert({
          id,
          asset_id: formData.assetId,
          maintenance_type: formData.maintenanceType,
          title: formData.title,
          description: formData.description,
          scheduled_date: formData.scheduledDate.toISOString().split('T')[0],
          is_recurring: formData.isRecurring,
          recurrence_interval: formData.recurrenceInterval,
          recurrence_unit: formData.recurrenceUnit,
          priority: formData.priority,
          estimated_cost: formData.estimatedCost,
          service_provider: formData.serviceProvider,
          technician_name: formData.technicianName,
          notify_before_days: formData.notifyBeforeDays,
        });

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

// Complete maintenance
export function useCompleteMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      actualCost,
      paymentAccountId,
      workPerformed,
      findings,
      recommendations,
      partsReplaced,
      laborHours,
    }: {
      id: string;
      actualCost?: number;
      paymentAccountId?: string;
      workPerformed?: string;
      findings?: string;
      recommendations?: string;
      partsReplaced?: string;
      laborHours?: number;
    }) => {
      const { error } = await supabase
        .from('asset_maintenance')
        .update({
          status: 'completed',
          completed_date: new Date().toISOString().split('T')[0],
          actual_cost: actualCost,
          payment_account_id: paymentAccountId,
          work_performed: workPerformed,
          findings,
          recommendations,
          parts_replaced: partsReplaced,
          labor_hours: laborHours,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

// Update maintenance
export function useUpdateMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: Partial<MaintenanceFormData> }) => {
      const updateData: any = {};

      if (formData.assetId) updateData.asset_id = formData.assetId;
      if (formData.maintenanceType) updateData.maintenance_type = formData.maintenanceType;
      if (formData.title) updateData.title = formData.title;
      if (formData.description !== undefined) updateData.description = formData.description;
      if (formData.scheduledDate) updateData.scheduled_date = formData.scheduledDate.toISOString().split('T')[0];
      if (formData.isRecurring !== undefined) updateData.is_recurring = formData.isRecurring;
      if (formData.recurrenceInterval !== undefined) updateData.recurrence_interval = formData.recurrenceInterval;
      if (formData.recurrenceUnit !== undefined) updateData.recurrence_unit = formData.recurrenceUnit;
      if (formData.priority) updateData.priority = formData.priority;
      if (formData.estimatedCost !== undefined) updateData.estimated_cost = formData.estimatedCost;
      if (formData.serviceProvider !== undefined) updateData.service_provider = formData.serviceProvider;
      if (formData.technicianName !== undefined) updateData.technician_name = formData.technicianName;
      if (formData.notifyBeforeDays !== undefined) updateData.notify_before_days = formData.notifyBeforeDays;

      const { error } = await supabase
        .from('asset_maintenance')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}

// Delete maintenance
export function useDeleteMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('asset_maintenance')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] });
    },
  });
}
