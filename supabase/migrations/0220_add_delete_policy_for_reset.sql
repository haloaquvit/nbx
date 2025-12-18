-- Add DELETE policies for tables that need reset functionality
-- This allows authenticated users with admin/owner role to delete all records

-- production_records - add delete policy
CREATE POLICY "Admin and owner can delete production records" ON production_records
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- product_materials - already has ALL policy for admin/owner

-- Disable RLS on production_records for easier management (optional - uncomment if needed)
-- ALTER TABLE production_records DISABLE ROW LEVEL SECURITY;
