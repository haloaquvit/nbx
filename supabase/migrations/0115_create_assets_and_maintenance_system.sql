-- =====================================================
-- ASSET AND MAINTENANCE MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates tables for:
-- 1. Assets (physical assets like equipment, vehicles, etc.)
-- 2. Maintenance records (scheduled and completed maintenance)
-- 3. Notifications system (for maintenance reminders and other alerts)
-- =====================================================

-- =====================================================
-- 1. ASSETS TABLE
-- =====================================================
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

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_location ON assets(location);
CREATE INDEX IF NOT EXISTS idx_assets_purchase_date ON assets(purchase_date);

-- =====================================================
-- 2. MAINTENANCE RECORDS TABLE
-- =====================================================
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
    recurrence_interval INTEGER, -- in days
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
    parts_replaced TEXT, -- JSON array of parts
    labor_hours NUMERIC(8, 2),

    -- Result
    work_performed TEXT,
    findings TEXT,
    recommendations TEXT,

    -- Attachments
    attachments TEXT, -- JSON array of file URLs

    -- Notification
    notify_before_days INTEGER DEFAULT 7, -- Notify X days before due date
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

-- =====================================================
-- 3. NOTIFICATIONS TABLE
-- =====================================================
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
    reference_type TEXT, -- 'asset', 'maintenance', 'purchase_order', 'transaction', etc.
    reference_id TEXT,
    reference_url TEXT, -- Deep link to the relevant page

    -- Priority
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,

    -- Target User
    user_id UUID REFERENCES auth.users(id),

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- Auto-delete after expiry
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_reference ON notifications(reference_type, reference_id);

-- =====================================================
-- 4. FUNCTIONS
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
CREATE TRIGGER update_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenance_updated_at
    BEFORE UPDATE ON asset_maintenance
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
        -- Straight-line depreciation
        v_current_value := v_purchase_price -
                          ((v_purchase_price - v_salvage_value) / v_useful_life_years * v_years_elapsed);
    ELSE
        -- Declining balance (double declining)
        v_current_value := v_purchase_price * POWER(1 - (2.0 / v_useful_life_years), v_years_elapsed);
    END IF;

    -- Ensure value doesn't go below salvage value
    IF v_current_value < v_salvage_value THEN
        v_current_value := v_salvage_value;
    END IF;

    RETURN GREATEST(v_current_value, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to check and update overdue maintenance
CREATE OR REPLACE FUNCTION update_overdue_maintenance()
RETURNS void AS $$
BEGIN
    -- Update status to overdue for scheduled maintenance past due date
    UPDATE asset_maintenance
    SET status = 'overdue'
    WHERE status = 'scheduled'
      AND scheduled_date < CURRENT_DATE;

    -- Create notifications for overdue maintenance (if not already sent)
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-OVERDUE-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Maintenance Overdue: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is overdue since ' || am.scheduled_date::TEXT,
        'maintenance_overdue',
        'maintenance',
        am.id,
        '/maintenance',
        'high',
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'overdue'
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'overdue'
      AND notification_sent = FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to create maintenance reminder notifications
CREATE OR REPLACE FUNCTION create_maintenance_reminders()
RETURNS void AS $$
BEGIN
    -- Create notifications for upcoming maintenance
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority, user_id)
    SELECT
        'NOTIF-REMINDER-' || am.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'Upcoming Maintenance: ' || a.asset_name,
        'Maintenance "' || am.title || '" for asset "' || a.asset_name || '" is scheduled for ' || am.scheduled_date::TEXT,
        'maintenance_due',
        'maintenance',
        am.id,
        '/maintenance',
        CASE
            WHEN am.priority = 'critical' THEN 'urgent'
            WHEN am.priority = 'high' THEN 'high'
            ELSE 'normal'
        END,
        am.created_by
    FROM asset_maintenance am
    JOIN assets a ON am.asset_id = a.id
    WHERE am.status = 'scheduled'
      AND am.scheduled_date <= CURRENT_DATE + (am.notify_before_days || ' days')::INTERVAL
      AND am.scheduled_date >= CURRENT_DATE
      AND am.notification_sent = FALSE;

    -- Mark notifications as sent
    UPDATE asset_maintenance
    SET notification_sent = TRUE
    WHERE status = 'scheduled'
      AND scheduled_date <= CURRENT_DATE + (notify_before_days || ' days')::INTERVAL
      AND scheduled_date >= CURRENT_DATE
      AND notification_sent = FALSE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. TRIGGER FUNCTIONS FOR AUTO NOTIFICATIONS
