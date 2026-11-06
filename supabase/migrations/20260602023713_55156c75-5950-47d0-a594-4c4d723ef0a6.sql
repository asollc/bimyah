
REVOKE EXECUTE ON FUNCTION public.credit_bimbucks(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_bimbits(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_bimbucks(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_bimbits(uuid, integer) TO service_role;
