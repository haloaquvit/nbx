-- =====================================================
-- ZAKAT AND CHARITY MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates tables for:
-- 1. Zakat & Sedekah records
-- 2. Nishab reference values
-- =====================================================

-- =====================================================
-- 1. ZAKAT AND CHARITY RECORDS TABLE
-- =====================================================
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
    recipient TEXT, -- Person or institution receiving
    recipient_type TEXT CHECK (recipient_type IN ('individual', 'mosque', 'orphanage', 'institution', 'other')),

    -- Amount
    amount NUMERIC(15, 2) NOT NULL,
    nishab_amount NUMERIC(15, 2), -- Minimum amount for zakat obligation
    percentage_rate NUMERIC(5, 2) DEFAULT 2.5, -- Usually 2.5% for zakat mal

    -- Payment Info
    payment_date DATE NOT NULL,
    payment_account_id TEXT REFERENCES accounts(id),
    payment_method TEXT CHECK (payment_method IN ('cash', 'transfer', 'check', 'other')),

    -- Status
    status TEXT DEFAULT 'paid' CHECK (status IN ('pending', 'paid', 'cancelled')),

    -- Reference
    cash_history_id TEXT, -- Link to cash_history table
    receipt_number TEXT,

    -- Calculation Details (for zakat)
    calculation_basis TEXT, -- What was this zakat calculated from
    calculation_notes TEXT,

    -- Additional Info
    is_anonymous BOOLEAN DEFAULT FALSE,
    notes TEXT,
    attachment_url TEXT, -- Receipt or proof

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

-- =====================================================
-- 2. NISHAB REFERENCE TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS nishab_reference (
    id SERIAL PRIMARY KEY,

    -- Precious Metal Prices (per gram in IDR)
    gold_price NUMERIC(15, 2) NOT NULL,
    silver_price NUMERIC(15, 2) NOT NULL,

    -- Nishab Standards
    gold_nishab NUMERIC(8, 2) DEFAULT 85, -- 85 grams
    silver_nishab NUMERIC(8, 2) DEFAULT 595, -- 595 grams

    -- Zakat Rate
    zakat_rate NUMERIC(5, 2) DEFAULT 2.5, -- 2.5%

    -- Metadata
    effective_date DATE NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT
);

-- Index for nishab reference
CREATE INDEX IF NOT EXISTS idx_nishab_effective_date ON nishab_reference(effective_date DESC);

-- =====================================================
-- 3. FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp for zakat records
CREATE TRIGGER update_zakat_records_updated_at
    BEFORE UPDATE ON zakat_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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
        v_gold_price := 1000000; -- Default Rp 1,000,000 per gram
        v_silver_price := 15000; -- Default Rp 15,000 per gram
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
    p_nishab_type TEXT DEFAULT 'gold' -- 'gold' or 'silver'
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

-- Function to create cash history entry for zakat/charity payment
CREATE OR REPLACE FUNCTION create_zakat_cash_entry()
RETURNS TRIGGER AS $$
DECLARE
    v_account_name TEXT;
    v_cash_history_id TEXT;
BEGIN
    -- Only create cash entry if status is 'paid' and payment account is specified
    IF NEW.status = 'paid' AND NEW.payment_account_id IS NOT NULL AND NEW.cash_history_id IS NULL THEN
        -- Get account name
        SELECT name INTO v_account_name FROM accounts WHERE id = NEW.payment_account_id;

        -- Generate cash history ID
        v_cash_history_id := 'CH-ZAKAT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT;

        -- Insert into cash_history
        INSERT INTO cash_history (
            id,
            account_id,
            account_name,
            amount,
            type,
            description,
            reference_type,
            reference_id,
            reference_name,
            created_at
        ) VALUES (
            v_cash_history_id,
            NEW.payment_account_id,
            v_account_name,
            NEW.amount,
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'sedekah'
            END,
            NEW.title || COALESCE(' - ' || NEW.description, ''),
            CASE
                WHEN NEW.category = 'zakat' THEN 'zakat'
                ELSE 'charity'
            END,
            NEW.id,
            NEW.title,
            NEW.payment_date
        );

        -- Update the zakat record with cash_history_id
        NEW.cash_history_id := v_cash_history_id;

        -- Update account balance
        UPDATE accounts
        SET balance = balance - NEW.amount
        WHERE id = NEW.payment_account_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create cash entry
DROP TRIGGER IF EXISTS trigger_create_zakat_cash_entry ON zakat_records;
CREATE TRIGGER trigger_create_zakat_cash_entry
    BEFORE INSERT OR UPDATE ON zakat_records
    FOR EACH ROW
    EXECUTE FUNCTION create_zakat_cash_entry();

-- =====================================================
-- 4. INSERT DEFAULT NISHAB VALUES
-- =====================================================

-- Insert current nishab reference (prices as of common market rates)
INSERT INTO nishab_reference (
    gold_price,
    silver_price,
    gold_nishab,
    silver_nishab,
    zakat_rate,
    effective_date,
    notes
) VALUES (
    1100000, -- Rp 1,100,000 per gram gold (approximate)
    15000,   -- Rp 15,000 per gram silver (approximate)
    85,      -- 85 grams gold
    595,     -- 595 grams silver
    2.5,     -- 2.5% zakat rate
    CURRENT_DATE,
    'Initial nishab values - please update with current market prices'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 5. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE zakat_records IS 'Stores all zakat and charity (sedekah, infaq, wakaf) transactions';
COMMENT ON TABLE nishab_reference IS 'Reference values for calculating zakat obligations based on gold/silver prices';

COMMENT ON COLUMN zakat_records.category IS 'zakat or charity - main classification';
COMMENT ON COLUMN zakat_records.type IS 'Specific type like zakat_mal, zakat_fitrah, sedekah, etc.';
COMMENT ON COLUMN zakat_records.nishab_amount IS 'Minimum threshold amount for zakat obligation';
COMMENT ON COLUMN zakat_records.percentage_rate IS 'Zakat rate, usually 2.5% for mal';
COMMENT ON COLUMN zakat_records.is_anonymous IS 'If true, donor name will not be disclosed';
COMMENT ON COLUMN zakat_records.hijri_year IS 'Islamic calendar year (e.g., 1445H)';
COMMENT ON COLUMN zakat_records.hijri_month IS 'Islamic calendar month (e.g., Ramadan, Syawal)';

COMMENT ON FUNCTION calculate_zakat_amount IS 'Calculate zakat obligation based on asset value and nishab threshold';
COMMENT ON FUNCTION get_current_nishab IS 'Get current nishab values for zakat calculation';
