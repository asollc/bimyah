
-- 1) Restrict user_equipped reads to authenticated users only
DROP POLICY IF EXISTS "Anyone can read equipped" ON public.user_equipped;
CREATE POLICY "Authenticated can read equipped"
  ON public.user_equipped FOR SELECT
  TO authenticated
  USING (true);

-- 2) Hide bplus_gifts.recipient_email from purchasers/recipients via column-level privilege.
--    Admin and server code use service_role (supabaseAdmin) and are unaffected.
REVOKE SELECT ON public.bplus_gifts FROM authenticated;
GRANT SELECT (
  id, purchaser_id, gift_type, status, amount_cents, currency, environment,
  stripe_session_id, subscription_id, recipient_user_id, allocated_by,
  allocated_at, created_at, updated_at
) ON public.bplus_gifts TO authenticated;

-- 3) Revoke EXECUTE on SECURITY DEFINER functions from anon/public.
--    These should only be callable from authenticated server-side contexts.
REVOKE EXECUTE ON FUNCTION public.purchase_badge_slot(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_bimbucks(uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_badge_slot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transfer_bimbucks(uuid, uuid, integer, text) TO authenticated, service_role;
