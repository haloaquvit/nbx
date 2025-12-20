-- Migration: Add product_id and item_type to purchase_order_items
-- This allows PO to purchase both materials (bahan baku) and products (produk jual langsung)

-- Add product_id column (nullable, references products table)
ALTER TABLE purchase_order_items
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;

-- Add item_type column to distinguish between material and product purchases
ALTER TABLE purchase_order_items
ADD COLUMN IF NOT EXISTS item_type TEXT DEFAULT 'material' CHECK (item_type IN ('material', 'product'));

-- Make material_id nullable (since we now have product_id as alternative)
ALTER TABLE purchase_order_items
ALTER COLUMN material_id DROP NOT NULL;

-- Add constraint: either material_id OR product_id must be set (not both null)
ALTER TABLE purchase_order_items
ADD CONSTRAINT check_item_reference
CHECK (material_id IS NOT NULL OR product_id IS NOT NULL);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_po_items_product_id ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_po_items_item_type ON purchase_order_items(item_type);

-- Comment
COMMENT ON COLUMN purchase_order_items.product_id IS 'Reference to products table for "Jual Langsung" product purchases';
COMMENT ON COLUMN purchase_order_items.item_type IS 'Type of item: material (bahan baku) or product (produk jual langsung)';
