/**
 * useJournalService Hook
 *
 * Hook untuk menggunakan journal service dengan branch context.
 * Menyediakan fungsi-fungsi untuk auto-generate jurnal dari transaksi.
 */

import { useCallback } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useToast } from '@/components/ui/use-toast';
import {
  createSalesJournal,
  createExpenseJournal,
  createAdvanceJournal,
  createPayrollJournal,
  createReceivablePaymentJournal,
  createPayablePaymentJournal,
  createTransferJournal,
} from '@/services/journalService';

export function useJournalService() {
  const { currentBranch } = useBranch();
  const { toast } = useToast();

  /**
   * Create journal for sales transaction
   */
  const createSalesEntry = useCallback(async (params: {
    transactionId: string;
    transactionNumber: string;
    transactionDate: Date;
    totalAmount: number;
    paymentMethod: 'cash' | 'credit' | 'transfer';
    customerName?: string;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal penjualan');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createSalesJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal penjualan:', result.error);
    } else {
      console.log('✅ Jurnal penjualan berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for expense
   */
  const createExpenseEntry = useCallback(async (params: {
    expenseId: string;
    expenseDate: Date;
    amount: number;
    categoryName: string;
    description: string;
    expenseAccountId?: string; // Akun beban spesifik
    cashAccountId?: string; // Akun sumber dana (Kas Kecil, Kas Operasional, Bank, dll)
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal pengeluaran');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createExpenseJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal pengeluaran:', result.error);
    } else {
      console.log('✅ Jurnal pengeluaran berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for employee advance (panjar)
   */
  const createAdvanceEntry = useCallback(async (params: {
    advanceId: string;
    advanceDate: Date;
    amount: number;
    employeeName: string;
    type: 'given' | 'returned';
    description?: string;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal panjar');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createAdvanceJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal panjar:', result.error);
    } else {
      console.log('✅ Jurnal panjar berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for payroll
   */
  const createPayrollEntry = useCallback(async (params: {
    payrollId: string;
    payrollDate: Date;
    employeeName: string;
    grossSalary: number;
    advanceDeduction: number;
    netSalary: number;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal gaji');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createPayrollJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal gaji:', result.error);
    } else {
      console.log('✅ Jurnal gaji berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for receivable payment
   */
  const createReceivablePaymentEntry = useCallback(async (params: {
    receivableId: string;
    paymentDate: Date;
    amount: number;
    customerName: string;
    invoiceNumber?: string;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal pembayaran piutang');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createReceivablePaymentJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal pembayaran piutang:', result.error);
    } else {
      console.log('✅ Jurnal pembayaran piutang berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for payable payment
   */
  const createPayablePaymentEntry = useCallback(async (params: {
    payableId: string;
    paymentDate: Date;
    amount: number;
    supplierName: string;
    invoiceNumber?: string;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal pembayaran hutang');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createPayablePaymentJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal pembayaran hutang:', result.error);
    } else {
      console.log('✅ Jurnal pembayaran hutang berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  /**
   * Create journal for account transfer
   */
  const createTransferEntry = useCallback(async (params: {
    transferId: string;
    transferDate: Date;
    amount: number;
    fromAccountId: string;
    fromAccountCode: string;
    fromAccountName: string;
    toAccountId: string;
    toAccountCode: string;
    toAccountName: string;
    description?: string;
  }) => {
    if (!currentBranch?.id) {
      console.error('Branch ID tidak tersedia untuk jurnal transfer');
      return { success: false, error: 'Branch ID tidak tersedia' };
    }

    const result = await createTransferJournal({
      ...params,
      branchId: currentBranch.id,
    });

    if (!result.success) {
      console.error('Gagal membuat jurnal transfer:', result.error);
    } else {
      console.log('✅ Jurnal transfer berhasil dibuat:', result.journalId);
    }

    return result;
  }, [currentBranch?.id]);

  return {
    branchId: currentBranch?.id,
    createSalesEntry,
    createExpenseEntry,
    createAdvanceEntry,
    createPayrollEntry,
    createReceivablePaymentEntry,
    createPayablePaymentEntry,
    createTransferEntry,
  };
}
