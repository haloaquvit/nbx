-- Fix existing asset mapping to correct account based on asset name/category
-- This will update the "Bangunan Pabrik" asset to Building category and 1440 account

DO $$
DECLARE
  v_asset_id TEXT;
  v_old_account_id TEXT;
  v_new_account_id TEXT;
  v_purchase_price NUMERIC;
  v_old_balance NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  -- Get the existing asset (Bangunan Pabrik)
  SELECT id, purchase_price, account_id
  INTO v_asset_id, v_purchase_price, v_old_account_id
  FROM assets
  WHERE asset_code = 'AST-26124557-J3Z'
  LIMIT 1;

  IF v_asset_id IS NOT NULL THEN
    -- Find the Bangunan account (1440)
    SELECT id INTO v_new_account_id
    FROM accounts
    WHERE code = '1440'
    AND is_active = true
    LIMIT 1;

    IF v_new_account_id IS NOT NULL THEN
      -- If asset already has an old account, remove the balance from old account
      IF v_old_account_id IS NOT NULL AND v_old_account_id != v_new_account_id THEN
        SELECT balance INTO v_old_balance
        FROM accounts
        WHERE id = v_old_account_id;

        UPDATE accounts
        SET balance = v_old_balance - v_purchase_price
        WHERE id = v_old_account_id;

        RAISE NOTICE 'Removed % from old account %', v_purchase_price, v_old_account_id;
      END IF;

      -- Update asset to building category and correct account
      UPDATE assets
      SET category = 'building',
          account_id = v_new_account_id,
          current_value = v_purchase_price
      WHERE id = v_asset_id;

      -- Add balance to new account (1440 Bangunan)
      SELECT balance INTO v_new_balance
      FROM accounts
      WHERE id = v_new_account_id;

      UPDATE accounts
      SET balance = COALESCE(v_new_balance, 0) + v_purchase_price
      WHERE id = v_new_account_id;

      RAISE NOTICE 'Asset updated to building category, account 1440 Bangunan with balance %', v_purchase_price;
    ELSE
      RAISE NOTICE 'Account 1440 Bangunan not found!';
    END IF;
  ELSE
    RAISE NOTICE 'Asset not found!';
  END IF;
END $$;
