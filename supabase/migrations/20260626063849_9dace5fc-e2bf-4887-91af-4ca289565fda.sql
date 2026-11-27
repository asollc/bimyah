ALTER TABLE public.bmart_custom_categories
  ADD COLUMN IF NOT EXISTS requires_plus boolean NOT NULL DEFAULT false;