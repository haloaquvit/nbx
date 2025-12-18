-- ============================================================================
-- LOCAL TESTING: FIFO + PPN SYSTEM
-- ============================================================================
-- Test script untuk development environment
-- Jalankan di Supabase SQL Editor setelah migration selesai
-- ============================================================================

-- Step 1: Setup Test Data
-- ============================================================================

DO $$
DECLARE
  test_branch_id UUID;
  test_supplier_id UUID;
  test_material_id UUID;
  test_po_id TEXT;
  test_po_item_id TEXT;
  test_production_id UUID;
BEGIN
  RAISE NOTICE '🧪 Starting FIFO + PPN Local Test...';

  -- Get or create test branch
  SELECT id INTO test_branch_id FROM public.branches LIMIT 1;
  IF test_branch_id IS NULL THEN
    INSERT INTO public.branches (id, name, code, address, phone, manager_name)
    VALUES (gen_random_uuid(), 'Test Branch', 'TB001', 'Test Address', '08123456789', 'Test Manager')
    RETURNING id INTO test_branch_id;
    RAISE NOTICE '✅ Created test branch: %', test_branch_id;
  ELSE
    RAISE NOTICE '✅ Using existing branch: %', test_branch_id;
  END IF;

  -- Create test supplier
  INSERT INTO public.suppliers (id, name, phone, address, npwp, is_pkp, branch_id)
  VALUES (
    gen_random_uuid(),
    'Test Supplier PKP',
    '08111222333',
    'Jl. Supplier Test No. 123',
    '01.234.567.8-901.000',
    true,
    test_branch_id
  )
  RETURNING id INTO test_supplier_id;
  RAISE NOTICE '✅ Created test supplier: %', test_supplier_id;

  -- Create test material
  INSERT INTO public.materials (id, name, unit, price_per_unit, stock, branch_id)
  VALUES (
    gen_random_uuid(),
    'Kain Test FIFO',
    'meter',
    90000,
    0,
    test_branch_id
  )
  RETURNING id INTO test_material_id;
  RAISE NOTICE '✅ Created test material: %', test_material_id;

  -- Create test PO with 2 items (different prices)
  INSERT INTO public.purchase_orders (
    id, po_number, supplier_id, branch_id, order_date, status
  ) VALUES (
    'po-test-fifo-' || extract(epoch from now())::bigint,
    'PO-TEST-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'),
    test_supplier_id,
    test_branch_id,
    NOW(),
    'pending'
  )
  RETURNING id INTO test_po_id;
  RAISE NOTICE '✅ Created test PO: %', test_po_id;

  -- Add first PO item (100 units @ Rp 90,000 with PPN)
  INSERT INTO public.purchase_order_items (
    id, purchase_order_id, material_id, quantity, unit_price, is_taxable, tax_percentage
  ) VALUES (
    'poi-test-1-' || extract(epoch from now())::bigint,
    test_po_id,
    test_material_id,
    100,
    90000,
    true,
    11.00
  )
  RETURNING id INTO test_po_item_id;
  RAISE NOTICE '✅ Created PO item 1: 100 units @ Rp 90,000 (PPN 11%%)';

  -- Add second PO item (100 units @ Rp 93,000 without PPN)
  INSERT INTO public.purchase_order_items (
    id, purchase_order_id, material_id, quantity, unit_price, is_taxable
  ) VALUES (
    'poi-test-2-' || extract(epoch from now())::bigint,
    test_po_id,
    test_material_id,
    100,
    93000,
    false
  );
  RAISE NOTICE '✅ Created PO item 2: 100 units @ Rp 93,000 (Non-PPN)';

  -- Store IDs for later tests
  RAISE NOTICE '';
  RAISE NOTICE '📝 Test Data Created:';
  RAISE NOTICE '   Branch ID: %', test_branch_id;
  RAISE NOTICE '   Supplier ID: %', test_supplier_id;
  RAISE NOTICE '   Material ID: %', test_material_id;
  RAISE NOTICE '   PO ID: %', test_po_id;
  RAISE NOTICE '';
END $$;

-- Step 2: Test PPN Auto-Calculation
-- ============================================================================

DO $$
DECLARE
  po_id TEXT;
  item1 RECORD;
  item2 RECORD;
  po_summary RECORD;
