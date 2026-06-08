
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS badge_slots_purchased INT NOT NULL DEFAULT 0
  CHECK (badge_slots_purchased BETWEEN 0 AND 1);

ALTER TABLE public.user_equipped
  ADD COLUMN IF NOT EXISTS badge_id_2 TEXT NULL;

ALTER TABLE public.bmart_products
  ADD COLUMN IF NOT EXISTS tabletop_style TEXT NULL
  CHECK (tabletop_style IS NULL OR tabletop_style IN ('wood','metal','neutral'));

CREATE TABLE IF NOT EXISTS public.decor_defaults (
  kind inventory_kind NOT NULL,
  default_key TEXT NOT NULL,
  name_override TEXT,
  image_url_override TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, default_key)
);

GRANT SELECT ON public.decor_defaults TO anon, authenticated;
GRANT ALL ON public.decor_defaults TO service_role;

ALTER TABLE public.decor_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read decor defaults" ON public.decor_defaults;
CREATE POLICY "Anyone can read decor defaults"
  ON public.decor_defaults FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage decor defaults" ON public.decor_defaults;
CREATE POLICY "Admins manage decor defaults"
  ON public.decor_defaults FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS update_decor_defaults_updated_at ON public.decor_defaults;
CREATE TRIGGER update_decor_defaults_updated_at
  BEFORE UPDATE ON public.decor_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.purchase_badge_slot(_user_id UUID)
RETURNS JSONB
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
        badge_slots_purchased = badge_slots_purchased + 1,
        updated_at = now()
    WHERE user_id = _user_id
      AND bimbucks >= _cost
      AND badge_slots_purchased < 1
    RETURNING bimbucks, badge_slots_purchased
    INTO _new_bimbucks, _new_slots;

  IF _new_bimbucks IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.wallets WHERE user_id = _user_id AND badge_slots_purchased >= 1) THEN
      RAISE EXCEPTION 'Max badge slots reached';
    END IF;
    RAISE EXCEPTION 'Insufficient Bimbucks';
  END IF;

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_user_id, 'badge_slot_extra', 'Extra Badge Slot', 'bimbucks', _cost, 'badge');

  RETURN jsonb_build_object('bimbucks', _new_bimbucks, 'badge_slots_purchased', _new_slots);
END;
$$;
