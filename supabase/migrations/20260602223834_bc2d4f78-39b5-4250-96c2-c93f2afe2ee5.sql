
-- Inventory kind enum
DO $$ BEGIN
  CREATE TYPE public.inventory_kind AS ENUM (
    'card_back', 'title', 'badge', 'victory', 'background', 'tabletop', 'table_art'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Owned items
CREATE TABLE public.user_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  kind public.inventory_kind NOT NULL,
  item_id text NOT NULL,
  source text NOT NULL DEFAULT 'purchase',
  acquired_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_inventory TO authenticated;
GRANT ALL ON public.user_inventory TO service_role;

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own inventory" ON public.user_inventory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage inventory" ON public.user_inventory
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_inventory_user_kind ON public.user_inventory(user_id, kind);

-- Equipped (one row per user)
CREATE TABLE public.user_equipped (
  user_id uuid NOT NULL PRIMARY KEY,
  title_id text,
  badge_id text,
  victory_id text,
  background_id text,
  tabletop_id text,
  table_art_id text,
  card_back_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_equipped TO authenticated;
GRANT SELECT ON public.user_equipped TO anon;
GRANT ALL ON public.user_equipped TO service_role;

ALTER TABLE public.user_equipped ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read equipped" ON public.user_equipped
  FOR SELECT USING (true);
CREATE POLICY "Users upsert own equipped insert" ON public.user_equipped
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users upsert own equipped update" ON public.user_equipped
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_user_equipped_updated_at
  BEFORE UPDATE ON public.user_equipped
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Purchase ledger
CREATE TABLE public.purchase_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  item_id text NOT NULL,
  item_name text NOT NULL,
  currency text NOT NULL,
  price integer NOT NULL,
  kind public.inventory_kind,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.purchase_ledger TO authenticated;
GRANT ALL ON public.purchase_ledger TO service_role;

ALTER TABLE public.purchase_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own ledger" ON public.purchase_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all ledger" ON public.purchase_ledger
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_purchase_ledger_user ON public.purchase_ledger(user_id, created_at DESC);

-- Optional kind on bmart_products for admin-added items
ALTER TABLE public.bmart_products
  ADD COLUMN IF NOT EXISTS kind public.inventory_kind;

-- Atomic purchase function
CREATE OR REPLACE FUNCTION public.purchase_bmart_item(
  _user_id uuid,
  _item_id text,
  _item_name text,
  _currency text,
  _price integer,
  _kind public.inventory_kind
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_bimbucks integer;
  _new_bimbits integer;
BEGIN
  IF _price < 0 THEN RAISE EXCEPTION 'Invalid price'; END IF;
  IF _currency NOT IN ('bimbucks','bimbits') THEN RAISE EXCEPTION 'Invalid currency'; END IF;

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
  VALUES (_user_id, _kind, _item_id, 'purchase')
  ON CONFLICT (user_id, kind, item_id) DO NOTHING;

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_user_id, _item_id, _item_name, _currency, _price, _kind);

  RETURN jsonb_build_object('bimbucks', _new_bimbucks, 'bimbits', _new_bimbits);
END;
$$;
