-- Create production_errors table for tracking material errors during production
CREATE TABLE IF NOT EXISTS public.production_errors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    ref VARCHAR(50) NOT NULL UNIQUE,
    material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL CHECK (quantity > 0),
    note TEXT,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_production_errors_material_id ON public.production_errors(material_id);
CREATE INDEX IF NOT EXISTS idx_production_errors_created_by ON public.production_errors(created_by);
CREATE INDEX IF NOT EXISTS idx_production_errors_created_at ON public.production_errors(created_at);
CREATE INDEX IF NOT EXISTS idx_production_errors_ref ON public.production_errors(ref);

-- Enable RLS (Row Level Security)
ALTER TABLE public.production_errors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow authenticated users to view production errors" ON public.production_errors
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert production errors" ON public.production_errors
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Allow owners and admins to delete production errors" ON public.production_errors
    FOR DELETE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.production_errors TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE public.production_errors IS 'Records of material errors/defects during production process';
COMMENT ON COLUMN public.production_errors.ref IS 'Unique reference code for the error record (e.g., ERR-250122-001)';
COMMENT ON COLUMN public.production_errors.material_id IS 'Reference to the material that had errors';
COMMENT ON COLUMN public.production_errors.quantity IS 'Quantity of material that was defective/error';
COMMENT ON COLUMN public.production_errors.note IS 'Description of the error or defect';
COMMENT ON COLUMN public.production_errors.created_by IS 'User who recorded the error';