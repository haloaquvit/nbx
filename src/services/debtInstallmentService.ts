import { supabase } from '@/integrations/supabase/client';
import { DebtInstallment, GenerateInstallmentInput } from '@/types/accountsPayable';
// journalService removed - now using RPC for all journal operations

/**
 * Service untuk mengelola jadwal angsuran hutang
 * - Generate jadwal cicilan berdasarkan tenor dan bunga
 * - Proses pembayaran angsuran dengan auto-generate jurnal
 */

// Convert dari database format ke app format
const fromDb = (dbInstallment: any): DebtInstallment => ({
  id: dbInstallment.id,
  debtId: dbInstallment.debt_id,
  installmentNumber: dbInstallment.installment_number,
  dueDate: new Date(dbInstallment.due_date),
  principalAmount: Number(dbInstallment.principal_amount) || 0,
  interestAmount: Number(dbInstallment.interest_amount) || 0,
  totalAmount: Number(dbInstallment.total_amount) || 0,
  status: dbInstallment.status,
  paidAt: dbInstallment.paid_at ? new Date(dbInstallment.paid_at) : undefined,
  paidAmount: dbInstallment.paid_amount ? Number(dbInstallment.paid_amount) : undefined,
  paymentAccountId: dbInstallment.payment_account_id,
  notes: dbInstallment.notes,
  branchId: dbInstallment.branch_id,
  createdAt: new Date(dbInstallment.created_at),
});

/**
 * Calculate monthly installment with interest
 * Supports: flat, per_month, per_year interest types
 */
function calculateInstallments(input: GenerateInstallmentInput): Omit<DebtInstallment, 'id' | 'createdAt'>[] {
  const { principal, interestRate, interestType, tenorMonths, startDate, debtId, branchId } = input;
  const installments: Omit<DebtInstallment, 'id' | 'createdAt'>[] = [];

  // Calculate principal per month
  const monthlyPrincipal = principal / tenorMonths;

  // Calculate interest based on type
  let totalInterest = 0;
  if (interestType === 'flat') {
    // Flat interest: total interest = principal * rate / 100
    totalInterest = principal * (interestRate / 100);
  } else if (interestType === 'per_month') {
    // Per month: total interest = principal * rate/100 * tenor
    totalInterest = principal * (interestRate / 100) * tenorMonths;
  } else if (interestType === 'per_year') {
    // Per year: convert to monthly first, then multiply by tenor
    const monthlyRate = interestRate / 12;
    totalInterest = principal * (monthlyRate / 100) * tenorMonths;
  }

  const monthlyInterest = totalInterest / tenorMonths;

  // Generate installments for each month
  for (let i = 1; i <= tenorMonths; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);

    // For decreasing interest type (bunga menurun), calculate based on remaining principal
    let interestForMonth = monthlyInterest;
    if (interestType === 'per_month' || interestType === 'per_year') {
      // Simple interest per month (could be enhanced for decreasing)
      interestForMonth = monthlyInterest;
    }

    installments.push({
      debtId,
      installmentNumber: i,
      dueDate,
      principalAmount: Math.round(monthlyPrincipal),
      interestAmount: Math.round(interestForMonth),
      totalAmount: Math.round(monthlyPrincipal + interestForMonth),
      status: 'pending',
      branchId,
    });
  }

  // Adjust last installment for rounding differences
  if (installments.length > 0) {
    const totalPrincipalGenerated = installments.reduce((sum, i) => sum + i.principalAmount, 0);
    const principalDiff = principal - totalPrincipalGenerated;
    if (principalDiff !== 0) {
      installments[installments.length - 1].principalAmount += principalDiff;
      installments[installments.length - 1].totalAmount += principalDiff;
    }
  }

  return installments;
}

