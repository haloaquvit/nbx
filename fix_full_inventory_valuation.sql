
-- 1. Create Temporary Table for Calculation (Products & Materials)
CREATE TEMP TABLE temp_inventory_valuation AS

-- A. PRODUCTS VALUATION
WITH product_stock_data AS (
    SELECT 
        p.id as item_id,
        p.name as item_name,
        'product' as item_type,
        p.branch_id,
        COALESCE(s.current_stock, 0) as real_stock,
        COALESCE(p.cost_price, 0) as unit_cost
    FROM products p
    LEFT JOIN v_product_current_stock s ON p.id = s.product_id
),
-- B. MATERIALS VALUATION
material_stock_data AS (
    SELECT 
        m.id as item_id,
        m.name as item_name,
        'material' as item_type,
        m.branch_id,
        COALESCE(m.stock, 0) as real_stock,
        COALESCE(m.price_per_unit, 0) as unit_cost
    FROM materials m
),
combined_stock AS (
    SELECT * FROM product_stock_data
    UNION ALL
    SELECT * FROM material_stock_data
),
inventory_accounts AS (
    -- 1310 for Products, 1320 for Materials
    SELECT id, branch_id, code FROM accounts WHERE code IN ('1310', '1320')
)
SELECT 
    cs.item_id,
    cs.item_name,
    cs.item_type,
    cs.branch_id,
    cs.real_stock,
    cs.unit_cost,
    (cs.real_stock * cs.unit_cost) as total_valuation,
    ia.id as target_account_id
FROM combined_stock cs
LEFT JOIN inventory_accounts ia ON cs.branch_id = ia.branch_id 
    AND (
        (cs.item_type = 'product' AND ia.code = '1310') OR 
        (cs.item_type = 'material' AND ia.code = '1320')
    );

-- 2. Create Adjustment Journal to Match Valuation
DO $$
DECLARE
    r RECORD;
    v_journal_id UUID;
    v_current_journal_balance NUMERIC;
    v_adjustment_needed NUMERIC;
    v_modal_acc_id TEXT;  -- Changed from UUID to TEXT
    v_acc_code TEXT;
BEGIN
    -- Loop through each Branch and Account Type (1310/1320)
    FOR r IN 
        SELECT branch_id, target_account_id, SUM(total_valuation) as target_val 
        FROM temp_inventory_valuation 
        WHERE target_account_id IS NOT NULL 
        GROUP BY branch_id, target_account_id 
    LOOP
        
        -- Get current journal balance for this account
        SELECT COALESCE(SUM(
            CASE 
                -- Asset accounts: Debit - Credit
                WHEN a.type IN ('Aset', 'Asset', 'Harta') THEN jel.debit_amount - jel.credit_amount
                ELSE jel.debit_amount - jel.credit_amount -- Default fallback
            END
        ), 0)
        INTO v_current_journal_balance
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN accounts a ON jel.account_id = a.id
        WHERE jel.account_id = r.target_account_id
        AND je.status = 'posted' AND je.is_voided = false;
        
        v_adjustment_needed := r.target_val - v_current_journal_balance;
        
        -- Get account code for logging
        SELECT code INTO v_acc_code FROM accounts WHERE id = r.target_account_id;
        
        RAISE NOTICE 'Branch: %, Account: %, Target: %, Current: %, Adj: %', 
            r.branch_id, v_acc_code, r.target_val, v_current_journal_balance, v_adjustment_needed;
        
        IF v_adjustment_needed <> 0 THEN
            -- Find Equity/Capital Account (Modal 3100) to balance
            SELECT id INTO v_modal_acc_id FROM accounts WHERE code = '3100' AND branch_id = r.branch_id LIMIT 1;
            
            IF v_modal_acc_id IS NOT NULL THEN
                INSERT INTO journal_entries (
                    entry_number, entry_date, description, reference_type, branch_id, status, total_debit, total_credit, created_at
                ) VALUES (
                    'ADJ-VAL-' || v_acc_code || '-' || to_char(now(), 'YYMMDDHH24MI') || '-' || floor(random() * 1000)::text,
                    now(),
                    'Auto Fix Valurasi Persediaan (' || v_acc_code || ') - Menyesuaikan Neraca dengan Fisik',
                    'opening',
                    r.branch_id,
                    'posted',
                    ABS(v_adjustment_needed),
                    ABS(v_adjustment_needed),
                    now()
                ) RETURNING id INTO v_journal_id;
                
                IF v_adjustment_needed > 0 THEN
                    -- Debit Inventory, Credit Modal (Stock Value < Journal Value)
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, line_number)
                    VALUES (v_journal_id, r.target_account_id, v_adjustment_needed, 0, 'Penyesuaian Valuasi Fisik', 1);
                    
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, line_number)
                    VALUES (v_journal_id, v_modal_acc_id, 0, v_adjustment_needed, 'Penyesuaian Valuasi Fisik', 2);
                ELSE
                    -- Credit Inventory, Debit Modal (Stock Value > Journal Value)
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, line_number)
                    VALUES (v_journal_id, r.target_account_id, 0, ABS(v_adjustment_needed), 'Penyesuaian Valuasi Fisik', 1);
                    
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, line_number)
                    VALUES (v_journal_id, v_modal_acc_id, ABS(v_adjustment_needed), 0, 'Penyesuaian Valuasi Fisik', 2);
                END IF;
            ELSE
                 RAISE NOTICE 'Skipping adjustment: Modal account (3100) not found for branch %', r.branch_id;
            END IF;
        END IF;
    END LOOP;
    
    -- Clean up (optional for temp table, drops at end of session anyway)
    DROP TABLE temp_inventory_valuation;
END $$;
