
-- 1. Create Temporary Table for Calculation
CREATE TEMP TABLE temp_stock_valuation AS
WITH current_stock_data AS (
    SELECT 
        p.id as product_id,
        p.name as product_name,
        p.branch_id,
        COALESCE(s.current_stock, 0) as real_stock,
        COALESCE(p.cost_price, 0) as unit_cost
    FROM products p
    LEFT JOIN v_product_current_stock s ON p.id = s.product_id
),
inventory_account AS (
    SELECT id, branch_id FROM accounts WHERE code = '1310'
)
SELECT 
    cs.product_id,
    cs.product_name,
    cs.branch_id,
    cs.real_stock,
    cs.unit_cost,
    (cs.real_stock * cs.unit_cost) as total_valuation,
    ia.id as account_1310_id
FROM current_stock_data cs
JOIN inventory_account ia ON cs.branch_id = ia.branch_id;

-- 2. Create Adjustment Journal to Match Valuation
DO $$
DECLARE
    r RECORD;
    v_journal_id UUID;
    v_current_journal_balance NUMERIC;
    v_target_valuation NUMERIC;
    v_adjustment_needed NUMERIC;
    v_modal_acc_id UUID;
BEGIN
    FOR r IN SELECT branch_id, SUM(total_valuation) as target_val, MIN(account_1310_id) as acc_id FROM temp_stock_valuation GROUP BY branch_id LOOP
        
        -- Get current journal balance for 1310
        SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
        INTO v_current_journal_balance
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        WHERE jel.account_id = r.acc_id
        AND je.status = 'posted' AND je.is_voided = false;
        
        v_adjustment_needed := r.target_val - v_current_journal_balance;
        
        RAISE NOTICE 'Branch: %, Target: %, Current: %, Adj: %', r.branch_id, r.target_val, v_current_journal_balance, v_adjustment_needed;
        
        IF v_adjustment_needed <> 0 THEN
            -- Find Equity/Capital Account (Modal) to balance
            SELECT id INTO v_modal_acc_id FROM accounts WHERE code = '3100' AND branch_id = r.branch_id LIMIT 1;
            
            IF v_modal_acc_id IS NOT NULL THEN
                INSERT INTO journal_entries (
                    entry_number, entry_date, description, reference_type, branch_id, status, total_debit, total_credit
                ) VALUES (
                    'ADJ-STOCK-' || to_char(now(), 'YYMMDD'),
                    now(),
                    'Penyesuaian Saldo Awal Persediaan (Auto Fix)',
                    'opening',
                    r.branch_id,
                    'posted',
                    ABS(v_adjustment_needed),
                    ABS(v_adjustment_needed)
                ) RETURNING id INTO v_journal_id;
                
                IF v_adjustment_needed > 0 THEN
                    -- Debit Inv (1310), Credit Modal (3100)
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
                    VALUES (v_journal_id, r.acc_id, v_adjustment_needed, 0, 'Penyesuaian Stock Opname');
                    
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
                    VALUES (v_journal_id, v_modal_acc_id, 0, v_adjustment_needed, 'Penyesuaian Stock Opname');
                ELSE
                    -- Credit Inv (1310), Debit Modal (3100)
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
                    VALUES (v_journal_id, r.acc_id, 0, ABS(v_adjustment_needed), 'Penyesuaian Stock Opname');
                    
                    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
                    VALUES (v_journal_id, v_modal_acc_id, ABS(v_adjustment_needed), 0, 'Penyesuaian Stock Opname');
                END IF;
            END IF;
        END IF;
    END LOOP;
END $$;
