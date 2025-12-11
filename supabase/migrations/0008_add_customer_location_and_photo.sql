-- Add location and photo columns to customers table (with IF NOT EXISTS)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS latitude NUMERIC,
ADD COLUMN IF NOT EXISTS longitude NUMERIC,
ADD COLUMN IF NOT EXISTS full_address TEXT,
ADD COLUMN IF NOT EXISTS store_photo_url TEXT,
ADD COLUMN IF NOT EXISTS store_photo_drive_id TEXT;