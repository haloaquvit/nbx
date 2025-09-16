-- Add fields for purchase order receipt tracking
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date timestamptz;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_note_photo text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by text;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity numeric;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expedition_receiver text;