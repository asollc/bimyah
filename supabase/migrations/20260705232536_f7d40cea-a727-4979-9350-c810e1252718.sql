-- Add "emblem" to inventory kinds
ALTER TYPE public.inventory_kind ADD VALUE IF NOT EXISTS 'emblem';

-- Emblem equip slots on user_equipped
ALTER TABLE public.user_equipped ADD COLUMN IF NOT EXISTS emblem_id text;
ALTER TABLE public.user_equipped ADD COLUMN IF NOT EXISTS emblem_id_2 text;

-- Purchased extra emblem slot counter (mirrors badge_slots_purchased)
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS emblem_slots_purchased integer NOT NULL DEFAULT 0;

-- Buy extra emblem slot for 150 Bimbucks (mirrors purchase_badge_slot)
CREATE OR REPLACE FUNCTION public.purchase_emblem_slot(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cost INT := 150;
  _new_bimbucks INT;
  _new_slots INT;
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
    SET bimbucks = bimbucks - _cost,
        emblem_slots_purchased = emblem_slots_purchased + 1,
        updated_at = now()
    WHERE user_id = _user_id
      AND bimbucks >= _cost
      AND emblem_slots_purchased < 1
    RETURNING bimbucks, emblem_slots_purchased
    INTO _new_bimbucks, _new_slots;

  IF _new_bimbucks IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = _user_id AND emblem_slots_purchased >= 1) THEN
      RAISE EXCEPTION 'Max emblem slots reached';
    END IF;
    RAISE EXCEPTION 'Insufficient Bimbucks';
  END IF;

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_user_id, 'emblem_slot_extra', 'Extra Emblem Slot', 'bimbucks', _cost, 'emblem');

  RETURN jsonb_build_object('bimbucks', _new_bimbucks, 'emblem_slots_purchased', _new_slots);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_emblem_slot(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_emblem_slot(uuid) TO authenticated, service_role;