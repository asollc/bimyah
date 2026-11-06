CREATE TABLE public.bmart_custom_categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  tag text NOT NULL DEFAULT '',
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bmart_custom_categories TO anon, authenticated;
GRANT ALL ON public.bmart_custom_categories TO service_role;

ALTER TABLE public.bmart_custom_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view visible custom categories"
  ON public.bmart_custom_categories FOR SELECT
  USING (hidden = false OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage custom categories"
  ON public.bmart_custom_categories FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bmart_custom_categories_updated_at
  BEFORE UPDATE ON public.bmart_custom_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();