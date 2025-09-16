import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import {
  EmployeeSalary,
  PayrollRecord,
  PayrollSummary,
  PayrollCalculation,
  SalaryConfigFormData,
  PayrollFormData,
  PayrollFilters,
  CommissionCalculation
} from '@/types/payroll'
import { useToast } from '@/hooks/use-toast'

// Helper functions for data transformation
const fromDbToEmployeeSalary = (dbData: any): EmployeeSalary => ({
  id: dbData.id,
  employeeId: dbData.employee_id,
  employeeName: dbData.employee_name,
  employeeRole: dbData.employee_role,
  baseSalary: Number(dbData.base_salary) || 0,
  commissionRate: Number(dbData.commission_rate) || 0,
  payrollType: dbData.payroll_type || 'monthly',
  commissionType: dbData.commission_type || 'none',
  effectiveFrom: new Date(dbData.effective_from),
  effectiveUntil: dbData.effective_until ? new Date(dbData.effective_until) : undefined,
  isActive: dbData.is_active,
  createdBy: dbData.created_by,
  createdAt: new Date(dbData.created_at),
  updatedAt: new Date(dbData.updated_at),
  notes: dbData.notes,
});

const fromDbToPayrollRecord = (dbData: any): PayrollRecord => ({
  id: dbData.id || dbData.payroll_id,
  employeeId: dbData.employee_id,
  employeeName: dbData.employee_name,
  employeeRole: dbData.employee_role,
  salaryConfigId: dbData.salary_config_id,
  periodYear: dbData.period_year,
  periodMonth: dbData.period_month,
  periodStart: new Date(dbData.period_start),
  periodEnd: new Date(dbData.period_end),
  periodDisplay: dbData.period_display,
  baseSalaryAmount: Number(dbData.base_salary_amount) || 0,
  commissionAmount: Number(dbData.commission_amount) || 0,
  bonusAmount: Number(dbData.bonus_amount) || 0,
  deductionAmount: Number(dbData.deduction_amount) || 0,
  outstandingAdvances: Number(dbData.outstanding_advances) || 0,
  grossSalary: Number(dbData.gross_salary) || 0,
  netSalary: Number(dbData.net_salary) || 0,
  status: dbData.status || 'draft',
  paymentDate: dbData.payment_date ? new Date(dbData.payment_date) : undefined,
  paymentAccountId: dbData.payment_account_id,
  paymentAccountName: dbData.payment_account_name,
  cashHistoryId: dbData.cash_history_id,
  createdBy: dbData.created_by,
  createdAt: new Date(dbData.created_at),
  updatedAt: new Date(dbData.updated_at),
  notes: dbData.notes,
});

// Hook for Employee Salary Configurations
export const useEmployeeSalaries = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: salaryConfigs, isLoading, error } = useQuery<EmployeeSalary[]>({
    queryKey: ['employeeSalaries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_salary_summary')
        .select('*')
        .order('employee_name', { ascending: true });

      if (error) {
        console.error('Failed to fetch employee salaries:', error);
        return [];
      }

      return (data || []).map(fromDbToEmployeeSalary);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const createSalaryConfig = useMutation({
    mutationFn: async (data: SalaryConfigFormData) => {
      const { data: result, error } = await supabase
        .from('employee_salaries')
        .insert({
          employee_id: data.employeeId,
          base_salary: data.baseSalary,
          commission_rate: data.commissionRate,
          payroll_type: data.payrollType,
          commission_type: data.commissionType,
          effective_from: data.effectiveFrom.toISOString().split('T')[0],
          effective_until: data.effectiveUntil?.toISOString().split('T')[0],
          notes: data.notes,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSalaries'] });
      toast({
        title: 'Success',
        description: 'Salary configuration created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create salary configuration',
      });
    },
  });

  const updateSalaryConfig = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SalaryConfigFormData> }) => {
      const updateData: any = {};

      if (data.baseSalary !== undefined) updateData.base_salary = data.baseSalary;
      if (data.commissionRate !== undefined) updateData.commission_rate = data.commissionRate;
      if (data.payrollType) updateData.payroll_type = data.payrollType;
      if (data.commissionType) updateData.commission_type = data.commissionType;
      if (data.effectiveFrom) updateData.effective_from = data.effectiveFrom.toISOString().split('T')[0];
      if (data.effectiveUntil) updateData.effective_until = data.effectiveUntil.toISOString().split('T')[0];
      if (data.notes !== undefined) updateData.notes = data.notes;

      const { data: result, error } = await supabase
        .from('employee_salaries')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSalaries'] });
      toast({
        title: 'Success',
        description: 'Salary configuration updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to update salary configuration',
      });
    },
  });

  const deactivateSalaryConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employee_salaries')
        .update({
          is_active: false,
          effective_until: new Date().toISOString().split('T')[0]
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employeeSalaries'] });
      toast({
        title: 'Success',
        description: 'Salary configuration deactivated successfully',
      });
    },
  });

  return {
    salaryConfigs,
    isLoading,
    error,
    createSalaryConfig,
    updateSalaryConfig,
    deactivateSalaryConfig,
  };
};

