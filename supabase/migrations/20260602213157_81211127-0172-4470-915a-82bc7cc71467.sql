
-- Bmart product overrides + custom products
CREATE TABLE public.bmart_products (
  id text PRIMARY KEY,
  name text,
  price integer,
  currency text CHECK (currency IN ('bimbucks','bimbits')),
  category text CHECK (category IN ('cards','victory','titles','backgrounds','tabletops')),
  hidden boolean NOT NULL DEFAULT false,
  image_url text,
  is_custom boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bmart_products TO anon;
GRANT SELECT ON public.bmart_products TO authenticated;
GRANT ALL ON public.bmart_products TO service_role;

ALTER TABLE public.bmart_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bmart products"
  ON public.bmart_products FOR SELECT
  USING (true);

CREATE POLICY "Admins manage bmart products"
  ON public.bmart_products FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bmart_products_updated_at
  BEFORE UPDATE ON public.bmart_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
