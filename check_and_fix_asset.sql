-- Step 1: Check current state
SELECT
  'ASSET INFO' as type,
  id,
  asset_name,
  asset_code,
  category,
  purchase_price,
  current_value,
  account_id
FROM assets
WHERE asset_code = 'AST-26124557-J3Z';

-- Step 2: Check accounts
SELECT
  'ACCOUNTS INFO' as type,
  id,
  code,
  name,
  balance
FROM accounts
WHERE code IN ('1410', '1440')
ORDER BY code;

-- Step 3: Fix - Reset everything and do it correctly
DO $$
DECLARE
  v_asset_id TEXT;
  v_old_account_id TEXT;
  v_new_account_id TEXT;
  v_purchase_price NUMERIC;
BEGIN
  -- Get asset info
  SELECT id, purchase_price, account_id
  INTO v_asset_id, v_purchase_price, v_old_account_id
  FROM assets
  WHERE asset_code = 'AST-26124557-J3Z'
  LIMIT 1;

  -- Get the Bangunan account (1440)
  SELECT id INTO v_new_account_id
  FROM accounts
  WHERE code = '1440'
  AND is_active = true
  LIMIT 1;

  IF v_asset_id IS NOT NULL AND v_new_account_id IS NOT NULL THEN
    -- First, if old account exists and is different, remove the amount
    IF v_old_account_id IS NOT NULL AND v_old_account_id != v_new_account_id THEN
      UPDATE accounts
      SET balance = balance - v_purchase_price
      WHERE id = v_old_account_id;

      RAISE NOTICE 'Removed % from old account', v_purchase_price;
    END IF;

    -- Update asset
    UPDATE assets
    SET category = 'building',
        account_id = v_new_account_id,
        current_value = v_purchase_price
    WHERE id = v_asset_id;

    -- Add to new account only if old account was different (to avoid double addition)
    IF v_old_account_id IS NULL OR v_old_account_id != v_new_account_id THEN
      UPDATE accounts
      SET balance = COALESCE(balance, 0) + v_purchase_price
      WHERE id = v_new_account_id;

      RAISE NOTICE 'Added % to new account 1440', v_purchase_price;
    END IF;

    RAISE NOTICE 'Asset updated successfully';
  ELSE
    RAISE NOTICE 'Asset or account not found';
  END IF;
END $$;

-- Step 4: Verify the result
SELECT
  'FINAL ASSET INFO' as type,
  id,
  asset_name,
  category,
  purchase_price,
  current_value,
  account_id
FROM assets
WHERE asset_code = 'AST-26124557-J3Z';

SELECT
  'FINAL ACCOUNTS INFO' as type,
  id,
  code,
  name,
  balance
FROM accounts
WHERE code IN ('1410', '1440')
ORDER BY code;
