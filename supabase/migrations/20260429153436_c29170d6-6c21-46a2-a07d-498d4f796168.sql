-- Lock the slot-claim functions to service role only
REVOKE EXECUTE ON FUNCTION public.claim_lifetime_slot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_lifetime_slot() FROM PUBLIC, anon, authenticated;