BEGIN
  RAISE NOTICE '🧮 TEST 1: PPN Auto-Calculation';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Get latest test PO
  SELECT id INTO po_id FROM public.purchase_orders WHERE po_number LIKE 'PO-TEST-%' ORDER BY created_at DESC LIMIT 1;

  -- Check item 1 (with PPN)
  SELECT * INTO item1 FROM public.purchase_order_items WHERE purchase_order_id = po_id AND is_taxable = true LIMIT 1;

  RAISE NOTICE 'Item 1 (PPN 11%%):';
  RAISE NOTICE '  Quantity: %', item1.quantity;
  RAISE NOTICE '  Unit Price: Rp %', item1.unit_price;
  RAISE NOTICE '  Subtotal: Rp %', item1.subtotal;
  RAISE NOTICE '  Tax Amount: Rp %', item1.tax_amount;
  RAISE NOTICE '  Total with Tax: Rp %', item1.total_with_tax;

  -- Verify calculation
  IF item1.subtotal = 9000000 AND item1.tax_amount = 990000 AND item1.total_with_tax = 9990000 THEN
    RAISE NOTICE '  ✅ Calculation CORRECT!';
  ELSE
    RAISE NOTICE '  ❌ Calculation ERROR!';
    RAISE NOTICE '     Expected: subtotal=9000000, tax=990000, total=9990000';
  END IF;

  RAISE NOTICE '';

  -- Check item 2 (no PPN)
  SELECT * INTO item2 FROM public.purchase_order_items WHERE purchase_order_id = po_id AND is_taxable = false LIMIT 1;

  RAISE NOTICE 'Item 2 (Non-PPN):';
  RAISE NOTICE '  Quantity: %', item2.quantity;
  RAISE NOTICE '  Unit Price: Rp %', item2.unit_price;
  RAISE NOTICE '  Subtotal: Rp %', item2.subtotal;
  RAISE NOTICE '  Tax Amount: Rp %', item2.tax_amount;
  RAISE NOTICE '  Total with Tax: Rp %', item2.total_with_tax;

  IF item2.tax_amount = 0 AND item2.total_with_tax = item2.subtotal THEN
    RAISE NOTICE '  ✅ Non-PPN CORRECT!';
  ELSE
    RAISE NOTICE '  ❌ Non-PPN ERROR!';
  END IF;

  RAISE NOTICE '';

  -- Check PO summary
  SELECT * INTO po_summary FROM public.purchase_orders WHERE id = po_id;

  RAISE NOTICE 'PO Summary:';
  RAISE NOTICE '  Subtotal: Rp %', po_summary.subtotal_amount;
  RAISE NOTICE '  Tax: Rp %', po_summary.tax_amount;
  RAISE NOTICE '  Grand Total: Rp %', po_summary.total_amount;

  IF po_summary.subtotal_amount = 18300000 AND po_summary.tax_amount = 990000 AND po_summary.total_amount = 19290000 THEN
    RAISE NOTICE '  ✅ PO Summary CORRECT!';
  ELSE
    RAISE NOTICE '  ❌ PO Summary ERROR!';
    RAISE NOTICE '     Expected: subtotal=18300000, tax=990000, total=19290000';
  END IF;

  RAISE NOTICE '';
END $$;

-- Step 3: Test FIFO Batch Creation
-- ============================================================================

DO $$
DECLARE
  po_id TEXT;
  batch_count INTEGER;
  batch1 RECORD;
  batch2 RECORD;
