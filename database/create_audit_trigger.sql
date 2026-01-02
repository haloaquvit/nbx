-- ============================================================================
-- UNIVERSAL AUDIT LOG TRIGGER
-- ============================================================================
-- Mencatat semua INSERT, UPDATE, DELETE pada tabel yang ditentukan
--
-- Informasi yang dicatat:
-- - table_name: Nama tabel yang diubah
-- - operation: INSERT, UPDATE, DELETE
-- - record_id: ID record yang diubah
-- - old_data: Data sebelum perubahan (untuk UPDATE dan DELETE)
-- - new_data: Data setelah perubahan (untuk INSERT dan UPDATE)
-- - changed_fields: Field yang berubah beserta nilai lama dan baru (UPDATE only)
-- - user_id, user_email, user_role: Info user yang melakukan perubahan
-- - created_at: Timestamp perubahan
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Update struktur tabel audit_logs jika perlu
-- ============================================================================
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS changed_fields jsonb,
ADD COLUMN IF NOT EXISTS ip_address text,
ADD COLUMN IF NOT EXISTS user_agent text;

-- Index untuk query audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_operation ON audit_logs(operation);

-- ============================================================================
-- STEP 2: Buat fungsi trigger universal
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
  old_data jsonb := NULL;
  new_data jsonb := NULL;
  changed_fields jsonb := NULL;
  record_id text := NULL;
  current_user_id uuid := NULL;
  current_user_email text := NULL;
  current_user_role text := NULL;
  key text;
  old_value jsonb;
  new_value jsonb;
BEGIN
  -- Coba ambil info user dari session (Supabase/PostgREST)
  BEGIN
    current_user_id := (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
    current_user_email := current_setting('request.jwt.claims', true)::jsonb->>'email';
    current_user_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  EXCEPTION WHEN OTHERS THEN
    -- Jika tidak ada JWT (direct connection), gunakan current_user
    current_user_email := current_user;
  END;

  -- Tentukan data berdasarkan operasi
  IF (TG_OP = 'DELETE') THEN
    old_data := to_jsonb(OLD);
    record_id := COALESCE(OLD.id::text, 'unknown');

  ELSIF (TG_OP = 'UPDATE') THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    record_id := COALESCE(NEW.id::text, OLD.id::text, 'unknown');

    -- Hitung field yang berubah
    changed_fields := '{}'::jsonb;
    FOR key IN SELECT jsonb_object_keys(new_data)
    LOOP
      old_value := old_data->key;
      new_value := new_data->key;

      -- Skip jika nilai sama atau field adalah updated_at
      IF old_value IS DISTINCT FROM new_value AND key NOT IN ('updated_at') THEN
        changed_fields := changed_fields || jsonb_build_object(
          key, jsonb_build_object(
            'old', old_value,
            'new', new_value
          )
        );
      END IF;
    END LOOP;

    -- Jika tidak ada perubahan substantif, skip audit
    IF changed_fields = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

  ELSIF (TG_OP = 'INSERT') THEN
    new_data := to_jsonb(NEW);
    record_id := COALESCE(NEW.id::text, 'unknown');
  END IF;

  -- Insert ke audit_logs
  INSERT INTO audit_logs (
    table_name,
    operation,
    record_id,
    old_data,
    new_data,
    changed_fields,
    user_id,
    user_email,
    user_role,
    created_at
  ) VALUES (
    TG_TABLE_NAME,
    TG_OP,
    record_id,
    old_data,
    new_data,
    changed_fields,
    current_user_id,
    current_user_email,
    current_user_role,
    NOW()
  );

  -- Return sesuai operasi
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 3: Buat fungsi helper untuk menambahkan trigger ke tabel
-- ============================================================================
CREATE OR REPLACE FUNCTION enable_audit_for_table(target_table text)
RETURNS void AS $$
DECLARE
  trigger_name text;
BEGIN
  trigger_name := 'audit_trigger_' || target_table;

  -- Drop trigger jika sudah ada
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, target_table);

  -- Buat trigger baru
  EXECUTE format(
    'CREATE TRIGGER %I
     AFTER INSERT OR UPDATE OR DELETE ON %I
     FOR EACH ROW EXECUTE FUNCTION audit_trigger_func()',
    trigger_name, target_table
  );

  RAISE NOTICE 'Audit trigger enabled for table: %', target_table;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: Terapkan trigger ke tabel-tabel penting
