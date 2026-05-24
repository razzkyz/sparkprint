-- ============================================
-- SPARK PRINT - Supabase Setup Migration
-- ============================================
-- Jalankan semua SQL di bawah ini di Supabase SQL Editor
-- https://app.supabase.com → SQL Editor → New Query → Copy & Paste semua ini

-- 1. CREATE STORAGE BUCKET FOR PHOTOS
-- (Run ini di Supabase console atau via Storage tab UI)
-- Tapi via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('photos', 'photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. SET BUCKET POLICIES
-- Allow public read
CREATE POLICY "Public read access for photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'photos');

-- Allow authenticated upload
CREATE POLICY "Authenticated upload to photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photos'
    AND auth.role() = 'authenticated'
  );

-- 3. CREATE print_orders TABLE (if not exists)
CREATE TABLE IF NOT EXISTS public.print_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Order tracking
  doku_order_id TEXT NOT NULL UNIQUE, -- Our order ID (SP-{timestamp}-{random})
  queue_number INTEGER NOT NULL,
  
  -- Customer info
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  
  -- Photo info
  fotoshare_token TEXT, -- Legacy field, not used
  image_urls TEXT[], -- Array of public URLs to uploaded photos (changed from single image_url)
  photo_sizes TEXT[], -- Array of sizes for each photo ('4x6' or '2x6'), same index as image_urls
  
  -- Order details
  size TEXT NOT NULL DEFAULT '4x6', -- '4x6' or '2x6'
  qty INTEGER NOT NULL DEFAULT 1, -- Total quantity across all photos
  amount INTEGER NOT NULL, -- Price in IDR
  
  -- Payment & Status
  payment_method TEXT DEFAULT 'qris', -- 'qris' or 'cashier'
  status TEXT DEFAULT 'PENDING', -- PENDING, PAID, PRINTED, FAILED
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  paid_at TIMESTAMPTZ,
  
  -- Index for faster queries
  CONSTRAINT chk_size CHECK (size IN ('4x6', '2x6', '2R', '4R', 'custom')),
  CONSTRAINT chk_qty CHECK (qty >= 1 AND qty <= 100),
  CONSTRAINT chk_status CHECK (status IN ('PENDING', 'PAID', 'PRINTED', 'FAILED'))
);

-- 4. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_print_orders_status ON public.print_orders(status);
CREATE INDEX IF NOT EXISTS idx_print_orders_paid_at ON public.print_orders(paid_at);
CREATE INDEX IF NOT EXISTS idx_print_orders_doku_id ON public.print_orders(doku_order_id);
CREATE INDEX IF NOT EXISTS idx_print_orders_customer_email ON public.print_orders(customer_email);

-- 5. MIGRATION: Add image_urls column and migrate existing data
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Add photo_sizes column for per-photo size tracking
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS photo_sizes TEXT[];

-- Migrate existing image_url to image_urls array
UPDATE public.print_orders 
SET image_urls = ARRAY[image_url] 
WHERE image_url IS NOT NULL AND image_urls IS NULL;

-- Initialize photo_sizes for existing orders (default to size value)
UPDATE public.print_orders 
SET photo_sizes = ARRAY[size] 
WHERE photo_sizes IS NULL AND size IS NOT NULL;

-- 6. UPDATE CHECK CONSTRAINT to support new sizes (2R, 4R, custom)
-- Drop old constraint
ALTER TABLE public.print_orders DROP CONSTRAINT IF EXISTS chk_size;

-- Add new constraint with all supported sizes
ALTER TABLE public.print_orders ADD CONSTRAINT chk_size CHECK (size IN ('4x6', '2x6', '2R', '4R', 'custom'));

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.print_orders ENABLE ROW LEVEL SECURITY;

-- 6. CREATE RLS POLICIES
-- Allow insert for anyone
CREATE POLICY "Anyone can insert orders"
  ON public.print_orders FOR INSERT
  WITH CHECK (true);

-- Allow select for order creator (by email)
CREATE POLICY "Users can view their own orders"
  ON public.print_orders FOR SELECT
  USING (
    customer_email = current_user_email()
    OR auth.role() = 'service_role' -- Allow admin/service role
  );

-- Allow update for service role (admin operations)
CREATE POLICY "Service role can update orders"
  ON public.print_orders FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- DONE! Now you can:
-- 1. Upload photos
-- 2. Create orders
-- 3. Test Doku payment
-- ============================================
