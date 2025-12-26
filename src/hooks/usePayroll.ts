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
import { useBranch } from '@/contexts/BranchContext'
import { useAuth } from './useAuth'
import { findAccountByLookup, AccountLookupType } from '@/services/accountLookupService'
import { Account } from '@/types/account'
import { createPayrollJournal } from '@/services/journalService'

// ============================================================================
// CATATAN PENTING: DOUBLE-ENTRY ACCOUNTING SYSTEM
// ============================================================================
// Semua saldo akun HANYA dihitung dari journal_entries (tidak ada update balance langsung)
// cash_history digunakan HANYA untuk Buku Kas Harian (monitoring), TIDAK update balance
// Jurnal otomatis dibuat melalui journalService untuk setiap transaksi payroll
// ============================================================================

// Helper to map DB account to App account format
const fromDbToAppAccount = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0,
  initialBalance: Number(dbAccount.initial_balance) || 0,
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),
  code: dbAccount.code || undefined,
  parentId: dbAccount.parent_id || undefined,
  level: dbAccount.level || 1,
  normalBalance: dbAccount.normal_balance || 'DEBIT',
  isHeader: dbAccount.is_header || false,
  isActive: dbAccount.is_active !== false,
  sortOrder: dbAccount.sort_order || 0,
  branchId: dbAccount.branch_id || undefined,
});

