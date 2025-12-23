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
          branch_id: currentBranch?.id || null,
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

      // Get current user from context (works with both Supabase and PostgREST)
      if (!authUser) throw new Error('User not authenticated');

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
        user_id: authUser.id,
        user_name: authUser.name || authUser.email || 'Admin',
        branch_id: currentBranch?.id || null,
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

      // ============================================================================
      // BALANCE UPDATE LANGSUNG DIHAPUS
      // Semua saldo sekarang dihitung dari journal_entries
      // Beban Gaji, Kas, Panjar Karyawan semua di-jurnal via createPayrollJournal
      // ============================================================================

      // ============================================================================
      // AUTO-GENERATE JOURNAL ENTRY FOR PAYROLL
      // ============================================================================
      // Jurnal otomatis untuk pembayaran gaji:
      // Dr. Beban Gaji        xxx
      //   Cr. Kas/Bank             xxx
      //   Cr. Panjar Karyawan      xxx (jika ada potongan panjar)
      // ============================================================================
      if (currentBranch?.id) {
        try {
          const deductionAmount = payrollRecord.deduction_amount || 0;
          const journalResult = await createPayrollJournal({
            payrollId: id,
            payrollDate: paymentDate,
            employeeName: payrollRecord.employee_name,
            grossSalary: payrollRecord.gross_salary || payrollRecord.net_salary + deductionAmount,
            advanceDeduction: deductionAmount,
            netSalary: payrollRecord.net_salary,
            branchId: currentBranch.id,
          });

          if (journalResult.success) {
            console.log('✅ Jurnal payroll auto-generated:', journalResult.journalId);
          } else {
            console.warn('⚠️ Gagal membuat jurnal payroll otomatis:', journalResult.error);
          }
        } catch (journalError) {
          console.error('Error creating payroll journal:', journalError);
        }
      }

      // Log advance deduction info for debugging
      const deductionAmount = payrollRecord.deduction_amount || 0;
      if (deductionAmount > 0) {
        console.log('💰 ADVANCE DEDUCTION INFO:');
        console.log('  - Payroll ID:', id);
        console.log('  - Employee:', payrollRecord.employee_name);
        console.log('  - Deduction Amount:', deductionAmount);
        console.log('  - Status changed to: paid');
        console.log('  - Database trigger should now process advance repayment automatically');
        console.log('  - Check database logs for trigger execution: payroll_advance_repayment_trigger');

        // Verify advance repayment was created (check after short delay for trigger to complete)
        setTimeout(async () => {
          try {
            const { data: recentRepayments, error: repaymentError } = await supabase
              .from('advance_repayments')
              .select('*')
              .eq('recorded_by', payrollRecord.created_by)
              .order('date', { ascending: false })
              .limit(5);

            if (repaymentError) {
              console.warn('⚠️ Could not verify advance repayments:', repaymentError);
            } else {
              console.log('📋 Recent advance repayments for verification:', recentRepayments);

              // Check if any repayment was created for this payroll period
              const payrollMonthStr = `${payrollRecord.period_month}`;
              const relatedRepayments = recentRepayments?.filter(r =>
                r.notes?.includes(payrollMonthStr) || r.notes?.includes('gaji')
              );

              if (relatedRepayments && relatedRepayments.length > 0) {
                console.log('✅ Advance repayment(s) found for this payroll:', relatedRepayments);
              } else {
                console.warn('⚠️ No advance repayment found - trigger may not have executed');
                console.warn('   Please check:');
                console.warn('   1. Database trigger payroll_advance_repayment_trigger is enabled');
                console.warn('   2. Account Piutang Karyawan (code 1220) exists');
                console.warn('   3. Employee has outstanding advances');
              }
            }
          } catch (verifyError) {
            console.warn('⚠️ Verification check failed:', verifyError);
          }
        }, 1000);
      } else {
        console.log('ℹ️ No advance deduction for this payroll (deduction_amount = 0)');
      }

      return { payrollRecord, cashHistoryData };
    },
    onSuccess: async () => {
      // Invalidate all payroll-related queries (like piutang system)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['payrollRecords'] }),
        queryClient.invalidateQueries({ queryKey: ['payrollSummary'] }),
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['cashFlow'] }),
        queryClient.invalidateQueries({ queryKey: ['cashBalance'] }),
        queryClient.invalidateQueries({ queryKey: ['employeeAdvances'] }), // For advance deduction updates
        queryClient.invalidateQueries({ queryKey: ['journalEntries'] }), // For auto-generated journal
      ]);

      // Force immediate refetch to update UI without waiting for background refetch
      await queryClient.refetchQueries({
        queryKey: ['payrollRecords'],
        type: 'active' // Only refetch currently mounted queries
      });

      toast({
        title: 'Success',
        description: 'Payment processed successfully',
      });
    },
  });

  const deletePayrollRecord = useMutation({
    mutationFn: async (payrollId: string) => {
      // Get payroll record details first
      const { data: payrollRecord, error: fetchError } = await supabase
        .from('payroll_records')
        .select('*, employee_id, net_salary, status')
        .eq('id', payrollId)
        .single();

      if (fetchError) throw fetchError;

      // ============================================================================
      // VOID JURNAL PAYROLL
      // Balance otomatis ter-rollback karena dihitung dari journal_entries
      // ============================================================================
      try {
        const { error: voidError } = await supabase
          .from('journal_entries')
          .update({ status: 'voided' })
          .eq('reference_id', payrollId)
          .eq('reference_type', 'payroll');

        if (voidError) {
          console.error('Failed to void payroll journal:', voidError.message);
        } else {
          console.log('✅ Payroll journal voided:', payrollId);
        }
      } catch (err) {
        console.error('Error voiding payroll journal:', err);
      }

      // If payroll was paid, delete cash_history record (untuk monitoring saja)
      if (payrollRecord.status === 'paid') {
        // Delete cash_history record
        const { error: cashError } = await supabase
          .from('cash_history')
          .delete()
          .eq('reference_id', payrollId)
          .eq('type', 'gaji_karyawan');

        if (cashError) {
          console.warn('Failed to delete cash history:', cashError);
          // Try alternative type
          await supabase
            .from('cash_history')
            .delete()
            .eq('reference_id', payrollId)
            .eq('type', 'kas_keluar_manual');
        }
      }

      // Delete payroll record
      const { error: deleteError } = await supabase
        .from('payroll_records')
        .delete()
        .eq('id', payrollId);

      if (deleteError) throw deleteError;

      return payrollId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payrollRecords'] });
      queryClient.invalidateQueries({ queryKey: ['payrollSummary'] });
      queryClient.invalidateQueries({ queryKey: ['cashHistory'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      toast({
        title: 'Success',
        description: 'Payroll record deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to delete payroll record: ${error.message}`,
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