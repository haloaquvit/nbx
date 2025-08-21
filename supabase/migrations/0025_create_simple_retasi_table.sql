-- Simple retasi table creation
CREATE TABLE IF NOT EXISTS public.retasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retasi_number TEXT NOT NULL UNIQUE,
  truck_number TEXT,
  driver_name TEXT,
  helper_name TEXT,
  departure_date DATE NOT NULL,
  departure_time TIME,
  route TEXT,
  total_items INTEGER DEFAULT 0,
  total_weight DECIMAL(10,2),
  notes TEXT,
  retasi_ke INTEGER NOT NULL DEFAULT 1,
  is_returned BOOLEAN DEFAULT FALSE,
  returned_items_count INTEGER DEFAULT 0,
  error_items_count INTEGER DEFAULT 0,
  return_notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.retasi ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - allow all operations for authenticated users
CREATE POLICY "retasi_access" ON public.retasi
FOR ALL USING (auth.uid() IS NOT NULL);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_retasi_departure_date ON public.retasi(departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_driver_date ON public.retasi(driver_name, departure_date);
CREATE INDEX IF NOT EXISTS idx_retasi_returned ON public.retasi(is_returned);

-- Create function to get next retasi counter for driver per day
CREATE OR REPLACE FUNCTION get_next_retasi_counter(driver TEXT, target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  counter INTEGER;
BEGIN
  -- Get the highest retasi_ke for the driver on the specific date
  SELECT COALESCE(MAX(retasi_ke), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE driver_name = driver 
    AND departure_date = target_date;
  
  RETURN counter;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if driver has unreturned retasi
CREATE OR REPLACE FUNCTION driver_has_unreturned_retasi(driver TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  count_unreturned INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO count_unreturned
  FROM public.retasi
  WHERE driver_name = driver 
    AND is_returned = FALSE;
  
  RETURN count_unreturned > 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate retasi number
CREATE OR REPLACE FUNCTION generate_retasi_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(retasi_number FROM 12 FOR 3) AS INTEGER)), 0) + 1
  INTO counter
  FROM public.retasi
  WHERE retasi_number LIKE 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-%';
  
  new_number := 'RET-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 3, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-set retasi_ke and number before insert
CREATE OR REPLACE FUNCTION set_retasi_ke_and_number()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-generate retasi number if not provided
  IF NEW.retasi_number IS NULL OR NEW.retasi_number = '' THEN
    NEW.retasi_number := generate_retasi_number();
  END IF;
  
  -- Auto-set retasi_ke based on driver and date
  IF NEW.driver_name IS NOT NULL THEN
    NEW.retasi_ke := get_next_retasi_counter(NEW.driver_name, NEW.departure_date);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_retasi_ke_and_number
  BEFORE INSERT ON public.retasi
  FOR EACH ROW
  EXECUTE FUNCTION set_retasi_ke_and_number();

-- Create function to mark retasi as returned
CREATE OR REPLACE FUNCTION mark_retasi_returned(
  retasi_id UUID,
  returned_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.retasi 
  SET 
    is_returned = TRUE,
    returned_items_count = returned_count,
    error_items_count = error_count,
    return_notes = notes,
    updated_at = NOW()
  WHERE id = retasi_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger
CREATE TRIGGER update_retasi_updated_at 
  BEFORE UPDATE ON public.retasi 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Success message
SELECT 'Simple retasi table created successfully!' as status;