// Hook for Payroll Records
export const usePayrollRecords = (filters?: PayrollFilters) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: payrollRecords, isLoading, error } = useQuery<PayrollRecord[]>({
    queryKey: ['payrollRecords', filters],
    queryFn: async () => {
      let query = supabase
        .from('payroll_summary')
        .select('*');

      // Apply filters
      if (filters?.year) {
        query = query.eq('period_year', filters.year);
      }
      if (filters?.month) {
        query = query.eq('period_month', filters.month);
      }
      if (filters?.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query.order('period_year', { ascending: false })
                                         .order('period_month', { ascending: false })
                                         .order('employee_name', { ascending: true });

      if (error) {
        console.error('Failed to fetch payroll records:', error);
        return [];
      }

      return (data || []).map(fromDbToPayrollRecord);
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const calculateCommission = useMutation({
    mutationFn: async ({ employeeId, startDate, endDate }: {
      employeeId: string;
      startDate: Date;
      endDate: Date;
    }) => {
      const { data, error } = await supabase.rpc('calculate_commission_for_period', {
        emp_id: employeeId,
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      });

      if (error) throw error;
      return Number(data) || 0;
    },
  });

  const calculatePayrollWithAdvances = useMutation({
    mutationFn: async ({ employeeId, year, month }: {
      employeeId: string;
      year: number;
      month: number;
    }) => {
      console.log('Calling RPC with parameters:', { employeeId, year, month });

      const { data, error } = await supabase.rpc('calculate_payroll_with_advances', {
        emp_id: employeeId,
        period_year: year,
        period_month: month,
      });

      console.log('RPC Response:', { data, error });

      if (error) {
        console.error('RPC Error:', error);
        throw error;
      }

      // Check if data has error flag
      if (data && data.error) {
        console.error('Function returned error:', data);
        throw new Error(data.message || 'RPC function returned an error');
      }

      // Simplified debug for commission issue
      if (data && (data.commissionAmount === 0 || data.commission_amount === 0)) {
        console.log('⚠️ Commission still 0 in RPC result. Check SQL function.');
      }

      return data;
    },
  });

  const getOutstandingAdvances = useMutation({
    mutationFn: async ({ employeeId, upToDate }: {
      employeeId: string;
      upToDate?: Date;
    }) => {
      const { data, error } = await supabase.rpc('get_outstanding_advances', {
        emp_id: employeeId,
        up_to_date: upToDate ? upToDate.toISOString().split('T')[0] : undefined,
      });

      if (error) throw error;
      return Number(data) || 0;
    },
  });

  const createPayrollRecord = useMutation({
    mutationFn: async (data: PayrollFormData) => {
      // First, calculate period dates
      const periodStart = new Date(data.periodYear, data.periodMonth - 1, 1);
      const periodEnd = new Date(data.periodYear, data.periodMonth, 0);

      const { data: result, error } = await supabase
        .from('payroll_records')
        .insert({
          employee_id: data.employeeId,
          period_year: data.periodYear,
          period_month: data.periodMonth,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          base_salary_amount: data.baseSalaryAmount || 0,
          commission_amount: data.commissionAmount || 0,
          bonus_amount: data.bonusAmount || 0,
          deduction_amount: data.deductionAmount || 0,
          payment_account_id: data.paymentAccountId,
          notes: data.notes,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      toast({
        title: 'Success',
        description: 'Payroll record created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create payroll record',
      });
    },
  });

  const updatePayrollRecord = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PayrollFormData> }) => {
      const updateData: any = {};

      if (data.baseSalaryAmount !== undefined) updateData.base_salary_amount = data.baseSalaryAmount;
      if (data.commissionAmount !== undefined) updateData.commission_amount = data.commissionAmount;
      if (data.bonusAmount !== undefined) updateData.bonus_amount = data.bonusAmount;
      if (data.deductionAmount !== undefined) updateData.deduction_amount = data.deductionAmount;
      if (data.paymentAccountId) updateData.payment_account_id = data.paymentAccountId;
      if (data.notes !== undefined) updateData.notes = data.notes;

      const { data: result, error } = await supabase
        .from('payroll_records')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      toast({
        title: 'Success',
        description: 'Payroll record updated successfully',
      });
    },
  });

  const approvePayrollRecord = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payroll_records')
        .update({ status: 'approved' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      toast({
        title: 'Success',
        description: 'Payroll record approved successfully',
      });
    },
  });

  const processPayment = useMutation({
    mutationFn: async ({ id, paymentAccountId, paymentDate }: {
      id: string;
      paymentAccountId: string;
      paymentDate: Date;
    }) => {
      // Get payroll record details
      const { data: payrollRecord, error: fetchError } = await supabase
        .from('payroll_summary')
        .select('*')
        .eq('payroll_id', id)
        .single();

      if (fetchError) throw fetchError;

      // Get current user info
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // Get account name
      const { data: accountData } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', paymentAccountId)
        .single();

      // Create cash_history record for payroll payment
      const cashHistoryRecord = {
        account_id: paymentAccountId,
        account_name: accountData?.name || 'Cash Account',
        type: 'gaji_karyawan', // Payroll payment type
        amount: Math.abs(payrollRecord.net_salary), // POSITIVE amount (database constraint workaround)
        description: `Pembayaran gaji ${payrollRecord.employee_name} - ${payrollRecord.period_display}`,
        reference_id: id,
        reference_name: `Payroll ${payrollRecord.employee_name}`,
        user_id: user.id,
        user_name: user.user_metadata?.full_name || user.email || 'Admin',
      };

      // Debug logging
      console.log('💰 Cash History Record:', cashHistoryRecord);
      console.log('💰 Record validation:');
      console.log('  - account_id:', typeof cashHistoryRecord.account_id, cashHistoryRecord.account_id);
      console.log('  - type:', typeof cashHistoryRecord.type, cashHistoryRecord.type);
      console.log('  - user_id:', typeof cashHistoryRecord.user_id, cashHistoryRecord.user_id);
      console.log('  - amount:', typeof cashHistoryRecord.amount, cashHistoryRecord.amount);

      // Insert cash history record
      let { data: cashHistoryData, error: cashHistoryError } = await supabase
        .from('cash_history')
        .insert(cashHistoryRecord)
        .select()
        .single();

      if (cashHistoryError) {
        console.error('💥 Cash History Error:', cashHistoryError);
        console.log('💥 Error details:', {
          message: cashHistoryError.message,
          code: cashHistoryError.code,
          details: cashHistoryError.details,
          hint: cashHistoryError.hint
        });
        console.log('💰 Failed Payload:', cashHistoryRecord);

        // If it's a constraint error for type, try with alternative type
        if (cashHistoryError.code === '23514' && (cashHistoryError.message.includes('type') || cashHistoryError.message.includes('cash_history_type_check'))) {
          console.log('🔄 Retrying with alternative payroll type...');

          const alternativeRecord = {
            ...cashHistoryRecord,
            type: 'kas_keluar_manual', // Use existing allowed type
            description: `${cashHistoryRecord.description} (Payroll Payment)`
          };

          const { data: retryData, error: retryError } = await supabase
            .from('cash_history')
            .insert(alternativeRecord)
            .select()
            .single();

          if (retryError) {
            console.error('💥 Retry also failed:', retryError);
            throw cashHistoryError; // Throw original error
          }

          console.log('✅ Cash History Success (alternative type):', retryData);
          cashHistoryData = retryData; // Use retry data
        } else {
          throw cashHistoryError; // Stop execution if other error
        }
      } else {
        console.log('✅ Cash History Success:', cashHistoryData);
        console.log('💰 Saved Cash History ID:', cashHistoryData.id);
      }

      // Update payroll record with payment info and cash_history link
      const updatePayload = {
        status: 'paid',
        payment_date: paymentDate.toISOString().split('T')[0],
        // payment_account_id: paymentAccountId, // TEMPORARILY REMOVED - Type mismatch (UUID vs TEXT)
        cash_history_id: cashHistoryData.id,
      };

      console.log('💼 Updating Payroll Record:', {
        id,
        payload: updatePayload
      });

      const { error: updateError } = await supabase
        .from('payroll_records')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) {
        console.error('💥 Payroll Update Error:', updateError);
        console.log('💥 Update Error Details:', {
          message: updateError.message,
          code: updateError.code,
          details: updateError.details,
          hint: updateError.hint
        });
        throw updateError;
      }

      console.log('✅ Payroll record updated successfully');

      // Update account balance (deduct the payment) - Direct SQL approach
      console.log('💳 Updating account balance directly:', {
        account_id: paymentAccountId,
        amount: -payrollRecord.net_salary,
        description: 'Deduct payroll payment from account'
      });

      // Get current balance first
      const { data: currentAccount, error: fetchAccountError } = await supabase
        .from('accounts')
        .select('balance, name')
        .eq('id', paymentAccountId)
        .single();

      if (fetchAccountError) {
        console.error('💥 Failed to fetch account:', fetchAccountError);
        throw new Error(`Failed to fetch account: ${fetchAccountError.message}`);
      }

      console.log('💰 Current account state:', currentAccount);

      // Update balance by deducting payroll amount
      const newBalance = (currentAccount.balance || 0) + (-payrollRecord.net_salary);

      const { error: balanceError } = await supabase
        .from('accounts')
        .update({ balance: newBalance })
        .eq('id', paymentAccountId);

      if (balanceError) {
        console.error('💥 Account Balance Update Error:', balanceError);
        throw new Error(`Failed to update account balance: ${balanceError.message}`);
      }

      console.log('✅ Account balance updated successfully:', {
        account: currentAccount.name,
        oldBalance: currentAccount.balance,
        payrollAmount: payrollRecord.net_salary,
        newBalance: newBalance
      });

      return { payrollRecord, cashHistoryData };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      toast({
        title: 'Success',
        description: 'Payment processed successfully',
      });
    },
  });

  return {
    payrollRecords,
    isLoading,
    error,
    calculateCommission,
    calculatePayrollWithAdvances,
    getOutstandingAdvances,
    createPayrollRecord,
    updatePayrollRecord,
    approvePayrollRecord,
    processPayment,
  };
};

