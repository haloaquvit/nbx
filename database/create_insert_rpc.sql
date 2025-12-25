-- ============================================================
-- RPC FUNCTION: insert_delivery
-- SECURITY DEFINER untuk bypass RLS saat RETURNING
-- FIXED: p_transaction_id dan transaction_id menggunakan TEXT
-- ============================================================

-- Drop function lama jika ada (dengan berbagai signature)
DROP FUNCTION IF EXISTS insert_delivery(uuid, integer, text, text, text, timestamptz, text, text, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS insert_delivery(text, integer, text, text, text, timestamptz, text, text, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.insert_delivery(
  p_transaction_id TEXT,
  p_delivery_number INTEGER,
  p_customer_name TEXT,
  p_customer_address TEXT DEFAULT '',
  p_customer_phone TEXT DEFAULT '',
  p_delivery_date TIMESTAMPTZ DEFAULT NOW(),
  p_photo_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_driver_id UUID DEFAULT NULL,
  p_helper_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  transaction_id TEXT,
  delivery_number INTEGER,
  customer_name TEXT,
  customer_address TEXT,
  customer_phone TEXT,
  delivery_date TIMESTAMPTZ,
  photo_url TEXT,
  notes TEXT,
  driver_id UUID,
  helper_id UUID,
  branch_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO deliveries (
    transaction_id,
    delivery_number,
    customer_name,
    customer_address,
    customer_phone,
    delivery_date,
    photo_url,
    notes,
    driver_id,
    helper_id,
    branch_id
  )
  VALUES (
    p_transaction_id,
    p_delivery_number,
    p_customer_name,
    p_customer_address,
    p_customer_phone,
    p_delivery_date,
    p_photo_url,
    p_notes,
    p_driver_id,
    p_helper_id,
    p_branch_id
  )
  RETURNING deliveries.id INTO new_id;

  -- Return full row
  RETURN QUERY
  SELECT
    d.id,
    d.transaction_id,
    d.delivery_number,
    d.customer_name,
    d.customer_address,
    d.customer_phone,
    d.delivery_date,
    d.photo_url,
    d.notes,
    d.driver_id,
    d.helper_id,
    d.branch_id,
    d.created_at,
    d.updated_at
  FROM deliveries d
  WHERE d.id = new_id;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.insert_delivery(TEXT, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;

-- ============================================================
-- RPC FUNCTION: insert_journal_entry
-- SECURITY DEFINER untuk bypass RLS saat RETURNING
-- ============================================================

DROP FUNCTION IF EXISTS insert_journal_entry(text, date, text, text, uuid, text, numeric, numeric, uuid, uuid, uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.insert_journal_entry(
  p_entry_number TEXT,
  p_entry_date DATE,
  p_description TEXT,
  p_reference_type TEXT,
  p_reference_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_total_debit NUMERIC DEFAULT 0,
  p_total_credit NUMERIC DEFAULT 0,
  p_branch_id UUID DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_approved_by UUID DEFAULT NULL,
  p_approved_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  entry_number TEXT,
  entry_date DATE,
  description TEXT,
  reference_type TEXT,
  reference_id UUID,
  status TEXT,
  total_debit NUMERIC,
  total_credit NUMERIC,
  branch_id UUID,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO journal_entries (
    entry_number,
    entry_date,
    description,
    reference_type,
    reference_id,
    status,
    total_debit,
    total_credit,
    branch_id,
    created_by,
    approved_by,
    approved_at
  )
  VALUES (
    p_entry_number,
    p_entry_date,
    p_description,
    p_reference_type,
    p_reference_id,
    p_status,
    p_total_debit,
    p_total_credit,
    p_branch_id,
    p_created_by,
    p_approved_by,
    p_approved_at
  )
  RETURNING journal_entries.id INTO new_id;

  -- Return full row
  RETURN QUERY
  SELECT
    j.id,
    j.entry_number,
    j.entry_date,
    j.description,
    j.reference_type,
    j.reference_id,
    j.status,
    j.total_debit,
    j.total_credit,
    j.branch_id,
    j.created_by,
    j.approved_by,
    j.approved_at,
    j.created_at,
    j.updated_at
  FROM journal_entries j
  WHERE j.id = new_id;
END;
$$;

-- Grant execute to authenticated role
GRANT EXECUTE ON FUNCTION public.insert_journal_entry(TEXT, DATE, TEXT, TEXT, UUID, TEXT, NUMERIC, NUMERIC, UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;
