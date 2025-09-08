-- Fix Commission RLS Policies
-- Date: 2025-09-06
-- Purpose: Fix RLS policies to use profiles table instead of JWT claims

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view commission rules" ON commission_rules;
DROP POLICY IF EXISTS "Admin/Owner/Cashier can manage commission rules" ON commission_rules;
DROP POLICY IF EXISTS "Anyone can view commission entries" ON commission_entries;
DROP POLICY IF EXISTS "System can insert commission entries" ON commission_entries;
DROP POLICY IF EXISTS "Admin/Owner can manage commission entries" ON commission_entries;

-- Create new working policies for commission_rules
CREATE POLICY "Authenticated users can view commission rules" ON commission_rules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin/Owner/Cashier can manage commission rules" ON commission_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'cashier')
    )
  );

-- Create new working policies for commission_entries
CREATE POLICY "Authenticated users can view commission entries" ON commission_entries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert commission entries" ON commission_entries
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin/Owner can manage commission entries" ON commission_entries
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'cashier')
    )
  );

CREATE POLICY "Admin/Owner can delete commission entries" ON commission_entries
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'owner', 'cashier')
    )
  );

-- Grant permissions
GRANT ALL ON commission_rules TO authenticated;
GRANT ALL ON commission_entries TO authenticated;

SELECT 'Commission RLS policies berhasil diperbaiki!' as status;