BEGIN
  RAISE NOTICE '📦 TEST 2: FIFO Batch Auto-Creation';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Get latest test PO
  SELECT id INTO po_id FROM public.purchase_orders WHERE po_number LIKE 'PO-TEST-%' ORDER BY created_at DESC LIMIT 1;

  RAISE NOTICE 'Receiving PO: %', po_id;

  -- Mark PO as received
  UPDATE public.purchase_orders SET status = 'received' WHERE id = po_id;

  RAISE NOTICE '✅ PO marked as received';
  RAISE NOTICE '';

  -- Check if batches were created
  SELECT COUNT(*) INTO batch_count FROM public.material_inventory_batches WHERE purchase_order_id = po_id;

  RAISE NOTICE 'Batches created: %', batch_count;

  IF batch_count = 2 THEN
    RAISE NOTICE '✅ Correct number of batches!';
  ELSE
    RAISE NOTICE '❌ Expected 2 batches, got %', batch_count;
  END IF;

  RAISE NOTICE '';

  -- Check batch details
  SELECT * INTO batch1 FROM public.material_inventory_batches
  WHERE purchase_order_id = po_id ORDER BY purchase_date, created_at LIMIT 1;

  RAISE NOTICE 'Batch 1:';
  RAISE NOTICE '  Batch Number: %', batch1.batch_number;
  RAISE NOTICE '  Quantity: %', batch1.quantity_received;
  RAISE NOTICE '  Unit Price: Rp %', batch1.unit_price;
  RAISE NOTICE '  Status: %', batch1.status;
  RAISE NOTICE '  Notes: %', batch1.notes;

  IF batch1.unit_price = 90000 THEN
    RAISE NOTICE '  ✅ Batch 1 price CORRECT (before tax)!';
  ELSE
    RAISE NOTICE '  ❌ Batch 1 price should be 90000, got %', batch1.unit_price;
  END IF;

  RAISE NOTICE '';

  SELECT * INTO batch2 FROM public.material_inventory_batches
  WHERE purchase_order_id = po_id ORDER BY purchase_date DESC, created_at DESC LIMIT 1;

  RAISE NOTICE 'Batch 2:';
  RAISE NOTICE '  Batch Number: %', batch2.batch_number;
  RAISE NOTICE '  Quantity: %', batch2.quantity_received;
  RAISE NOTICE '  Unit Price: Rp %', batch2.unit_price;
  RAISE NOTICE '  Status: %', batch2.status;

  IF batch2.unit_price = 93000 THEN
    RAISE NOTICE '  ✅ Batch 2 price CORRECT!';
  ELSE
    RAISE NOTICE '  ❌ Batch 2 price should be 93000, got %', batch2.unit_price;
  END IF;

  RAISE NOTICE '';
END $$;

-- Step 4: Test FIFO Cost Calculation
-- ============================================================================

DO $$
DECLARE
  material_id UUID;
  branch_id UUID;
  fifo_cost RECORD;
  total_cost DECIMAL := 0;
BEGIN
  RAISE NOTICE '💰 TEST 3: FIFO Cost Calculation';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Get test material and branch
  SELECT id INTO material_id FROM public.materials WHERE name LIKE 'Kain Test FIFO%' LIMIT 1;
  SELECT id INTO branch_id FROM public.branches LIMIT 1;

  RAISE NOTICE 'Testing FIFO for 150 units (should use 100 from batch 1 + 50 from batch 2)';
  RAISE NOTICE '';

  -- Calculate FIFO cost for 150 units
  FOR fifo_cost IN
    SELECT * FROM calculate_fifo_cost(material_id, 150, branch_id)
  LOOP
    RAISE NOTICE 'Batch used:';
    RAISE NOTICE '  Quantity: %', fifo_cost.quantity_from_batch;
    RAISE NOTICE '  Unit Price: Rp %', fifo_cost.unit_price;
    RAISE NOTICE '  Cost: Rp %', fifo_cost.batch_cost;
    total_cost := total_cost + fifo_cost.batch_cost;
    RAISE NOTICE '';
  END LOOP;

  RAISE NOTICE 'FIFO Calculation Summary:';
  RAISE NOTICE '  Total Cost: Rp %', total_cost;
  RAISE NOTICE '  Average Price: Rp %', total_cost / 150;

  IF total_cost = 13650000 THEN
    RAISE NOTICE '  ✅ FIFO calculation CORRECT!';
    RAISE NOTICE '     (100 × 90,000 + 50 × 93,000 = 13,650,000)';
  ELSE
    RAISE NOTICE '  ❌ FIFO calculation ERROR!';
    RAISE NOTICE '     Expected: 13650000, Got: %', total_cost;
  END IF;

  RAISE NOTICE '';
END $$;

-- Step 5: Test Material Usage with FIFO
-- ============================================================================

DO $$
DECLARE
  material_id UUID;
  branch_id UUID;
  production_id UUID;
  usage_result JSON;
  batch1 RECORD;
  batch2 RECORD;
