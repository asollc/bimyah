-- Add a counter for custom card-back slots the user has purchased with Bimbucks.
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS custom_slots_purchased integer NOT NULL DEFAULT 0;

-- RPC: atomically debit Bimbucks and credit purchased custom card-back slots.
CREATE OR REPLACE FUNCTION public.purchase_custom_card_slots(_user_id uuid, _quantity integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost integer;
  _new_balance integer;
  _new_slots integer;
BEGIN
  IF _quantity IS NULL OR _quantity < 1 OR _quantity > 50 THEN
    RAISE EXCEPTION 'Invalid slot quantity';
  END IF;
  _cost := 250 * _quantity;

  INSERT INTO public.wallets (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
    SET bimbucks = bimbucks - _cost,
        custom_slots_purchased = custom_slots_purchased + _quantity,
        updated_at = now()
    WHERE user_id = _user_id AND bimbucks >= _cost
    RETURNING bimbucks, custom_slots_purchased
    INTO _new_balance, _new_slots;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient Bimbucks';
  END IF;

  RETURN jsonb_build_object(
    'bimbucks', _new_balance,
    'custom_slots_purchased', _new_slots
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_custom_card_slots(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_custom_card_slots(uuid, integer) TO service_role;