export const DebtInstallmentService = {
  /**
   * Generate jadwal angsuran untuk hutang
   */
  async generateInstallments(input: GenerateInstallmentInput): Promise<{ success: boolean; installments?: DebtInstallment[]; error?: string }> {
    try {
      // Check if installments already exist for this debt
      const { data: existing } = await supabase
        .from('debt_installments')
        .select('id')
        .eq('debt_id', input.debtId)
        .limit(1);

      if (existing && existing.length > 0) {
        return { success: false, error: 'Jadwal angsuran sudah ada untuk hutang ini' };
      }

      // Calculate installments
      const calculatedInstallments = calculateInstallments(input);

      // Insert all installments
      const insertData = calculatedInstallments.map(inst => ({
        debt_id: inst.debtId,
        installment_number: inst.installmentNumber,
        due_date: inst.dueDate.toISOString(),
        principal_amount: inst.principalAmount,
        interest_amount: inst.interestAmount,
        total_amount: inst.totalAmount,
        status: inst.status,
        branch_id: inst.branchId,
      }));

      const { data, error } = await supabase
        .from('debt_installments')
        .insert(insertData)
        .select();

      if (error) throw error;

      // Update accounts_payable with tenor_months
      await supabase
        .from('accounts_payable')
        .update({ tenor_months: input.tenorMonths })
        .eq('id', input.debtId);

      return {
        success: true,
        installments: data?.map(fromDb) || [],
      };
    } catch (error: any) {
      console.error('[DebtInstallmentService] Error generating installments:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Get jadwal angsuran untuk hutang tertentu
   */
  async getInstallments(debtId: string): Promise<DebtInstallment[]> {
    try {
      const { data, error } = await supabase
        .from('debt_installments')
        .select('*')
        .eq('debt_id', debtId)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      return data?.map(fromDb) || [];
    } catch (error) {
      console.error('[DebtInstallmentService] Error fetching installments:', error);
      return [];
    }
  },

  /**
   * Bayar angsuran - menggunakan RPC atomic untuk menghindari race condition
   * RPC menangani: update installment + update accounts_payable + create journal
   * dalam 1 transaksi database (otomatis rollback jika gagal)
   */
  async payInstallment(params: {
    installmentId: string;
    paymentAccountId: string;
    liabilityAccountId?: string; // DEPRECATED: Not used by RPC - hutang account is auto-detected
    branchId: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Use atomic RPC - handles everything in single DB transaction
      const { data: rpcResultRaw, error: rpcError } = await supabase
        .rpc('pay_debt_installment_atomic', {
          p_installment_id: params.installmentId,
          p_branch_id: params.branchId,
          p_payment_account_id: params.paymentAccountId,
          p_notes: params.notes || null,
        });

      const rpcResult = Array.isArray(rpcResultRaw) ? rpcResultRaw[0] : rpcResultRaw;

      if (rpcError || !rpcResult?.success) {
        console.error('[DebtInstallmentService] RPC Error:', rpcError?.message || rpcResult?.error_message);
        throw new Error(rpcError?.message || rpcResult?.error_message || 'Gagal membayar angsuran');
      }

      console.log('[DebtInstallmentService] Payment processed via atomic RPC:', {
        installmentId: rpcResult.installment_id,
        debtId: rpcResult.debt_id,
        journalId: rpcResult.journal_id,
        remainingDebt: rpcResult.remaining_debt
      });

      return { success: true };
    } catch (error: any) {
      console.error('[DebtInstallmentService] Error paying installment:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Delete jadwal angsuran untuk hutang (only if none are paid)
   */
  async deleteInstallments(debtId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if any installments are paid
      const { data: paidInstallments } = await supabase
        .from('debt_installments')
        .select('id')
        .eq('debt_id', debtId)
        .eq('status', 'paid')
        .limit(1);

      if (paidInstallments && paidInstallments.length > 0) {
        return { success: false, error: 'Tidak dapat menghapus jadwal yang sudah ada pembayaran' };
      }

      const { error } = await supabase
        .from('debt_installments')
        .delete()
        .eq('debt_id', debtId);

      if (error) throw error;

      // Reset tenor_months on debt
      await supabase
        .from('accounts_payable')
        .update({ tenor_months: null })
        .eq('id', debtId);

      return { success: true };
    } catch (error: any) {
      console.error('[DebtInstallmentService] Error deleting installments:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Update status angsuran yang sudah jatuh tempo menjadi overdue
   * Uses RPC to avoid 401 Unauthorized errors
   */
  async updateOverdueStatus(): Promise<void> {
    try {
      const { data: resultRaw, error } = await supabase
        .rpc('update_overdue_installments_atomic');

      const result = Array.isArray(resultRaw) ? resultRaw[0] : resultRaw;

      if (error) {
        console.error('[DebtInstallmentService] RPC Error:', error);
        return;
      }

      if (result?.success) {
        console.log(`[DebtInstallmentService] Updated ${result.updated_count} overdue installments`);
      } else {
        console.error('[DebtInstallmentService] RPC failed:', result?.error_message);
      }
    } catch (error) {
      console.error('[DebtInstallmentService] Error updating overdue status:', error);
    }
  },

  /**
   * Get summary angsuran untuk dashboard
   */
  async getInstallmentSummary(branchId?: string): Promise<{
    totalPending: number;
    totalOverdue: number;
    nextDueDate?: Date;
    nextDueAmount?: number;
  }> {
    try {
      let query = supabase
        .from('debt_installments')
        .select('*')
        .in('status', ['pending', 'overdue']);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data } = await query;

      if (!data) return { totalPending: 0, totalOverdue: 0 };

      const pending = data.filter(i => i.status === 'pending');
      const overdue = data.filter(i => i.status === 'overdue');

      // Find next due installment
      const sortedPending = pending.sort((a, b) =>
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );

      return {
        totalPending: pending.reduce((sum, i) => sum + Number(i.total_amount), 0),
        totalOverdue: overdue.reduce((sum, i) => sum + Number(i.total_amount), 0),
        nextDueDate: sortedPending[0] ? new Date(sortedPending[0].due_date) : undefined,
        nextDueAmount: sortedPending[0] ? Number(sortedPending[0].total_amount) : undefined,
      };
    } catch (error) {
      console.error('[DebtInstallmentService] Error getting summary:', error);
      return { totalPending: 0, totalOverdue: 0 };
    }
  },
};
