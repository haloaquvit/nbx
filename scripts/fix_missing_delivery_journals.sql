-- ============================================================================
-- REPAIR MISSING DELIVERY JOURNALS
-- ============================================================================
-- Script untuk memperbaiki jurnal pengiriman yang belum tercatat
-- Jurnal: Dr. Hutang Barang Dagang (2140), Cr. Persediaan Barang Dagang (1310)
-- ============================================================================

-- 1. Cari semua delivery yang BELUM punya jurnal
-- (delivery yang journal_entries.reference_id tidak ada)
WITH missing_journals AS (
    SELECT
        d.id as delivery_id,
        d.transaction_id,
        d.delivery_date,
        d.branch_id,
        t.is_office_sale
    FROM deliveries d
    LEFT JOIN transactions t ON t.id = d.transaction_id
    LEFT JOIN journal_entries je ON je.reference_id = d.id AND je.reference_type = 'adjustment'
    WHERE je.id IS NULL
      AND (t.is_office_sale = false OR t.is_office_sale IS NULL)  -- Hanya non-office sale
)
SELECT
    mj.delivery_id,
    mj.transaction_id,
    mj.delivery_date,
    mj.branch_id,
    COUNT(di.id) as item_count
FROM missing_journals mj
LEFT JOIN delivery_items di ON di.delivery_id = mj.delivery_id
GROUP BY mj.delivery_id, mj.transaction_id, mj.delivery_date, mj.branch_id
ORDER BY mj.delivery_date;

-- ============================================================================
-- 2. Hitung total HPP per delivery yang missing
-- ============================================================================
WITH missing_deliveries AS (
    SELECT
        d.id as delivery_id,
        d.transaction_id,
        d.delivery_date,
        d.branch_id
    FROM deliveries d
    LEFT JOIN transactions t ON t.id = d.transaction_id
    LEFT JOIN journal_entries je ON je.reference_id = d.id AND je.reference_type = 'adjustment'
    WHERE je.id IS NULL
      AND (t.is_office_sale = false OR t.is_office_sale IS NULL)
),
delivery_hpp AS (
    SELECT
        md.delivery_id,
        md.transaction_id,
        md.delivery_date,
        md.branch_id,
        di.product_id,
        di.product_name,
        di.quantity_delivered,
        COALESCE(p.cost_price, p.base_price, 0) as cost_per_unit,
        di.quantity_delivered * COALESCE(p.cost_price, p.base_price, 0) as item_hpp
    FROM missing_deliveries md
    JOIN delivery_items di ON di.delivery_id = md.delivery_id
    LEFT JOIN products p ON p.id = di.product_id
)
SELECT
    delivery_id,
    transaction_id,
    delivery_date,
    branch_id,
    SUM(item_hpp) as total_hpp,
    STRING_AGG(product_name || ' x' || quantity_delivered, ', ') as items_desc
FROM delivery_hpp
GROUP BY delivery_id, transaction_id, delivery_date, branch_id
HAVING SUM(item_hpp) > 0
ORDER BY delivery_date;

-- ============================================================================
-- 3. INSERT JOURNAL ENTRIES untuk delivery yang missing
-- ============================================================================
-- Jalankan ini untuk setiap branch yang perlu diperbaiki

DO $$
DECLARE
    v_delivery RECORD;
    v_total_hpp NUMERIC;
    v_items_desc TEXT;
    v_journal_id UUID;
    v_entry_number TEXT;
    v_hutang_account_id UUID;
    v_persediaan_account_id UUID;
    v_branch_id UUID;
    v_created_count INT := 0;
    v_skipped_count INT := 0;
