-- Update existing asset to connect with account and update account balance
DO $$
DECLARE
  v_asset_id TEXT;
  v_account_id TEXT;
  v_purchase_price NUMERIC;
  v_current_balance NUMERIC;
BEGIN
  -- Get the existing asset
  SELECT id, purchase_price INTO v_asset_id, v_purchase_price
  FROM assets
  WHERE asset_code = 'AST-26124557-J3Z'
  LIMIT 1;

  -- Find the Peralatan Produksi account (1410)
  SELECT id INTO v_account_id
  FROM accounts
  WHERE code = '1410'
  AND is_active = true
  LIMIT 1;

  IF v_asset_id IS NOT NULL AND v_account_id IS NOT NULL THEN
    -- Update asset with account_id and current_value
    UPDATE assets
    SET account_id = v_account_id,
        current_value = v_purchase_price
    WHERE id = v_asset_id;

    -- Update account balance
    SELECT balance INTO v_current_balance
    FROM accounts
    WHERE id = v_account_id;

    UPDATE accounts
    SET balance = v_current_balance + v_purchase_price
    WHERE id = v_account_id;

    RAISE NOTICE 'Asset updated and account balance increased by %', v_purchase_price;
  END IF;
END $$;
