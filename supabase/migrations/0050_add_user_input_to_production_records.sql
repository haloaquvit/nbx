-- Add user input tracking to production_records table
ALTER TABLE public.production_records 
ADD COLUMN user_input_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN user_input_name text;

-- Allow product_id to be null for damaged material records
ALTER TABLE public.production_records 
ALTER COLUMN product_id DROP NOT NULL;

-- Create index for better query performance  
CREATE INDEX idx_production_records_user_input_id ON public.production_records(user_input_id);

-- Update existing records to use created_by as user_input_id and user_input_name
UPDATE public.production_records 
SET user_input_id = created_by,
    user_input_name = 'Unknown User'
WHERE user_input_id IS NULL;