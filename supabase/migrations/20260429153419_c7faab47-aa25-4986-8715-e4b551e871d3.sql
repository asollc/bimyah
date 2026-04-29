-- Phase 2: Bimyah!+ entitlement, subscriptions, payments, config

-- Plan enum
CREATE TYPE public.bplus_plan AS ENUM ('lifetime', 'monthly', 'annual');
CREATE TYPE public.bplus_status AS ENUM ('active', 'past_due', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('completed', 'refunded', 'failed');

-- Singleton config table (one row, id=1)
CREATE TABLE public.bplus_config (
  id integer PRIMARY KEY DEFAULT 1,
  lifetime_quota integer NOT NULL DEFAULT 500,
  lifetime_sold integer NOT NULL DEFAULT 0,
  lifetime_price_cents integer NOT NULL DEFAULT 500,   -- $5.00
  monthly_price_cents integer NOT NULL DEFAULT 200,    -- $2.00
  annual_price_cents integer NOT NULL DEFAULT 2000,    -- $20.00
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bplus_config_singleton CHECK (id = 1)
);

INSERT INTO public.bplus_config (id) VALUES (1);

ALTER TABLE public.bplus_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read bplus_config"
  ON public.bplus_config FOR SELECT USING (true);

CREATE POLICY "Admins can update bplus_config"
  ON public.bplus_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Subscriptions: one active row per user gates B+ access
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan public.bplus_plan NOT NULL,
  status public.bplus_status NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  paypal_subscription_id text,
  source text NOT NULL DEFAULT 'paypal', -- paypal | admin_grant
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status);
CREATE UNIQUE INDEX subscriptions_one_active_per_user
  ON public.subscriptions(user_id) WHERE status = 'active';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all subscriptions"
  ON public.subscriptions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payments ledger
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  plan public.bplus_plan NOT NULL,
  status public.payment_status NOT NULL DEFAULT 'completed',
  paypal_order_id text,
  paypal_capture_id text,
  paypal_subscription_id text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payments_user_idx ON public.payments(user_id);
CREATE INDEX payments_created_idx ON public.payments(created_at DESC);
CREATE UNIQUE INDEX payments_paypal_capture_unique
  ON public.payments(paypal_capture_id) WHERE paypal_capture_id IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own payments"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all payments"
  ON public.payments FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Founding members
CREATE TABLE public.founding_members (
  user_id uuid PRIMARY KEY,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.founding_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founding members publicly viewable"
  ON public.founding_members FOR SELECT USING (true);

-- Entitlement helper
CREATE OR REPLACE FUNCTION public.has_bimyah_plus(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id AND status = 'active'
  )
$$;

-- Atomic lifetime-slot claim. Returns true if slot reserved (caller must
-- then create the subscription + payment rows). Returns false if sold out.
CREATE OR REPLACE FUNCTION public.claim_lifetime_slot()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved boolean := false;
BEGIN
  UPDATE public.bplus_config
  SET lifetime_sold = lifetime_sold + 1, updated_at = now()
  WHERE id = 1 AND lifetime_sold < lifetime_quota
  RETURNING true INTO reserved;

  RETURN COALESCE(reserved, false);
END;
$$;

-- Release a previously-claimed slot (used if payment ultimately fails)
CREATE OR REPLACE FUNCTION public.release_lifetime_slot()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.bplus_config
  SET lifetime_sold = GREATEST(lifetime_sold - 1, 0), updated_at = now()
  WHERE id = 1;
$$;