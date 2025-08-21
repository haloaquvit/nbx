-- Create production_records table
CREATE TABLE production_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ref VARCHAR(50) NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    note TEXT,
    consume_bom BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create product_materials table for BOM (Bill of Materials)
CREATE TABLE product_materials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    quantity DECIMAL(10,4) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, material_id)
);

-- Add updated_at trigger for production_records
CREATE OR REPLACE FUNCTION update_production_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_production_records_updated_at
    BEFORE UPDATE ON production_records
    FOR EACH ROW
    EXECUTE FUNCTION update_production_records_updated_at();

-- Add updated_at trigger for product_materials
CREATE OR REPLACE FUNCTION update_product_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_materials_updated_at
    BEFORE UPDATE ON product_materials
    FOR EACH ROW
    EXECUTE FUNCTION update_product_materials_updated_at();

-- Enable RLS for production_records
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for production_records
CREATE POLICY "Users can view all production records" ON production_records
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert production records" ON production_records
    FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own production records" ON production_records
    FOR UPDATE USING (auth.uid() = created_by);

-- Enable RLS for product_materials
ALTER TABLE product_materials ENABLE ROW LEVEL SECURITY;

-- RLS policies for product_materials
CREATE POLICY "Users can view all product materials" ON product_materials
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and owner can manage product materials" ON product_materials
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- Add indexes for better performance
CREATE INDEX idx_production_records_product_id ON production_records(product_id);
CREATE INDEX idx_production_records_created_by ON production_records(created_by);
CREATE INDEX idx_production_records_created_at ON production_records(created_at);
CREATE INDEX idx_product_materials_product_id ON product_materials(product_id);
CREATE INDEX idx_product_materials_material_id ON product_materials(material_id);