-- Test process_delivery_atomic RPC
SELECT * FROM process_delivery_atomic(
  p_transaction_id := 'AIR-MIG-AR-0222',
  p_items := '[
    {
      "product_id": "81c600c6-eedc-4db2-af43-69f04e16953b",
      "quantity": 1,
      "product_name": "Es Kristal Aquvit 5 Kg",
      "unit": "pcs",
      "is_bonus": false
    }
  ]'::jsonb,
  p_branch_id := '13d4e975-d9cb-407b-9d2e-5e33cf8cef64'::uuid,
  p_delivery_date := '2026-01-04'::date
);
