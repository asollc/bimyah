CREATE OR REPLACE FUNCTION public.transfer_bimbucks(_sender_id uuid, _recipient_id uuid, _amount integer, _note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_sender_balance integer;
  _transfer_id uuid;
  _sender_name text;
  _recipient_name text;
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

  SELECT display_name INTO _sender_name FROM public.profiles WHERE id = _sender_id;
  SELECT display_name INTO _recipient_name FROM public.profiles WHERE id = _recipient_id;

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_sender_id, 'bimbuck_transfer_sent', 'Sent to ' || COALESCE(_recipient_name, 'Player'), 'bimbucks', -_amount, NULL);

  INSERT INTO public.purchase_ledger (user_id, item_id, item_name, currency, price, kind)
  VALUES (_recipient_id, 'bimbuck_transfer_received', 'Received from ' || COALESCE(_sender_name, 'Player'), 'bimbucks', _amount, NULL);

  RETURN jsonb_build_object('transfer_id', _transfer_id, 'sender_bimbucks', _new_sender_balance);
END;
$function$;