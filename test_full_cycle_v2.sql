-- =================================================================
-- TEST FULL CYCLE V2: FIX FUNCTION CALLS AND COLUMNS
-- =================================================================

BEGIN; -- Start transaction block

DO $$
DECLARE
    v_user_id UUID;
    v_user_name TEXT := 'Syahruddin Makki';
    v_branch_id UUID;
    v_customer_id UUID;
    v_product_id UUID;
    v_txn_id UUID;
    v_delivery_id UUID;
    v_txn_no TEXT;
    v_product_price DECIMAL := 15000;
    v_qty INTEGER := 10;
    v_total_amount DECIMAL;
    v_initial_stock INTEGER;
    v_final_stock INTEGER;
BEGIN
    RAISE NOTICE '🚀 STARTING FULL CYCLE TEST (CORRECTED)...';

    -- 1. SETUP DATA
    SELECT id INTO v_user_id FROM profiles WHERE email = 'inputpip@gmail.com' LIMIT 1;
    SELECT id INTO v_branch_id FROM branches WHERE name = 'Kantor Pusat' LIMIT 1;
    SELECT id INTO v_customer_id FROM customers LIMIT 1;
    SELECT id INTO v_product_id FROM products LIMIT 1;
    
    SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_initial_stock 
    FROM inventory_batches 
    WHERE product_id = v_product_id AND branch_id = v_branch_id AND remaining_quantity > 0;

    RAISE NOTICE 'Setup Info: User=%, Branch=%, Product=%, Stock=%', v_user_id, v_branch_id, v_product_id, v_initial_stock;

    -- 2. CREATE TRANSACTION
    v_total_amount := v_product_price * v_qty;
    v_txn_id := gen_random_uuid();
    
    INSERT INTO transactions (
        id, branch_id, customer_id, order_date, created_at, status, delivery_status,
        total, payment_status, paid_amount, 
        sales_id, cashier_id, sales_name, cashier_name,
        items
    ) VALUES (
        v_txn_id, v_branch_id, v_customer_id, NOW(), NOW(), 'Pesanan Masuk', 'Pending',
        v_total_amount, 'Belum Lunas', 0,
        v_user_id, v_user_id, v_user_name, v_user_name,
        jsonb_build_array(
            jsonb_build_object(
                'product_id', v_product_id,
                'quantity', v_qty,
                'price', v_product_price,
                'subtotal', v_total_amount,
                'product_name', 'Test Product',
                'unit', 'Pcs'
            )
        )
    ) RETURNING ref INTO v_txn_no;

    RAISE NOTICE '✅ Transaction Created: % (ID: %)', v_txn_no, v_txn_id;

    -- 3. CREATE DELIVERY (WITHOUT DRIVER)
    v_delivery_id := gen_random_uuid();
    
    INSERT INTO deliveries (
        id, transaction_id, delivery_date, status, 
        driver_id, -- NULL for "Tanpa Supir"
        helper_id, -- NULL
        branch_id
    ) VALUES (
        v_delivery_id, v_txn_id, NOW(), 'Completed',
        NULL, 
        NULL,
        v_branch_id
    );

    INSERT INTO delivery_items (
        delivery_id, product_id, quantity_delivered,
        product_name, unit
    ) VALUES (
        v_delivery_id, v_product_id, v_qty,
        'Test Product', 'Pcs'
    );

    -- Stock Movement (FIFO)
    BEGIN
        -- consume_stock_fifo_v2(product_id, quantity, ref_id, ref_type, branch_id)
        PERFORM consume_stock_fifo_v2(
            v_product_id, 
            v_qty, 
            v_delivery_id::TEXT, 
            'delivery', 
            v_branch_id
        );
        RAISE NOTICE '✅ FIFO Consumer executed';
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️ FIFO Consumer FAILED: %', SQLERRM;
    END;

    -- Update Trx Status
    -- Commented out to debug trigger error
    -- UPDATE transactions 
    -- SET status = 'Selesai', delivery_status = 'Completed'
    -- WHERE id = v_txn_id;

    RAISE NOTICE '✅ Delivery Created without Driver (ID: %)', v_delivery_id;
    
    -- Verify Stock
    SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_final_stock 
    FROM inventory_batches 
    WHERE product_id = v_product_id AND branch_id = v_branch_id AND remaining_quantity > 0;
    
    RAISE NOTICE 'Stock Check: Initial %, Final % (Diff: %)', v_initial_stock, v_final_stock, v_initial_stock - v_final_stock;

    -- 4. PROCESS PAYMENT (Full Payment)
    UPDATE transactions 
    SET payment_status = 'Lunas', paid_amount = v_total_amount, status = 'Selesai', delivery_status = 'Completed'
    WHERE id = v_txn_id;
    
    RAISE NOTICE '✅ Payment Processed';

    -- 5. VERIFY JOURNALS
    DECLARE
        v_journal_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO v_journal_count FROM journal_entries WHERE reference_id = v_txn_id::TEXT;
        RAISE NOTICE 'Journals found: %', v_journal_count;
    END;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '❌ ERROR OCCURRED: %', SQLERRM;
END $$;

ROLLBACK; -- Always rollback test data
DO $$ BEGIN RAISE NOTICE '🔄 TRANSACTION COMPLETED (ROLLED BACK)'; END $$;