-- =====================================================

-- Trigger function for new purchase orders
CREATE OR REPLACE FUNCTION notify_purchase_order_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
    VALUES (
        'NOTIF-PO-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
        'New Purchase Order Created',
        'PO #' || NEW.id || ' for supplier ' || COALESCE(NEW.supplier_name, 'Unknown') || ' - ' ||
        'Total: Rp ' || TO_CHAR(NEW.total, 'FM999,999,999,999'),
        'purchase_order_created',
        'purchase_order',
        NEW.id,
        '/purchase-orders/' || NEW.id,
        'normal'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for production completion
CREATE OR REPLACE FUNCTION notify_production_completed()
RETURNS TRIGGER AS $$
DECLARE
    v_product_name TEXT;
BEGIN
    -- Only notify when status changes to completed
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Get product name
        SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;

        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PROD-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Production Completed',
            'Production of ' || COALESCE(v_product_name, 'Unknown Product') || ' completed. Quantity: ' || NEW.quantity_produced,
            'production_completed',
            'production',
            NEW.id,
            '/production',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for debt payment
CREATE OR REPLACE FUNCTION notify_debt_payment()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for debt payment type
    IF NEW.type = 'pembayaran_utang' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-DEBT-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Debt Payment Recorded',
            'Payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.description, 'debt payment'),
            'debt_payment',
            'accounts_payable',
            NEW.reference_id,
            '/accounts-payable',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for payroll processing
CREATE OR REPLACE FUNCTION notify_payroll_processed()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify for payroll payment type
    IF NEW.type = 'pembayaran_gaji' THEN
        INSERT INTO notifications (id, title, message, type, reference_type, reference_id, reference_url, priority)
        VALUES (
            'NOTIF-PAYROLL-' || NEW.id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT,
            'Payroll Payment Processed',
            'Salary payment of Rp ' || TO_CHAR(NEW.amount, 'FM999,999,999,999') || ' for ' || COALESCE(NEW.reference_name, 'employee'),
            'payroll_processed',
            'payroll',
            NEW.reference_id,
            '/payroll',
            'normal'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. CREATE TRIGGERS
-- =====================================================

-- Purchase order notifications
DROP TRIGGER IF EXISTS trigger_notify_purchase_order ON purchase_orders;
CREATE TRIGGER trigger_notify_purchase_order
    AFTER INSERT ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION notify_purchase_order_created();

-- Production notifications
DROP TRIGGER IF EXISTS trigger_notify_production ON production_records;
CREATE TRIGGER trigger_notify_production
    AFTER INSERT OR UPDATE ON production_records
    FOR EACH ROW
    EXECUTE FUNCTION notify_production_completed();

-- Cash history notifications (for debt and payroll)
DROP TRIGGER IF EXISTS trigger_notify_cash_history ON cash_history;
CREATE TRIGGER trigger_notify_cash_history
    AFTER INSERT ON cash_history
    FOR EACH ROW
    EXECUTE FUNCTION notify_debt_payment();

DROP TRIGGER IF EXISTS trigger_notify_payroll ON cash_history;
CREATE TRIGGER trigger_notify_payroll
    AFTER INSERT ON cash_history
    FOR EACH ROW
    EXECUTE FUNCTION notify_payroll_processed();

-- =====================================================
-- 7. COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE assets IS 'Stores all company physical assets including equipment, vehicles, buildings, etc.';
COMMENT ON TABLE asset_maintenance IS 'Tracks all maintenance activities for assets - scheduled, in-progress, and completed';
COMMENT ON TABLE notifications IS 'Central notification system for all app activities and alerts';

COMMENT ON COLUMN assets.depreciation_method IS 'straight_line or declining_balance depreciation calculation method';
COMMENT ON COLUMN assets.current_value IS 'Auto-calculated current value after depreciation';
COMMENT ON COLUMN asset_maintenance.is_recurring IS 'If true, will auto-create next maintenance record when completed';
COMMENT ON COLUMN asset_maintenance.notify_before_days IS 'Number of days before scheduled date to send reminder notification';
COMMENT ON COLUMN notifications.expires_at IS 'Notifications will auto-delete after this date to keep table clean';

-- =====================================================
-- 8. SAMPLE DATA (OPTIONAL)
-- =====================================================

-- Insert sample asset categories reference
-- Users can refer to these when creating assets
COMMENT ON COLUMN assets.category IS 'Asset categories: equipment, vehicle, building, furniture, computer, other';
