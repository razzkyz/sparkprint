-- Migration: Add support for custom sizes (2R, 4R, custom)
-- Run this in Supabase SQL Editor after adding the new size options

-- Drop old CHECK constraint that only allowed 4x6 and 2x6
ALTER TABLE public.print_orders DROP CONSTRAINT IF EXISTS chk_size;

-- Add new CHECK constraint with support for all sizes:
-- - '4x6', '2x6' (old legacy sizes)
-- - '2R', '4R' (new standard sizes)
-- - 'custom' (new custom size at 25,000 IDR)
ALTER TABLE public.print_orders ADD CONSTRAINT chk_size CHECK (size IN ('4x6', '2x6', '2R', '4R', 'custom'));

-- Verify the constraint was added
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'print_orders' AND constraint_name = 'chk_size';