// Helper to get account by lookup type (using name/type based matching)
const getAccountByLookup = async (lookupType: AccountLookupType): Promise<{ id: string; name: string; code?: string; balance: number } | null> => {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('code');

  if (error || !data) {
    console.warn(`Failed to fetch accounts for ${lookupType} lookup:`, error?.message);
    return null;
  }

  const accounts = data.map(fromDbToAppAccount);
  const account = findAccountByLookup(accounts, lookupType);

  if (!account) {
    console.warn(`Account not found for lookup type: ${lookupType}`);
    return null;
  }

  return { id: account.id, name: account.name, code: account.code, balance: account.balance || 0 };
};

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
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: resultRaw, error } = await supabase
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
        .order('id').limit(1);

      if (error) throw error;
      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
      if (!result) throw new Error('Failed to create salary config');
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

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: resultRaw, error } = await supabase
        .from('employee_salaries')
        .update(updateData)
        .eq('id', id)
        .select()
        .order('id').limit(1);

      if (error) throw error;
      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
      if (!result) throw new Error('Failed to update salary config');
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
  const { currentBranch } = useBranch();
  const { user: authUser } = useAuth();

  const { data: payrollRecords, isLoading, error } = useQuery<PayrollRecord[]>({
    queryKey: ['payrollRecords', filters, currentBranch?.id],
    queryFn: async () => {
      let query = supabase
        .from('payroll_summary')
        .select('*');

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

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
    enabled: !!currentBranch,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnMount: true, // Auto-refetch when switching branches
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
    mutationFn: async (data: PayrollFormData & { salaryDeduction?: number }) => {
      // Calculate period dates as YYYY-MM-DD strings (avoid timezone issues)
      // periodStart = first day of month
      const periodStartStr = `${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}-01`;
      // periodEnd = last day of month
      const lastDay = new Date(data.periodYear, data.periodMonth, 0).getDate();
      const periodEndStr = `${data.periodYear}-${String(data.periodMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      // Calculate net salary
      // total_deductions = advance_deduction (potong panjar) + salary_deduction (potongan gaji)
      const advanceDeduction = data.deductionAmount || 0;
      const salaryDeduction = data.salaryDeduction || 0;
      const totalDeductions = advanceDeduction + salaryDeduction;

      const grossSalary = (data.baseSalaryAmount || 0) + (data.commissionAmount || 0) + (data.bonusAmount || 0);
      const netSalary = grossSalary - totalDeductions;

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: resultRaw, error } = await supabase
        .from('payroll_records')
        .insert({
          employee_id: data.employeeId,
          period_start: periodStartStr,
          period_end: periodEndStr,
          base_salary: data.baseSalaryAmount || 0,
          total_commission: data.commissionAmount || 0,
          total_bonus: data.bonusAmount || 0,
          total_deductions: totalDeductions,
          advance_deduction: advanceDeduction,
          salary_deduction: salaryDeduction, // Potongan gaji terpisah
          net_salary: netSalary,
          notes: data.notes,
          branch_id: currentBranch?.id || null,
        })
        .select()
        .order('id').limit(1);

      if (error) throw error;
      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
      if (!result) throw new Error('Failed to create payroll record');
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

      if (data.baseSalaryAmount !== undefined) updateData.base_salary = data.baseSalaryAmount;
      if (data.commissionAmount !== undefined) updateData.total_commission = data.commissionAmount;
      if (data.bonusAmount !== undefined) updateData.total_bonus = data.bonusAmount;
      if (data.deductionAmount !== undefined) {
        updateData.total_deductions = data.deductionAmount;
        updateData.advance_deduction = data.deductionAmount;
      }
      if (data.notes !== undefined) updateData.notes = data.notes;

      // Recalculate net_salary if any amount changed
      if (data.baseSalaryAmount !== undefined || data.commissionAmount !== undefined ||
          data.bonusAmount !== undefined || data.deductionAmount !== undefined) {
        const grossSalary = (data.baseSalaryAmount || 0) + (data.commissionAmount || 0) + (data.bonusAmount || 0);
        updateData.net_salary = grossSalary - (data.deductionAmount || 0);
      }

      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: resultRaw, error } = await supabase
        .from('payroll_records')
        .update(updateData)
        .eq('id', id)
        .select()
        .order('id').limit(1);

      if (error) throw error;
      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;
      if (!result) throw new Error('Failed to update payroll record');
      return result;
    },
    onSuccess: () => {
      // Invalidate all payroll-related queries
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      queryClient.invalidateQueries({ queryKey: ['payrollSummary'] });
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
    onSuccess: async () => {
      // Invalidate with exact: false to match all query variants (with filters, branch, etc.)
      await queryClient.invalidateQueries({ queryKey: ['payrollRecords'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['payrollSummary'], exact: false });

      // Force immediate refetch of ALL active payroll queries
      await queryClient.refetchQueries({
        queryKey: ['payrollRecords'],
        exact: false,
        type: 'active'
      });
      await queryClient.refetchQueries({
        queryKey: ['payrollSummary'],
        exact: false,
        type: 'active'
      });

      toast({
        title: 'Sukses',
        description: 'Payroll berhasil disetujui',
      });
    },
    onError: (error: Error) => {
      console.error('Error approving payroll:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Gagal menyetujui payroll',
      });
    },
  });

  const processPayment = useMutation({
    mutationFn: async ({ id, paymentAccountId, paymentDate }: {
      id: string;
      paymentAccountId: string;
      paymentDate: Date;
    }) => {
      // Get payroll record details from summary view
      // Note: payroll_summary view uses 'id' not 'payroll_id'
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: payrollRecordRaw, error: fetchError } = await supabase
        .from('payroll_summary')
        .select('*')
        .eq('id', id)
        .order('id').limit(1);

      if (fetchError) throw fetchError;
      const payrollRecord = Array.isArray(payrollRecordRaw) ? payrollRecordRaw[0] : payrollRecordRaw;
      if (!payrollRecord) throw new Error('Payroll record not found');

      // Get current user from context
      if (!authUser) throw new Error('User not authenticated');

      // Get account name and code for journal entry
      // Use .order('id').limit(1) and handle array response because our client forces Accept: application/json
      const { data: accountDataRaw } = await supabase
        .from('accounts')
        .select('name, code')
        .eq('id', paymentAccountId)
        .order('id').limit(1);
      const accountData = Array.isArray(accountDataRaw) ? accountDataRaw[0] : accountDataRaw;

      // ============================================================================
      // UPDATE PAYROLL STATUS TO PAID
      // ============================================================================
      const updatePayload = {
        status: 'paid',
        paid_date: paymentDate.toISOString().split('T')[0],
      };

      console.log('💼 Updating Payroll Record:', { id, payload: updatePayload });

      const { error: updateError } = await supabase
        .from('payroll_records')
        .update(updatePayload)
        .eq('id', id);

      if (updateError) {
        console.error('💥 Payroll Update Error:', updateError);
        throw updateError;
      }

      console.log('✅ Payroll record updated successfully');

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PAYROLL
      // Semua saldo dihitung dari journal_entries (tidak perlu cash_history)
      // ============================================================================
      // Jurnal otomatis untuk pembayaran gaji:
      // Dr. Beban Gaji        xxx (gross salary)
      //   Cr. Kas/Bank             xxx (net salary - akun yang dipilih user)
      //   Cr. Panjar Karyawan      xxx (jika ada potongan panjar)
      // ============================================================================
      if (currentBranch?.id) {
        try {
          const deductionAmount = payrollRecord.advance_deduction || payrollRecord.total_deductions || 0;
          const grossSalary = payrollRecord.gross_salary || (payrollRecord.net_salary + deductionAmount);

          const journalResult = await createPayrollJournal({
            payrollId: id,
            payrollDate: paymentDate,
            employeeName: payrollRecord.employee_name,
            grossSalary: grossSalary,
            advanceDeduction: deductionAmount,
            netSalary: payrollRecord.net_salary,
            branchId: currentBranch.id,
            paymentAccountId: paymentAccountId,
            paymentAccountName: accountData?.name,
            paymentAccountCode: accountData?.code,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal payroll auto-generated:', journalResult.journalId);
            console.log('  - Akun pembayaran:', accountData?.name || 'Default Kas');
            console.log('  - Gross Salary:', grossSalary);
            console.log('  - Net Salary:', payrollRecord.net_salary);
            console.log('  - Deduction:', deductionAmount);
          } else {
            console.warn('⚠️ Gagal membuat jurnal payroll otomatis:', journalResult.error);
            // Don't throw - payment still succeeded, just journal failed
          }

          // ============================================================================
          // UPDATE EMPLOYEE_ADVANCES.REMAINING_AMOUNT
          // Kurangi saldo panjar karyawan yang dipotong dari gaji
          // ============================================================================
          if (deductionAmount > 0 && payrollRecord.employee_id) {
            try {
              // Get outstanding advances for this employee (oldest first - FIFO)
              const { data: advances, error: advancesError } = await supabase
                .from('employee_advances')
                .select('id, remaining_amount')
                .eq('employee_id', payrollRecord.employee_id)
                .gt('remaining_amount', 0)
                .order('date', { ascending: true });

              if (!advancesError && advances && advances.length > 0) {
                let remainingDeduction = deductionAmount;

                for (const advance of advances) {
                  if (remainingDeduction <= 0) break;

                  const amountToDeduct = Math.min(remainingDeduction, advance.remaining_amount);
                  const newRemaining = advance.remaining_amount - amountToDeduct;

                  const { error: updateError } = await supabase
                    .from('employee_advances')
                    .update({ remaining_amount: newRemaining })
                    .eq('id', advance.id);

                  if (updateError) {
                    console.error(`Failed to update advance ${advance.id}:`, updateError);
                  } else {
                    console.log(`✅ Panjar ${advance.id} dikurangi: ${advance.remaining_amount} → ${newRemaining}`);
                  }

                  remainingDeduction -= amountToDeduct;
                }
              }
            } catch (advanceError) {
              console.error('Error updating employee advances:', advanceError);
              // Don't throw - payment still succeeded
            }
          }

          // ============================================================================
          // UPDATE COMMISSION_ENTRIES STATUS TO 'paid'
          // Mark all pending commissions for this employee in this period as paid
          // ============================================================================
          if (payrollRecord.employee_id) {
            try {
              // Get period dates for filtering
              const periodStart = new Date(payrollRecord.period_start);
              const periodEnd = new Date(payrollRecord.period_end);
              periodEnd.setHours(23, 59, 59, 999);

              const { data: updatedCommissions, error: commissionUpdateError } = await supabase
                .from('commission_entries')
                .update({ status: 'paid' })
                .eq('user_id', payrollRecord.employee_id)
                .eq('status', 'pending')
                .gte('created_at', periodStart.toISOString())
                .lte('created_at', periodEnd.toISOString())
                .select('id');

              if (commissionUpdateError) {
                console.error('Failed to update commission status:', commissionUpdateError);
              } else {
                console.log(`✅ ${updatedCommissions?.length || 0} commission entries marked as paid`);
              }
            } catch (commissionError) {
              console.error('Error updating commission status:', commissionError);
              // Don't throw - payment still succeeded
            }
          }
        } catch (journalError) {
          console.error('Error creating payroll journal:', journalError);
          // Don't throw - payment still succeeded
        }
      }

      return { payrollRecord };
    },
    onSuccess: async () => {
      // Invalidate all payroll-related queries with exact: false
      await queryClient.invalidateQueries({ queryKey: ['payrollRecords'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['payrollSummary'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['accounts'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['cashFlow'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['cashBalance'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['employeeAdvances'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['journalEntries'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['commissionEntries'], exact: false });

      // Force immediate refetch to update UI
      await queryClient.refetchQueries({
        queryKey: ['payrollRecords'],
        exact: false,
        type: 'active'
      });
      await queryClient.refetchQueries({
        queryKey: ['payrollSummary'],
        exact: false,
        type: 'active'
      });

      toast({
        title: 'Sukses',
        description: 'Pembayaran berhasil diproses',
      });
    },
  });

  const deletePayrollRecord = useMutation({
    mutationFn: async (payrollId: string) => {
      console.log('🗑️ Deleting payroll record:', payrollId);

      // ============================================================================
      // VOID JURNAL PAYROLL (jika ada)
      // Balance otomatis ter-rollback karena dihitung dari journal_entries
      // ============================================================================
      try {
        const { error: voidError } = await supabase
          .from('journal_entries')
          .update({ status: 'voided', is_voided: true, void_reason: 'Payroll record deleted' })
          .eq('reference_id', payrollId)
          .eq('reference_type', 'payroll');

        if (voidError) {
          console.warn('Failed to void payroll journal (may not exist):', voidError.message);
        } else {
          console.log('✅ Payroll journal voided:', payrollId);
        }
      } catch (err) {
        console.warn('Error voiding payroll journal:', err);
      }

      // Delete payroll record
      const { error: deleteError } = await supabase
        .from('payroll_records')
        .delete()
        .eq('id', payrollId);

      if (deleteError) {
        console.error('💥 Delete error:', deleteError);
        throw deleteError;
      }

      console.log('✅ Payroll record deleted:', payrollId);
      return payrollId;
    },
    onSuccess: async () => {
      // Invalidate all payroll-related queries with exact: false to match all variants
      await queryClient.invalidateQueries({ queryKey: ['payrollRecords'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['payrollSummary'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['cashHistory'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['accounts'], exact: false });
      await queryClient.invalidateQueries({ queryKey: ['journalEntries'], exact: false });

      // Force immediate refetch of ALL active payroll queries
      await queryClient.refetchQueries({
        queryKey: ['payrollRecords'],
        exact: false,
        type: 'active'
      });
      await queryClient.refetchQueries({
        queryKey: ['payrollSummary'],
        exact: false,
        type: 'active'
      });

      toast({
        title: 'Sukses',
        description: 'Catatan gaji berhasil dihapus',
      });
    },
    onError: (error: Error) => {
      console.error('Error deleting payroll:', error);
      toast({
        title: 'Error',
        description: `Gagal menghapus catatan gaji: ${error.message}`,
        variant: 'destructive',
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
    deletePayrollRecord,
  };
};

// Hook for Payroll Summary/Dashboard
export const usePayrollSummary = (year?: number, month?: number) => {
  const { currentBranch } = useBranch();

  const { data: summary, isLoading } = useQuery<PayrollSummary>({
    queryKey: ['payrollSummary', year, month, currentBranch?.id],
    queryFn: async () => {
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || (currentDate.getMonth() + 1);

      let query = supabase
        .from('payroll_summary')
        .select('*')
        .eq('period_year', targetYear)
        .eq('period_month', targetMonth);

      // Apply branch filter - ALWAYS filter by selected branch
      if (currentBranch?.id) {
        query = query.eq('branch_id', currentBranch.id);
      }

      const { data, error } = await query;

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
    enabled: !!currentBranch,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true, // Auto-refetch when switching branches
  });

  return {
    summary,
    isLoading,
  };
};