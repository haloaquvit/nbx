import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Account } from '@/types/account'
import { supabase } from '@/integrations/supabase/client'

// Helper to map from DB (snake_case) to App (camelCase)
const fromDbToApp = (dbAccount: any): Account => ({
  id: dbAccount.id,
  name: dbAccount.name,
  type: dbAccount.type,
  balance: Number(dbAccount.balance) || 0, // Ensure balance is a number
  initialBalance: Number(dbAccount.initial_balance) || 0, // Ensure initialBalance is a number
  isPaymentAccount: dbAccount.is_payment_account,
  createdAt: new Date(dbAccount.created_at),
});

// Helper to map from App (camelCase) to DB (snake_case)
const fromAppToDb = (appAccount: Partial<Omit<Account, 'id' | 'createdAt'>>) => {
  const { isPaymentAccount, initialBalance, ...rest } = appAccount as any;
  const dbData: any = { ...rest };
  if (isPaymentAccount !== undefined) {
    dbData.is_payment_account = isPaymentAccount;
  }
  if (initialBalance !== undefined) {
    dbData.initial_balance = initialBalance;
  }
  return dbData;
};

export const useAccounts = () => {
  const queryClient = useQueryClient()

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) throw new Error(error.message);
      return data ? data.map(fromDbToApp) : [];
    }
  })

  const addAccount = useMutation({
    mutationFn: async (newAccountData: Omit<Account, 'id' | 'createdAt'>): Promise<Account> => {
      const dbData = fromAppToDb(newAccountData);
      // Set initial_balance equal to balance when creating new account
      if (!dbData.initial_balance && dbData.balance) {
        dbData.initial_balance = dbData.balance;
      }
      const { data, error } = await supabase
        .from('accounts')
        .insert({ ...dbData, id: `acc-${Date.now()}` })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const updateAccountBalance = useMutation({
    mutationFn: async ({ accountId, amount }: { accountId: string, amount: number }) => {
      const { data: currentAccount, error: fetchError } = await supabase.from('accounts').select('balance').eq('id', accountId).single();
      if (fetchError) throw fetchError;

      // Ensure both values are numbers to prevent string concatenation
      const currentBalance = Number(currentAccount.balance) || 0;
      const amountToAdd = Number(amount) || 0;
      const newBalance = currentBalance + amountToAdd;

      console.log(`Updating account ${accountId}:`, {
        currentBalance,
        amountToAdd,
        newBalance,
        currentBalanceType: typeof currentBalance,
        amountType: typeof amountToAdd
      });

      const { data, error: updateError } = await supabase.from('accounts').update({ balance: newBalance }).eq('id', accountId).select().single();
      if (updateError) throw updateError;
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const updateAccount = useMutation({
    mutationFn: async ({ accountId, newData }: { accountId: string, newData: Partial<Account> }) => {
      const dbData = fromAppToDb(newData);
      const { data, error } = await supabase.from('accounts').update(dbData).eq('id', accountId).select().single();
      if (error) throw error;
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const updateInitialBalance = useMutation({
    mutationFn: async ({ accountId, initialBalance }: { accountId: string, initialBalance: number }) => {
      // Get current balance and calculate the difference
      const { data: currentAccount, error: fetchError } = await supabase
        .from('accounts')
        .select('balance, initial_balance')
        .eq('id', accountId)
        .single();
      
      if (fetchError) throw fetchError;

      // Calculate how much the balance should change
      const balanceDifference = initialBalance - (currentAccount.initial_balance || 0);
      const newBalance = currentAccount.balance + balanceDifference;

      // Update both initial_balance and balance
      const { data, error } = await supabase
        .from('accounts')
        .update({ 
          initial_balance: initialBalance,
          balance: newBalance 
        })
        .eq('id', accountId)
        .select()
        .single();
        
      if (error) throw error;
      return fromDbToApp(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    }
  })

  const deleteAccount = useMutation({
    mutationFn: async (accountId: string): Promise<void> => {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return {
    accounts,
    isLoading,
    addAccount,
    updateAccountBalance,
    updateAccount,
    updateInitialBalance,
    deleteAccount,
  }
}