-- =====================================================
-- MANUAL MIGRATION - COPY PASTE KE SUPABASE SQL EDITOR
-- =====================================================
-- File ini menggabungkan 2 migration:
-- 1. Assets & Maintenance System
-- 2. Zakat & Charity System
--
-- CARA MENJALANKAN:
-- 1. Buka Supabase Dashboard
-- 2. Klik SQL Editor
-- 3. Copy-paste seluruh isi file ini
-- 4. Klik "Run"
-- =====================================================

-- =====================================================
-- PART 1: ASSET AND MAINTENANCE MANAGEMENT SYSTEM
-- =====================================================

-- 1. ASSETS TABLE
CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    asset_name TEXT NOT NULL,
    asset_code TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('equipment', 'vehicle', 'building', 'furniture', 'computer', 'other')),
    description TEXT,

    -- Purchase Information
    purchase_date DATE NOT NULL,
    purchase_price NUMERIC(15, 2) NOT NULL DEFAULT 0,
    supplier_name TEXT,

    -- Asset Details
    brand TEXT,
    model TEXT,
    serial_number TEXT,
    location TEXT,

    -- Depreciation
    useful_life_years INTEGER DEFAULT 5,
    salvage_value NUMERIC(15, 2) DEFAULT 0,
    depreciation_method TEXT DEFAULT 'straight_line' CHECK (depreciation_method IN ('straight_line', 'declining_balance')),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'retired', 'sold')),
    condition TEXT DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'poor')),

    -- Financial Integration
    account_id TEXT REFERENCES accounts(id),
    current_value NUMERIC(15, 2),

    -- Additional Info
    warranty_expiry DATE,
    insurance_expiry DATE,
    notes TEXT,
    photo_url TEXT,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for assets
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location);
CREATE INDEX IF NOT EXISTS idx_assets_purchase_date ON assets(purchase_date);

-- 2. MAINTENANCE RECORDS TABLE
CREATE TABLE IF NOT EXISTS asset_maintenance (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,

    -- Maintenance Type
    maintenance_type TEXT NOT NULL CHECK (maintenance_type IN ('preventive', 'corrective', 'inspection', 'calibration', 'other')),
    title TEXT NOT NULL,
    description TEXT,

    -- Schedule Information
    scheduled_date DATE NOT NULL,
    completed_date DATE,
    next_maintenance_date DATE,

    -- Frequency (for recurring maintenance)
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_interval INTEGER,
    recurrence_unit TEXT CHECK (recurrence_unit IN ('days', 'weeks', 'months', 'years')),

    -- Status
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'overdue')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),

    -- Cost Information
    estimated_cost NUMERIC(15, 2) DEFAULT 0,
    actual_cost NUMERIC(15, 2) DEFAULT 0,
    payment_account_id TEXT REFERENCES accounts(id),

    -- Service Provider
    service_provider TEXT,
    technician_name TEXT,

    -- Parts Used
    parts_replaced TEXT,
    labor_hours NUMERIC(8, 2),

    -- Result
    work_performed TEXT,
    findings TEXT,
    recommendations TEXT,

    -- Attachments
    attachments TEXT,

    -- Notification
    notify_before_days INTEGER DEFAULT 7,
    notification_sent BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    completed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for maintenance
