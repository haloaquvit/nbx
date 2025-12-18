import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

export interface ExpenseCategoryMapping {
  id: number;
  categoryName: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  createdAt: Date;
}

export interface ExpenseAccountInfo {
  accountId: string;
  accountCode: string;
  accountName: string;
}

// Hook to get all expense category mappings
export const useExpenseCategories = () => {
  const { data: categories, isLoading } = useQuery<ExpenseCategoryMapping[]>({
    queryKey: ['expenseCategories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_category_mapping')
        .select('*')
        .order('category_name');
      
      if (error) throw new Error(error.message);
      
      return data ? data.map(item => ({
        id: item.id,
        categoryName: item.category_name,
        accountId: item.account_id,
        accountCode: item.account_code,
        accountName: item.account_name,
        createdAt: new Date(item.created_at)
      })) : [];
    }
  });

  return { categories, isLoading };
};

// Function to get expense account for a category
export const getExpenseAccountForCategory = async (categoryName: string): Promise<ExpenseAccountInfo> => {
  const { data, error } = await supabase
    .rpc('get_expense_account_for_category', { category_name: categoryName });
  
  if (error) {
    console.error('Error getting expense account for category:', error);
    // Return default account for Beban Lain-lain
    return {
      accountId: 'acc-6900',
      accountCode: '6900',
      accountName: 'Beban Lain-lain'
    };
  }
  
  if (data && data.length > 0) {
    return {
      accountId: data[0].account_id,
      accountCode: data[0].account_code,
      accountName: data[0].account_name
    };
  }
  
  // Default fallback
  return {
    accountId: 'acc-6900',
    accountCode: '6900', 
    accountName: 'Beban Lain-lain'
  };
};

// Get predefined expense categories (grouped by type)
export const getExpenseCategoryOptions = () => {
  return {
    // Kategori untuk Pembelian Persediaan (BUKAN HPP - hanya tracking cash flow)
    // HPP dihitung dari pemakaian aktual (material_stock_movements)
    persediaan: [
      'Pembelian Bahan',
      'Pembayaran PO',
      'Pembayaran Utang',
    ],
    // Kategori untuk Biaya Operasional
    operasional: [
      'Gaji',
      'Operasional',
      'Administrasi',
      'Listrik',
      'Transportasi',
      'Komunikasi',
      'Pemeliharaan',
      'Komisi',
      'Penghapusan Piutang',
      'Lain-lain'
    ]
  };
};

// Check if a category is for inventory purchases (NOT for HPP calculation)
export const isInventoryPurchaseCategory = (category: string): boolean => {
  const categories = getExpenseCategoryOptions();
  return categories.persediaan.includes(category);
};

// Get all expense categories as a flat array
export const getAllExpenseCategories = (): string[] => {
  const categories = getExpenseCategoryOptions();
  return [...categories.persediaan, ...categories.operasional];
};