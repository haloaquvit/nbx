import { supabase } from '@/integrations/supabase/client';
import { DebtInstallment, GenerateInstallmentInput } from '@/types/accountsPayable';
import { createPayablePaymentJournal } from './journalService';

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
   * Bayar angsuran - auto generate jurnal dan update status
   */
  async payInstallment(params: {
    installmentId: string;
    paymentAccountId: string;
    liabilityAccountId: string;
    branchId: string;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Get installment data
      const { data: installmentData, error: fetchError } = await supabase
        .from('debt_installments')
        .select('*, accounts_payable:debt_id(id, supplier_name, description)')
        .eq('id', params.installmentId)
        .single();

      if (fetchError || !installmentData) {
        throw new Error('Angsuran tidak ditemukan');
      }

      const installment = fromDb(installmentData);
      const debt = (installmentData as any).accounts_payable;

      // Update installment status
      const paymentDate = new Date();
      const { error: updateError } = await supabase
        .from('debt_installments')
        .update({
          status: 'paid',
          paid_at: paymentDate.toISOString(),
          paid_amount: installment.totalAmount,
          payment_account_id: params.paymentAccountId,
          notes: params.notes,
        })
        .eq('id', params.installmentId);

      if (updateError) throw updateError;

      // Update accounts_payable paid_amount
      const { data: currentDebt } = await supabase
        .from('accounts_payable')
        .select('paid_amount, amount')
        .eq('id', installment.debtId)
        .single();

      if (currentDebt) {
        const newPaidAmount = (currentDebt.paid_amount || 0) + installment.totalAmount;
        const newStatus = newPaidAmount >= currentDebt.amount ? 'Paid' : 'Partial';

        await supabase
          .from('accounts_payable')
          .update({
            paid_amount: newPaidAmount,
            status: newStatus,
            paid_at: newStatus === 'Paid' ? paymentDate.toISOString() : null,
          })
          .eq('id', installment.debtId);
      }

      // Create journal entry for payment
      const journalResult = await createPayablePaymentJournal({
        payableId: installment.debtId,
        paymentDate,
        amount: installment.totalAmount,
        supplierName: debt?.supplier_name || 'Kreditor',
        invoiceNumber: `Angsuran #${installment.installmentNumber}`,
        branchId: params.branchId,
        paymentAccountId: params.paymentAccountId,
        liabilityAccountId: params.liabilityAccountId,
      });

      if (!journalResult.success) {
        console.warn('[DebtInstallmentService] Journal creation warning:', journalResult.error);
      }

      console.log(`[DebtInstallmentService] Installment #${installment.installmentNumber} paid successfully`);

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
   */
  async updateOverdueStatus(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await supabase
        .from('debt_installments')
        .update({ status: 'overdue' })
        .eq('status', 'pending')
        .lt('due_date', today.toISOString());

      console.log('[DebtInstallmentService] Updated overdue installments');
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
