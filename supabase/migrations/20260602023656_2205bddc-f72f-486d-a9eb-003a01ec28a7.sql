
CREATE TABLE public.wallets (
  user_id UUID NOT NULL PRIMARY KEY,
  bimbucks INTEGER NOT NULL DEFAULT 0,
  bimbits INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own wallet"
ON public.wallets FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all wallets"
ON public.wallets FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage wallets"
ON public.wallets FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_wallets_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Idempotent credit function (service role only via webhook)
CREATE OR REPLACE FUNCTION public.credit_bimbucks(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, bimbucks)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET bimbucks = public.wallets.bimbucks + _amount,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_bimbits(_user_id uuid, _amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id, bimbits)
  VALUES (_user_id, _amount)
  ON CONFLICT (user_id) DO UPDATE
    SET bimbits = public.wallets.bimbits + _amount,
        updated_at = now();
END;
$$;
