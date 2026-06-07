CREATE TABLE public.bmart_text (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bmart_text TO anon, authenticated;
GRANT ALL ON public.bmart_text TO service_role;
ALTER TABLE public.bmart_text ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bmart text" ON public.bmart_text FOR SELECT USING (true);
CREATE POLICY "Admins manage bmart text" ON public.bmart_text FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));