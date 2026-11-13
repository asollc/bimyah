DROP POLICY IF EXISTS "Anyone can read games"   ON public.games;
DROP POLICY IF EXISTS "Anyone can insert games" ON public.games;
DROP POLICY IF EXISTS "Anyone can update games" ON public.games;

REVOKE ALL ON public.games FROM anon, authenticated;
GRANT  ALL ON public.games TO service_role;

ALTER PUBLICATION supabase_realtime DROP TABLE public.games;

REVOKE EXECUTE ON FUNCTION public.has_bimyah_plus(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_bimyah_plus(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_bimbits(uuid, integer)  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.credit_bimbits(uuid, integer)  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.credit_bimbucks(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.credit_bimbucks(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.claim_lifetime_slot()   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_lifetime_slot()   TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.release_lifetime_slot() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.release_lifetime_slot() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.purchase_bmart_item(uuid, text, text, text, integer, inventory_kind) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_bmart_item(uuid, text, text, text, integer, inventory_kind) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.purchase_custom_card_slots(uuid, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_custom_card_slots(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.lock_profile_display_name() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.lock_profile_display_name() TO authenticated, service_role;

ALTER FUNCTION public.delete_email(text, bigint)                    SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb)                    SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)        SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer)      SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)               TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

DROP POLICY IF EXISTS "Admins read bmart bucket"   ON storage.objects;
DROP POLICY IF EXISTS "Admins write bmart bucket"  ON storage.objects;
DROP POLICY IF EXISTS "Admins update bmart bucket" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete bmart bucket" ON storage.objects;

CREATE POLICY "Admins read bmart bucket" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bmart' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write bmart bucket" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bmart' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update bmart bucket" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'bmart' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'bmart' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete bmart bucket" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bmart' AND public.has_role(auth.uid(), 'admin'));