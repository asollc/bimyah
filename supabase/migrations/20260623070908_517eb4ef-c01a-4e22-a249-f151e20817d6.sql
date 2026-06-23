DROP POLICY IF EXISTS "Anyone can view visible custom categories" ON public.bmart_custom_categories;
DROP POLICY IF EXISTS "Admins manage custom categories" ON public.bmart_custom_categories;

CREATE POLICY "Anyone can view visible custom categories"
  ON public.bmart_custom_categories
  FOR SELECT
  TO public
  USING (hidden = false);

CREATE POLICY "Admins can view all custom categories"
  ON public.bmart_custom_categories
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage custom categories"
  ON public.bmart_custom_categories
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;