
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS price_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox';

ALTER TABLE public.payments ALTER COLUMN paypal_capture_id DROP NOT NULL;
ALTER TABLE public.payments ALTER COLUMN paypal_order_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS payments_stripe_session_idx ON public.payments(stripe_session_id);
