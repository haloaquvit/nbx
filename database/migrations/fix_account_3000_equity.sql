-- FIX: Move Opening Balance Equity from Account 3000 to 'Modal Disetor' / 3110
-- Safe to run multiple times (idempotent logic: only affects 3000)

DO $$
DECLARE
    r_branch RECORD;
    v_correct_acc_id UUID;
    v_wrong_acc_id UUID;
    v_count INTEGER;
BEGIN
    RAISE NOTICE 'Starting Account 3000 Fix...';

    -- Loop through all branches explicitly
    FOR r_branch IN SELECT id, name FROM branches LOOP
        RAISE NOTICE 'Processing Branch: %', r_branch.name;

        -- 1. Find the WRONG account (Code '3000')
        SELECT id INTO v_wrong_acc_id
        FROM accounts
        WHERE branch_id = r_branch.id AND code = '3000';

        IF v_wrong_acc_id IS NULL THEN
            RAISE NOTICE '  -> Account 3000 not found, skipping.';
            CONTINUE;
        END IF;

        -- 2. Find the CORRECT account (Priority logic)
        -- Priority 1: 'Modal Disetor'
        SELECT id INTO v_correct_acc_id
        FROM accounts
        WHERE branch_id = r_branch.id 
          AND is_active = TRUE
          AND name ILIKE '%Modal Disetor%'
        LIMIT 1;

        -- Priority 2: Code '3110'
        IF v_correct_acc_id IS NULL THEN
            SELECT id INTO v_correct_acc_id
            FROM accounts
            WHERE branch_id = r_branch.id 
              AND is_active = TRUE 
              AND code = '3110'
            LIMIT 1;
        END IF;

        -- Priority 3: First valid equity NOT 3000
        IF v_correct_acc_id IS NULL THEN
            SELECT id INTO v_correct_acc_id
            FROM accounts
            WHERE branch_id = r_branch.id 
              AND is_active = TRUE 
              AND code LIKE '3%'
              AND id != v_wrong_acc_id
            ORDER BY code ASC
            LIMIT 1;
        END IF;

        IF v_correct_acc_id IS NULL THEN
             RAISE NOTICE '  -> No valid destination Equity account found, skipping.';
             CONTINUE;
        END IF;
        
        RAISE NOTICE '  -> Moving from 3000 (%) to Correct (%)', v_wrong_acc_id, v_correct_acc_id;

        -- 3. Update Journal Lines
        -- Only affect 'opening_balance' entries
        WITH updated_rows AS (
            UPDATE journal_entry_lines jel
            SET account_id = v_correct_acc_id
            FROM journal_entries je
            WHERE jel.journal_entry_id = je.id
              AND jel.account_id = v_wrong_acc_id
              AND je.branch_id = r_branch.id
              AND je.reference_type = 'opening_balance'
              AND je.is_voided = FALSE
            RETURNING jel.id
        )
        SELECT COUNT(*) INTO v_count FROM updated_rows;

        RAISE NOTICE '  -> Fixed % journal lines.', v_count;

    END LOOP;

    RAISE NOTICE 'Fix Complete.';
END $$;
