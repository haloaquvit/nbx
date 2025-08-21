-- Add location and photo columns to customers table
ALTER TABLE public.customers 
ADD COLUMN latitude NUMERIC,
ADD COLUMN longitude NUMERIC,
ADD COLUMN full_address TEXT,
ADD COLUMN store_photo_url TEXT,
ADD COLUMN store_photo_drive_id TEXT;