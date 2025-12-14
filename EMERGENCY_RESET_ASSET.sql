-- EMERGENCY: Reset asset and accounts to original state before the broken migration

DO $$
DECLARE
  v_asset_id TEXT;
  v_account_1410_id TEXT;
  v_account_1440_id TEXT;
BEGIN
  -- Get account IDs
  SELECT id INTO v_account_1410_id FROM accounts WHERE code = '1410' LIMIT 1;
  SELECT id INTO v_account_1440_id FROM accounts WHERE code = '1440' LIMIT 1;

  -- Get asset ID
  SELECT id INTO v_asset_id FROM assets WHERE asset_code = 'AST-26124557-J3Z' LIMIT 1;

  -- Reset account balances to 0 first to avoid confusion
  UPDATE accounts SET balance = 0 WHERE id = v_account_1410_id;
  UPDATE accounts SET balance = 0 WHERE id = v_account_1440_id;

  -- Reset asset to have NO account_id (will be auto-assigned on next save)
  UPDATE assets
  SET account_id = NULL,
      current_value = purchase_price
  WHERE id = v_asset_id;

  RAISE NOTICE 'Reset complete. Asset and accounts cleared.';
END $$;

-- Now manually set the correct category and let the system auto-assign account
UPDATE assets
SET category = 'building'
WHERE asset_code = 'AST-26124557-J3Z';

-- Manually assign to correct account and update balance
DO $$
DECLARE
  v_asset_id TEXT;
  v_account_id TEXT;
  v_price NUMERIC;
BEGIN
  -- Get asset
  SELECT id, purchase_price INTO v_asset_id, v_price
  FROM assets
  WHERE asset_code = 'AST-26124557-J3Z';

  -- Get account 1440
  SELECT id INTO v_account_id
  FROM accounts
  WHERE code = '1440';

  -- Update asset
  UPDATE assets
  SET account_id = v_account_id,
      current_value = v_price
  WHERE id = v_asset_id;

  -- Update account balance
  UPDATE accounts
  SET balance = v_price
  WHERE id = v_account_id;

  RAISE NOTICE 'Asset properly assigned to account 1440 with balance %', v_price;
END $$;

-- Verify
SELECT
  a.asset_name,
  a.category,
  a.purchase_price,
  a.current_value,
  acc.code,
  acc.name,
  acc.balance
FROM assets a
LEFT JOIN accounts acc ON a.account_id = acc.id
WHERE a.asset_code = 'AST-26124557-J3Z';