BEGIN
    -- Loop through all deliveries that don't have journals
    FOR v_delivery IN
        SELECT
            d.id as delivery_id,
            d.transaction_id,
            d.delivery_date,
            d.branch_id
        FROM deliveries d
        LEFT JOIN transactions t ON t.id = d.transaction_id
        LEFT JOIN journal_entries je ON je.reference_id = d.id AND je.reference_type = 'adjustment'
        WHERE je.id IS NULL
          AND (t.is_office_sale = false OR t.is_office_sale IS NULL)
    LOOP
        v_branch_id := v_delivery.branch_id;

        -- Calculate total HPP for this delivery
        SELECT
            COALESCE(SUM(di.quantity_delivered * COALESCE(p.cost_price, p.base_price, 0)), 0),
            STRING_AGG(di.product_name || ' x' || di.quantity_delivered, ', ')
        INTO v_total_hpp, v_items_desc
        FROM delivery_items di
        LEFT JOIN products p ON p.id = di.product_id
        WHERE di.delivery_id = v_delivery.delivery_id;

        -- Skip if no HPP to record
        IF v_total_hpp <= 0 THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Find Hutang Barang Dagang account (2140)
        SELECT id INTO v_hutang_account_id
        FROM accounts
        WHERE code = '2140' AND (branch_id = v_branch_id OR branch_id IS NULL)
        LIMIT 1;

        -- Find Persediaan Barang Dagang account (1310)
        SELECT id INTO v_persediaan_account_id
        FROM accounts
        WHERE code = '1310' AND (branch_id = v_branch_id OR branch_id IS NULL)
        LIMIT 1;

        -- Skip if accounts not found
        IF v_hutang_account_id IS NULL OR v_persediaan_account_id IS NULL THEN
            RAISE NOTICE 'Skipping delivery % - accounts not found (2140: %, 1310: %)',
                v_delivery.delivery_id, v_hutang_account_id, v_persediaan_account_id;
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Generate entry number
        v_entry_number := 'JE-' || TO_CHAR(v_delivery.delivery_date, 'YYYYMMDD') || '-' ||
                          LPAD((EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT % 10000000::TEXT, 7, '0');

        -- Create journal entry
        v_journal_id := gen_random_uuid();

        INSERT INTO journal_entries (
            id, entry_number, entry_date, description,
            reference_type, reference_id, branch_id,
            status, is_voided, created_at, updated_at
        ) VALUES (
            v_journal_id,
            v_entry_number,
            v_delivery.delivery_date,
            'Pengantaran ' || v_delivery.transaction_id || ': ' || COALESCE(v_items_desc, ''),
            'adjustment',
            v_delivery.delivery_id,
            v_branch_id,
            'posted',
            false,
            NOW(),
            NOW()
        );

        -- Create journal lines
        -- Dr. Hutang Barang Dagang (2140)
        INSERT INTO journal_entry_lines (
            id, journal_entry_id, account_id, account_code, account_name,
            debit_amount, credit_amount, description, created_at
        )
        SELECT
            gen_random_uuid(),
            v_journal_id,
            v_hutang_account_id,
            a.code,
            a.name,
            v_total_hpp,
            0,
            'Kewajiban kirim barang terpenuhi',
            NOW()
        FROM accounts a WHERE a.id = v_hutang_account_id;

        -- Cr. Persediaan Barang Dagang (1310)
        INSERT INTO journal_entry_lines (
            id, journal_entry_id, account_id, account_code, account_name,
            debit_amount, credit_amount, description, created_at
        )
        SELECT
            gen_random_uuid(),
            v_journal_id,
            v_persediaan_account_id,
            a.code,
            a.name,
            0,
            v_total_hpp,
            'Pengurangan persediaan barang diantar',
            NOW()
        FROM accounts a WHERE a.id = v_persediaan_account_id;

        v_created_count := v_created_count + 1;
        RAISE NOTICE 'Created journal for delivery % - HPP: %', v_delivery.delivery_id, v_total_hpp;
    END LOOP;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'REPAIR COMPLETE';
    RAISE NOTICE 'Created: % journals', v_created_count;
    RAISE NOTICE 'Skipped: % deliveries', v_skipped_count;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- 4. VERIFIKASI - Cek hasil
-- ============================================================================
SELECT
    'Before Repair' as status,
    COUNT(*) as total_deliveries,
    COUNT(je.id) as with_journal,
    COUNT(*) - COUNT(je.id) as without_journal
FROM deliveries d
LEFT JOIN journal_entries je ON je.reference_id = d.id AND je.reference_type = 'adjustment'
LEFT JOIN transactions t ON t.id = d.transaction_id
WHERE t.is_office_sale = false OR t.is_office_sale IS NULL;
