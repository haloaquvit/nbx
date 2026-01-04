-- Migration 011: Create Material Inventory Batches for Nabire
-- Date: 2026-01-04

DO $$
DECLARE
  v_material RECORD;
  v_batch_count INTEGER := 0;
BEGIN
  RAISE NOTICE '=== CREATING MATERIAL INVENTORY BATCHES ===';

  FOR v_material IN
    SELECT m.id, m.name, m.stock, m.price_per_unit, m.branch_id
    FROM materials m
    WHERE m.stock > 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory_batches ib
        WHERE ib.material_id = m.id
        AND ib.notes = 'Stok Awal'
      )
  LOOP
    INSERT INTO inventory_batches (
      material_id,
      branch_id,
      batch_date,
      initial_quantity,
      remaining_quantity,
      unit_cost,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_material.id,
      v_material.branch_id,
      NOW(),
      v_material.stock,
      v_material.stock,
      COALESCE(v_material.price_per_unit, 0),
      'Stok Awal',
      NOW(),
      NOW()
    );

    v_batch_count := v_batch_count + 1;
    RAISE NOTICE 'Created batch for material: % (qty: %, branch: %)',
      v_material.name, v_material.stock, v_material.branch_id;
  END LOOP;

  RAISE NOTICE 'Created % new material inventory batches', v_batch_count;
END $$;

-- Verify results
SELECT
  ib.branch_id,
  b.name as branch_name,
  COUNT(*) as batch_count
FROM inventory_batches ib
LEFT JOIN branches b ON b.id = ib.branch_id
WHERE ib.material_id IS NOT NULL AND ib.notes = 'Stok Awal'
GROUP BY ib.branch_id, b.name;