// Hook for Payroll Summary/Dashboard
export const usePayrollSummary = (year?: number, month?: number) => {
  const { data: summary, isLoading } = useQuery<PayrollSummary>({
    queryKey: ['payrollSummary', year, month],
    queryFn: async () => {
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || (currentDate.getMonth() + 1);

      const { data, error } = await supabase
        .from('payroll_summary')
        .select('*')
        .eq('period_year', targetYear)
        .eq('period_month', targetMonth);

      if (error) {
        console.error('Failed to fetch payroll summary:', error);
        return {
          period: {
            year: targetYear,
            month: targetMonth,
            display: `${new Date(targetYear, targetMonth - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
          },
          totalEmployees: 0,
          totalBaseSalary: 0,
          totalCommission: 0,
          totalBonus: 0,
          totalDeductions: 0,
          totalGrossSalary: 0,
          totalNetSalary: 0,
          paidCount: 0,
          pendingCount: 0,
          draftCount: 0,
        };
      }

      const records = (data || []).map(fromDbToPayrollRecord);

      return {
        period: {
          year: targetYear,
          month: targetMonth,
          display: `${new Date(targetYear, targetMonth - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`,
        },
        totalEmployees: records.length,
        totalBaseSalary: records.reduce((sum, r) => sum + r.baseSalaryAmount, 0),
        totalCommission: records.reduce((sum, r) => sum + r.commissionAmount, 0),
        totalBonus: records.reduce((sum, r) => sum + r.bonusAmount, 0),
        totalDeductions: records.reduce((sum, r) => sum + r.deductionAmount, 0),
        totalGrossSalary: records.reduce((sum, r) => sum + r.grossSalary, 0),
        totalNetSalary: records.reduce((sum, r) => sum + r.netSalary, 0),
        paidCount: records.filter(r => r.status === 'paid').length,
        pendingCount: records.filter(r => r.status === 'approved').length,
        draftCount: records.filter(r => r.status === 'draft').length,
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    summary,
    isLoading,
  };
};