CREATE INDEX IF NOT EXISTS idx_maintenance_asset ON asset_maintenance(asset_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON asset_maintenance(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled_date ON asset_maintenance(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON asset_maintenance(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_type ON asset_maintenance(maintenance_type);

-- 3. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,

    -- Notification Details
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (
        'maintenance_due',
        'maintenance_overdue',
        'warranty_expiry',
        'insurance_expiry',
        'purchase_order_created',
        'purchase_order_received',
        'production_completed',
        'advance_request',
        'payroll_processed',
        'debt_payment',
        'low_stock',
        'transaction_created',
        'delivery_scheduled',
        'system_alert',
        'other'
    )),

    -- Reference Information
    reference_type TEXT,
    reference_id TEXT,
    reference_url TEXT,

    -- Priority
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Target User
    user_id UUID REFERENCES auth.users(id),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- =====================================================
-- PART 2: ZAKAT AND CHARITY MANAGEMENT SYSTEM
-- =====================================================

-- 1. ZAKAT AND CHARITY RECORDS TABLE
CREATE TABLE IF NOT EXISTS zakat_records (
    id TEXT PRIMARY KEY,

    -- Type
    type TEXT NOT NULL CHECK (type IN (
        'zakat_mal',
        'zakat_fitrah',
        'zakat_penghasilan',
        'zakat_perdagangan',
        'zakat_emas',
        'sedekah',
        'infaq',
        'wakaf',
        'qurban',
        'other'
    )),
    category TEXT NOT NULL CHECK (category IN ('zakat', 'charity')),

    -- Details
    title TEXT NOT NULL,
    description TEXT,
    recipient TEXT,
    recipient_type TEXT CHECK (recipient_type IN ('individual', 'mosque', 'orphanage', 'institution', 'other')),

    -- Amount
    amount NUMERIC(15, 2) NOT NULL,
    nishab_amount NUMERIC(15, 2),
    percentage_rate NUMERIC(5, 2) DEFAULT 2.5,

    -- Payment Info
    payment_date DATE NOT NULL,
    payment_account_id TEXT REFERENCES accounts(id),
    payment_method TEXT CHECK (payment_method IN ('cash', 'transfer', 'check', 'other')),

    -- Status
    status TEXT DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'cancelled')),

    -- Reference
    cash_history_id TEXT,
    receipt_number TEXT,

    -- Calculation Details
    calculation_basis TEXT,
    calculation_notes TEXT,

    -- Additional Info
    is_anonymous BOOLEAN DEFAULT FALSE,
    notes TEXT,
    attachment_url TEXT,

    -- Islamic Calendar
    hijri_year TEXT,
    hijri_month TEXT,

    -- Metadata
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for zakat records
CREATE INDEX IF NOT EXISTS idx_zakat_type ON zakat_records(type);
CREATE INDEX IF NOT EXISTS idx_zakat_category ON zakat_records(category);
CREATE INDEX IF NOT EXISTS idx_zakat_payment_date ON zakat_records(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_zakat_recipient ON zakat_records(recipient);
CREATE INDEX IF NOT EXISTS idx_zakat_status ON zakat_records(status);
CREATE INDEX IF NOT EXISTS idx_zakat_hijri_year ON zakat_records(hijri_year);

-- 2. NISHAB REFERENCE TABLE
CREATE TABLE IF NOT EXISTS nishab_reference (
    id SERIAL PRIMARY KEY,

    -- Precious Metal Prices (per gram in IDR)
    gold_price NUMERIC(15, 2) NOT NULL,
    silver_price NUMERIC(15, 2) NOT NULL,

    -- Nishab Standards
    gold_nishab NUMERIC(8, 2) DEFAULT 85,
    silver_nishab NUMERIC(8, 2) DEFAULT 595,

    -- Zakat Rate
    zakat_rate NUMERIC(5, 2) DEFAULT 2.5,

    -- Metadata
    effective_date DATE NOT NULL,
    created_by TEXT REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Index for nishab reference
CREATE INDEX IF NOT EXISTS idx_nishab_effective_date ON nishab_reference(effective_date DESC);

-- =====================================================
-- PART 3: FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_assets_updated_at ON assets;
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_maintenance_updated_at ON asset_maintenance;
CREATE TRIGGER update_maintenance_updated_at
    BEFORE UPDATE ON asset_maintenance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_zakat_records_updated_at ON zakat_records;
CREATE TRIGGER update_zakat_records_updated_at
    BEFORE UPDATE ON zakat_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate asset current value (depreciation)
CREATE OR REPLACE FUNCTION calculate_asset_current_value(
    p_asset_id TEXT
)
RETURNS NUMERIC AS $$
DECLARE
    v_purchase_price NUMERIC;
    v_purchase_date DATE;
    v_useful_life_years INTEGER;
    v_salvage_value NUMERIC;
    v_depreciation_method TEXT;
    v_years_elapsed NUMERIC;
    v_current_value NUMERIC;
BEGIN
    -- Get asset details
    SELECT
        purchase_price,
        purchase_date,
        useful_life_years,
        salvage_value,
        depreciation_method
    INTO
        v_purchase_price,
        v_purchase_date,
        v_useful_life_years,
        v_salvage_value,
        v_depreciation_method
    FROM assets
    WHERE id = p_asset_id;

    -- Calculate years elapsed
    v_years_elapsed := EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_purchase_date)) +
                      (EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_purchase_date)) / 12.0);

    -- Calculate depreciation based on method
    IF v_depreciation_method = 'straight_line' THEN
        v_current_value := v_purchase_price -
                          ((v_purchase_price - v_salvage_value) / v_useful_life_years * v_years_elapsed);
    ELSE
        v_current_value := v_purchase_price * POWER(1 - (2.0 / v_useful_life_years), v_years_elapsed);
    END IF;

    -- Ensure value doesn't go below salvage value
    IF v_current_value < v_salvage_value THEN
        v_current_value := v_salvage_value;
    END IF;

    RETURN GREATEST(v_current_value, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get current nishab values
CREATE OR REPLACE FUNCTION get_current_nishab()
RETURNS TABLE (
    gold_price NUMERIC,
    silver_price NUMERIC,
    gold_nishab NUMERIC,
    silver_nishab NUMERIC,
    zakat_rate NUMERIC,
    gold_nishab_value NUMERIC,
    silver_nishab_value NUMERIC
) AS $$
DECLARE
    v_gold_price NUMERIC;
    v_silver_price NUMERIC;
    v_gold_nishab NUMERIC;
    v_silver_nishab NUMERIC;
    v_zakat_rate NUMERIC;
BEGIN
    -- Get the most recent nishab values
    SELECT
        nr.gold_price,
        nr.silver_price,
        nr.gold_nishab,
        nr.silver_nishab,
        nr.zakat_rate
    INTO
        v_gold_price,
        v_silver_price,
        v_gold_nishab,
        v_silver_nishab,
        v_zakat_rate
    FROM nishab_reference nr
    WHERE nr.effective_date <= CURRENT_DATE
    ORDER BY nr.effective_date DESC
    LIMIT 1;

    -- If no record found, return default values
    IF v_gold_price IS NULL THEN
        v_gold_price := 1100000;
        v_silver_price := 15000;
        v_gold_nishab := 85;
        v_silver_nishab := 595;
        v_zakat_rate := 2.5;
    END IF;

    RETURN QUERY SELECT
        v_gold_price,
        v_silver_price,
        v_gold_nishab,
        v_silver_nishab,
        v_zakat_rate,
        v_gold_price * v_gold_nishab AS gold_nishab_value,
        v_silver_price * v_silver_nishab AS silver_nishab_value;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate zakat amount
CREATE OR REPLACE FUNCTION calculate_zakat_amount(
    p_asset_value NUMERIC,
    p_nishab_type TEXT DEFAULT 'gold'
)
RETURNS TABLE (
    asset_value NUMERIC,
    nishab_value NUMERIC,
    is_obligatory BOOLEAN,
    zakat_amount NUMERIC,
    rate NUMERIC
) AS $$
DECLARE
    v_nishab_value NUMERIC;
    v_zakat_rate NUMERIC;
    v_is_obligatory BOOLEAN;
    v_zakat_amount NUMERIC;
BEGIN
    -- Get current nishab
    SELECT
        CASE
            WHEN p_nishab_type = 'silver' THEN cn.silver_nishab_value
            ELSE cn.gold_nishab_value
        END,
        cn.zakat_rate
    INTO
        v_nishab_value,
        v_zakat_rate
    FROM get_current_nishab() cn;

    -- Check if zakat is obligatory
    v_is_obligatory := p_asset_value >= v_nishab_value;

    -- Calculate zakat amount
    IF v_is_obligatory THEN
        v_zakat_amount := p_asset_value * (v_zakat_rate / 100);
    ELSE
        v_zakat_amount := 0;
    END IF;

    RETURN QUERY SELECT
        p_asset_value,
        v_nishab_value,
        v_is_obligatory,
        v_zakat_amount,
        v_zakat_rate;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 4: INSERT DEFAULT DATA
-- =====================================================

-- Insert current nishab reference
INSERT INTO nishab_reference (
    gold_price,
    silver_price,
    gold_nishab,
    silver_nishab,
    zakat_rate,
    effective_date,
    notes
) VALUES (
    1100000,
    15000,
    85,
    595,
    2.5,
    CURRENT_DATE,
    'Initial nishab values - please update with current market prices'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- SELESAI! MIGRATION BERHASIL
-- =====================================================
-- Tabel yang sudah dibuat:
-- ✅ assets
-- ✅ asset_maintenance
-- ✅ notifications
-- ✅ zakat_records
-- ✅ nishab_reference
--
-- Functions yang sudah dibuat:
-- ✅ calculate_asset_current_value()
-- ✅ get_current_nishab()
-- ✅ calculate_zakat_amount()
-- =====================================================
