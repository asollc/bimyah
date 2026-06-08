
CREATE TABLE public.bimbuck_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  note text,
  seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bimbuck_transfers_recipient_idx ON public.bimbuck_transfers (recipient_id, created_at DESC);
CREATE INDEX bimbuck_transfers_sender_idx ON public.bimbuck_transfers (sender_id, created_at DESC);

GRANT SELECT ON public.bimbuck_transfers TO authenticated;
GRANT ALL ON public.bimbuck_transfers TO service_role;

ALTER TABLE public.bimbuck_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own transfers"
  ON public.bimbuck_transfers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.transfer_bimbucks(
  _sender_id uuid,
  _recipient_id uuid,
  _amount integer,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_sender_balance integer;
  _transfer_id uuid;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF _sender_id = _recipient_id THEN
    RAISE EXCEPTION 'Cannot send to yourself';
  END IF;

  INSERT INTO public.wallets (user_id) VALUES (_sender_id)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (_recipient_id)
    ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.wallets
    SET bimbucks = bimbucks - _amount, updated_at = now()
    WHERE user_id = _sender_id AND bimbucks >= _amount
    RETURNING bimbucks INTO _new_sender_balance;

  IF _new_sender_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient Bimbucks';
  END IF;

  UPDATE public.wallets
    SET bimbucks = bimbucks + _amount, updated_at = now()
    WHERE user_id = _recipient_id;

  INSERT INTO public.bimbuck_transfers (sender_id, recipient_id, amount, note)
  VALUES (_sender_id, _recipient_id, _amount, _note)
  RETURNING id INTO _transfer_id;

  RETURN jsonb_build_object('transfer_id', _transfer_id, 'sender_bimbucks', _new_sender_balance);
END;
$$;
