-- Migration: Add per-photo size tracking
-- Run this in Supabase SQL Editor

-- Add photo_sizes column to track size for each photo
ALTER TABLE public.print_orders ADD COLUMN IF NOT EXISTS photo_sizes TEXT[];

-- Initialize photo_sizes for existing orders (default to size value)
UPDATE public.print_orders 
SET photo_sizes = ARRAY[size] 
WHERE photo_sizes IS NULL AND size IS NOT NULL;

-- Verify migration
SELECT id, image_urls, photo_sizes, size, qty FROM public.print_orders LIMIT 5;
