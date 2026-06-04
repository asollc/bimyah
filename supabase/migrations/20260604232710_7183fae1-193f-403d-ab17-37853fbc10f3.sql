CREATE TABLE IF NOT EXISTS public.bmart_category_images (
  id text PRIMARY KEY,
  image_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bmart_category_images TO anon, authenticated;
GRANT ALL ON public.bmart_category_images TO service_role;

ALTER TABLE public.bmart_category_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read category images" ON public.bmart_category_images;
CREATE POLICY "Public read category images" ON public.bmart_category_images
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Admins manage category images" ON public.bmart_category_images;
CREATE POLICY "Admins manage category images" ON public.bmart_category_images
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));