BEGIN
  RAISE NOTICE '🏭 TEST 4: Material Usage with FIFO';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  -- Get test data
  SELECT id INTO material_id FROM public.materials WHERE name LIKE 'Kain Test FIFO%' LIMIT 1;
  SELECT id INTO branch_id FROM public.branches LIMIT 1;

  -- Create dummy production record (if table exists)
  BEGIN
    INSERT INTO public.production_records (id, product_id, quantity_produced, branch_id, status)
    VALUES (gen_random_uuid(), (SELECT id FROM products LIMIT 1), 10, branch_id, 'completed')
    RETURNING id INTO production_id;
    RAISE NOTICE '✅ Created test production record';
  EXCEPTION WHEN OTHERS THEN
    production_id := NULL;
    RAISE NOTICE '⚠️  Production table not available, using NULL';
  END;

  RAISE NOTICE '';
  RAISE NOTICE 'Using 150 units of material...';

  -- Use material with FIFO
  SELECT use_material_fifo(
    material_id,
    150,
    branch_id,
    production_id,
    'production',
    'Test FIFO usage',
    auth.uid()
  ) INTO usage_result;

  RAISE NOTICE '';
  RAISE NOTICE 'Usage Result:';
  RAISE NOTICE '%', usage_result;

  -- Check batch status after usage
  SELECT * INTO batch1 FROM public.material_inventory_batches
  WHERE material_id = material_id ORDER BY purchase_date, created_at LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE 'Batch 1 after usage:';
  RAISE NOTICE '  Remaining: %', batch1.quantity_remaining;
  RAISE NOTICE '  Status: %', batch1.status;

  IF batch1.quantity_remaining = 0 AND batch1.status = 'depleted' THEN
    RAISE NOTICE '  ✅ Batch 1 fully depleted!';
  ELSE
    RAISE NOTICE '  ❌ Batch 1 should be depleted';
  END IF;

  SELECT * INTO batch2 FROM public.material_inventory_batches
  WHERE material_id = material_id ORDER BY purchase_date DESC, created_at DESC LIMIT 1;

  RAISE NOTICE '';
  RAISE NOTICE 'Batch 2 after usage:';
  RAISE NOTICE '  Remaining: %', batch2.quantity_remaining;
  RAISE NOTICE '  Status: %', batch2.status;

  IF batch2.quantity_remaining = 50 AND batch2.status = 'active' THEN
    RAISE NOTICE '  ✅ Batch 2 partially used (50 remaining)!';
  ELSE
    RAISE NOTICE '  ❌ Batch 2 should have 50 remaining';
  END IF;

  RAISE NOTICE '';
END $$;

-- Step 6: Test Tax Summary View
-- ============================================================================

DO $$
DECLARE
  po_id TEXT;
  tax_summary RECORD;
BEGIN
  RAISE NOTICE '📊 TEST 5: Tax Summary View';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  SELECT id INTO po_id FROM public.purchase_orders WHERE po_number LIKE 'PO-TEST-%' ORDER BY created_at DESC LIMIT 1;

  SELECT * INTO tax_summary FROM public.purchase_order_tax_summary WHERE po_id = po_id;

  RAISE NOTICE 'PO: %', tax_summary.po_number;
  RAISE NOTICE 'Supplier: % (NPWP: %)', tax_summary.supplier_name, tax_summary.supplier_npwp;
  RAISE NOTICE 'Taxable Items: %', tax_summary.taxable_items_count;
  RAISE NOTICE 'Non-Taxable Items: %', tax_summary.non_taxable_items_count;
  RAISE NOTICE 'Taxable Subtotal: Rp %', tax_summary.taxable_subtotal;
  RAISE NOTICE 'Non-Taxable Subtotal: Rp %', tax_summary.non_taxable_subtotal;
  RAISE NOTICE 'Total Tax: Rp %', tax_summary.total_tax;
  RAISE NOTICE 'Grand Total: Rp %', tax_summary.total_amount;

  IF tax_summary.taxable_items_count = 1 AND tax_summary.non_taxable_items_count = 1 THEN
    RAISE NOTICE '✅ Tax summary view working correctly!';
  ELSE
    RAISE NOTICE '❌ Tax summary view has errors';
  END IF;

  RAISE NOTICE '';
END $$;

-- Final Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔════════════════════════════════════════════════════╗';
  RAISE NOTICE '║  🎉 FIFO + PPN SYSTEM TEST COMPLETED!             ║';
  RAISE NOTICE '╚════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'Tests Run:';
  RAISE NOTICE '  ✅ PPN Auto-Calculation';
  RAISE NOTICE '  ✅ FIFO Batch Creation from PO';
  RAISE NOTICE '  ✅ FIFO Cost Calculation';
  RAISE NOTICE '  ✅ Material Usage with FIFO';
  RAISE NOTICE '  ✅ Tax Summary Views';
  RAISE NOTICE '';
  RAISE NOTICE 'Check the output above for detailed results.';
  RAISE NOTICE '';
  RAISE NOTICE 'To clean up test data, run:';
  RAISE NOTICE '  DELETE FROM purchase_orders WHERE po_number LIKE ''PO-TEST-%'';';
  RAISE NOTICE '  DELETE FROM materials WHERE name LIKE ''Kain Test FIFO%'';';
  RAISE NOTICE '  DELETE FROM suppliers WHERE name LIKE ''Test Supplier%'';';
  RAISE NOTICE '';
END $$;
