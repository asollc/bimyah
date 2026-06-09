CREATE OR REPLACE FUNCTION public.purchase_bmart_item(_user_id uuid, _item_id text, _item_name text, _currency text, _price integer, _kind inventory_kind)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_bimbucks integer;
  _new_bimbits integer;
BEGIN
  IF _price < 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF _currency NOT IN ('bimbucks','bimbits') THEN RAISE EXCEPTION 'Invalid currency'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_inventory
    WHERE user_id = _user_id AND kind = _kind AND item_id = _item_id
  ) THEN
    RAISE EXCEPTION 'You already own this item';
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  IF _currency = 'bimbucks' THEN
    UPDATE public.wallets
      SET bimbucks = bimbucks - _price, updated_at = now()
      WHERE user_id = _user_id AND bimbucks >= _price
      RETURNING bimbucks, bimbits INTO _new_bimbucks, _new_bimbits;
  ELSE
    UPDATE public.wallets
      SET bimbits = bimbits - _price, updated_at = now()
      WHERE user_id = _user_id AND bimbits >= _price
      RETURNING bimbucks, bimbits INTO _new_bimbucks, _new_bimbits;
  END IF;

  IF _new_bimbucks IS NULL THEN
    RAISE EXCEPTION 'Insufficient %', _currency;
  END IF;

  INSERT INTO public.user_inventory (user_id, kind, item_id, source)
  VALUES (_user_id, _kind, _item_id, 'purchase');

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_user_id, _item_id, _item_name, _currency, _price, _kind);

  RETURN jsonb_build_object('bimbucks', _new_bimbucks, 'bimbits', _new_bimbits);
END;
$function$;