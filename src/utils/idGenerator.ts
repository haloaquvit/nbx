import { supabase } from '@/integrations/supabase/client';

interface GenerateIdParams {
  branchName?: string;
  tableName: string;
  pageCode: string;
  branchId?: string | null;
}

/**
 * Generate standardized ID format: [PREFIX]-[MODULE]-[PAGE]-[NUMBER]
 * Example: KAN-HT-AP-0001, EKS-TR-PO-0023, COM-AS-MT-0005
 *
 * @param branchName - Name of the branch (first 3 letters will be used)
 * @param tableName - Database table name for counting
 * @param pageCode - Page/module code (e.g., 'AP' for Accounts Payable, 'PO' for Purchase Order)
 * @param branchId - Optional branch ID for filtering count
 * @returns Promise<string> - Generated ID
 */
export async function generateSequentialId({
  branchName,
  tableName,
  pageCode,
  branchId = null,
}: GenerateIdParams): Promise<string> {
  // Generate branch prefix (3 letters)
  const branchPrefix = branchName
    ? branchName.substring(0, 3).toUpperCase().replace(/\s/g, '')
    : 'COM';

  // Get count for sequential number
  const query = supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  // Filter by branch if provided
  if (branchId !== undefined) {
    query.eq('branch_id', branchId);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error getting count for ID generation:', error);
    // Fallback to timestamp-based ID if count fails
    const timestamp = Date.now().toString().slice(-6);
    return `${branchPrefix}-${pageCode}-${timestamp}`;
  }

  const sequentialNumber = String((count || 0) + 1).padStart(4, '0');
  return `${branchPrefix}-${pageCode}-${sequentialNumber}`;
}

/**
 * Extract module code from table name or use custom mapping
 */
export function getModuleCodeFromTable(tableName: string): string {
  const moduleMap: Record<string, string> = {
    'accounts_payable': 'HT-AP',
    'purchase_orders': 'TR-PO',
    'transactions': 'TR-TX',
    'expenses': 'KU-EX',
    'employees': 'KR-EM',
    'employee_advances': 'KR-AD',
    'commissions': 'KM-CM',
    'assets': 'AS-AS',
    'maintenance': 'AS-MT',
    'production_records': 'PR-PR',
    'customers': 'CU-CS',
    'retasi': 'RT-RT',
    'zakat': 'ZK-ZK',
    'accounts': 'AK-AC',
    'cash_history': 'KA-CH',
  };

  return moduleMap[tableName] || 'GN-XX';
}