-- ============================================================================

-- Master Data
SELECT enable_audit_for_table('products');
SELECT enable_audit_for_table('materials');
SELECT enable_audit_for_table('customers');
SELECT enable_audit_for_table('suppliers');
SELECT enable_audit_for_table('employees');
SELECT enable_audit_for_table('profiles');
SELECT enable_audit_for_table('accounts');
SELECT enable_audit_for_table('branches');

-- Transaksi
SELECT enable_audit_for_table('transactions');
SELECT enable_audit_for_table('expenses');
SELECT enable_audit_for_table('purchase_orders');
SELECT enable_audit_for_table('deliveries');
SELECT enable_audit_for_table('delivery_items');

-- Inventory
SELECT enable_audit_for_table('inventory_batches');
SELECT enable_audit_for_table('stock_movements');
SELECT enable_audit_for_table('production_records');

-- Keuangan
SELECT enable_audit_for_table('journal_entries');
SELECT enable_audit_for_table('journal_entry_lines');
SELECT enable_audit_for_table('receivables');
SELECT enable_audit_for_table('payables');

-- HR
SELECT enable_audit_for_table('employee_advances');
SELECT enable_audit_for_table('payroll');
SELECT enable_audit_for_table('attendance');

-- Retasi
SELECT enable_audit_for_table('retasi');
SELECT enable_audit_for_table('retasi_items');

-- ============================================================================
-- STEP 5: Buat view untuk melihat audit logs dengan mudah
-- ============================================================================
CREATE OR REPLACE VIEW v_audit_logs_readable AS
SELECT
  al.id,
  al.created_at as "Waktu",
  al.table_name as "Tabel",
  al.operation as "Operasi",
  al.record_id as "Record ID",
  COALESCE(al.user_email, 'system') as "User",
  al.user_role as "Role",
  CASE
    WHEN al.operation = 'INSERT' THEN 'Data baru dibuat'
    WHEN al.operation = 'DELETE' THEN 'Data dihapus'
    WHEN al.operation = 'UPDATE' THEN
      (SELECT string_agg(key || ': ' || (value->>'old')::text || ' -> ' || (value->>'new')::text, ', ')
       FROM jsonb_each(al.changed_fields))
    ELSE 'Unknown'
  END as "Perubahan",
  al.changed_fields as "Detail Perubahan"
FROM audit_logs al
ORDER BY al.created_at DESC;

-- ============================================================================
-- STEP 6: Buat fungsi untuk query audit history per record
-- ============================================================================
CREATE OR REPLACE FUNCTION get_record_history(
  p_table_name text,
  p_record_id text
)
RETURNS TABLE (
  audit_time timestamp with time zone,
  operation text,
  user_email text,
  changed_fields jsonb,
  old_data jsonb,
  new_data jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    al.created_at,
    al.operation,
    al.user_email,
    al.changed_fields,
    al.old_data,
    al.new_data
  FROM audit_logs al
  WHERE al.table_name = p_table_name
    AND al.record_id = p_record_id
  ORDER BY al.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DONE
-- ============================================================================
COMMIT;

-- Tampilkan tabel yang sudah punya audit trigger
SELECT
  tgrelid::regclass as table_name,
  tgname as trigger_name
FROM pg_trigger
WHERE tgname LIKE 'audit_trigger_%'
ORDER BY tgrelid::regclass::text;
