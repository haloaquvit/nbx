import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://emfvoassfrsokqwspuml.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtZnZvYXNzZnJzb2txd3NwdW1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3MzM2MiwiZXhwIjoyMDcwODQ5MzYyfQ.zLCJYmJUL0C6wYQAVqn9jFJZjMDK-UGNLnYJLXiE7Lc'; // Use service role key for DDL operations

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAccountsPayableTable() {
  console.log('🛠️ Creating accounts_payable table...');

  try {
    // Create the table using raw SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create accounts payable table
        CREATE TABLE IF NOT EXISTS public.accounts_payable (
            id text PRIMARY KEY,
            purchase_order_id text,
            supplier_name text NOT NULL,
            amount numeric NOT NULL,
            due_date timestamptz,
            description text NOT NULL,
            status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
            created_at timestamptz DEFAULT now(),
            paid_at timestamptz,
            paid_amount numeric DEFAULT 0,
            payment_account_id text,
            notes text
        );

        -- Create indexes for better query performance
        CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON public.accounts_payable(purchase_order_id);
        CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
        CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON public.accounts_payable(created_at);

        -- Enable RLS
        ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;

        -- Create policy for authenticated users
        CREATE POLICY IF NOT EXISTS "Authenticated users can manage accounts payable"
        ON public.accounts_payable FOR ALL
        USING (auth.role() = 'authenticated');

        SELECT 'accounts_payable table created successfully' as result;
      `
    });

    if (error) {
      console.error('❌ Error creating table:', error);
    } else {
      console.log('✅ accounts_payable table created successfully');
      console.log('Result:', data);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Alternative method using individual commands
async function createTableDirect() {
  console.log('🛠️ Creating accounts_payable table using direct SQL...');

  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.accounts_payable (
        id text PRIMARY KEY,
        purchase_order_id text,
        supplier_name text NOT NULL,
        amount numeric NOT NULL,
        due_date timestamptz,
        description text NOT NULL,
        status text NOT NULL DEFAULT 'Outstanding' CHECK (status IN ('Outstanding', 'Paid', 'Partial')),
        created_at timestamptz DEFAULT now(),
        paid_at timestamptz,
        paid_amount numeric DEFAULT 0,
        payment_account_id text,
        notes text
    );
  `;

  const { data, error } = await supabase.rpc('exec_sql', { sql: createTableSQL });

  if (error) {
    console.error('❌ Error creating table:', error);
    return false;
  }

  console.log('✅ Table created, adding indexes...');

  const indexSQL = `
    CREATE INDEX IF NOT EXISTS idx_accounts_payable_po_id ON public.accounts_payable(purchase_order_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON public.accounts_payable(status);
    CREATE INDEX IF NOT EXISTS idx_accounts_payable_created_at ON public.accounts_payable(created_at);
  `;

  const { data: indexData, error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL });

  if (indexError) {
    console.error('❌ Error creating indexes:', indexError);
    return false;
  }

  console.log('✅ Indexes created, enabling RLS...');

  const rlsSQL = `
    ALTER TABLE public.accounts_payable ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Authenticated users can manage accounts payable" ON public.accounts_payable;
    CREATE POLICY "Authenticated users can manage accounts payable"
    ON public.accounts_payable FOR ALL
    USING (auth.role() = 'authenticated');
  `;

  const { data: rlsData, error: rlsError } = await supabase.rpc('exec_sql', { sql: rlsSQL });

  if (rlsError) {
    console.error('❌ Error setting up RLS:', rlsError);
    return false;
  }

  console.log('✅ RLS configured successfully');
  return true;
}

// First, let's check if exec_sql function exists
async function checkExecSql() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1 as test;' });

  if (error) {
    console.log('❌ exec_sql function not available, trying alternative...');
    return false;
  } else {
    console.log('✅ exec_sql function available');
    return true;
  }
}

async function main() {
  const canUseExecSql = await checkExecSql();

  if (canUseExecSql) {
    await createTableDirect();
  } else {
    console.log('❌ Cannot create table directly. Need to use migration files.');
    console.log('🔄 Trying to apply specific migration 0104...');
  }

  // Verify table was created
  console.log('🔍 Verifying table creation...');
  const { data: verifyData, error: verifyError } = await supabase
    .from('accounts_payable')
    .select('*')
    .limit(1);

  if (verifyError) {
    console.log('❌ Table still not accessible:', verifyError.message);
  } else {
    console.log('✅ accounts_payable table is now accessible!');
  }
}

main();