-- Track Bimyah!+ gifts purchased through Stripe.
-- gift_type = 'friend' (immediately fulfilled to a known user)
--           | 'random' (held as pending credit for admin to allocate manually)
-- status    = 'pending'  (random gifts awaiting allocation)
--           | 'fulfilled' (credit granted to a recipient)
--           | 'refunded'

CREATE TYPE public.gift_type AS ENUM ('friend', 'random');
CREATE TYPE public.gift_status AS ENUM ('pending', 'fulfilled', 'refunded');

CREATE TABLE public.bplus_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchaser_id UUID NOT NULL,
  gift_type public.gift_type NOT NULL,
  status public.gift_status NOT NULL DEFAULT 'pending',
  -- Stripe linkage. One Stripe session can produce N gift rows when qty > 1
  -- for randoms; we still record the same session_id on every row.
  stripe_session_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 500,
  currency TEXT NOT NULL DEFAULT 'USD',
  environment TEXT NOT NULL DEFAULT 'sandbox',
  -- For friend gifts: the email entered at checkout + matched user id
  recipient_email TEXT,
  recipient_user_id UUID,
  -- For randoms once an admin allocates manually
  allocated_by UUID,
  allocated_at TIMESTAMPTZ,
  -- The lifetime subscription row created when this gift was fulfilled
  subscription_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX bplus_gifts_purchaser_idx ON public.bplus_gifts(purchaser_id);
CREATE INDEX bplus_gifts_status_idx ON public.bplus_gifts(gift_type, status);
CREATE INDEX bplus_gifts_session_idx ON public.bplus_gifts(stripe_session_id);

ALTER TABLE public.bplus_gifts ENABLE ROW LEVEL SECURITY;

-- Purchaser can read their own gifts
CREATE POLICY "Purchasers view own gifts"
  ON public.bplus_gifts FOR SELECT
  TO authenticated
  USING (auth.uid() = purchaser_id);

-- Recipients can see gifts that landed in their account
CREATE POLICY "Recipients view their gifts"
  ON public.bplus_gifts FOR SELECT
  TO authenticated
  USING (auth.uid() = recipient_user_id);

-- Admins can do everything
CREATE POLICY "Admins view all gifts"
  ON public.bplus_gifts FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage gifts"
  ON public.bplus_gifts FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bplus_gifts_updated_at
  BEFORE UPDATE ON public.bplus_gifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();